/* ============================================================
   WOLF·JS — js/textures.js
   Procedurální textury stěn, podlahy a stropu.
   Žádné externí obrázky: vše se kreslí do offscreen canvasu
   a pak se předpočítají mip úrovně (64/32/16/8) a 16 úrovní
   ztmavení pro vzdálenostní stín.
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};

  var SIZE = 64;        // rozměr textury (mocnina dvou kvůli rychlému %)
  var SHADES = 16;      // počet předpočítaných úrovní jasu

  /* ---------- deterministický generátor ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- kreslicí pomocníci ---------- */
  function newCtx(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return x;
  }

  function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

  function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }

  /** Zrnitost přes celou texturu — dodá kameni "špínu". */
  function speckle(ctx, size, amount, rnd) {
    var img = ctx.getImageData(0, 0, size, size);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (rnd() - 0.5) * amount;
      d[i] = clamp255(d[i] + n);
      d[i + 1] = clamp255(d[i + 1] + n);
      d[i + 2] = clamp255(d[i + 2] + n);
    }
    ctx.putImageData(img, 0, 0);
  }

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /** Svislý gradient přes celou dlaždici — imituje osvětlení shora. */
  function topLight(ctx, size, strength) {
    var g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, 'rgba(255,255,255,' + strength + ')');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (strength * 1.4) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  /* ============================================================
     GENERÁTORY STĚN
     ============================================================ */

  /** Šedý kvádrový kámen — základní zeď pevnosti. */
  function texStone(ctx, s) {
    var rnd = mulberry32(11);
    rect(ctx, 0, 0, s, s, '#2b2b31');                    // spára
    var rows = 4, bh = s / rows;
    for (var r = 0; r < rows; r++) {
      var off = (r % 2) ? bh : 0;
      for (var x = -bh; x < s; x += bh * 2) {
        var bx = x + off, by = r * bh;
        var v = 96 + rnd() * 34;
        rect(ctx, bx + 1, by + 1, bh * 2 - 2, bh - 2, rgb(v, v * 0.98, v * 0.94));
        // horní hrana světlá, spodní tmavá
        rect(ctx, bx + 1, by + 1, bh * 2 - 2, 1, rgb(v + 40, v + 38, v + 34));
        rect(ctx, bx + 1, by + bh - 2, bh * 2 - 2, 1, rgb(v * 0.55, v * 0.55, v * 0.52));
        // náhodné odprýsknutí
        if (rnd() > 0.6) {
          var cw = 2 + rnd() * 4;
          rect(ctx, bx + 3 + rnd() * (bh * 2 - 8), by + 3 + rnd() * (bh - 7),
               cw, 1 + rnd() * 2, rgb(v * 0.6, v * 0.6, v * 0.58));
        }
      }
    }
    speckle(ctx, s, 26, rnd);
    topLight(ctx, s, 0.10);
  }

  /** Červená cihla — chodby. */
  function texBrick(ctx, s) {
    var rnd = mulberry32(23);
    rect(ctx, 0, 0, s, s, '#8d8377');                    // malta
    var rows = 8, bh = s / rows;
    for (var r = 0; r < rows; r++) {
      var off = (r % 2) ? bh : 0;
      for (var x = -bh; x < s; x += bh * 2) {
        var bx = x + off, by = r * bh;
        var v = rnd();
        var R = 118 + v * 42, G = 50 + v * 26, B = 40 + v * 20;
        rect(ctx, bx + 1, by + 1, bh * 2 - 1, bh - 1, rgb(R, G, B));
        rect(ctx, bx + 1, by + 1, bh * 2 - 1, 1, rgb(R + 26, G + 20, B + 16));
        rect(ctx, bx + 1, by + bh - 1, bh * 2 - 1, 1, rgb(R * 0.6, G * 0.6, B * 0.6));
      }
    }
    speckle(ctx, s, 20, rnd);
    topLight(ctx, s, 0.08);
  }

  /** Dřevěné obložení — kasárna. */
  function texWood(ctx, s) {
    var rnd = mulberry32(37);
    rect(ctx, 0, 0, s, s, '#3a2616');
    var pw = 8;
    for (var x = 0; x < s; x += pw) {
      var v = rnd();
      var R = 106 + v * 34, G = 68 + v * 24, B = 34 + v * 16;
      rect(ctx, x, 0, pw - 1, s, rgb(R, G, B));
      rect(ctx, x, 0, 1, s, rgb(R + 24, G + 18, B + 12));
      rect(ctx, x + pw - 2, 0, 1, s, rgb(R * 0.62, G * 0.62, B * 0.62));
      // léta dřeva
      for (var k = 0; k < 5; k++) {
        var y = rnd() * s;
        ctx.strokeStyle = 'rgba(40,24,10,.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y);
        ctx.bezierCurveTo(x + 3, y + 3, x + 4, y - 3, x + pw - 2, y + 1);
        ctx.stroke();
      }
    }
    // vodorovné lišty
    rect(ctx, 0, 0, s, 3, '#2a1a0c');
    rect(ctx, 0, s - 4, s, 4, '#241609');
    rect(ctx, 0, 3, s, 1, 'rgba(255,200,140,.16)');
    speckle(ctx, s, 14, rnd);
    topLight(ctx, s, 0.07);
  }

  /** Modrošedý ocelový panel s nýty — sklad. */
  function texSteel(ctx, s) {
    var rnd = mulberry32(53);
    var g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#5a6474');
    g.addColorStop(0.5, '#454e5c');
    g.addColorStop(1, '#333b47');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);

    // dělicí rámeček panelu
    rect(ctx, 0, 0, s, 2, '#6f7b8d');
    rect(ctx, 0, s - 3, s, 3, '#222833');
    rect(ctx, 0, 0, 2, s, '#687385');
    rect(ctx, s - 3, 0, 3, s, '#242a35');
    rect(ctx, 6, 6, s - 12, s - 12, '#4b5566');
    ctx.strokeStyle = '#2b3240'; ctx.lineWidth = 1;
    ctx.strokeRect(6.5, 6.5, s - 13, s - 13);

    // nýty v rozích
    var rivets = [[4, 4], [s - 5, 4], [4, s - 5], [s - 5, s - 5],
                  [s / 2, 4], [s / 2, s - 5], [4, s / 2], [s - 5, s / 2]];
    for (var i = 0; i < rivets.length; i++) {
      var rx = rivets[i][0], ry = rivets[i][1];
      rect(ctx, rx - 1, ry - 1, 3, 3, '#8b95a6');
      rect(ctx, rx, ry, 2, 2, '#c3ccd9');
      rect(ctx, rx, ry + 2, 2, 1, '#20262f');
    }
    // šrámy
    for (var k = 0; k < 14; k++) {
      ctx.strokeStyle = 'rgba(20,24,30,.25)';
      ctx.beginPath();
      var sx = rnd() * s, sy = rnd() * s;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + rnd() * 10 - 5, sy + rnd() * 10 - 5);
      ctx.stroke();
    }
    speckle(ctx, s, 12, rnd);
    topLight(ctx, s, 0.09);
  }

  /** Kámen s praporcem — jídelna / velitelství. */
  function texBanner(ctx, s) {
    texStone(ctx, s);
    // praporec
    rect(ctx, 14, 2, 36, 52, '#8d1220');
    rect(ctx, 14, 2, 36, 3, '#2b2b31');
    rect(ctx, 14, 2, 2, 52, '#5e0a15');
    rect(ctx, 48, 2, 2, 52, '#5e0a15');
    var g = ctx.createLinearGradient(14, 0, 50, 0);
    g.addColorStop(0, 'rgba(0,0,0,.35)');
    g.addColorStop(0.35, 'rgba(255,255,255,.10)');
    g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g; ctx.fillRect(14, 5, 36, 49);

    // zlatá vlčí hlava (stylizovaná)
    ctx.fillStyle = '#e8b437';
    ctx.beginPath();
    ctx.moveTo(32, 14);            // temeno
    ctx.lineTo(24, 20); ctx.lineTo(23, 12); ctx.lineTo(27, 17);  // levé ucho
    ctx.lineTo(32, 15);
    ctx.lineTo(37, 17); ctx.lineTo(41, 12); ctx.lineTo(40, 20);  // pravé ucho
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 20); ctx.lineTo(40, 20);
    ctx.lineTo(36, 34); ctx.lineTo(32, 40); ctx.lineTo(28, 34);
    ctx.closePath(); ctx.fill();
    rect(ctx, 28, 24, 3, 2, '#8d1220');
    rect(ctx, 34, 24, 3, 2, '#8d1220');
    rect(ctx, 31, 33, 2, 3, '#6a0d18');
    // třásně
    for (var i = 0; i < 9; i++) rect(ctx, 15 + i * 4, 54, 2, 3 + (i % 3), '#c9a227');
  }

  /** Tmavý kámen s mechem a lebkou — bossova hala. */
  function texHell(ctx, s) {
    var rnd = mulberry32(71);
    rect(ctx, 0, 0, s, s, '#15171c');
    var rows = 4, bh = s / rows;
    for (var r = 0; r < rows; r++) {
      var off = (r % 2) ? bh : 0;
      for (var x = -bh; x < s; x += bh * 2) {
        var bx = x + off, by = r * bh;
        var v = 44 + rnd() * 22;
        rect(ctx, bx + 1, by + 1, bh * 2 - 2, bh - 2, rgb(v, v * 1.02, v * 0.94));
        rect(ctx, bx + 1, by + 1, bh * 2 - 2, 1, rgb(v + 26, v + 28, v + 22));
        if (rnd() > 0.55) {
          rect(ctx, bx + 2, by + bh - 5, 3 + rnd() * 10, 3, 'rgba(72,110,46,.55)');
        }
      }
    }
    // vyrytá lebka
    ctx.fillStyle = 'rgba(190,190,178,.30)';
    ctx.beginPath(); ctx.ellipse(32, 28, 12, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(8,8,10,.85)';
    ctx.beginPath(); ctx.ellipse(27, 26, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(37, 26, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    rect(ctx, 30, 34, 4, 4, 'rgba(8,8,10,.85)');
    rect(ctx, 25, 41, 14, 5, 'rgba(190,190,178,.26)');
    for (var i = 0; i < 4; i++) rect(ctx, 27 + i * 3, 41, 1, 5, 'rgba(8,8,10,.7)');
    speckle(ctx, s, 18, rnd);
    topLight(ctx, s, 0.12);
  }

  /** Ocelové dveře; `accent` obarví zámkový pruh (zlatý / stříbrný). */
  function texDoor(ctx, s, accent) {
    var g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, '#3d4553');
    g.addColorStop(0.5, '#5b6575');
    g.addColorStop(1, '#333a46');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);

    rect(ctx, 0, 0, s, 3, '#798496');
    rect(ctx, 0, s - 4, s, 4, '#20252e');
    rect(ctx, 3, 6, s - 6, s - 12, '#4d5666');
    ctx.strokeStyle = '#262c37'; ctx.lineWidth = 2;
    ctx.strokeRect(4, 7, s - 8, s - 14);

    // vodorovné výztuhy
    for (var y = 12; y < s - 12; y += 12) {
      rect(ctx, 6, y, s - 12, 3, '#5f6a7b');
      rect(ctx, 6, y + 3, s - 12, 1, '#2b313c');
    }
    // okénko
    rect(ctx, 22, 18, 20, 12, '#151a22');
    rect(ctx, 23, 19, 18, 10, 'rgba(120,190,220,.20)');
    for (var i = 0; i < 4; i++) rect(ctx, 25 + i * 4, 18, 1, 12, '#3a4350');
    // klika
    rect(ctx, 46, 36, 10, 4, '#9aa6b6');
    rect(ctx, 46, 40, 10, 2, '#3b434f');

    if (accent) {
      rect(ctx, 6, s - 16, s - 12, 6, accent.dark);
      rect(ctx, 6, s - 16, s - 12, 2, accent.light);
      // klíčová dírka
      rect(ctx, 29, s - 15, 6, 4, '#12161c');
    }
    var rnd = mulberry32(97);
    speckle(ctx, s, 10, rnd);
  }

  /** Panel s pákou — výtah na konci levelu. */
  function texSwitch(ctx, s, active) {
    texSteel(ctx, s);
    rect(ctx, 18, 12, 28, 40, '#2c333f');
    ctx.strokeStyle = '#697487'; ctx.lineWidth = 2;
    ctx.strokeRect(19, 13, 26, 38);
    // páka
    var col = active ? '#4ade80' : '#c1121f';
    var glow = active ? 'rgba(74,222,128,.55)' : 'rgba(193,18,31,.45)';
    ctx.shadowColor = glow; ctx.shadowBlur = 10;
    rect(ctx, 30, active ? 18 : 32, 5, 16, '#8b95a6');
    rect(ctx, 28, active ? 16 : 44, 9, 6, col);
    ctx.shadowBlur = 0;
    // kontrolky
    rect(ctx, 22, 44, 5, 5, active ? '#4ade80' : '#20262f');
    rect(ctx, 37, 44, 5, 5, active ? '#4ade80' : '#5a1a1a');
  }

  /** Podlahové dlaždice. */
  function texFloor(ctx, s) {
    var rnd = mulberry32(131);
    rect(ctx, 0, 0, s, s, '#3a3630');
    for (var y = 0; y < s; y += 16) {
      for (var x = 0; x < s; x += 16) {
        var v = 58 + rnd() * 20;
        rect(ctx, x + 1, y + 1, 14, 14, rgb(v, v * 0.94, v * 0.84));
        rect(ctx, x + 1, y + 1, 14, 1, rgb(v + 18, v + 16, v + 12));
        rect(ctx, x + 1, y + 14, 14, 1, rgb(v * 0.7, v * 0.68, v * 0.6));
      }
    }
    speckle(ctx, s, 16, rnd);
  }

  /** Strop — beton s trámy. */
  function texCeil(ctx, s) {
    var rnd = mulberry32(151);
    rect(ctx, 0, 0, s, s, '#3c414e');
    // stropní trámy
    for (var y = 0; y < s; y += 32) {
      rect(ctx, 0, y, s, 7, '#2e323c');
      rect(ctx, 0, y, s, 2, '#4d5262');
      rect(ctx, 0, y + 6, s, 1, '#252932');
    }
    for (var i = 0; i < 60; i++) {
      var v = 50 + rnd() * 20;
      rect(ctx, rnd() * s, rnd() * s, 2 + rnd() * 7, 2, rgb(v, v, v + 6));
    }
    speckle(ctx, s, 16, rnd);
  }

  /* ============================================================
     PŘEDPOČET ZTMAVENÝCH VARIANT
     ============================================================ */
  /** Zmenší RGBA bitmapu na polovinu průměrem čtveřic pixelů (box filter). */
  function downsample(src, s) {
    var d = s >> 1, out = new Uint8ClampedArray(d * d * 4);
    for (var y = 0; y < d; y++) {
      for (var x = 0; x < d; x++) {
        var i0 = ((y * 2) * s + x * 2) * 4, i1 = i0 + 4, i2 = i0 + s * 4, i3 = i2 + 4;
        var o = (y * d + x) * 4;
        out[o]     = (src[i0]     + src[i1]     + src[i2]     + src[i3]     + 2) >> 2;
        out[o + 1] = (src[i0 + 1] + src[i1 + 1] + src[i2 + 1] + src[i3 + 1] + 2) >> 2;
        out[o + 2] = (src[i0 + 2] + src[i1 + 2] + src[i2 + 2] + src[i3 + 2] + 2) >> 2;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  /** 16 úrovní jasu pro jednu bitmapu. */
  function bakeShades(src, size) {
    var n = size * size, shades = [];
    for (var l = 0; l < SHADES; l++) {
      var f = 0.10 + 0.90 * Math.pow(1 - l / (SHADES - 1), 1.32);
      var out = new Uint32Array(n);
      for (var i = 0; i < n; i++) {
        var o = i * 4;
        out[i] = (255 << 24) |
                 ((src[o + 2] * f | 0) << 16) |
                 ((src[o + 1] * f | 0) << 8) |
                 (src[o] * f | 0);
      }
      shades.push(out);
    }
    return shades;
  }

  /**
   * Z canvasu udělá texturu: mip úrovně 64→32→16→8, každá se 16 stíny.
   * Raycaster si podle hustoty texelů na pixel vybere úroveň a podle
   * vzdálenosti stín — za běhu už se nic nepočítá.
   */
  function bake(ctx, size) {
    var data = ctx.getImageData(0, 0, size, size).data;
    var mips = [], s = size;
    for (;;) {
      mips.push({ size: s, shift: Math.log2(s) | 0, mask: s - 1, shades: bakeShades(data, s) });
      if (s <= 8) break;
      data = downsample(data, s);
      s >>= 1;
    }
    return { size: size, shades: mips[0].shades, mips: mips, canvas: ctx.canvas };
  }

  /* ============================================================
     REGISTR
     ============================================================ */
  var GOLD = { dark: '#7a5a10', light: '#ffd257' };
  var SILVER = { dark: '#5d6875', light: '#dce6f2' };

  var TASKS = [
    ['stone',  function (c) { texStone(c, SIZE); }],
    ['brick',  function (c) { texBrick(c, SIZE); }],
    ['wood',   function (c) { texWood(c, SIZE); }],
    ['steel',  function (c) { texSteel(c, SIZE); }],
    ['banner', function (c) { texBanner(c, SIZE); }],
    ['hell',   function (c) { texHell(c, SIZE); }],
    ['door',   function (c) { texDoor(c, SIZE, null); }],
    ['doorG',  function (c) { texDoor(c, SIZE, GOLD); }],
    ['doorS',  function (c) { texDoor(c, SIZE, SILVER); }],
    ['switch0', function (c) { texSwitch(c, SIZE, false); }],
    ['switch1', function (c) { texSwitch(c, SIZE, true); }],
    ['floor',  function (c) { texFloor(c, SIZE); }],
    ['ceil',   function (c) { texCeil(c, SIZE); }]
  ];

  var store = {};

  function buildAll(onProgress, onDone) {
    var i = 0;
    function step() {
      var t0 = performance.now();
      while (i < TASKS.length && performance.now() - t0 < 12) {
        var name = TASKS[i][0];
        var ctx = newCtx(SIZE, SIZE);
        TASKS[i][1](ctx);
        store[name] = bake(ctx, SIZE);
        i++;
      }
      if (onProgress) onProgress(i / TASKS.length);
      // setTimeout, ne rAF – generování musí doběhnout i na skryté záložce
      if (i < TASKS.length) setTimeout(step, 0);
      else if (onDone) onDone();
    }
    step();
  }

  W.Tex = {
    SIZE: SIZE,
    SHADES: SHADES,
    store: store,
    get: function (name) { return store[name]; },
    build: buildAll,
    // pomůcky sdílené s modulem spritů
    newCtx: newCtx,
    rect: rect,
    rgb: rgb,
    rnd: mulberry32
  };

})(window);
