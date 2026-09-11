/* ============================================================
   WOLF·JS — js/audio.js
   Procedurální SFX přes Web Audio API. Žádné .wav soubory:
   všechno je šum + oscilátory + obálky.
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};

  var ctx = null, master = null, noiseBuf = null;
  var volume = 0.7;
  var enabled = true;
  var lastPlay = {};                     // omezovač: stejný zvuk ne moc často

  /* ============================================================
     INICIALIZACE (musí proběhnout po gestu uživatele)
     ============================================================ */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;

    // jemná komprese, ať to netrhá uši při přestřelce
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);

    // bílý šum na 2 s dopředu
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }

  /* ============================================================
     ZÁKLADNÍ STAVEBNÍ KAMENY
     ============================================================ */

  /** Šumový impuls s filtrem, který přeletí z f0 na f1. */
  function noise(o) {
    if (!ctx) return;
    var t = ctx.currentTime + (o.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;

    var flt = ctx.createBiquadFilter();
    flt.type = o.filter || 'lowpass';
    flt.frequency.setValueAtTime(o.f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || o.f0), t + o.dur);
    flt.Q.value = o.q || 1;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t);
    src.stop(t + o.dur + 0.02);
  }

  /** Tón s klouzáním frekvence. */
  function tone(o) {
    if (!ctx) return;
    var t = ctx.currentTime + (o.delay || 0);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    if (o.detune) osc.detune.value = o.detune;
    osc.connect(g); g.connect(master);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  /* ============================================================
     KATALOG ZVUKŮ
     ============================================================ */
  var SFX = {

    /* ---- zbraně hráče ---- */
    pistol: function () {
      noise({ f0: 4200, f1: 300, dur: 0.16, gain: 0.55, q: 1.2 });
      tone({ type: 'square', f0: 180, f1: 55, dur: 0.09, gain: 0.28 });
      noise({ f0: 9000, f1: 5000, dur: 0.03, gain: 0.22, filter: 'highpass' });
    },
    smg: function () {
      noise({ f0: 5200, f1: 500, dur: 0.10, gain: 0.42, q: 1.4 });
      tone({ type: 'square', f0: 230, f1: 70, dur: 0.06, gain: 0.2 });
    },
    shotgun: function () {
      noise({ f0: 2600, f1: 140, dur: 0.34, gain: 0.7, q: 0.9 });
      tone({ type: 'square', f0: 120, f1: 38, dur: 0.22, gain: 0.34 });
      noise({ f0: 9000, f1: 3000, dur: 0.05, gain: 0.3, filter: 'highpass' });
    },
    pump: function () {
      noise({ f0: 3200, f1: 1400, dur: 0.06, gain: 0.2, filter: 'bandpass', q: 3 });
      noise({ f0: 2600, f1: 900, dur: 0.07, gain: 0.22, filter: 'bandpass', q: 3, delay: 0.11 });
      tone({ type: 'square', f0: 260, f1: 180, dur: 0.05, gain: 0.08, delay: 0.11 });
    },
    knife: function () {
      noise({ f0: 900, f1: 5200, dur: 0.13, gain: 0.26, filter: 'bandpass', q: 2.4 });
    },
    empty: function () {
      noise({ f0: 3000, f1: 1200, dur: 0.05, gain: 0.18, filter: 'bandpass', q: 4 });
      tone({ type: 'square', f0: 950, f1: 600, dur: 0.04, gain: 0.08 });
    },
    switch: function () {
      noise({ f0: 2600, f1: 900, dur: 0.07, gain: 0.16, filter: 'bandpass', q: 3 });
    },
    hitFlesh: function () {
      noise({ f0: 1400, f1: 200, dur: 0.09, gain: 0.3, filter: 'lowpass' });
    },
    hitWall: function () {
      noise({ f0: 6000, f1: 1400, dur: 0.06, gain: 0.16, filter: 'bandpass', q: 2 });
    },

    /* ---- zbraně nepřátel ---- */
    enemyShot: function () {
      noise({ f0: 3200, f1: 260, dur: 0.15, gain: 0.30, q: 1.1 });
      tone({ type: 'square', f0: 150, f1: 50, dur: 0.08, gain: 0.16 });
    },
    bossShot: function () {
      noise({ f0: 2600, f1: 180, dur: 0.20, gain: 0.42, q: 1.0 });
      tone({ type: 'sawtooth', f0: 110, f1: 38, dur: 0.14, gain: 0.24 });
    },
    bite: function () {
      noise({ f0: 700, f1: 2400, dur: 0.10, gain: 0.3, filter: 'bandpass', q: 1.6 });
      tone({ type: 'sawtooth', f0: 240, f1: 90, dur: 0.12, gain: 0.14 });
    },

    /* ---- poplach ---- */
    alertGuard: function () {
      tone({ type: 'square', f0: 420, f1: 260, dur: 0.16, gain: 0.2 });
      tone({ type: 'square', f0: 300, f1: 200, dur: 0.14, gain: 0.16, delay: 0.15 });
    },
    alertOfficer: function () {
      tone({ type: 'sawtooth', f0: 560, f1: 340, dur: 0.14, gain: 0.2 });
      tone({ type: 'sawtooth', f0: 420, f1: 300, dur: 0.12, gain: 0.15, delay: 0.13 });
    },
    alertDog: function () {
      tone({ type: 'sawtooth', f0: 320, f1: 180, dur: 0.12, gain: 0.22 });
      noise({ f0: 1800, f1: 600, dur: 0.15, gain: 0.2, filter: 'bandpass', q: 1.2 });
      tone({ type: 'sawtooth', f0: 300, f1: 160, dur: 0.1, gain: 0.18, delay: 0.14 });
    },
    alertBoss: function () {
      tone({ type: 'sawtooth', f0: 160, f1: 70, dur: 0.9, gain: 0.34 });
      tone({ type: 'square', f0: 90, f1: 44, dur: 1.1, gain: 0.24, delay: 0.08 });
      noise({ f0: 500, f1: 120, dur: 0.9, gain: 0.2 });
    },

    /* ---- smrt ---- */
    enemyPain: function () {
      tone({ type: 'square', f0: 520, f1: 300, dur: 0.09, gain: 0.16 });
    },
    dieGuard: function () {
      tone({ type: 'square', f0: 400, f1: 90, dur: 0.42, gain: 0.24 });
      noise({ f0: 1200, f1: 200, dur: 0.4, gain: 0.16 });
    },
    dieOfficer: function () {
      tone({ type: 'sawtooth', f0: 520, f1: 110, dur: 0.5, gain: 0.24 });
      noise({ f0: 1400, f1: 220, dur: 0.45, gain: 0.16 });
    },
    dieDog: function () {
      tone({ type: 'sawtooth', f0: 700, f1: 160, dur: 0.35, gain: 0.22 });
      noise({ f0: 2200, f1: 400, dur: 0.3, gain: 0.14, filter: 'bandpass', q: 1.5 });
    },
    dieBoss: function () {
      tone({ type: 'sawtooth', f0: 200, f1: 40, dur: 1.6, gain: 0.4 });
      tone({ type: 'square', f0: 130, f1: 30, dur: 1.8, gain: 0.3, delay: 0.1 });
      noise({ f0: 900, f1: 80, dur: 1.7, gain: 0.28 });
    },

    /* ---- hráč ---- */
    playerPain: function () {
      tone({ type: 'sawtooth', f0: 220, f1: 120, dur: 0.18, gain: 0.3 });
      noise({ f0: 800, f1: 160, dur: 0.16, gain: 0.24 });
    },
    playerDie: function () {
      tone({ type: 'sawtooth', f0: 260, f1: 45, dur: 1.5, gain: 0.4 });
      tone({ type: 'square', f0: 130, f1: 30, dur: 1.7, gain: 0.26, delay: 0.12 });
      noise({ f0: 700, f1: 90, dur: 1.4, gain: 0.24 });
    },

    /* ---- předměty ---- */
    pickAmmo: function () {
      tone({ type: 'square', f0: 700, f1: 1100, dur: 0.07, gain: 0.16 });
      noise({ f0: 4000, f1: 2000, dur: 0.05, gain: 0.12, filter: 'bandpass', q: 3 });
    },
    pickHealth: function () {
      tone({ type: 'triangle', f0: 620, f1: 980, dur: 0.10, gain: 0.2 });
      tone({ type: 'triangle', f0: 930, f1: 1320, dur: 0.10, gain: 0.16, delay: 0.07 });
    },
    pickKey: function () {
      tone({ type: 'triangle', f0: 900, f1: 1500, dur: 0.08, gain: 0.18 });
      tone({ type: 'triangle', f0: 1400, f1: 2000, dur: 0.10, gain: 0.14, delay: 0.07 });
    },
    pickTreasure: function () {
      tone({ type: 'triangle', f0: 1050, dur: 0.09, gain: 0.16 });
      tone({ type: 'triangle', f0: 1320, dur: 0.09, gain: 0.15, delay: 0.07 });
      tone({ type: 'triangle', f0: 1760, dur: 0.14, gain: 0.14, delay: 0.14 });
    },
    pickWeapon: function () {
      tone({ type: 'square', f0: 300, f1: 700, dur: 0.14, gain: 0.22 });
      tone({ type: 'square', f0: 500, f1: 1100, dur: 0.16, gain: 0.18, delay: 0.1 });
      noise({ f0: 3000, f1: 900, dur: 0.1, gain: 0.14, filter: 'bandpass', q: 2 });
    },

    /* ---- prostředí ---- */
    door: function () {
      noise({ f0: 380, f1: 900, dur: 0.65, gain: 0.24, filter: 'bandpass', q: 0.8, attack: 0.06 });
      tone({ type: 'sawtooth', f0: 60, f1: 90, dur: 0.6, gain: 0.09 });
    },
    doorLocked: function () {
      noise({ f0: 2400, f1: 800, dur: 0.09, gain: 0.2, filter: 'bandpass', q: 5 });
      tone({ type: 'square', f0: 160, f1: 110, dur: 0.12, gain: 0.14 });
    },
    secret: function () {
      tone({ type: 'sawtooth', f0: 70, f1: 42, dur: 1.1, gain: 0.3 });
      noise({ f0: 260, f1: 90, dur: 1.0, gain: 0.26, attack: 0.1 });
    },
    lever: function () {
      noise({ f0: 1800, f1: 400, dur: 0.14, gain: 0.26, filter: 'bandpass', q: 3 });
      tone({ type: 'square', f0: 220, f1: 120, dur: 0.16, gain: 0.16 });
    },
    step: function () {
      noise({ f0: 260, f1: 90, dur: 0.07, gain: 0.06 });
    },

    /* ---- fanfáry ---- */
    victory: function () {
      var seq = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < seq.length; i++) {
        tone({ type: 'square', f0: seq[i], dur: 0.22, gain: 0.2, delay: i * 0.15 });
        tone({ type: 'triangle', f0: seq[i] / 2, dur: 0.26, gain: 0.14, delay: i * 0.15 });
      }
      tone({ type: 'square', f0: 1568, dur: 0.7, gain: 0.22, delay: 0.78 });
    },
    bossDown: function () {
      var seq = [392, 466, 587, 784];
      for (var i = 0; i < seq.length; i++) {
        tone({ type: 'sawtooth', f0: seq[i], dur: 0.3, gain: 0.18, delay: 0.6 + i * 0.16 });
      }
    }
  };

  /* ============================================================
     PŘEHRÁVÁNÍ
     ============================================================ */
  var THROTTLE = { step: 0.22, enemyShot: 0.05, smg: 0.03, bossShot: 0.05 };

  function play(name) {
    if (!enabled || !name) return;
    if (!ctx) return;                      // ještě nebyl gest uživatele
    var fn = SFX[name];
    if (!fn) return;
    var now = ctx.currentTime;
    var th = THROTTLE[name];
    if (th && lastPlay[name] && now - lastPlay[name] < th) return;
    lastPlay[name] = now;
    try { fn(); } catch (e) { /* zvuk nesmí shodit hru */ }
  }

  W.Audio = {
    init: ensure,
    play: play,
    setVolume: setVolume,
    get ready() { return !!ctx; },
    get enabled() { return enabled; }
  };

})(window);
