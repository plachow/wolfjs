/* ============================================================
   WOLF·JS — js/sprites.js
   Procedurální sprity: nepřátelé, boss, pickupy, dekorace.
   Každý snímek se nakreslí do canvasu a převede na Uint32Array
   s alfa-maskou, aby ho raycaster mohl skládat po sloupcích.
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};
  var T = W.Tex;

  var frames = {};                      // jméno snímku -> {w,h,px}

  function newCtx(w, h) { return T.newCtx(w, h); }
  function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  /**
   * Zmenší sprite na polovinu. Průhledné texely se do průměru nepočítají;
   * výsledný texel je neprůhledný, jen když byly aspoň dva ze čtyř.
   */
  function downsamplePx(px, w, h) {
    var dw = w >> 1, dh = h >> 1, out = new Uint32Array(dw * dh);
    for (var y = 0; y < dh; y++) {
      for (var x = 0; x < dw; x++) {
        var i0 = (y * 2) * w + x * 2, i2 = i0 + w;
        var r = 0, g = 0, b = 0, n = 0, c;
        c = px[i0];     if (c) { r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; n++; }
        c = px[i0 + 1]; if (c) { r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; n++; }
        c = px[i2];     if (c) { r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; n++; }
        c = px[i2 + 1]; if (c) { r += c & 255; g += (c >> 8) & 255; b += (c >> 16) & 255; n++; }
        out[y * dw + x] = n >= 2
          ? ((255 << 24) | ((b / n | 0) << 16) | ((g / n | 0) << 8) | (r / n | 0))
          : 0;
      }
    }
    return { w: dw, h: dh, px: out };
  }

  /** Vytáhne z canvasu pixely do Uint32Array (alfa 0 = průhledno) + mip úrovně. */
  function grab(ctx, w, h) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
    var px = new Uint32Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      px[i] = d[o + 3] > 96
        ? ((255 << 24) | (d[o + 2] << 16) | (d[o + 1] << 8) | d[o])
        : 0;
    }
    var base = { w: w, h: h, px: px };
    var mips = [base], m = base;
    while (mips.length < 4 && m.w >= 16 && m.h >= 16) {
      m = downsamplePx(m.px, m.w, m.h);
      mips.push(m);
    }
    base.mips = mips;
    return base;
  }

  /* ============================================================
     PALETY
     ============================================================ */
  var GUARD = {
    coat: '#6d7a54', coatD: '#49523a', coatL: '#8b9a70',
    helm: '#5b6749', helmD: '#3c452f',
    boots: '#241d17', skin: '#e9b98d', skinD: '#bd8b5b',
    belt: '#2c241c', hair: '#54381d', cap: true
  };
  var OFFICER = {
    coat: '#d7dae1', coatD: '#a3a9b4', coatL: '#f2f4f8',
    helm: '#20242d', helmD: '#12151b',
    boots: '#15181e', skin: '#f0c69c', skinD: '#c69a6d',
    belt: '#1b1e25', hair: '#3a2a16', cap: true
  };
  var BOSS = {
    coat: '#443463', coatD: '#271d3d', coatL: '#66528f',
    helm: '#2a2140', helmD: '#181227',
    boots: '#141119', skin: '#dfae86', skinD: '#b07e56',
    belt: '#211a33', hair: null, cap: false
  };

  /* ============================================================
     VOJÁK (guard / officer / boss)
     pose: 'walk' | 'aim' | 'fire' | 'pain' | 'die'
     ============================================================ */
  function drawSoldier(g, P, pose, frame, big) {
    var GROUND = 63;
    var cx = 32;

    /* ---- smrt řešíme zvlášť: rotace + krev ---- */
    if (pose === 'die') {
      var k = frame / 5;                                  // 0..1
      // kaluž krve roste
      g.globalAlpha = Math.min(1, k * 1.6);
      g.fillStyle = '#6d0f13';
      g.beginPath();
      g.ellipse(cx, GROUND - 2, 8 + k * 20, 2 + k * 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#a3161c';
      g.beginPath();
      g.ellipse(cx - 2, GROUND - 3, 5 + k * 13, 1 + k * 4, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      if (frame >= 5) {                                   // ležící mrtvola
        R(g, cx - 22, GROUND - 9, 44, 8, P.coat);
        R(g, cx - 22, GROUND - 9, 44, 2, P.coatL);
        R(g, cx - 24, GROUND - 8, 5, 6, P.skin);
        R(g, cx + 17, GROUND - 7, 8, 5, P.boots);
        R(g, cx - 6, GROUND - 12, 11, 5, P.skin);         // hlava na boku
        R(g, cx - 6, GROUND - 13, 11, 3, P.helm);
        R(g, cx - 3, GROUND - 10, 2, 2, '#3a1010');
        return;
      }

      g.save();
      g.translate(cx, GROUND);
      g.rotate(-k * Math.PI * 0.5);                       // padá dozadu
      g.scale(1, 1 - k * 0.25);
      g.translate(-cx, -GROUND);
      drawSoldierBody(g, P, 'die', frame, GROUND, cx);
      g.restore();
      return;
    }

    drawSoldierBody(g, P, pose, frame, GROUND, cx);

    /* ---- záblesk z hlavně ---- */
    if (pose === 'fire') {
      var fx = cx + (big ? 0 : 0), fy = 34;
      g.globalCompositeOperation = 'lighter';
      var grd = g.createRadialGradient(fx, fy, 0, fx, fy, big ? 20 : 14);
      grd.addColorStop(0, 'rgba(255,255,235,.98)');
      grd.addColorStop(0.35, 'rgba(255,206,90,.85)');
      grd.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(fx, fy, big ? 20 : 14, 0, Math.PI * 2); g.fill();
      // hvězdice
      g.strokeStyle = 'rgba(255,235,170,.9)'; g.lineWidth = 2;
      for (var a = 0; a < 4; a++) {
        var an = a * Math.PI / 4 + 0.4;
        g.beginPath();
        g.moveTo(fx - Math.cos(an) * 12, fy - Math.sin(an) * 12);
        g.lineTo(fx + Math.cos(an) * 12, fy + Math.sin(an) * 12);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  function drawSoldierBody(g, P, pose, frame, GROUND, cx) {
    var bob = 0, spread = 0, lean = 0;

    if (pose === 'walk') {
      var ph = [0, 1, 0, -1][frame & 3];
      spread = [0, 5, 0, 5][frame & 3];
      bob = (frame & 1) ? -1 : 0;
      lean = ph;
    } else if (pose === 'pain') {
      bob = -2; lean = -2;
    } else if (pose === 'die') {
      bob = frame; lean = -frame;
    }

    var topY = 8 + bob;

    /* ---- nohy ---- */
    var lx = cx - 8 - spread * 0.6, rx = cx + 2 + spread * 0.6;
    R(g, lx, 44 + bob, 7, 14, P.coatD);
    R(g, rx, 44 + bob, 7, 14, P.coatD);
    R(g, lx, 44 + bob, 2, 14, P.coat);
    R(g, rx, 44 + bob, 2, 14, P.coat);
    R(g, lx - 1, 57 + bob, 9, 6, P.boots);            // boty
    R(g, rx - 1, 57 + bob, 9, 6, P.boots);
    R(g, lx - 1, 57 + bob, 9, 1, '#4a4038');
    R(g, rx - 1, 57 + bob, 9, 1, '#4a4038');

    /* ---- kabát / trup ---- */
    R(g, cx - 10 + lean, 24 + bob, 20, 21, P.coat);
    R(g, cx - 10 + lean, 24 + bob, 20, 2, P.coatL);       // ramena
    R(g, cx - 10 + lean, 24 + bob, 4, 21, P.coatL);       // levý světlý pruh
    R(g, cx + 6 + lean, 24 + bob, 4, 21, P.coatD);
    R(g, cx - 1 + lean, 24 + bob, 2, 21, P.coatD);        // zapínání
    // opasek + přezka
    R(g, cx - 11 + lean, 42 + bob, 22, 4, P.belt);
    R(g, cx - 2 + lean, 42 + bob, 5, 4, '#b9a05a');
    // límec
    R(g, cx - 6 + lean, 22 + bob, 12, 3, P.coatD);

    /* ---- ruce ---- */
    var armSwing = pose === 'walk' ? [0, -3, 0, 3][frame & 3] : 0;
    if (pose === 'aim' || pose === 'fire') {
      // obě ruce dopředu ke zbrani
      R(g, cx - 14, 30 + bob, 7, 8, P.coat);
      R(g, cx + 7, 30 + bob, 7, 8, P.coat);
      R(g, cx - 9, 33 + bob, 7, 6, P.skin);
      R(g, cx + 2, 33 + bob, 7, 6, P.skin);
    } else if (pose === 'pain') {
      R(g, cx - 16, 22 + bob, 6, 12, P.coat);            // ruce vzhůru
      R(g, cx + 10, 22 + bob, 6, 12, P.coat);
      R(g, cx - 16, 18 + bob, 6, 5, P.skin);
      R(g, cx + 10, 18 + bob, 6, 5, P.skin);
    } else {
      R(g, cx - 14 + lean, 26 + bob + armSwing, 6, 14, P.coat);
      R(g, cx + 8 + lean, 26 + bob - armSwing, 6, 14, P.coat);
      R(g, cx - 14 + lean, 39 + bob + armSwing, 6, 5, P.skin);
      R(g, cx + 8 + lean, 39 + bob - armSwing, 6, 5, P.skin);
    }

    /* ---- zbraň ---- */
    if (pose === 'aim' || pose === 'fire') {
      R(g, cx - 5, 31 + bob, 10, 7, '#2a2f38');
      R(g, cx - 5, 31 + bob, 10, 2, '#4b535f');
      R(g, cx - 2, 29 + bob, 4, 4, '#171b22');           // ústí
      R(g, cx - 1, 30 + bob, 2, 2, '#0a0c10');
    }

    /* ---- hlava ---- */
    var hx = cx - 7 + lean;
    R(g, hx, topY + 4, 14, 14, P.skin);
    R(g, hx, topY + 4, 3, 14, P.skinD);                  // stín na tváři
    R(g, hx + 11, topY + 4, 3, 14, P.skinD);
    // oči
    if (pose === 'pain') {
      R(g, hx + 3, topY + 9, 3, 3, '#ffffff');
      R(g, hx + 8, topY + 9, 3, 3, '#ffffff');
      R(g, hx + 4, topY + 15, 6, 3, '#5d1414');          // otevřená ústa
    } else {
      R(g, hx + 3, topY + 9, 3, 2, '#20242c');
      R(g, hx + 8, topY + 9, 3, 2, '#20242c');
      R(g, hx + 4, topY + 15, 6, 1, '#8a5b3a');
    }
    // helma / čepice
    if (P.cap) {
      R(g, hx - 2, topY, 18, 6, P.helm);
      R(g, hx - 2, topY, 18, 2, P.helmD);
      R(g, hx - 3, topY + 5, 20, 2, P.helmD);            // kšilt
      R(g, hx + 5, topY + 1, 4, 3, '#c9b06a');           // odznak
    } else if (P.hair) {
      R(g, hx, topY + 1, 14, 5, P.hair);
    } else {
      R(g, hx + 1, topY + 2, 12, 4, P.skin);             // holá lebka
      R(g, hx + 1, topY + 2, 12, 1, '#f2cfae');
    }
  }

  /* ============================================================
     BOSS — velký voják se dvěma kulomety
     ============================================================ */
  function drawBoss(g, pose, frame) {
    g.save();
    g.scale(96 / 64, 96 / 64);
    drawSoldier(g, BOSS, pose, frame, true);
    g.restore();

    if (pose === 'die') return;

    // navíc: nárameníky, plášť a dvojice kulometů
    var s = 96 / 64;
    var cx = 48, bob = (pose === 'walk' && (frame & 1)) ? -2 : 0;
    R(g, cx - 26, 34 * s + bob, 12, 6, BOSS.coatL);
    R(g, cx + 14, 34 * s + bob, 12, 6, BOSS.coatL);
    R(g, cx - 26, 34 * s + bob, 12, 2, '#8a74bd');
    R(g, cx + 14, 34 * s + bob, 12, 2, '#8a74bd');

    if (pose === 'aim' || pose === 'fire') {
      // dva kulomety po stranách
      [-1, 1].forEach(function (sgn) {
        var bx = cx + sgn * 22 - 7;
        R(g, bx, 48 + bob, 14, 9, '#232830');
        R(g, bx, 48 + bob, 14, 2, '#454e5c');
        R(g, bx + 4, 44 + bob, 6, 6, '#14181e');
        R(g, bx + 5, 45 + bob, 4, 4, '#05070a');
        R(g, bx + 1, 57 + bob, 12, 3, '#1a1e25');
      });
      if (pose === 'fire') {
        g.globalCompositeOperation = 'lighter';
        [-1, 1].forEach(function (sgn) {
          var fx = cx + sgn * 22, fy = 45 + bob;
          var grd = g.createRadialGradient(fx, fy, 0, fx, fy, 18);
          grd.addColorStop(0, 'rgba(255,255,240,.95)');
          grd.addColorStop(0.4, 'rgba(255,190,70,.8)');
          grd.addColorStop(1, 'rgba(255,110,10,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(fx, fy, 18, 0, Math.PI * 2); g.fill();
        });
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ============================================================
     PES
     ============================================================ */
  var DOG = { fur: '#6b5236', furD: '#493422', furL: '#8d7048', belly: '#a08862' };

  function drawDog(g, pose, frame) {
    var GROUND = 63;

    if (pose === 'die') {
      var k = frame / 3;
      g.globalAlpha = Math.min(1, k * 1.7);
      g.fillStyle = '#7a1116';
      g.beginPath(); g.ellipse(32, GROUND - 2, 8 + k * 16, 2 + k * 5, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (frame >= 3) {
        R(g, 12, GROUND - 10, 34, 9, DOG.fur);
        R(g, 12, GROUND - 10, 34, 2, DOG.furL);
        R(g, 44, GROUND - 13, 12, 8, DOG.fur);          // hlava
        R(g, 52, GROUND - 11, 4, 3, '#2a1a10');
        R(g, 8, GROUND - 6, 6, 3, DOG.furD);            // ocas
        R(g, 18, GROUND - 14, 4, 5, DOG.furD);          // nohy vzhůru
        R(g, 30, GROUND - 15, 4, 6, DOG.furD);
        return;
      }
      g.save();
      g.translate(32, GROUND);
      g.rotate(k * 1.2);
      g.translate(-32, -GROUND);
      dogBody(g, 'walk', 0, GROUND);
      g.restore();
      return;
    }
    dogBody(g, pose, frame, GROUND);
  }

  function dogBody(g, pose, frame, GROUND) {
    var bob = pose === 'walk' ? [0, -1, 0, -2][frame & 3] : (pose === 'bite' ? -3 : 0);
    var lunge = pose === 'bite' ? (frame ? 4 : 2) : 0;

    /* nohy */
    var ph = [0, 3, 0, -3][frame & 3];
    R(g, 20, 50 + bob, 6, 12, DOG.furD);
    R(g, 38, 50 + bob, 6, 12, DOG.furD);
    R(g, 26 + ph, 50 + bob, 5, 12, DOG.fur);
    R(g, 33 - ph, 50 + bob, 5, 12, DOG.fur);
    R(g, 19, GROUND - 3, 8, 3, '#2b2118');
    R(g, 37, GROUND - 3, 8, 3, '#2b2118');

    /* trup */
    R(g, 17, 36 + bob, 30, 16, DOG.fur);
    R(g, 17, 36 + bob, 30, 3, DOG.furL);
    R(g, 20, 47 + bob, 24, 5, DOG.belly);
    R(g, 17, 36 + bob, 4, 16, DOG.furD);

    /* ocas */
    R(g, 12, 34 + bob, 6, 4, DOG.furD);
    R(g, 8, 30 + bob, 5, 5, DOG.fur);

    /* hlava */
    var hy = 20 + bob - lunge;
    R(g, 24, hy, 18, 18, DOG.fur);
    R(g, 24, hy, 18, 3, DOG.furL);
    R(g, 24, hy, 4, 18, DOG.furD);
    // uši
    R(g, 22, hy - 5, 5, 8, DOG.furD);
    R(g, 39, hy - 5, 5, 8, DOG.furD);
    R(g, 23, hy - 3, 3, 5, DOG.fur);
    R(g, 40, hy - 3, 3, 5, DOG.fur);
    // oči
    R(g, 28, hy + 6, 4, 3, '#f5c518');
    R(g, 35, hy + 6, 4, 3, '#f5c518');
    R(g, 29, hy + 7, 2, 2, '#140d05');
    R(g, 36, hy + 7, 2, 2, '#140d05');
    // čenich
    R(g, 29, hy + 12, 9, 6, DOG.furL);
    R(g, 31, hy + 12, 5, 3, '#20160e');

    if (pose === 'bite') {
      R(g, 28, hy + 15, 11, 7, '#5d0f14');               // tlama
      for (var i = 0; i < 4; i++) {
        R(g, 29 + i * 3, hy + 15, 2, 3, '#f2f0e6');      // horní zuby
        R(g, 30 + i * 3, hy + 19, 2, 3, '#f2f0e6');
      }
      R(g, 31, hy + 18, 5, 2, '#8e2028');                // jazyk
    } else if (pose === 'pain') {
      R(g, 29, hy + 15, 9, 4, '#5d0f14');
      R(g, 26, hy + 4, 12, 2, '#a3161c');
    }
  }

  /* ============================================================
     PICKUPY
     ============================================================ */
  function pAmmo(g, big) {
    var w = big ? 26 : 16, x = 32 - w / 2, y = big ? 40 : 46;
    var h = big ? 22 : 17;
    R(g, x, y, w, h, '#4d5566');
    R(g, x, y, w, 3, '#7d8798');
    R(g, x, y + h - 3, w, 3, '#2b313c');
    R(g, x + 2, y + 3, w - 4, h - 6, '#3b4450');
    for (var i = 0; i < (big ? 5 : 3); i++) {
      var bx = x + 3 + i * ((w - 6) / (big ? 5 : 3));
      R(g, bx, y - 4, 3, 6, '#c9a227');
      R(g, bx, y - 6, 3, 3, '#8a6a14');
    }
    R(g, x + 2, y + h - 8, w - 4, 3, '#c1121f');
  }

  function pMedkit(g) {
    R(g, 20, 40, 24, 20, '#e8ecf2');
    R(g, 20, 40, 24, 3, '#ffffff');
    R(g, 20, 57, 24, 3, '#a9b0bc');
    R(g, 20, 40, 3, 20, '#c6ccd6');
    R(g, 29, 44, 6, 13, '#c1121f');
    R(g, 24, 47, 16, 6, '#c1121f');
    R(g, 27, 37, 10, 4, '#8b93a1');                       // rukojeť
    R(g, 27, 37, 10, 1, '#c2c9d4');
  }

  function pFood(g) {
    R(g, 20, 50, 24, 4, '#c9ccd3');                        // talíř
    R(g, 18, 52, 28, 4, '#9aa1ad');
    g.fillStyle = '#8a5423';
    g.beginPath(); g.ellipse(32, 47, 11, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a8702f';
    g.beginPath(); g.ellipse(30, 45, 8, 5, 0, 0, Math.PI * 2); g.fill();
    R(g, 38, 42, 4, 9, '#e6d5b8');                         // kost
    R(g, 40, 40, 4, 4, '#f2e6d0');
  }

  function pSmg(g) {
    R(g, 14, 46, 36, 7, '#2e343e');
    R(g, 14, 46, 36, 2, '#525c6b');
    R(g, 44, 47, 12, 4, '#1a1e25');                        // hlaveň
    R(g, 22, 52, 8, 11, '#242a33');                        // zásobník
    R(g, 16, 52, 5, 7, '#3a4250');
    R(g, 12, 44, 8, 5, '#5a4326');                         // pažba
    R(g, 32, 43, 14, 4, '#3d4551');
  }

  function pShotgun(g) {
    R(g, 8, 47, 34, 5, '#5a6270');                // hlaveň
    R(g, 8, 47, 34, 1, '#98a2b1');
    R(g, 12, 52, 26, 3, '#3a4048');               // zásobník
    R(g, 20, 44, 12, 12, '#6b4a24');              // předpažbí
    R(g, 40, 45, 10, 9, '#33383f');               // závěr
    g.fillStyle = '#6b4a24';
    g.beginPath(); g.moveTo(48, 46); g.lineTo(60, 50); g.lineTo(60, 61); g.lineTo(49, 55); g.closePath(); g.fill();
    R(g, 4, 48, 5, 3, '#242931');
  }

  function pShells(g) {
    R(g, 22, 44, 20, 15, '#8d1220');              // krabička
    R(g, 22, 44, 20, 3, '#c1121f');
    R(g, 22, 56, 20, 3, '#5a0a12');
    R(g, 24, 47, 16, 8, '#a8161f');
    for (var i = 0; i < 4; i++) {                 // vyčnívající broky
      R(g, 24 + i * 4, 38, 3, 8, '#c1121f');
      R(g, 24 + i * 4, 44, 3, 2, '#c9a227');
    }
    R(g, 26, 50, 12, 2, '#f2e6d0');
  }

  function pKey(g, gold) {
    var a = gold ? '#ffd257' : '#dfe8f4';
    var b = gold ? '#a37a12' : '#8d97a5';
    g.strokeStyle = b; g.lineWidth = 5;
    g.beginPath(); g.arc(26, 46, 7, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = a; g.lineWidth = 3;
    g.beginPath(); g.arc(26, 46, 7, 0, Math.PI * 2); g.stroke();
    R(g, 32, 44, 18, 4, b);
    R(g, 32, 44, 18, 2, a);
    R(g, 44, 48, 3, 6, b);
    R(g, 38, 48, 3, 5, b);
  }

  function pTreasure(g, kind) {
    if (kind === 0) {                                      // zlatý kříž
      R(g, 29, 36, 6, 26, '#e8b437');
      R(g, 22, 42, 20, 6, '#e8b437');
      R(g, 29, 36, 2, 26, '#fce9a8');
      R(g, 22, 42, 20, 2, '#fce9a8');
      R(g, 29, 60, 6, 2, '#8a6a14');
    } else if (kind === 1) {                               // pohár
      R(g, 26, 52, 12, 3, '#e8b437');
      R(g, 30, 46, 4, 8, '#c9a227');
      g.fillStyle = '#e8b437';
      g.beginPath();
      g.moveTo(22, 34); g.lineTo(42, 34); g.lineTo(37, 47); g.lineTo(27, 47);
      g.closePath(); g.fill();
      R(g, 23, 34, 18, 3, '#fce9a8');
      R(g, 28, 38, 3, 6, '#fff3c9');
    } else {                                               // koruna
      g.fillStyle = '#e8b437';
      g.beginPath();
      g.moveTo(20, 56); g.lineTo(20, 40); g.lineTo(26, 47); g.lineTo(32, 36);
      g.lineTo(38, 47); g.lineTo(44, 40); g.lineTo(44, 56);
      g.closePath(); g.fill();
      R(g, 20, 52, 24, 4, '#c9a227');
      R(g, 20, 52, 24, 1, '#fce9a8');
      R(g, 24, 44, 3, 3, '#c1121f');
      R(g, 37, 44, 3, 3, '#2f6fd0');
      R(g, 30, 40, 4, 4, '#4ade80');
    }
  }

  /* ============================================================
     DEKORACE
     ============================================================ */
  function dPillar(g) {
    var grd = g.createLinearGradient(20, 0, 44, 0);
    grd.addColorStop(0, '#3d434f');
    grd.addColorStop(0.4, '#798496');
    grd.addColorStop(1, '#333944');
    g.fillStyle = grd; g.fillRect(21, 4, 22, 56);
    R(g, 17, 0, 30, 7, '#6c7788');
    R(g, 17, 0, 30, 2, '#98a3b4');
    R(g, 17, 57, 30, 7, '#5a6474');
    R(g, 17, 57, 30, 2, '#828d9e');
    for (var y = 10; y < 56; y += 8) R(g, 21, y, 22, 1, 'rgba(0,0,0,.28)');
  }

  function dBarrel(g) {
    var grd = g.createLinearGradient(18, 0, 46, 0);
    grd.addColorStop(0, '#4a3419');
    grd.addColorStop(0.4, '#8a6432');
    grd.addColorStop(1, '#3f2c15');
    g.fillStyle = grd; g.fillRect(19, 26, 26, 37);
    R(g, 19, 26, 26, 4, '#9c7139');
    R(g, 17, 32, 30, 4, '#565f6e');
    R(g, 17, 46, 30, 4, '#565f6e');
    R(g, 17, 32, 30, 1, '#8b95a6');
    R(g, 17, 46, 30, 1, '#8b95a6');
    R(g, 19, 60, 26, 3, '#2a1d0e');
    for (var x = 21; x < 44; x += 5) R(g, x, 30, 1, 33, 'rgba(0,0,0,.22)');
  }

  function dTable(g) {
    R(g, 10, 40, 44, 5, '#8a6432');
    R(g, 10, 40, 44, 2, '#a87c42');
    R(g, 10, 45, 44, 2, '#4a3419');
    R(g, 14, 47, 5, 16, '#5c421f');
    R(g, 45, 47, 5, 16, '#5c421f');
    // hrnek a talíř
    R(g, 22, 34, 8, 6, '#c9ccd3');
    R(g, 30, 36, 3, 3, '#9aa1ad');
    g.fillStyle = '#d8dbe2';
    g.beginPath(); g.ellipse(41, 38, 7, 2.5, 0, 0, Math.PI * 2); g.fill();
  }

  function dBrazier(g, f) {
    R(g, 26, 46, 12, 17, '#3a4250');
    R(g, 22, 60, 20, 3, '#2a3038');
    R(g, 22, 40, 20, 8, '#4d5666');
    R(g, 22, 40, 20, 2, '#798496');
    // plamen
    g.globalCompositeOperation = 'lighter';
    var h = f ? 22 : 18, w = f ? 9 : 11;
    var grd = g.createRadialGradient(32, 34, 1, 32, 34, h);
    grd.addColorStop(0, 'rgba(255,255,220,.95)');
    grd.addColorStop(0.35, 'rgba(255,180,50,.8)');
    grd.addColorStop(1, 'rgba(220,60,10,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32 - w, 42);
    g.quadraticCurveTo(32 - w * 0.6, 42 - h * 0.7, 32, 42 - h);
    g.quadraticCurveTo(32 + w * 0.6, 42 - h * 0.7, 32 + w, 42);
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }

  function dBones(g) {
    R(g, 16, 56, 32, 4, '#cfc7b2');
    R(g, 14, 54, 5, 8, '#e0d9c6');
    R(g, 45, 54, 5, 8, '#e0d9c6');
    g.fillStyle = '#e6dfcc';
    g.beginPath(); g.ellipse(30, 49, 8, 7, 0, 0, Math.PI * 2); g.fill();
    R(g, 26, 47, 3, 3, '#2a2620');
    R(g, 32, 47, 3, 3, '#2a2620');
    R(g, 28, 54, 5, 2, '#2a2620');
  }

  function dBlood(g) {
    g.fillStyle = '#6d0f13';
    g.beginPath(); g.ellipse(32, 58, 22, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a3161c';
    g.beginPath(); g.ellipse(29, 57, 14, 3, 0, 0, Math.PI * 2); g.fill();
  }

  /* ============================================================
     SESTAVENÍ VŠECH SNÍMKŮ
     ============================================================ */
  function soldierSet(prefix, P) {
    var out = [];
    for (var i = 0; i < 4; i++) out.push([prefix + '_walk' + i, 64, 64, mk('walk', i)]);
    out.push([prefix + '_aim', 64, 64, mk('aim', 0)]);
    out.push([prefix + '_fire', 64, 64, mk('fire', 0)]);
    out.push([prefix + '_pain', 64, 64, mk('pain', 0)]);
    for (var d = 0; d <= 5; d++) out.push([prefix + '_die' + d, 64, 64, mk('die', d)]);
    return out;
    function mk(pose, f) {
      return function (g) { drawSoldier(g, P, pose, f, false); };
    }
  }

  function bossSet() {
    var out = [];
    for (var i = 0; i < 4; i++) out.push(['boss_walk' + i, 96, 96, mk('walk', i)]);
    out.push(['boss_aim', 96, 96, mk('aim', 0)]);
    out.push(['boss_fire', 96, 96, mk('fire', 0)]);
    out.push(['boss_pain', 96, 96, mk('pain', 0)]);
    for (var d = 0; d <= 5; d++) out.push(['boss_die' + d, 96, 96, mk('die', d)]);
    return out;
    function mk(pose, f) { return function (g) { drawBoss(g, pose, f); }; }
  }

  function dogSet() {
    var out = [];
    for (var i = 0; i < 4; i++) out.push(['dog_walk' + i, 64, 64, mk('walk', i)]);
    out.push(['dog_aim', 64, 64, mk('bite', 0)]);
    out.push(['dog_fire', 64, 64, mk('bite', 1)]);
    out.push(['dog_pain', 64, 64, mk('pain', 0)]);
    for (var d = 0; d <= 3; d++) out.push(['dog_die' + d, 64, 64, mk('die', d)]);
    return out;
    function mk(pose, f) { return function (g) { drawDog(g, pose, f); }; }
  }

  var TASKS = []
    .concat(soldierSet('guard', GUARD))
    .concat(soldierSet('officer', OFFICER))
    .concat(dogSet())
    .concat(bossSet())
    .concat([
      ['ammo',     64, 64, function (g) { pAmmo(g, false); }],
      ['ammoBig',  64, 64, function (g) { pAmmo(g, true); }],
      ['medkit',   64, 64, pMedkit],
      ['food',     64, 64, pFood],
      ['smg',      64, 64, pSmg],
      ['shotgun',  64, 64, pShotgun],
      ['shells',   64, 64, pShells],
      ['keyGold',  64, 64, function (g) { pKey(g, true); }],
      ['keySilver', 64, 64, function (g) { pKey(g, false); }],
      ['cross',    64, 64, function (g) { pTreasure(g, 0); }],
      ['chalice',  64, 64, function (g) { pTreasure(g, 1); }],
      ['crown',    64, 64, function (g) { pTreasure(g, 2); }],
      ['pillar',   64, 64, dPillar],
      ['barrel',   64, 64, dBarrel],
      ['table',    64, 64, dTable],
      ['brazier0', 64, 64, function (g) { dBrazier(g, 0); }],
      ['brazier1', 64, 64, function (g) { dBrazier(g, 1); }],
      ['bones',    64, 64, dBones],
      ['blood',    64, 64, dBlood]
    ]);

  function build(onProgress, onDone) {
    var i = 0;
    function step() {
      var t0 = performance.now();
      while (i < TASKS.length && performance.now() - t0 < 12) {
        var t = TASKS[i];
        var ctx = newCtx(t[1], t[2]);
        t[3](ctx);
        frames[t[0]] = grab(ctx, t[1], t[2]);
        i++;
      }
      if (onProgress) onProgress(i / TASKS.length);
      // setTimeout, ne rAF – generování musí doběhnout i na skryté záložce
      if (i < TASKS.length) setTimeout(step, 0);
      else if (onDone) onDone();
    }
    step();
  }

  W.Spr = {
    frames: frames,
    get: function (n) { return frames[n]; },
    build: build,
    count: TASKS.length
  };

})(window);
