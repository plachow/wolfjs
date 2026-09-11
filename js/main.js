/* ============================================================
   WOLF·JS — js/main.js
   Aplikační skořápka: canvas, smyčka, stavy hry, klávesy.
   Herní logika se zapojí přes W.Game (další části).
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};
  var UI;

  /* ============================================================
     STAV APLIKACE
     ============================================================ */
  var App = {
    canvas: null,
    ctx: null,
    width: 640,
    height: 400,
    state: 'menu',          // menu | playing | paused | dead | win
    time: 0,
    dt: 0,
    fps: 0
  };

  var MAX_W = 1280;         // strop vnitřního rozlišení (výkon)

  /* ============================================================
     CANVAS
     ============================================================ */
  function resize() {
    var stage = document.getElementById('stage');
    if (!stage || !App.canvas) return;

    var rect = stage.getBoundingClientRect();
    var scale = (UI && UI.settings.resScale) || 1;

    // Základ 640px šířky * uživatelské rozlišení, ořezané na MAX_W.
    var w = Math.round(Math.min(MAX_W, 640 * scale));
    var aspect = rect.height > 0 ? rect.width / rect.height : 1.6;
    var h = Math.round(w / aspect);

    if (App.canvas.width !== w || App.canvas.height !== h) {
      App.canvas.width = App.width = w;
      App.canvas.height = App.height = h;
      App.ctx.imageSmoothingEnabled = false;
      if (W.Game && W.Game.onResize) W.Game.onResize(w, h);
    }
  }

  /* ============================================================
     KLÁVESY — sdílená tabulka, čte ji i herní modul
     ============================================================ */
  var keys = Object.create(null);

  /* Číselné klávesy podle fyzické pozice: na české klávesnici je bez
     Shiftu "+ěš…", ale e.code říká Digit1–Digit3 nezávisle na rozložení. */
  var CZ_DIGITS = { '+': '1', 'ě': '2', 'š': '3', 'č': '4', 'ř': '5' };

  function normKey(e) {
    var k = e.key;
    if (e.code && e.code.indexOf('Digit') === 0) return e.code.charAt(5);
    if (CZ_DIGITS[k]) return CZ_DIGITS[k];
    if (k === ' ') return 'space';
    return k.toLowerCase();          // w, arrowup, shift, escape, tab, ...
  }

  function onKeyDown(e) {
    var k = normKey(e);

    if (k === 'escape') {
      e.preventDefault();
      if (App.state === 'playing') pause();
      else if (App.state === 'paused') resume();
      else if (App.state === 'menu' && UI.overlay === 'controls') UI.showOverlay('menu');
      return;
    }
    if (k === 'tab') e.preventDefault();
    if (k === 'space' || k.indexOf('arrow') === 0) e.preventDefault();

    if (!keys[k]) keys[k + '|pressed'] = true;   // hrana pro "právě stisknuto"
    keys[k] = true;
  }

  function onKeyUp(e) {
    // Hranu "právě stisknuto" tu nemažeme: rychlý ťuknutí mezi dvěma snímky
    // by se jinak ztratilo. Spotřebuje ji consumePress, zbytek uklidí clearPresses.
    keys[normKey(e)] = false;
  }

  /** Zahodí nespotřebované stisky (při startu hry / návratu z pauzy). */
  function clearPresses() {
    for (var k in keys) if (k.indexOf('|pressed') > 0) keys[k] = false;
  }

  /** Spotřebuje jednorázový stisk (edge trigger). */
  function consumePress(k) {
    if (keys[k + '|pressed']) { keys[k + '|pressed'] = false; return true; }
    return false;
  }

  /* ============================================================
     MYŠ / POINTER LOCK
     ============================================================ */
  var mouse = { dx: 0, dy: 0, down: false, locked: false, hadLock: false, lockBroken: false };

  function requestLock() {
    var stage = document.getElementById('stage');
    if (!stage || !stage.requestPointerLock) { mouse.lockBroken = true; return; }
    try {
      // V některých rámech (náhled v IDE, sandboxovaný iframe) zámek nejde —
      // hra musí fungovat i bez něj, proto tiše ignorujeme, jen si to zapamatujeme.
      var p = stage.requestPointerLock();
      if (p && p.catch) p.catch(function () { mouse.lockBroken = true; });
    } catch (e) { mouse.lockBroken = true; }
  }
  function exitLock() {
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
  }

  function onMouseMove(e) {
    if (!mouse.locked) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
  }

  function onLockChange() {
    var stage = document.getElementById('stage');
    mouse.locked = (document.pointerLockElement === stage);
    if (mouse.locked) { mouse.hadLock = true; mouse.lockBroken = false; }
    // Vypadnutí ze zámku během hry = pauza (uživatel odešel jinam).
    if (!mouse.locked && App.state === 'playing') pause();
  }

  /* ============================================================
     PŘECHODY STAVŮ
     ============================================================ */
  function startGame() {
    // Hra si sama řekne, jestli je připravená (vygenerované textury).
    if (W.Game && W.Game.start && W.Game.start(UI.settings.difficulty) === false) return;
    App.state = 'playing';
    clearPresses();
    UI.hideOverlays();
    requestLock();
  }

  /** Po výtahu do dalšího sektoru. */
  function nextLevel() {
    if (!W.Game || !W.Game.nextLevel()) { quitToMenu(); return; }
    App.state = 'playing';
    clearPresses();
    UI.hideOverlays();
    requestLock();
  }

  /** Po smrti: znovu tentýž sektor (nebo nová hra, když došly životy). */
  function retryLevel() {
    if (!W.Game || !W.Game.retryLevel()) return;
    App.state = 'playing';
    clearPresses();
    UI.hideOverlays();
    requestLock();
  }

  function pause() {
    if (App.state !== 'playing') return;
    App.state = 'paused';
    exitLock();
    UI.showOverlay('pause');
  }

  function resume() {
    if (App.state !== 'paused') return;
    App.state = 'playing';
    clearPresses();
    UI.hideOverlays();
    requestLock();
    // Prohlížeč po Esc někdy zámek myši z klávesnice nedovolí – pak stačí kliknout.
    setTimeout(function () {
      if (App.state === 'playing' && !mouse.locked && mouse.hadLock) UI.toast('Klikni do obrazu pro uzamčení myši');
    }, 350);
  }

  function quitToMenu() {
    App.state = 'menu';
    exitLock();
    UI.setMinimap(false, false);
    UI.showOverlay('menu');
    if (W.Game && W.Game.stop) W.Game.stop();
  }

  function gameOver(statsText) {
    App.state = 'dead';
    exitLock();
    UI.setDeadStats(statsText || '');
    UI.showOverlay('dead');
  }

  function victory(rows, hasNext, title) {
    App.state = 'win';
    exitLock();
    UI.setWinStats(rows || [], !!hasNext, title);
    UI.showOverlay('win');
  }

  /* ============================================================
     HLAVNÍ SMYČKA
     ============================================================ */
  var lastT = 0, fpsAcc = 0, fpsFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);

    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;          // po přepnutí tabu neskákat
    App.dt = dt;
    App.time += dt;

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { App.fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

    UI.tickFace(dt);

    if (App.state === 'playing') {
      if (W.Game && W.Game.update) W.Game.update(dt, keys, mouse, consumePress);
      mouse.dx = mouse.dy = 0;
    }

    if (W.Game && W.Game.render) {
      W.Game.render(App.ctx, App.width, App.height, App.time);
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    UI = W.UI;
    UI.init();

    App.canvas = document.getElementById('screen');
    App.ctx = App.canvas.getContext('2d');
    App.ctx.imageSmoothingEnabled = false;

    UI.on('start', startGame);
    UI.on('resume', resume);
    UI.on('next', nextLevel);
    UI.on('retry', retryLevel);
    UI.on('quit', quitToMenu);
    UI.on('resolution', resize);
    UI.on('smooth', function (v) { App.canvas.classList.toggle('smooth', !!v); });
    App.canvas.classList.toggle('smooth', !!UI.settings.smooth);
    UI.on('volume', function (v) { if (W.Audio && W.Audio.setVolume) W.Audio.setVolume(v); });

    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      for (var k in keys) keys[k] = false;
      if (App.state === 'playing') pause();
    });

    var stage = document.getElementById('stage');
    stage.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (App.state === 'playing' && !mouse.locked) {
        requestLock();
        // Klik, který zamyká myš, ještě nestřílí – ledaže zámek v tomhle prostředí nefunguje.
        if (mouse.hadLock || !mouse.lockBroken) return;
      }
      mouse.down = true;
    });
    stage.addEventListener('wheel', function (e) {
      if (App.state !== 'playing' || !W.Weap) return;
      e.preventDefault();
      W.Weap.next(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    window.addEventListener('mouseup', function (e) { if (e.button === 0) mouse.down = false; });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    resize();
    if (W.Game && W.Game.boot) W.Game.boot();
    requestAnimationFrame(function (t) { lastT = t; frame(t); });
  }

  /* ---------- veřejné API pro herní moduly ---------- */
  W.App = App;
  W.App.keys = keys;
  W.App.mouse = mouse;
  W.App.consumePress = consumePress;
  W.App.pause = pause;
  W.App.resume = resume;
  W.App.quitToMenu = quitToMenu;
  W.App.gameOver = gameOver;
  W.App.victory = victory;
  W.App.resize = resize;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
