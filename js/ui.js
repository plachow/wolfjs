/* ============================================================
   WOLF·JS — js/ui.js
   Vrstva mezi hrou a DOMem: overlaye, status bar, toasty, efekty.
   Nic o raycastingu tu není — herní kód volá jen W.UI.*
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};

  /* ---------- drobné pomocníky ---------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ============================================================
     NASTAVENÍ (persistentní v localStorage)
     ============================================================ */
  var DEFAULTS = {
    sens: 1.0, volume: 0.7, resScale: 1, difficulty: 1,
    look: 1,        // 0 jen do stran, 1 volný, 2 s návratem
    mip: 1,         // mipmapy textur
    filter: 0,      // 0 ostré vzorkování, 1 stěny filtrované svisle, 2 bilineární
    smooth: 0       // hladké zmenšení canvasu (supersampling)
  };
  var STORE_KEY = 'wolfjs.settings';

  var settings = (function load() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var got = JSON.parse(raw);
        for (var j in DEFAULTS) if (typeof got[j] === typeof DEFAULTS[j]) s[j] = got[j];
      }
    } catch (e) { /* privátní režim apod. — jedeme s výchozími */ }
    return s;
  })();

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  /* ============================================================
     OVERLAYE
     ============================================================ */
  var OVERLAYS = ['menu', 'controls', 'pause', 'dead', 'win', 'loading'];
  var currentOverlay = 'menu';

  function showOverlay(name) {
    for (var i = 0; i < OVERLAYS.length; i++) {
      var el = $('overlay-' + OVERLAYS[i]);
      if (el) el.classList.toggle('hidden', OVERLAYS[i] !== name);
    }
    currentOverlay = name || null;
    document.getElementById('stage').classList.toggle('playing', !currentOverlay);
    setCrosshair(!currentOverlay);
  }

  function hideOverlays() { showOverlay(null); }

  /* ============================================================
     TOASTY
     ============================================================ */
  function toast(text, kind) {
    var box = $('toasts');
    if (!box) return;
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = text;
    box.appendChild(t);
    // Ať se nehromadí — nejstarší ven.
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2700);
  }

  /* ============================================================
     OBRAZOVKOVÉ EFEKTY
     ============================================================ */
  function flash(id, ms) {
    var el = $(id);
    if (!el) return;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, ms || 40);
  }
  function flashDamage() { flash('flash-damage', 60); }
  function flashPickup() { flash('flash-pickup', 50); }

  function setCrosshair(on) {
    var c = $('crosshair');
    if (c) c.classList.toggle('on', !!on);
  }
  function crosshairHit() {
    var c = $('crosshair');
    if (!c) return;
    c.classList.add('hit');
    clearTimeout(c._t);
    c._t = setTimeout(function () { c.classList.remove('hit'); }, 110);
  }

  /* ============================================================
     STATUS BAR
     ============================================================ */
  var hud = {
    floor: null, score: null, lives: null,
    health: null, healthBar: null,
    ammo: null, ammoBar: null,
    keyGold: null, keySilver: null
  };
  var lastHealth = 100, lastAmmo = 0, ammoMax = 99;

  function cacheHud() {
    hud.floor     = $('hud-floor');
    hud.score     = $('hud-score');
    hud.lives     = $('hud-lives');
    hud.health    = $('hud-health');
    hud.healthBar = $('hud-health-bar');
    hud.ammo      = $('hud-ammo');
    hud.ammoBar   = $('hud-ammo-bar');
    hud.keyGold   = $('key-gold');
    hud.keySilver = $('key-silver');
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;           // vynutí restart animace
    el.classList.add('pulse');
  }

  function setFloor(n) { if (hud.floor) hud.floor.textContent = n; }
  function setLives(n) { if (hud.lives) hud.lives.textContent = n; }

  function setScore(n) {
    if (!hud.score) return;
    hud.score.textContent = String(n);
  }

  function setHealth(hp) {
    hp = clamp(Math.round(hp), 0, 100);
    if (hud.health) {
      hud.health.innerHTML = hp + '<i>%</i>';
      hud.health.classList.toggle('low', hp <= 25);
      if (hp < lastHealth) pulse(hud.health);
    }
    if (hud.healthBar) hud.healthBar.style.width = hp + '%';
    lastHealth = hp;
    drawFace(hp);
  }

  function setAmmo(cur, max) {
    if (typeof max === 'number' && max > 0) ammoMax = max;
    cur = Math.max(0, Math.round(cur));
    if (hud.ammo) {
      hud.ammo.textContent = String(cur);
      hud.ammo.classList.toggle('low', cur <= 5);
      if (cur > lastAmmo) pulse(hud.ammo);
    }
    if (hud.ammoBar) hud.ammoBar.style.width = clamp(cur / ammoMax * 100, 0, 100) + '%';
    lastAmmo = cur;
  }

  /** Popisek políčka s municí (Náboje / Broky). */
  function setAmmoLabel(text) {
    var el = $('hud-ammo-label');
    if (el) el.textContent = text;
  }

  function setKeys(gold, silver) {
    if (hud.keyGold)   hud.keyGold.classList.toggle('have', !!gold);
    if (hud.keySilver) hud.keySilver.classList.toggle('have', !!silver);
  }

  /* ============================================================
     PORTRÉT (pixel-art kreslený kódem)
     ============================================================ */
  var facePx = 2;                    // velikost logického pixelu
  var faceState = { hp: 100, hurt: 0, look: 0, tNext: 0 };

  var SKIN = ['#f0c39a', '#d99f74', '#b87a52'];
  var HAIR = '#5b3a1e';

  function px(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x * facePx, y * facePx, w * facePx, h * facePx);
  }

  /**
   * Vykreslí obličej podle zdraví. 100 % = klidný, <25 % = zkrvavený.
   * @param {number} hp 0..100
   * @param {boolean} [hurt] krátká grimasa po zásahu
   */
  function drawFace(hp, hurt) {
    var cv = $('face');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    facePx = Math.floor(cv.width / 26) || 2;

    faceState.hp = hp;
    if (hurt) faceState.hurt = 1;

    var lvl = hp > 75 ? 0 : hp > 50 ? 1 : hp > 25 ? 2 : 3;  // stupeň zranění
    var look = faceState.look;                               // -1 / 0 / +1

    ctx.clearRect(0, 0, cv.width, cv.height);

    // pozadí portrétu
    var g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, '#2a3140');
    g.addColorStop(1, '#0d1015');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // hlava
    px(ctx, 5, 4, 16, 20, SKIN[0]);
    px(ctx, 4, 7, 1, 13, SKIN[1]);
    px(ctx, 21, 7, 1, 13, SKIN[1]);
    px(ctx, 6, 23, 14, 2, SKIN[2]);          // stín pod bradou
    // vlasy
    px(ctx, 4, 2, 18, 4, HAIR);
    px(ctx, 3, 4, 2, 5, HAIR);
    px(ctx, 21, 4, 2, 5, HAIR);
    // krk + límec
    px(ctx, 9, 25, 8, 3, SKIN[1]);
    px(ctx, 5, 27, 16, 3, '#3f5a34');

    // obočí — s klesajícím zdravím zuřivější
    var browY = 9 + (lvl > 1 ? 1 : 0);
    px(ctx, 7 + look, browY, 4, 1 + (lvl > 2 ? 1 : 0), '#3a2412');
    px(ctx, 15 + look, browY, 4, 1 + (lvl > 2 ? 1 : 0), '#3a2412');

    // oči
    px(ctx, 8 + look, 11, 3, 3, '#ffffff');
    px(ctx, 15 + look, 11, 3, 3, '#ffffff');
    px(ctx, 9 + look, 12, 2, 2, '#2a3d5c');
    px(ctx, 16 + look, 12, 2, 2, '#2a3d5c');

    // nos + ústa
    px(ctx, 12, 14, 2, 4, SKIN[1]);
    if (faceState.hurt > 0 || lvl === 3) {
      px(ctx, 9, 19, 8, 3, '#5e1a1a');       // otevřená ústa
      px(ctx, 10, 19, 6, 1, '#ffffff');
    } else if (lvl === 0) {
      px(ctx, 10, 20, 6, 1, '#7d3b2c');      // klidná linka
    } else {
      px(ctx, 10, 20, 6, 2, '#6b2a22');
    }

    // krev podle stupně zranění
    if (lvl >= 1) { px(ctx, 18, 8, 2, 4, '#a11d1d'); px(ctx, 18, 12, 1, 3, '#7d1414'); }
    if (lvl >= 2) { px(ctx, 6, 15, 3, 2, '#a11d1d'); px(ctx, 13, 6, 4, 2, '#8f1717'); }
    if (lvl >= 3) {
      px(ctx, 7, 17, 2, 5, '#8f1717');
      px(ctx, 16, 15, 2, 6, '#8f1717');
      px(ctx, 11, 3, 5, 2, '#6d0f0f');
    }

    // rámeček
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, cv.width - 2, cv.height - 2);
  }

  /** Animace portrétu — občasné pohledy do stran, doznívání grimasy. */
  function tickFace(dt) {
    faceState.tNext -= dt;
    var redraw = false;
    if (faceState.hurt > 0) {
      faceState.hurt -= dt;
      if (faceState.hurt <= 0) { faceState.hurt = 0; redraw = true; }
    }
    if (faceState.tNext <= 0) {
      faceState.tNext = 0.7 + Math.random() * 1.6;
      var opts = [-1, 0, 1];
      faceState.look = opts[(Math.random() * 3) | 0];
      redraw = true;
    }
    if (redraw) drawFace(faceState.hp);
  }

  function faceHurt() { faceState.hurt = 0.5; drawFace(faceState.hp, true); }

  /* ============================================================
     IKONA ZBRANĚ
     ============================================================ */
  var weaponIconDrawer = null;   // dodá modul zbraní ve 6. části

  function setWeaponIconDrawer(fn) { weaponIconDrawer = fn; refreshWeaponIcon(0); }

  function refreshWeaponIcon(index) {
    var cv = $('weapon-icon');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (weaponIconDrawer) { weaponIconDrawer(ctx, cv.width, cv.height, index); return; }
    // placeholder, než přijde 6. část
    ctx.fillStyle = '#767f90';
    ctx.fillRect(10, cv.height / 2 - 2, cv.width - 20, 4);
  }

  /* ============================================================
     MINIMAPA
     ============================================================ */
  function setMinimap(on, big) {
    var el = $('minimap-wrap');
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.classList.toggle('big', !!big);
  }

  /* ============================================================
     LOADING
     ============================================================ */
  function setLoading(p) {
    var f = $('loadbar-fill');
    if (f) f.style.width = clamp(p * 100, 0, 100) + '%';
  }

  /* ============================================================
     TABULKY VÝSLEDKŮ
     ============================================================ */
  function setWinStats(rows, hasNext, title) {
    var box = $('win-stats');
    if (!box) return;
    var h = $('win-title'), bn = $('btn-win-next'), bm = $('btn-win-menu');
    if (h && title) h.textContent = title;
    if (bn) bn.hidden = !hasNext;
    if (bm) bm.classList.toggle('btn-primary', !hasNext);
    box.innerHTML = '';
    rows.forEach(function (r) {
      var k = document.createElement('div');
      k.className = 'st-k'; k.textContent = r[0];
      var v = document.createElement('div');
      v.className = 'st-v' + (r[2] ? ' perfect' : ''); v.textContent = r[1];
      box.appendChild(k); box.appendChild(v);
    });
  }

  function setDeadStats(text) {
    var el = $('dead-stats');
    if (el) el.textContent = text;
  }

  /* ============================================================
     NAPOJENÍ OVLÁDACÍCH PRVKŮ
     ============================================================ */
  var handlers = {};   // vyplní main.js / game.js

  function on(name, fn) { handlers[name] = fn; }
  function fire(name, arg) { if (handlers[name]) handlers[name](arg); }

  var syncers = [];              // funkce, které promítnou settings zpět do ovládacích prvků

  function bindSegmented(rootId, attr, onPick, initial, getter) {
    var root = $(rootId);
    if (!root) return;
    var btns = root.querySelectorAll('.seg-btn');
    function select(val) {
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('is-active', parseFloat(btns[i].getAttribute(attr)) === val);
      }
    }
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          var v = parseFloat(b.getAttribute(attr));
          select(v);
          onPick(v);
        });
      })(btns[i]);
    }
    if (initial !== undefined) select(initial);
    if (getter) syncers.push(function () { select(getter()); });
  }

  function bindControls() {
    var b;
    if ((b = $('btn-start')))         b.addEventListener('click', function () { fire('start'); });
    if ((b = $('btn-controls')))      b.addEventListener('click', function () { showOverlay('controls'); });
    if ((b = $('btn-controls-back'))) b.addEventListener('click', function () { showOverlay('menu'); });
    if ((b = $('btn-resume')))        b.addEventListener('click', function () { fire('resume'); });
    if ((b = $('btn-quit')))          b.addEventListener('click', function () { fire('quit'); });
    if ((b = $('btn-retry')))         b.addEventListener('click', function () { fire('retry'); });
    if ((b = $('btn-dead-menu')))     b.addEventListener('click', function () { fire('quit'); });
    if ((b = $('btn-win-menu')))      b.addEventListener('click', function () { fire('quit'); });
    if ((b = $('btn-win-next')))      b.addEventListener('click', function () { fire('next'); });

    bindSegmented('difficulty', 'data-diff', function (v) {
      settings.difficulty = v; saveSettings();
    }, settings.difficulty, function () { return settings.difficulty; });

    bindSegmented('opt-look', 'data-look', function (v) {
      settings.look = v; saveSettings();
    }, settings.look, function () { return settings.look; });

    bindSegmented('opt-mip', 'data-mip', function (v) {
      settings.mip = v; saveSettings();
    }, settings.mip, function () { return settings.mip; });

    bindSegmented('opt-filter', 'data-filter', function (v) {
      settings.filter = v; saveSettings();
    }, settings.filter, function () { return settings.filter; });

    bindSegmented('opt-smooth', 'data-smooth', function (v) {
      settings.smooth = v; saveSettings(); fire('smooth', v);
    }, settings.smooth, function () { return settings.smooth; });

    bindSegmented('opt-res', 'data-res', function (v) {
      settings.resScale = v; saveSettings(); fire('resolution', v);
    }, settings.resScale, function () { return settings.resScale; });

    var sens = $('opt-sens'), sensVal = $('opt-sens-val');
    if (sens) {
      sens.value = Math.round(settings.sens * 100);
      if (sensVal) sensVal.textContent = settings.sens.toFixed(2);
      sens.addEventListener('input', function () {
        settings.sens = parseInt(sens.value, 10) / 100;
        if (sensVal) sensVal.textContent = settings.sens.toFixed(2);
        saveSettings();
      });
    }

    var vol = $('opt-vol'), volVal = $('opt-vol-val');
    if (vol) {
      vol.value = Math.round(settings.volume * 100);
      if (volVal) volVal.textContent = String(Math.round(settings.volume * 100));
      vol.addEventListener('input', function () {
        settings.volume = parseInt(vol.value, 10) / 100;
        if (volVal) volVal.textContent = vol.value;
        saveSettings();
        fire('volume', settings.volume);
      });
    }
    syncers.push(function () {
      if (sens) { sens.value = Math.round(settings.sens * 100); if (sensVal) sensVal.textContent = settings.sens.toFixed(2); }
      if (vol) { vol.value = Math.round(settings.volume * 100); if (volVal) volVal.textContent = String(Math.round(settings.volume * 100)); }
    });

    if ((b = $('btn-defaults'))) b.addEventListener('click', resetSettings);
  }

  /** Smaže uložené nastavení a vrátí všechno na výchozí hodnoty (i v UI a ve hře). */
  function resetSettings() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    for (var k in DEFAULTS) settings[k] = DEFAULTS[k];   // stejný objekt – drží ho i hra
    for (var i = 0; i < syncers.length; i++) syncers[i]();
    fire('resolution', settings.resScale);
    fire('smooth', settings.smooth);
    fire('volume', settings.volume);
    toast('Nastavení vráceno na výchozí', 'good');
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    cacheHud();
    bindControls();
    setHealth(100);
    setAmmo(8, 99);
    setKeys(false, false);
    setScore(0);
    refreshWeaponIcon(0);
    showOverlay('menu');
  }

  /* ---------- veřejné API ---------- */
  W.UI = {
    init: init,
    settings: settings,
    saveSettings: saveSettings,
    resetSettings: resetSettings,

    showOverlay: showOverlay,
    hideOverlays: hideOverlays,
    get overlay() { return currentOverlay; },

    toast: toast,
    flashDamage: flashDamage,
    flashPickup: flashPickup,
    crosshairHit: crosshairHit,
    setCrosshair: setCrosshair,

    setFloor: setFloor,
    setScore: setScore,
    setLives: setLives,
    setHealth: setHealth,
    setAmmo: setAmmo,
    setAmmoLabel: setAmmoLabel,
    setKeys: setKeys,

    drawFace: drawFace,
    tickFace: tickFace,
    faceHurt: faceHurt,

    setWeaponIconDrawer: setWeaponIconDrawer,
    refreshWeaponIcon: refreshWeaponIcon,

    setMinimap: setMinimap,
    setLoading: setLoading,
    setWinStats: setWinStats,
    setDeadStats: setDeadStats,

    on: on
  };

})(window);
