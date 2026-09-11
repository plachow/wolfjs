/* ============================================================
   WOLF·JS — js/raycaster.js
   Vykreslovací jádro: DDA vrhání paprsků, texturované stěny,
   posuvné dveře, castovaná podlaha/strop a sprity se z-bufferem.

   Vše jde do jednoho Uint32Array framebufferu (ABGR), který se
   na konci nahraje do canvasu jediným putImageData.

   Kvalita textur (volby v pauze, čte se z W.UI.settings):
     mip     – mipmapy: podle hustoty texelů na pixel se sáhne do
               zmenšené kopie textury → žádné třpytění v dálce
     filter  – 1: stěny filtrované jen svisle (proti "zubům" na
               vodorovných hranách textur, skoro zadarmo)
               2: plný bilineár – interpolace ze čtyř texelů i na
               podlaze (dražší, hladší, měkčí)
   Hrany stěn (stěna/strop, stěna/podlaha) mají vždy antialiasing:
   krajní pixel se míchá podle toho, jak velkou část zakrývá stěna.
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};
  var Map = null;                       // dosadí se při prvním renderu
  var TEX = 64, SHADES = 16;
  var TILE_OFFSET = 4096;               // posun souřadnic podlahy do kladných čísel

  var img = null, buf = null, bw = 0, bh = 0;
  var zbuf = null;
  var wallTop = null, wallBot = null;   // plně pokryté pixely stěny v každém sloupci
  var edgeTopY = null, edgeBotY = null; // částečně pokryté pixely na horní/dolní hraně stěny…
  var edgeTopCov = null, edgeBotCov = null;   // …jejich pokrytí (0–256)
  var edgeTopCol = null, edgeBotCol = null;   // …a barva stěny, která se do nich přimíchá
  var useMip = true, filterMode = 0;    // 0 ostrý, 1 svisle filtrované stěny, 2 bilineární
  var bilinear = false, vfilter = false;
  var hrow = new Uint32Array(64);       // scratch: sloupec textury po horizontální interpolaci

  /* ============================================================
     BUFFERY
     ============================================================ */
  function resize(ctx, w, h) {
    if (bw === w && bh === h && img) return;
    bw = w; bh = h;
    img = ctx.createImageData(w, h);
    buf = new Uint32Array(img.data.buffer);
    zbuf = new Float32Array(w);
    wallTop = new Int32Array(w);
    wallBot = new Int32Array(w);
    edgeTopY = new Int32Array(w); edgeBotY = new Int32Array(w);
    edgeTopCov = new Int32Array(w); edgeBotCov = new Int32Array(w);
    edgeTopCol = new Uint32Array(w); edgeBotCol = new Uint32Array(w);
  }

  /** Úroveň ztmavení podle vzdálenosti (0 = plný jas). */
  function shadeOf(dist, extra, boost) {
    var l = (dist * 0.92 + extra - boost) | 0;
    return l < 0 ? 0 : (l > SHADES - 1 ? SHADES - 1 : l);
  }

  /** Mip úroveň podle počtu texelů na jeden pixel obrazu. */
  function mipFor(tpp) {
    if (!useMip) return 0;
    return tpp < 1.5 ? 0 : tpp < 3 ? 1 : tpp < 6 ? 2 : 3;
  }

  /**
   * Lineární interpolace dvou ABGR barev, f = 0..256.
   * Kanály r+b a g se počítají ve dvojici najednou (maska 0x00FF00FF),
   * takže jsou to čtyři násobení místo šesti. Alfa se doplní až při zápisu.
   */
  function lerp(a, b, f) {
    var g = 256 - f;
    return ((((a & 0x00FF00FF) * g + (b & 0x00FF00FF) * f) >>> 8) & 0x00FF00FF) |
           ((((a & 0x0000FF00) * g + (b & 0x0000FF00) * f) >>> 8) & 0x0000FF00);
  }

  /* ============================================================
     PODLAHA A STROP
     ============================================================ */
  function castFlats(cam, horizon) {
    var floorTex = W.Tex.get('floor'), ceilTex = W.Tex.get('ceil');
    var posX = cam.x + TILE_OFFSET, posY = cam.y + TILE_OFFSET;
    var dirX = cam.dirX, dirY = cam.dirY;
    var plX = cam.plX, plY = cam.plY;

    // krajní paprsky (levý a pravý okraj obrazu)
    var rdx0 = dirX - plX, rdy0 = dirY - plY;
    var rdx1 = dirX + plX, rdy1 = dirY + plY;
    var posZ = 0.5 * bh;
    var boost = cam.flash || 0;
    var tppK = 2 * cam.planeLen * TEX / bw;      // texelů na pixel při vzdálenosti 1

    for (var y = 0; y < bh; y++) {
      var isFloor = y > horizon;
      var p = isFloor ? (y - horizon) : (horizon - y);
      if (p < 1) p = 1;

      var rowDist = posZ / p;
      if (rowDist > 42) rowDist = 42;

      var stepX = rowDist * (rdx1 - rdx0) / bw;
      var stepY = rowDist * (rdy1 - rdy0) / bw;
      var fx = posX + rowDist * rdx0;
      var fy = posY + rowDist * rdy0;

      var mip = (isFloor ? floorTex : ceilTex).mips[mipFor(rowDist * tppK)];
      var S = mip.size, sh = mip.shift, mask = mip.mask;
      var tbl = mip.shades[isFloor
        ? shadeOf(rowDist, 1, boost > 0 && rowDist < 5 ? 3 : 0)
        : shadeOf(rowDist, 2, 0)];

      var o = y * bw, x;
      if (!bilinear) {
        // ostrá cesta: bez testu na stěnu – větev na pixel stojí víc než jedno čtení,
        // stěny se kreslí až potom a podlahu prostě přepíšou
        for (x = 0; x < bw; x++) {
          buf[o + x] = tbl[((((fy * S) | 0) & mask) << sh) + (((fx * S) | 0) & mask)];
          fx += stepX; fy += stepY;
        }
      } else {
        // bilineární cesta: pixel stojí ~7× víc, takže se vyplatí přeskočit
        // všechno, co za chvíli stejně překryje stěna (kreslí se první)
        for (x = 0; x < bw; x++) {
          if (y >= wallTop[x] && y < wallBot[x]) { fx += stepX; fy += stepY; continue; }
          var u = fx * S, v = fy * S;
          var u0 = u | 0, v0 = v | 0;
          var fu = ((u - u0) * 256) | 0, fv = ((v - v0) * 256) | 0;
          var u1 = (u0 + 1) & mask, v1 = (v0 + 1) & mask;
          u0 &= mask; v0 &= mask;
          var r0 = v0 << sh, r1 = v1 << sh;
          buf[o + x] = lerp(lerp(tbl[r0 + u0], tbl[r0 + u1], fu),
                            lerp(tbl[r1 + u0], tbl[r1 + u1], fu), fv) | 0xFF000000;
          fx += stepX; fy += stepY;
        }
      }
    }
  }

  /* ============================================================
     STĚNY (DDA)
     ============================================================ */
  function castWalls(cam, horizon) {
    var level = Map.level;
    var grid = level.grid, mw = level.w, mh = level.h;
    var posX = cam.x, posY = cam.y;
    var boost = cam.flash || 0;

    for (var x = 0; x < bw; x++) {
      var camX = 2 * x / bw - 1;
      var rdX = cam.dirX + cam.plX * camX;
      var rdY = cam.dirY + cam.plY * camX;

      var mapX = posX | 0, mapY = posY | 0;
      var deltaX = rdX === 0 ? 1e30 : Math.abs(1 / rdX);
      var deltaY = rdY === 0 ? 1e30 : Math.abs(1 / rdY);

      var stepX, stepY, sideX, sideY;
      if (rdX < 0) { stepX = -1; sideX = (posX - mapX) * deltaX; }
      else { stepX = 1; sideX = (mapX + 1 - posX) * deltaX; }
      if (rdY < 0) { stepY = -1; sideY = (posY - mapY) * deltaY; }
      else { stepY = 1; sideY = (mapY + 1 - posY) * deltaY; }

      var side = 0, hit = 0, id = 0, dist = 0, wallU = 0, guard = 0;

      while (!hit && guard++ < 120) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
        else { sideY += deltaY; mapY += stepY; side = 1; }

        if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) { dist = 60; id = 1; hit = 1; break; }
        id = grid[mapY * mw + mapX];
        if (id === 0) continue;

        if (id === 7 || id === 8 || id === 9) {
          /* ---- posuvné dveře: rovina uprostřed buňky ---- */
          var d = Map.doorAt(mapX, mapY);
          var open = d ? d.open : 0;
          var t, u;
          if (d && d.vertical) {
            if (rdX === 0) continue;
            t = (mapX + 0.5 - posX) / rdX;
            if (t <= 0) continue;
            u = posY + rdY * t;
            if (u < mapY || u >= mapY + 1) continue;   // paprsek buňku minul
            u -= mapY;
            side = 0;
          } else {
            if (rdY === 0) continue;
            t = (mapY + 0.5 - posY) / rdY;
            if (t <= 0) continue;
            u = posX + rdX * t;
            if (u < mapX || u >= mapX + 1) continue;
            u -= mapX;
            side = 1;
          }
          if (u < open) continue;                      // tudy je díra – dveře odjely
          dist = t; wallU = u; hit = 2;
          break;
        }

        /* ---- běžná stěna ---- */
        dist = side === 0
          ? (mapX - posX + (1 - stepX) / 2) / rdX
          : (mapY - posY + (1 - stepY) / 2) / rdY;
        if (side === 0) wallU = posY + dist * rdY;
        else wallU = posX + dist * rdX;
        wallU -= Math.floor(wallU);
        hit = 1;
      }

      if (dist < 0.02) dist = 0.02;
      zbuf[x] = dist;

      /* ---- projekce sloupce (subpixelově přesně) ----
         Výška i horní hrana zůstávají desetinné. Plně pokryté pixely se
         kreslí normálně; pixel nad a pod stěnou, který je pokrytý jen
         zčásti, se později přimíchá podle pokrytí → hrana bez schodů. */
      var lineHf = bh / dist;
      var top = horizon - lineHf * 0.5, bot = top + lineHf;
      var y0 = Math.ceil(top), y1 = Math.floor(bot);      // plné pixely: y0 … y1-1
      var ty = y0 - 1, tCov = y0 - top;                   // částečný pixel nad
      var by = y1, bCov = bot - y1;                       // částečný pixel pod
      if (y1 < y0) {                                      // stěna tenčí než pixel
        ty = y1; tCov = lineHf; bCov = 0; y0 = y1 = ty + 1;
      }
      if (y0 < 0) y0 = 0;
      if (y1 > bh) y1 = bh;
      wallTop[x] = y0; wallBot[x] = y1;
      edgeTopY[x] = ty; edgeBotY[x] = by;
      edgeTopCov[x] = (ty >= 0 && ty < bh) ? (tCov * 256) | 0 : 0;
      edgeBotCov[x] = (by >= 0 && by < bh) ? (bCov * 256) | 0 : 0;
      if (y1 <= y0 && !edgeTopCov[x] && !edgeBotCov[x]) continue;

      var texName = hit === 2 ? Map.doorAt(mapX, mapY).tex : Map.texFor(id);
      var tex = W.Tex.get(texName);
      if (!tex) tex = W.Tex.get('stone');

      // orientace textury, aby nebyla zrcadlená
      var u2 = wallU;
      if (hit === 1) {
        if (side === 0 && rdX > 0) u2 = 1 - u2;
        if (side === 1 && rdY < 0) u2 = 1 - u2;
      }

      var mip = tex.mips[mipFor(TEX / lineHf)];
      var S = mip.size, sh = mip.shift, mask = mip.mask;
      var tbl = mip.shades[shadeOf(dist, side === 1 ? 2 : 0, boost > 0 && dist < 6 ? 3 : 0)];

      var stepT = S / lineHf;
      var texPos = (y0 - top) * stepT;                    // ukotveno k přesné hraně, ne k pixelu
      var texX = ((u2 * S) | 0) & mask;
      var o = y0 * bw + x, y, r, rr;

      if (!vfilter) {
        edgeTopCol[x] = tbl[texX];
        edgeBotCol[x] = tbl[((S - 1) << sh) + texX];
        for (y = y0; y < y1; y++) {
          buf[o] = tbl[((texPos & mask) << sh) + texX];
          texPos += stepT;
          o += bw;
        }
      } else {
        // u je pro celý sloupec stejné → připravíme sloupec textury jednou
        // (bilineár: s horizontální interpolací, svislý filtr: bez ní)
        // a per pixel zbývá jediný lerp mezi dvěma řádky
        if (bilinear) {
          var uu = u2 * S, u0 = uu | 0;
          var fu = ((uu - u0) * 256) | 0;
          var u1 = (u0 + 1) & mask;
          u0 &= mask;
          for (r = 0; r < S; r++) { rr = r << sh; hrow[r] = lerp(tbl[rr + u0], tbl[rr + u1], fu); }
        } else {
          for (r = 0; r < S; r++) hrow[r] = tbl[(r << sh) + texX];
        }
        edgeTopCol[x] = hrow[0];
        edgeBotCol[x] = hrow[S - 1];
        for (y = y0; y < y1; y++) {
          var v0 = texPos | 0;
          var fv = ((texPos - v0) * 256) | 0;
          var v1 = (v0 + 1) & mask;
          buf[o] = lerp(hrow[v0 & mask], hrow[v1], fv) | 0xFF000000;
          texPos += stepT;
          o += bw;
        }
      }
    }
  }

  /* ============================================================
     ANTIALIASING HRAN STĚN
     Krajní pixel nad a pod každým sloupcem stěny dostane směs
     toho, co tam už je (strop/podlaha), a barvy stěny podle pokrytí.
     ============================================================ */
  function castEdges() {
    for (var x = 0; x < bw; x++) {
      var c = edgeTopCov[x], o;
      if (c) { o = edgeTopY[x] * bw + x; buf[o] = lerp(buf[o], edgeTopCol[x], c) | 0xFF000000; }
      c = edgeBotCov[x];
      if (c) { o = edgeBotY[x] * bw + x; buf[o] = lerp(buf[o], edgeBotCol[x], c) | 0xFF000000; }
    }
  }

  /* ============================================================
     SPRITY
     ============================================================ */
  var order = [];

  function castSprites(cam, sprites, horizon) {
    var n = sprites.length;
    if (!n) return;

    order.length = 0;
    for (var i = 0; i < n; i++) {
      var s = sprites[i];
      var dx = s.x - cam.x, dy = s.y - cam.y;
      s._d = dx * dx + dy * dy;
      if (s._d < 900) order.push(s);
    }
    order.sort(function (a, b) { return b._d - a._d; });

    var invDet = 1.0 / (cam.plX * cam.dirY - cam.dirX * cam.plY);
    var boost = cam.flash || 0;

    for (i = 0; i < order.length; i++) {
      var sp = order[i];
      var frame = sp.frame;
      if (!frame) continue;

      var sx = sp.x - cam.x, sy = sp.y - cam.y;
      var tX = invDet * (cam.dirY * sx - cam.dirX * sy);
      var tY = invDet * (-cam.plY * sx + cam.plX * sy);
      if (tY < 0.12) continue;

      var scale = sp.scale || 1;
      var screenX = ((bw / 2) * (1 + tX / tY)) | 0;
      var sizeH = Math.abs((bh / tY) * scale) | 0;
      var sizeW = sizeH;
      if (!sizeH) continue;

      // posazení na podlahu (+ volitelné nadzvednutí)
      var ground = horizon + (bh / tY) / 2;
      var drawStartY = (ground - sizeH - (sp.lift || 0) * (bh / tY)) | 0;
      var drawEndY = drawStartY + sizeH;
      var y0 = drawStartY < 0 ? 0 : drawStartY;
      var y1 = drawEndY > bh ? bh : drawEndY;
      if (y1 <= y0) continue;

      var x0 = (screenX - sizeW / 2) | 0;
      var x1 = x0 + sizeW;
      if (x1 <= 0 || x0 >= bw) continue;
      if (x0 < 0) x0 = 0;
      if (x1 > bw) x1 = bw;

      var f = 0.10 + 0.90 * Math.pow(1 - shadeOf(tY, 1, boost > 0 && tY < 6 ? 3 : 0) / (SHADES - 1), 1.32);
      if (sp.glow) f = 1;
      var tint = sp.tint || 0;

      // mip úroveň podle toho, kolik texelů spritu připadá na pixel
      var fr = frame;
      if (frame.mips) {
        var lvl = mipFor(frame.h / sizeH);
        if (lvl >= frame.mips.length) lvl = frame.mips.length - 1;
        fr = frame.mips[lvl];
      }
      var tw = fr.w, th = fr.h, px = fr.px;
      var stepTX = tw / sizeW, stepTY = th / sizeH;

      for (var x = x0; x < x1; x++) {
        if (tY >= zbuf[x]) continue;
        var texX = ((x - (screenX - sizeW / 2)) * stepTX) | 0;
        if (texX < 0) texX = 0; else if (texX >= tw) texX = tw - 1;

        var texPos = (y0 - drawStartY) * stepTY;
        var o = y0 * bw + x;
        for (var y = y0; y < y1; y++) {
          var c = px[((texPos | 0) * tw) + texX];
          texPos += stepTY;
          if (c !== 0) {
            var r = (c & 255) * f, g = ((c >> 8) & 255) * f, b = ((c >> 16) & 255) * f;
            if (tint) {
              r = r + (255 - r) * tint;
              g = g * (1 - tint * 0.75);
              b = b * (1 - tint * 0.75);
            }
            buf[o] = 0xFF000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
          }
          o += bw;
        }
      }
    }
  }

  /* ============================================================
     VEŘEJNÉ API
     ============================================================ */
  function render(ctx, cam, sprites) {
    Map = W.Map;
    resize(ctx, cam.w, cam.h);

    var st = W.UI ? W.UI.settings : null;
    useMip = !st || st.mip !== 0;
    filterMode = st ? (st.filter | 0) : 0;
    bilinear = filterMode === 2;
    vfilter = filterMode >= 1;

    var horizon = bh * 0.5 + (cam.pitch || 0);

    // kamerové vektory
    var aspect = bw / bh;
    var planeLen = 0.66 * (aspect / 1.6);
    cam.planeLen = planeLen;
    cam.dirX = Math.cos(cam.a); cam.dirY = Math.sin(cam.a);
    cam.plX = -cam.dirY * planeLen; cam.plY = cam.dirX * planeLen;

    if (bilinear) {
      castWalls(cam, horizon);        // stěny první: drahá podlaha pak ví, co přeskočit
      castFlats(cam, horizon);
    } else {
      castFlats(cam, horizon);        // levná podlaha přes celý obraz, stěny ji přepíšou
      castWalls(cam, horizon);
    }
    castEdges();                      // až když je pod hranami strop/podlaha
    castSprites(cam, sprites, horizon);

    ctx.putImageData(img, 0, 0);
  }

  W.Ray = {
    render: render,
    resize: function (ctx, w, h) { bw = 0; resize(ctx, w, h); },
    get zbuf() { return zbuf; },
    get width() { return bw; },
    get height() { return bh; }
  };

})(window);
