/* ============================================================
   WOLF·JS — js/weapons.js
   Čtyři zbraně: nůž, pistole, samopal MP-40, brokovnice.
   Kreslí se procedurálně do offscreen canvasů a skládají
   nad raycastovaný obraz (bob, zpětný ráz, záblesk).
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};
  var CW = 160, CH = 120;            // rozlišení kresby zbraně

  /* ============================================================
     PARAMETRY ZBRANÍ
     ============================================================ */
  var DEFS = [
    {
      id: 0, key: 'knife', name: 'Nůž', short: 'NŮŽ', ammoType: null,
      useAmmo: 0, dmg: [10, 26], range: 1.75, rate: 0.30,
      spread: 0.16, auto: true, snd: 'knife', noise: 0,
      frames: ['knife_i', 'knife_a', 'knife_b', 'knife_c'],
      seq: [0.06, 0.08, 0.09, 0.09]
    },
    {
      id: 1, key: 'pistol', name: 'Pistole P08', short: 'PISTOLE', ammoType: 'bullets',
      useAmmo: 1, dmg: [11, 30], range: 22, rate: 0.35,
      spread: 0.022, auto: false, snd: 'pistol', noise: 10,
      frames: ['pistol_i', 'pistol_a', 'pistol_b', 'pistol_c'],
      seq: [0.04, 0.06, 0.08, 0.09]
    },
    {
      id: 2, key: 'smg', name: 'Samopal MP-40', short: 'SAMOPAL', ammoType: 'bullets',
      useAmmo: 1, dmg: [8, 23], range: 24, rate: 0.085,
      spread: 0.055, auto: true, snd: 'smg', noise: 13,
      frames: ['smg_i', 'smg_a', 'smg_b'],
      seq: [0.03, 0.045, 0.045]
    },
    {
      id: 3, key: 'shotgun', name: 'Brokovnice', short: 'BROKOVNICE', ammoType: 'shells',
      useAmmo: 1, pellets: 7, dmg: [5, 12], range: 11, rate: 0.95,
      spread: 0.22, auto: false, snd: 'shotgun', noise: 17,
      frames: ['sg_i', 'sg_a', 'sg_b', 'sg_c'],
      seq: [0.05, 0.12, 0.17, 0.14], pumpAt: 2, pumpSnd: 'pump'
    }
  ];

  var canvases = {};                  // jméno snímku -> canvas

  /* ============================================================
     KRESBA
     ============================================================ */
  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  var SKIN = '#e6b183', SKIN_D = '#bd8757', SKIN_L = '#f7d0aa';
  var STEEL = '#5a6270', STEEL_D = '#2b313b', STEEL_L = '#98a2b1';
  var GUNMETAL = '#33383f', WOOD = '#6b4a24', WOOD_D = '#432c12';

  /** Předloktí vyrůstající ze spodní hrany obrazu, mírně zkosené. */
  function forearm(g, bx, tx, topY, wBot, wTop) {
    g.fillStyle = SKIN;
    g.beginPath();
    g.moveTo(bx - wBot / 2, CH);
    g.lineTo(bx + wBot / 2, CH);
    g.lineTo(tx + wTop / 2, topY);
    g.lineTo(tx - wTop / 2, topY);
    g.closePath();
    g.fill();

    // světlo zleva, stín zprava
    g.fillStyle = SKIN_L;
    g.beginPath();
    g.moveTo(bx - wBot / 2, CH);
    g.lineTo(bx - wBot / 2 + 5, CH);
    g.lineTo(tx - wTop / 2 + 5, topY);
    g.lineTo(tx - wTop / 2, topY);
    g.closePath(); g.fill();
    g.fillStyle = SKIN_D;
    g.beginPath();
    g.moveTo(bx + wBot / 2 - 5, CH);
    g.lineTo(bx + wBot / 2, CH);
    g.lineTo(tx + wTop / 2, topY);
    g.lineTo(tx + wTop / 2 - 5, topY);
    g.closePath(); g.fill();

    // vyhrnutý rukáv
    var ry = CH - 26, k = (ry - CH) / (topY - CH);
    var cx = bx + (tx - bx) * k, cw = wBot + (wTop - wBot) * k;
    g.fillStyle = '#4c5540';
    g.beginPath();
    g.moveTo(cx - cw / 2 - 4, ry + 20);
    g.lineTo(cx + cw / 2 + 4, ry + 20);
    g.lineTo(cx + cw / 2 + 3, ry);
    g.lineTo(cx - cw / 2 - 3, ry);
    g.closePath(); g.fill();
    g.fillStyle = '#69754f';
    g.fillRect(cx - cw / 2 - 3, ry, cw + 6, 3);
  }

  /** Pěst sevřená kolem zbraně. */
  function fist(g, x, y, w, h) {
    R(g, x, y, w, h, SKIN);
    R(g, x, y, w, 4, SKIN_L);
    R(g, x, y + h - 4, w, 4, SKIN_D);
    R(g, x, y, 4, h, SKIN_L);
    var n = Math.max(3, Math.round(w / 11));
    for (var i = 0; i < n; i++) {
      R(g, x + 4 + i * ((w - 6) / n), y + 5, Math.max(4, (w - 10) / n - 2), 5, SKIN_D);
    }
  }

  function muzzleFlash(g, cx, cy, size) {
    g.globalCompositeOperation = 'lighter';
    var grd = g.createRadialGradient(cx, cy, 0, cx, cy, size);
    grd.addColorStop(0, 'rgba(255,255,240,.98)');
    grd.addColorStop(0.3, 'rgba(255,214,110,.9)');
    grd.addColorStop(0.65, 'rgba(255,140,30,.5)');
    grd.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, size, 0, Math.PI * 2); g.fill();

    g.fillStyle = 'rgba(255,246,214,.92)';
    g.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = i * Math.PI / 5;
      var r = (i % 2) ? size * 0.26 : size * 0.9;
      var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.75;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  /* ---------- NŮŽ ---------- */
  function drawKnife(g, phase) {
    var rot = [0.10, -0.25, -0.85, -0.45][phase];
    var offX = [0, -14, -40, -18][phase];
    var offY = [0, -8, -18, -6][phase];

    g.save();
    g.translate(118 + offX, 104 + offY);
    g.rotate(rot);
    g.translate(-118, -104);

    forearm(g, 132, 112, 64, 42, 32);
    fist(g, 92, 48, 42, 30);

    // záštita
    R(g, 84, 42, 58, 8, '#3b4048');
    R(g, 84, 42, 58, 2, '#79849a');
    // čepel
    g.fillStyle = '#c9d2de';
    g.beginPath();
    g.moveTo(128, 42); g.lineTo(56, 2); g.lineTo(48, 13); g.lineTo(104, 46);
    g.closePath(); g.fill();
    g.fillStyle = '#8c96a6';
    g.beginPath();
    g.moveTo(126, 44); g.lineTo(60, 8); g.lineTo(56, 15); g.lineTo(116, 48);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath();
    g.moveTo(56, 2); g.lineTo(48, 13); g.lineTo(55, 14);
    g.closePath(); g.fill();

    g.restore();
  }

  /* ---------- PISTOLE ---------- */
  function drawPistol(g, phase) {
    var kick = [0, 9, 5, 2][phase];
    var slide = phase === 1 ? 10 : (phase === 2 ? 5 : 0);

    g.save();
    g.translate(0, kick);

    // předloktí zprava
    forearm(g, 122, 96, 62, 44, 34);

    // pažbička + pěst
    R(g, 76, 44, 26, 44, WOOD);
    R(g, 76, 44, 5, 44, '#8a6534');
    R(g, 97, 44, 5, 44, WOOD_D);
    for (var k = 0; k < 6; k++) R(g, 78, 50 + k * 6, 22, 1, 'rgba(0,0,0,.28)');
    fist(g, 68, 52, 44, 32);

    // tělo a lučík
    R(g, 66, 30, 38, 20, GUNMETAL);
    R(g, 66, 30, 38, 3, STEEL_L);
    R(g, 66, 47, 38, 3, '#191d22');
    R(g, 64, 50, 8, 12, GUNMETAL);
    R(g, 98, 50, 8, 12, GUNMETAL);

    // závěr
    R(g, 72, 10 - slide, 26, 24, STEEL);
    R(g, 72, 10 - slide, 5, 24, STEEL_L);
    R(g, 93, 10 - slide, 5, 24, STEEL_D);
    R(g, 75, 20 - slide, 20, 2, '#1d2128');
    R(g, 78, 4 - slide, 14, 10, '#20252c');       // ústí
    R(g, 81, 6 - slide, 8, 6, '#0a0c10');
    R(g, 81, 0 - slide, 6, 5, '#454d59');         // muška

    if (phase === 1) muzzleFlash(g, 85, 4, 36);

    g.restore();
  }

  /* ---------- SAMOPAL ----------
     Pohled zezadu jako u pistole: hlaveň míří do scény a zkracuje se
     perspektivou, zásobník visí pod tělem, levá ruka ho drží vpředu
     (výš a menší), pravá svírá pistolovou rukojeť vzadu. */
  function poly(g, pts, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }

  function drawSmg(g, phase) {
    var kick = [0, 8, 4][phase];
    var shake = phase === 1 ? 2 : (phase === 2 ? -1 : 0);
    var cx = 86;                                   // osa zbraně

    g.save();
    g.translate(shake, kick);

    // předloktí: levé zleva dole (drží zásobník), pravé zprava dole (rukojeť)
    forearm(g, 34, 62, 72, 38, 26);
    forearm(g, 130, 106, 84, 42, 32);

    // sklopená opěrka pod tělem, vzadu u hráče
    R(g, cx - 22, 96, 44, 8, '#2a2f36');
    R(g, cx - 22, 96, 44, 2, '#4b525c');
    R(g, cx - 24, 102, 8, 10, '#20242b');
    R(g, cx + 16, 102, 8, 10, '#20242b');

    // zásobník visí pod tělem (vidíme jeho zadní stěnu)
    R(g, cx - 9, 62, 18, 48, '#3a4048');
    R(g, cx - 9, 62, 4, 48, '#525a66');
    R(g, cx - 9, 104, 18, 6, '#20242b');

    // tělo zbraně – lichoběžník ubíhající k ústí
    poly(g, [cx - 20, 94, cx + 20, 94, cx + 10, 24, cx - 10, 24], GUNMETAL);
    poly(g, [cx - 15, 94, cx + 15, 94, cx + 7, 24, cx - 7, 24], '#3e444d');   // horní plocha
    poly(g, [cx - 20, 94, cx - 15, 94, cx - 7, 24, cx - 10, 24], STEEL_L);   // světlá hrana
    poly(g, [cx + 15, 94, cx + 20, 94, cx + 10, 24, cx + 7, 24], STEEL_D);   // stinná hrana
    // příčné drážky na těle (perspektivně hustší směrem dopředu)
    for (var i = 0; i < 6; i++) {
      var yy = 88 - i * (10 - i);
      var hw = 15 - (94 - yy) * 0.11;
      R(g, cx - hw, yy, hw * 2, 1, 'rgba(0,0,0,.35)');
    }

    // hlaveň s chladicím pláštěm a ústí
    poly(g, [cx - 10, 24, cx + 10, 24, cx + 6, 8, cx - 6, 8], STEEL);
    poly(g, [cx - 10, 24, cx - 6, 24, cx - 3, 8, cx - 6, 8], STEEL_L);
    for (i = 0; i < 5; i++) R(g, cx - 6 + i * 3, 12, 1, 10, '#20252c');
    R(g, cx - 7, 2, 14, 8, '#242931');
    R(g, cx - 7, 2, 14, 2, '#4d5560');
    g.fillStyle = '#05070a';
    g.beginPath(); g.arc(cx, 6, 3, 0, Math.PI * 2); g.fill();
    // muška a hledí
    R(g, cx - 1, -3, 3, 6, '#565e6a');
    R(g, cx - 5, 76, 10, 3, '#565e6a');
    R(g, cx - 1, 74, 2, 3, '#20252c');

    // pistolová rukojeť vzadu + pravá pěst
    R(g, cx - 4, 90, 24, 26, '#262b32');
    R(g, cx - 4, 90, 4, 26, '#3a4048');
    fist(g, cx - 2, 82, 40, 30);

    // levá pěst na zásobníku – vpředu, tedy výš a o něco menší
    fist(g, cx - 30, 58, 34, 26);

    if (phase === 1) muzzleFlash(g, cx, 4, 34);

    g.restore();
  }

  /* ---------- BROKOVNICE ----------
     Pumpa: levá ruka na dřevěném předpažbí vpředu, pravá na krku pažby.
     Fáze 2/3 = předpažbí jede k hráči a zpět, vyletí prázdná nábojnice. */
  function drawShotgun(g, phase) {
    var kick = [0, 11, 5, 2][phase];
    var pump = [0, 0, 16, 5][phase];
    var cx = 84;

    g.save();
    g.translate(0, kick);

    forearm(g, 34, 58, 62 + pump * 0.6, 40, 28);    // levá – předpažbí
    forearm(g, 134, 110, 88, 44, 32);              // pravá – pažba

    // pažba
    poly(g, [cx - 22, 120, cx + 28, 120, cx + 18, 92, cx - 12, 92], WOOD);
    poly(g, [cx - 22, 120, cx - 16, 120, cx - 8, 92, cx - 12, 92], '#8a6534');
    R(g, cx - 12, 92, 30, 3, '#3a2a14');

    // pouzdro závěru
    poly(g, [cx - 13, 94, cx + 17, 94, cx + 9, 44, cx - 7, 44], GUNMETAL);
    poly(g, [cx - 13, 94, cx - 9, 94, cx - 4, 44, cx - 7, 44], STEEL_L);
    poly(g, [cx + 13, 94, cx + 17, 94, cx + 9, 44, cx + 6, 44], STEEL_D);
    R(g, cx + 6, 74, 8, 5, '#111418');              // výhozné okénko

    // hlaveň a trubicový zásobník pod ní
    poly(g, [cx - 7, 44, cx + 9, 44, cx + 5, 4, cx - 3, 4], STEEL);
    poly(g, [cx - 7, 44, cx - 4, 44, cx - 1, 4, cx - 3, 4], STEEL_L);
    poly(g, [cx - 5, 48, cx + 7, 48, cx + 4, 18, cx - 2, 18], '#3a4048');
    R(g, cx - 3, -2, 10, 8, '#242931');
    R(g, cx - 3, -2, 10, 2, '#4d5560');
    g.fillStyle = '#05070a';
    g.beginPath(); g.arc(cx + 2, 2, 3, 0, Math.PI * 2); g.fill();
    R(g, cx + 1, -6, 3, 5, '#565e6a');             // muška

    // dřevěné předpažbí – pumpa
    var py = 34 + pump;
    poly(g, [cx - 13, py + 30, cx + 15, py + 30, cx + 11, py, cx - 9, py], WOOD);
    poly(g, [cx - 13, py + 30, cx - 9, py + 30, cx - 6, py, cx - 9, py], '#8a6534');
    for (var i = 0; i < 5; i++) R(g, cx - 10, py + 5 + i * 5, 22, 1, 'rgba(0,0,0,.3)');
    fist(g, cx - 30, py + 10, 36, 26);

    // vyhozená nábojnice
    if (phase === 2) {
      g.save(); g.translate(cx + 30, 62); g.rotate(0.6);
      R(g, 0, 0, 6, 12, '#c1121f'); R(g, 0, 10, 6, 3, '#c9a227');
      g.restore();
    }

    // pravá pěst na krku pažby
    fist(g, cx + 2, 80, 40, 30);

    if (phase === 1) muzzleFlash(g, cx + 2, 0, 42);

    g.restore();
  }

  /* ============================================================
     SESTAVENÍ SNÍMKŮ
     ============================================================ */
  function build() {
    var list = [
      ['knife_i', drawKnife, 0], ['knife_a', drawKnife, 1],
      ['knife_b', drawKnife, 2], ['knife_c', drawKnife, 3],
      ['pistol_i', drawPistol, 0], ['pistol_a', drawPistol, 1],
      ['pistol_b', drawPistol, 2], ['pistol_c', drawPistol, 3],
      ['smg_i', drawSmg, 0], ['smg_a', drawSmg, 1], ['smg_b', drawSmg, 2],
      ['sg_i', drawShotgun, 0], ['sg_a', drawShotgun, 1],
      ['sg_b', drawShotgun, 2], ['sg_c', drawShotgun, 3]
    ];
    for (var i = 0; i < list.length; i++) {
      var ctx = W.Tex.newCtx(CW, CH);
      list[i][1](ctx, list[i][2]);
      canvases[list[i][0]] = ctx.canvas;
    }
  }

  /* ============================================================
     STAV ZBRANĚ
     ============================================================ */
  var state = {
    index: 1,             // aktuální zbraň
    owned: [true, true, false, false],
    phase: 0,             // index snímku v sekvenci
    t: 0,
    firing: false,
    cooldown: 0,
    switchTo: -1,
    lower: 0              // 0 nahoře, 1 dole (přepínání)
  };

  function reset() {
    state.index = 1;
    state.owned = [true, true, false, false];
    state.phase = 0; state.t = 0; state.firing = false;
    state.cooldown = 0; state.switchTo = -1; state.lower = 0;
  }

  function give(i) {
    state.owned[i] = true;
    select(i);
  }

  function select(i) {
    if (i === state.index || !state.owned[i] || state.switchTo >= 0) return;
    state.switchTo = i;
  }

  function next(dir) {
    var i = state.index, n = DEFS.length;
    for (var k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (state.owned[i]) { select(i); return; }
    }
  }

  function def() { return DEFS[state.index]; }

  /**
   * @param {number} dt
   * @param {boolean} wantFire  drží hráč spoušť?
   * @param {function} tryShot  vrátí true, když je čím střílet (a odečte náboj)
   */
  function update(dt, wantFire, tryShot) {
    var d = DEFS[state.index];

    /* přepínání zbraní — sjet dolů, vyměnit, vyjet nahoru */
    if (state.switchTo >= 0) {
      state.lower += dt * 6;
      if (state.lower >= 1) {
        state.lower = 1;
        state.index = state.switchTo;
        state.switchTo = -1;
        state.phase = 0; state.t = 0; state.firing = false;
        if (W.Audio) W.Audio.play('switch');
      }
      return;
    }
    if (state.lower > 0) {
      state.lower -= dt * 6;
      if (state.lower < 0) state.lower = 0;
    }

    if (state.cooldown > 0) state.cooldown -= dt;

    /* animace výstřelu */
    if (state.firing) {
      state.t += dt;
      var seq = d.seq;
      while (state.firing && state.t >= seq[state.phase]) {
        state.t -= seq[state.phase];
        state.phase++;
        if (state.phase === d.pumpAt && d.pumpSnd && W.Audio) W.Audio.play(d.pumpSnd);
        if (state.phase >= d.frames.length) {
          state.phase = 0;
          state.firing = false;
        }
      }
      return;
    }

    /* nový výstřel */
    if (wantFire && state.cooldown <= 0 && state.lower === 0) {
      if (tryShot(d)) {
        state.firing = true;
        state.phase = 1;
        state.t = 0;
        state.cooldown = d.rate;
      } else {
        state.cooldown = 0.25;
        if (W.Audio) W.Audio.play('empty');
      }
    }
  }

  /** Aktuální canvas snímku. */
  function frameCanvas() {
    var d = DEFS[state.index];
    return canvases[d.frames[state.firing ? state.phase : 0]];
  }

  /** Svítí právě záblesk? (osvětlí scénu) */
  function isFlashing() {
    return state.firing && state.phase === 1 && state.index > 0;
  }

  /**
   * Vykreslí zbraň přes raycastovaný obraz.
   * @param {number} bobX,bobY  houpání podle chůze
   */
  function render(ctx, w, h, bobX, bobY) {
    var img = frameCanvas();
    if (!img) return;

    var scale = h * 0.46 / CH;
    var dw = CW * scale, dh = CH * scale;
    var x = (w - dw) / 2 + bobX * scale;
    var y = h - dh + bobY * scale + state.lower * dh * 0.9;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(dw), Math.round(dh));
  }

  /* ============================================================
     IKONA DO STATUS BARU
     ============================================================ */
  function drawIcon(g, w, h, index) {
    g.clearRect(0, 0, w, h);
    var i = (typeof index === 'number') ? index : state.index;
    g.save();
    g.translate(w / 2, h / 2);
    var s = Math.min(w / 90, h / 46);
    g.scale(s, s);
    g.translate(-45, -23);

    if (i === 0) {
      g.fillStyle = '#c9d2de';
      g.beginPath();
      g.moveTo(14, 26); g.lineTo(58, 8); g.lineTo(62, 16); g.lineTo(20, 32);
      g.closePath(); g.fill();
      R(g, 58, 6, 6, 22, '#3b4048');
      R(g, 62, 12, 20, 10, WOOD);
      R(g, 62, 12, 20, 3, '#8a6534');
    } else if (i === 1) {
      R(g, 20, 14, 40, 10, GUNMETAL);
      R(g, 20, 14, 40, 2, STEEL_L);
      R(g, 56, 16, 16, 6, STEEL);
      R(g, 26, 24, 14, 16, WOOD);
      R(g, 26, 24, 4, 16, '#8a6534');
      R(g, 20, 24, 6, 8, GUNMETAL);
    } else if (i === 2) {
      R(g, 14, 14, 54, 9, GUNMETAL);
      R(g, 14, 14, 54, 2, STEEL_L);
      R(g, 66, 15, 18, 6, STEEL);
      R(g, 30, 23, 10, 18, '#3a4048');
      R(g, 52, 22, 12, 12, '#262b32');
      R(g, 4, 16, 12, 6, '#2a2f36');
    } else {
      R(g, 4, 17, 50, 5, STEEL);                 // hlaveň
      R(g, 4, 17, 50, 1, STEEL_L);
      R(g, 8, 22, 40, 4, '#3a4048');             // trubicový zásobník
      R(g, 18, 15, 16, 12, WOOD);                // předpažbí
      R(g, 50, 14, 16, 12, GUNMETAL);            // závěr
      g.fillStyle = WOOD;
      g.beginPath(); g.moveTo(64, 14); g.lineTo(86, 18); g.lineTo(86, 34); g.lineTo(66, 27); g.closePath(); g.fill();
    }
    g.restore();
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  W.Weap = {
    DEFS: DEFS,
    state: state,
    build: build,
    reset: reset,
    give: give,
    select: select,
    next: next,
    def: def,
    update: update,
    render: render,
    drawIcon: drawIcon,
    isFlashing: isFlashing
  };

})(window);
