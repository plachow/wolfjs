/* ============================================================
   WOLF·JS — js/entities.js
   Nepřátelé (3 druhy + boss), pickupy a dekorace.

   AI vojáků (guard / officer / boss):
     idle → engage → attack → (cover) → engage …, hunt když ztratí kontakt
     · drží si odstup (keep[min,max]), místo přímého náběhu krouží
     · po dávce se s pravděpodobností schová za roh a vykoukne
     · stráže u klíčů a výtahu drží pozici (post + leash)
     · navigují po flow-fieldu (BFS od hráče), otevírají obyčejné dveře
   Psi chodí přímo (chase → bite).
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};

  /* ============================================================
     DEFINICE NEPŘÁTEL
     ============================================================ */
  var ENEMY = {
    guard: {
      name: 'Strážný', spr: 'guard', scale: 0.86, radius: 0.28,
      hp: 26, speed: 1.9, sight: 15,
      range: 13, aim: 0.30, cool: 1.0, burst: 1,
      dmg: [3, 11], acc: 0.42, score: 100,
      keep: [3.0, 7.5], strafe: 0.55, coverChance: 0.45,
      dieFrames: 6, snd: 'alertGuard', dieSnd: 'dieGuard'
    },
    dog: {
      name: 'Vlčák', spr: 'dog', scale: 0.60, radius: 0.26,
      hp: 15, speed: 3.6, sight: 13,
      range: 1.25, aim: 0.18, cool: 0.7, burst: 1, melee: true,
      dmg: [4, 12], acc: 0.85, score: 200,
      dieFrames: 4, snd: 'alertDog', dieSnd: 'dieDog'
    },
    officer: {
      name: 'Důstojník', spr: 'officer', scale: 0.88, radius: 0.28,
      hp: 58, speed: 2.6, sight: 17,
      range: 15, aim: 0.22, cool: 0.7, burst: 3, burstGap: 0.11,
      dmg: [4, 14], acc: 0.55, score: 500,
      keep: [4.0, 9.0], strafe: 0.8, coverChance: 0.65,
      dieFrames: 6, snd: 'alertOfficer', dieSnd: 'dieOfficer'
    },
    boss: {
      name: 'Generál', spr: 'boss', scale: 1.30, radius: 0.38,
      hp: 480, speed: 1.7, sight: 22,
      range: 18, aim: 0.35, cool: 1.25, burst: 9, burstGap: 0.085,
      dmg: [5, 15], acc: 0.5, score: 5000,
      keep: [2.5, 8.0], strafe: 0.7, coverChance: 0,
      dieFrames: 6, snd: 'alertBoss', dieSnd: 'dieBoss', boss: true
    }
  };

  /* ============================================================
     DEFINICE PŘEDMĚTŮ
     ============================================================ */
  var ITEM = {
    ammo:      { spr: 'ammo',      ammo: 8,  msg: 'Zásobník',        snd: 'pickAmmo' },
    ammoBig:   { spr: 'ammoBig',   ammo: 25, msg: 'Bedna nábojů',    snd: 'pickAmmo' },
    shells:    { spr: 'shells',    shells: 4, msg: 'Broky +4',       snd: 'pickAmmo' },
    medkit:    { spr: 'medkit',    heal: 25, msg: 'Lékárnička +25',  snd: 'pickHealth' },
    food:      { spr: 'food',      heal: 10, msg: 'Jídlo +10',       snd: 'pickHealth' },
    smg:       { spr: 'smg',       weapon: 2, ammo: 20, msg: 'SAMOPAL MP-40!', snd: 'pickWeapon' },
    shotgun:   { spr: 'shotgun',   weapon: 3, shells: 8, msg: 'BROKOVNICE!',   snd: 'pickWeapon' },
    keyGold:   { spr: 'keyGold',   key: 1,   msg: 'Zlatý klíč',      snd: 'pickKey' },
    keySilver: { spr: 'keySilver', key: 2,   msg: 'Stříbrný klíč',   snd: 'pickKey' },
    cross:     { spr: 'cross',     score: 100, treasure: 1, msg: 'Zlatý kříž +100',  snd: 'pickTreasure' },
    chalice:   { spr: 'chalice',   score: 250, treasure: 1, msg: 'Pohár +250',       snd: 'pickTreasure' },
    crown:     { spr: 'crown',     score: 500, treasure: 1, msg: 'Koruna +500',      snd: 'pickTreasure' }
  };

  var DECO = {
    // solid = neprůstřelné: zastaví střelu i pohled → krytí pro hráče i nepřátele.
    // Stoly a ohniště jsou nízké, přes ty se střílí.
    pillar:  { spr: 'pillar',  blocking: true,  solid: true, scale: 1.0 },
    barrel:  { spr: 'barrel',  blocking: true,  solid: true, scale: 1.0, radius: 0.34 },
    table:   { spr: 'table',   blocking: true,  scale: 1.0, radius: 0.38 },
    brazier: { spr: 'brazier0', blocking: true, scale: 1.0, radius: 0.3, anim: true, glow: true },
    bones:   { spr: 'bones',   blocking: false, scale: 1.0 },
    blood:   { spr: 'blood',   blocking: false, scale: 1.0 }
  };

  /* ============================================================
     STAV
     ============================================================ */
  var enemies = [], items = [], decos = [], sprites = [];
  var solid = null;                  // Uint8Array: buňky s neprůstřelnou dekorací (sud, sloup)
  var stats = { kills: 0, totalKills: 0, treasure: 0, totalTreasure: 0, secrets: 0, totalSecrets: 0 };
  var hooks = {};
  var diff = 1;
  var levelRef = null;

  function spr(n) { return W.Spr.get(n); }
  function rnd() { return Math.random(); }

  /* ============================================================
     ZALOŽENÍ LEVELU
     ============================================================ */
  function spawn(level, difficulty) {
    diff = difficulty;
    levelRef = level;
    enemies.length = 0; items.length = 0; decos.length = 0; sprites.length = 0;
    stats.kills = stats.totalKills = 0;
    stats.treasure = stats.totalTreasure = 0;
    stats.secrets = 0;
    stats.totalSecrets = level.secrets.length;
    flow = null; flowCell = -1;
    solid = new Uint8Array(level.w * level.h);

    var dmgMul = [0.6, 1, 1.45][difficulty] || 1;
    var hpMul = [0.8, 1, 1.15][difficulty] || 1;

    for (var i = 0; i < level.things.length; i++) {
      var t = level.things[i];
      var type = t[0], x = t[1] + 0.5, y = t[2] + 0.5;

      if (ENEMY[type]) {
        var d = ENEMY[type];
        if (d.boss && level.bossName) {
          d = Object.create(d);
          d.name = level.bossName;
          if (level.bossHp) d.hp = level.bossHp;
        }
        enemies.push({
          kind: 'enemy', def: d, type: type,
          hidden: !!(d.boss && level.arena),      // boss v aréně čeká na zapečetění dveří
          x: x, y: y, r: d.radius,
          hp: Math.round(d.hp * hpMul), maxHp: Math.round(d.hp * hpMul),
          dmgMul: dmgMul,
          state: 'idle', t: 0, af: 0, at: 0,
          burstLeft: 0, cool: 0, tint: 0,
          alerted: false, dieFrame: 0,
          scale: d.scale, frame: spr(d.spr + '_walk0'),
          // taktika
          lkX: x, lkY: y, lostT: 0, huntT: 0,
          post: null, leash: 0,
          coverX: 0, coverY: 0, coverT: 0, peekT: 0,
          side: rnd() < 0.5 ? -1 : 1, sideT: rnd(), holdT: 0,
          lastX: x, lastY: y, stuckT: 0, detourT: 0, detourDir: 1,
          moving: false
        });
        stats.totalKills++;
      } else if (ITEM[type]) {
        var it = ITEM[type];
        items.push({
          kind: 'item', def: it, type: type,
          x: x, y: y, r: 0.42, taken: false,
          scale: 1, frame: spr(it.spr), bob: rnd() * 6.28
        });
        if (it.treasure) stats.totalTreasure++;
      } else if (DECO[type]) {
        var dc = DECO[type];
        decos.push({
          kind: 'deco', def: dc, type: type,
          x: x, y: y, r: dc.radius || 0.3,
          blocking: dc.blocking, scale: dc.scale,
          frame: spr(dc.spr), glow: dc.glow, anim: dc.anim
        });
        if (dc.solid) solid[(y | 0) * level.w + (x | 0)] = 1;
      }
    }

    scatter(level);
    assignGuardians(level);
  }

  /**
   * Trochu náhody: každý nepřítel (kromě bosse) se posune na náhodnou volnou
   * dlaždici do 3 kroků od autorské pozice. Nepřechází dveře (zůstane ve své
   * místnosti), nevleze do startovní místnosti ani na dekoraci.
   */
  function scatter(level) {
    var w = level.w, key = function (x, y) { return y * w + x; };

    // startovní místnost: co je dosažitelné bez otevření dveří
    var safe = {}, sx = level.start.x | 0, sy = level.start.y | 0;
    var q = [[sx, sy]]; safe[key(sx, sy)] = 1;
    while (q.length) {
      var c = q.pop();
      for (var k = 0; k < 4; k++) {
        var nx = c[0] + [1, -1, 0, 0][k], ny = c[1] + [0, 0, 1, -1][k];
        if (W.Map.at(nx, ny) !== 0 || safe[key(nx, ny)]) continue;
        safe[key(nx, ny)] = 1; q.push([nx, ny]);
      }
    }

    var taken = {};
    for (var i = 0; i < decos.length; i++) if (decos[i].blocking) taken[key(decos[i].x | 0, decos[i].y | 0)] = 1;

    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.def.boss) continue;
      var ox = e.x | 0, oy = e.y | 0;
      var seen = {}; seen[key(ox, oy)] = 1;
      var cands = [[ox, oy]], front = [[ox, oy, 0]];
      while (front.length) {
        var f = front.shift();
        if (f[2] >= 3) continue;
        for (k = 0; k < 4; k++) {
          nx = f[0] + [1, -1, 0, 0][k]; ny = f[1] + [0, 0, 1, -1][k];
          var kk = key(nx, ny);
          if (seen[kk] || W.Map.at(nx, ny) !== 0) continue;   // dveře i zdi zastaví
          seen[kk] = 1;
          front.push([nx, ny, f[2] + 1]);
          if (!safe[kk] && !taken[kk]) cands.push([nx, ny]);
        }
      }
      var pick = cands[(rnd() * cands.length) | 0];
      if (!pick || taken[key(pick[0], pick[1])]) continue;
      taken[key(pick[0], pick[1])] = 1;
      e.x = pick[0] + 0.5 + (rnd() - 0.5) * 0.4;
      e.y = pick[1] + 0.5 + (rnd() - 0.5) * 0.4;
      e.lastX = e.lkX = e.x; e.lastY = e.lkY = e.y;
    }
  }

  /** Boss v aréně se zjeví (volá hra po zapečetění dveří). */
  function revealBoss(p) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.hidden) continue;
      e.hidden = false;
      e.tint = 1;
      alert(e, p);
    }
  }

  /** Vojáci do 3 dlaždic od klíče nebo páky drží pozici a nechodí za hráčem daleko. */
  function assignGuardians(level) {
    var posts = [];
    for (var i = 0; i < items.length; i++) if (items[i].def.key) posts.push([items[i].x, items[i].y]);
    for (var y = 0; y < level.h; y++) {
      for (var x = 0; x < level.w; x++) if (level.grid[y * level.w + x] === 10) posts.push([x + 0.5, y + 0.5]);
    }
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.def.melee || e.def.boss) continue;
      for (var k = 0; k < posts.length; k++) {
        var dx = posts[k][0] - e.x, dy = posts[k][1] - e.y;
        if (dx * dx + dy * dy <= 16) { e.post = { x: e.x, y: e.y }; e.leash = 3.5; break; }
      }
    }
  }

  /* ============================================================
     GEOMETRIE
     ============================================================ */

  /**
   * Přímá viditelnost (a průchodnost pro střelu); výchozí a cílová buňka
   * se ignorují. Kromě zdí a zavřených dveří ji blokují i neprůstřelné
   * dekorace – sudy a sloupy, za které se dá schovat.
   */
  function los(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return true;
    var steps = (len / 0.12) | 0;
    if (steps < 1) steps = 1;
    var sx = dx / steps, sy = dy / steps;
    var ax = x0 | 0, ay = y0 | 0, bx = x1 | 0, by = y1 | 0;
    var x = x0, y = y0;
    for (var i = 0; i < steps; i++) {
      x += sx; y += sy;
      var cx = x | 0, cy = y | 0;
      if ((cx === ax && cy === ay) || (cx === bx && cy === by)) continue;
      if (W.Map.opaque(cx, cy)) return false;
      if (solid && solid[cy * W.Map.level.w + cx]) return false;
    }
    return true;
  }

  function entityBlocks(x, y, ignore) {
    var i, e;
    for (i = 0; i < decos.length; i++) {
      e = decos[i];
      if (!e.blocking) continue;
      if (Math.abs(x - e.x) < e.r && Math.abs(y - e.y) < e.r) return true;
    }
    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e === ignore || e.hidden || e.state === 'die' || e.state === 'dead') continue;
      if (Math.abs(x - e.x) < e.r + 0.16 && Math.abs(y - e.y) < e.r + 0.16) return true;
    }
    return false;
  }

  function decoBlocksCell(cx, cy) {
    for (var i = 0; i < decos.length; i++) {
      var d = decos[i];
      if (d.blocking && (d.x | 0) === cx && (d.y | 0) === cy) return true;
    }
    return false;
  }

  /** Průchodnost buňky pro nepřátele: podlaha, obyčejné dveře, otevřené zamčené dveře. */
  function enemyPassable(cx, cy) {
    var id = W.Map.at(cx, cy);
    if (id === 0) return !decoBlocksCell(cx, cy);
    var d = W.Map.doorAt(cx, cy);
    if (id === 7) return !!d && (d.lock === 0 || d.open > 0.5);
    if (id === 8 || id === 9) return !!d && d.open > 0.5;
    return false;
  }

  /** Nepřítel, který chce projít dveřmi, si je otevře (jen nezamčené). */
  function tryOpenDoor(cx, cy, playerNear) {
    var id = W.Map.at(cx, cy);
    if (id !== 7) return;
    var d = W.Map.doorAt(cx, cy);
    if (!d || d.lock !== 0) return;
    if (d.state === 'closed' || d.state === 'closing') {
      d.state = 'opening';
      if (playerNear && W.Audio) W.Audio.play('door');
    } else if (d.state === 'open') d.hold = Math.max(d.hold, 1.5);
  }

  /** Pohyb s klouzáním po stěnách; vrací true, když se skutečně posunul. */
  function moveEntity(e, dx, dy, p) {
    var r = e.r, moved = false;
    var nx = e.x + dx;
    var cxEdge = (nx + Math.sign(dx) * r) | 0, cy = e.y | 0;
    if (dx !== 0 && cxEdge !== (e.x | 0)) tryOpenDoor(cxEdge, cy, p && Math.hypot(e.x - p.x, e.y - p.y) < 14);
    if (!W.Map.blocked(cxEdge, cy) && !entityBlocks(nx, e.y, e)) { e.x = nx; moved = moved || dx !== 0; }

    var ny = e.y + dy;
    var cx = e.x | 0, cyEdge = (ny + Math.sign(dy) * r) | 0;
    if (dy !== 0 && cyEdge !== (e.y | 0)) tryOpenDoor(cx, cyEdge, p && Math.hypot(e.x - p.x, e.y - p.y) < 14);
    if (!W.Map.blocked(cx, cyEdge) && !entityBlocks(e.x, ny, e)) { e.y = ny; moved = moved || dy !== 0; }
    return moved;
  }

  /* ============================================================
     FLOW FIELD — BFS vzdálenosti od hráče, přepočet ~3× za sekundu
     ============================================================ */
  var flow = null, flowCell = -1, flowT = 0, flowQueue = null;

  function updateFlow(p, dt) {
    var lv = W.Map.level, w = lv.w, h = lv.h;
    var cell = (p.x | 0) + (p.y | 0) * w;
    flowT -= dt;
    if (flow && cell === flowCell && flowT > 0) return;
    flowT = 0.35; flowCell = cell;

    if (!flow || flow.length !== w * h) { flow = new Int16Array(w * h); flowQueue = new Int32Array(w * h); }
    flow.fill(-1);
    var head = 0, tail = 0;
    flow[cell] = 0; flowQueue[tail++] = cell;
    while (head < tail) {
      var c = flowQueue[head++];
      var cx = c % w, cy = (c / w) | 0, dv = flow[c] + 1;
      if (dv > 60) continue;
      // čtyři sousedi
      if (cx > 0 && flow[c - 1] < 0 && enemyPassable(cx - 1, cy)) { flow[c - 1] = dv; flowQueue[tail++] = c - 1; }
      if (cx < w - 1 && flow[c + 1] < 0 && enemyPassable(cx + 1, cy)) { flow[c + 1] = dv; flowQueue[tail++] = c + 1; }
      if (cy > 0 && flow[c - w] < 0 && enemyPassable(cx, cy - 1)) { flow[c - w] = dv; flowQueue[tail++] = c - w; }
      if (cy < h - 1 && flow[c + w] < 0 && enemyPassable(cx, cy + 1)) { flow[c + w] = dv; flowQueue[tail++] = c + w; }
    }
  }

  /** Střed sousední buňky, která je po flow-fieldu blíž k hráči; null = nedostupné. */
  function flowStep(e) {
    if (!flow) return null;
    var w = W.Map.level.w;
    var cx = e.x | 0, cy = e.y | 0, c = cx + cy * w;
    var best = flow[c], bx = cx, by = cy;
    if (best < 0) return null;
    if (cx > 0 && flow[c - 1] >= 0 && flow[c - 1] < best) { best = flow[c - 1]; bx = cx - 1; by = cy; }
    if (flow[c + 1] >= 0 && flow[c + 1] < best) { best = flow[c + 1]; bx = cx + 1; by = cy; }
    if (cy > 0 && flow[c - w] >= 0 && flow[c - w] < best) { best = flow[c - w]; bx = cx; by = cy - 1; }
    if (flow[c + w] >= 0 && flow[c + w] < best) { best = flow[c + w]; bx = cx; by = cy + 1; }
    if (bx === cx && by === cy) return null;
    return { x: bx + 0.5, y: by + 0.5 };
  }

  /* ============================================================
     ŘÍZENÍ POHYBU
     ============================================================ */

  /**
   * Posune nepřítele směrem (dirX,dirY) s příčným kroužením a detekcí
   * zaseknutí (pak chvíli uhýbá kolmo). speed v dlaždicích/s.
   */
  function steer(e, dirX, dirY, strafe, speed, dt, p) {
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len > 0.0001) { dirX /= len; dirY /= len; }

    // kolmé kroužení, směr se občas přehodí
    e.sideT -= dt;
    if (e.sideT <= 0) { e.sideT = 0.7 + rnd() * 1.3; e.side = -e.side; }

    var mx, my;
    if (e.detourT > 0) {
      e.detourT -= dt;
      mx = -dirY * e.detourDir; my = dirX * e.detourDir;      // kolmo k původnímu směru
    } else {
      mx = dirX - dirY * strafe * e.side;
      my = dirY + dirX * strafe * e.side;
      var ml = Math.sqrt(mx * mx + my * my) || 1;
      mx /= ml; my /= ml;
    }

    var moved = moveEntity(e, mx * speed * dt, my * speed * dt, p);
    e.moving = moved;

    // zaseknutí: za 0.45 s se skoro nehnul → objíždět
    e.stuckT += dt;
    if (e.stuckT > 0.45) {
      var dd = Math.hypot(e.x - e.lastX, e.y - e.lastY);
      if (dd < 0.12 && e.detourT <= 0) { e.detourT = 0.5 + rnd() * 0.4; e.detourDir = rnd() < 0.5 ? -1 : 1; e.side = -e.side; }
      e.lastX = e.x; e.lastY = e.y; e.stuckT = 0;
    }
    return moved;
  }

  /** Vyrazí k bodu: přímo, když ho vidí, jinak po flow-fieldu. */
  function goTo(e, tx, ty, strafe, dt, p) {
    var dx = tx - e.x, dy = ty - e.y;
    if (!los(e.x, e.y, tx, ty)) {
      var s = flowStep(e);
      if (s) { dx = s.x - e.x; dy = s.y - e.y; strafe = 0; }
    }
    return steer(e, dx, dy, strafe, e.def.speed, dt, p);
  }

  /** Najde blízkou buňku, na kterou hráč nevidí a na kterou se dá dojít rovně. */
  function findCover(e, p) {
    var best = null, bestD = 1e9;
    var cx0 = e.x | 0, cy0 = e.y | 0;
    for (var cy = cy0 - 3; cy <= cy0 + 3; cy++) {
      for (var cx = cx0 - 3; cx <= cx0 + 3; cx++) {
        if (!enemyPassable(cx, cy) || W.Map.at(cx, cy) !== 0) continue;
        var tx = cx + 0.5, ty = cy + 0.5;
        var dx = tx - e.x, dy = ty - e.y, d = dx * dx + dy * dy;
        if (d < 0.3 || d >= bestD) continue;
        // ne přímo u hráče, mimo jeho výhled, a dosažitelné rovnou
        if (Math.hypot(tx - p.x, ty - p.y) < 1.5) continue;
        if (los(tx, ty, p.x, p.y)) continue;
        if (!los(e.x, e.y, tx, ty)) continue;
        best = { x: tx, y: ty }; bestD = d;
      }
    }
    return best;
  }

  /* ============================================================
     AI
     ============================================================ */
  function updateEnemy(e, dt, p) {
    var d = e.def;
    if (e.hidden) return;
    var dx = p.x - e.x, dy = p.y - e.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    e.t += dt;
    if (e.tint > 0) e.tint = Math.max(0, e.tint - dt * 4);
    if (e.cool > 0) e.cool -= dt;

    if (e.state === 'die' || e.state === 'dead' || e.state === 'pain' || e.state === 'attack') {
      updateSimpleStates(e, dt, p, dist);
      return;
    }
    if (d.melee) { updateDog(e, dt, p, dist, dx, dy); return; }

    var seen = dist < d.sight * 1.3 && los(e.x, e.y, p.x, p.y);

    switch (e.state) {

      case 'idle':
        e.frame = spr(d.spr + '_walk0');
        e.moving = false;
        if (dist < d.sight && seen) alert(e, p);
        break;

      case 'engage': {
        if (seen) { e.lkX = p.x; e.lkY = p.y; e.lostT = 0; }
        else { e.lostT += dt; if (e.lostT > 0.7) { e.state = 'hunt'; e.huntT = 0; break; } }

        // výstřel má přednost, když vidí a je v dosahu
        if (seen && dist <= d.range && e.cool <= 0 && e.holdT <= 0) {
          e.state = 'attack'; e.t = 0; e.burstLeft = d.burst;
          e.frame = spr(d.spr + '_aim'); e.moving = false;
          break;
        }

        // stráž se nevzdaluje od stanoviště, dokud hráč není u ní
        if (e.post && dist > 2.2) {
          var pdx = e.post.x - e.x, pdy = e.post.y - e.y;
          if (pdx * pdx + pdy * pdy > e.leash * e.leash) { goTo(e, e.post.x, e.post.y, 0.2, dt, p); break; }
        }

        // občas se zastaví (klidnější střelba), jinak krouží / drží odstup
        e.holdT -= dt;
        if (e.holdT > 0) { e.moving = false; break; }
        if (rnd() < dt * 0.5) { e.holdT = 0.25 + rnd() * 0.35; e.moving = false; break; }

        var inv = dist > 0.001 ? 1 / dist : 0, fx = dx * inv, fy = dy * inv;
        if (dist < d.keep[0]) {
          steer(e, -fx, -fy, d.strafe * 0.8, d.speed * 0.9, dt, p);          // couvá a uhýbá
        } else if (dist > d.keep[1] || !seen) {
          if (seen) steer(e, fx, fy, d.strafe, d.speed, dt, p);               // cik-cak k hráči
          else goTo(e, e.lkX, e.lkY, 0.3, dt, p);
        } else {
          // ve správné vzdálenosti: jen krouží kolem hráče (kolmo na spojnici)
          if (!steer(e, -fy * e.side, fx * e.side, 0, d.speed * 0.85, dt, p)) e.side = -e.side;
        }
        break;
      }

      case 'cover': {
        e.coverT -= dt;
        var cdx = e.coverX - e.x, cdy = e.coverY - e.y;
        var hidden = !los(e.x, e.y, p.x, p.y);
        if (seen && dist < 2.2) { e.state = 'engage'; break; }         // hráč to obešel
        if (Math.hypot(cdx, cdy) > 0.25 && !hidden && e.coverT > 0) {
          steer(e, cdx, cdy, 0, d.speed * 1.15, dt, p);
        } else {
          e.moving = false;
          e.peekT -= dt;
          if (e.peekT <= 0 || e.coverT <= -2) { e.state = 'engage'; e.cool = 0; e.holdT = 0; }
        }
        break;
      }

      case 'hunt': {
        if (seen) { e.state = 'engage'; e.lostT = 0; break; }
        e.huntT += dt;
        if (e.huntT > 7) {                                             // vzdal to
          if (e.post) { goTo(e, e.post.x, e.post.y, 0, dt, p); if (Math.hypot(e.post.x - e.x, e.post.y - e.y) < 0.4) { e.state = 'idle'; e.alerted = false; } }
          else { e.state = 'idle'; e.alerted = false; }
          break;
        }
        if (e.post && Math.hypot(e.post.x - e.x, e.post.y - e.y) > e.leash * 1.3) { goTo(e, e.post.x, e.post.y, 0, dt, p); break; }
        var s = flowStep(e);
        if (s) steer(e, s.x - e.x, s.y - e.y, 0, d.speed, dt, p);
        else goTo(e, e.lkX, e.lkY, 0, dt, p);
        break;
      }
    }

    // animace chůze podle skutečného pohybu
    if (e.state !== 'idle') {
      if (e.moving) { e.af += dt; if (e.af > 0.15) { e.af = 0; e.at = (e.at + 1) & 3; } e.frame = spr(d.spr + '_walk' + e.at); }
      else e.frame = spr(d.spr + '_walk0');
    }
  }

  function updateDog(e, dt, p, dist, dx, dy) {
    var d = e.def;
    var seen = los(e.x, e.y, p.x, p.y);
    if (e.state === 'idle') {
      e.frame = spr(d.spr + '_walk0');
      if (dist < d.sight && seen) alert(e, p);
      return;
    }
    if (seen) { e.lkX = p.x; e.lkY = p.y; e.lostT = 0; } else e.lostT += dt;
    if (seen && dist <= d.range && e.cool <= 0) {
      e.state = 'attack'; e.t = 0; e.burstLeft = 1; e.frame = spr(d.spr + '_aim'); return;
    }
    if (dist > 0.75 || !seen) {
      if (seen) steer(e, dx, dy, 0.15, d.speed, dt, p);
      else { var s = flowStep(e); if (s) steer(e, s.x - e.x, s.y - e.y, 0, d.speed, dt, p); else goTo(e, e.lkX, e.lkY, 0, dt, p); }
    } else e.moving = false;
    if (e.lostT > 9) { e.state = 'idle'; e.alerted = false; return; }
    if (e.moving) { e.af += dt; if (e.af > 0.12) { e.af = 0; e.at = (e.at + 1) & 3; } e.frame = spr(d.spr + '_walk' + e.at); }
    else e.frame = spr(d.spr + '_walk0');
  }

  function updateSimpleStates(e, dt, p, dist) {
    var d = e.def;
    switch (e.state) {
      case 'attack':
        e.moving = false;
        if (e.t < d.aim) { e.frame = spr(d.spr + '_aim'); break; }
        e.frame = spr(d.spr + '_fire');
        if (e.t < d.aim + 0.09) break;
        shootAtPlayer(e, p, dist);
        e.burstLeft--;
        if (e.burstLeft > 0) { e.t = d.aim - (d.burstGap || 0.12); break; }
        e.cool = d.cool * (0.75 + rnd() * 0.5) * (diff === 2 ? 0.75 : 1);
        e.t = 0;
        // po dávce: schovat se za roh?
        if (!d.melee && d.coverChance && rnd() < d.coverChance * (e.hp < e.maxHp * 0.6 ? 1.3 : 1)) {
          var c = findCover(e, p);
          if (c) { e.state = 'cover'; e.coverX = c.x; e.coverY = c.y; e.coverT = 1.6; e.peekT = 0.5 + rnd() * 0.9; break; }
        }
        e.state = d.melee ? 'chase' : 'engage';
        break;

      case 'pain':
        e.frame = spr(d.spr + '_pain');
        e.moving = false;
        if (e.t > 0.24) { e.state = d.melee ? 'chase' : 'engage'; e.t = 0; e.cool = Math.min(e.cool, 0.25); }
        break;

      case 'die':
        e.af += dt;
        if (e.af > 0.085) {
          e.af = 0; e.dieFrame++;
          if (e.dieFrame >= d.dieFrames - 1) { e.dieFrame = d.dieFrames - 1; e.state = 'dead'; }
        }
        e.frame = spr(d.spr + '_die' + e.dieFrame);
        break;

      case 'dead':
        e.frame = spr(d.spr + '_die' + (d.dieFrames - 1));
        break;
    }
  }

  function alert(e, p) {
    if (e.alerted) return;
    e.alerted = true;
    e.state = e.def.melee ? 'chase' : 'engage';
    e.t = 0; e.lostT = 0;
    e.lkX = p ? p.x : e.x; e.lkY = p ? p.y : e.y;
    e.cool = 0.35 + rnd() * 0.5;
    if (W.Audio) W.Audio.play(e.def.snd);
    if (e.def.boss && hooks.onBoss) hooks.onBoss(e);
  }

  /** Hluk: probudí ty, kdo vidí, a na půl dosahu i ty za rohem / dveřmi. */
  function makeNoise(x, y, radius) {
    var p = { x: x, y: y };
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.alerted || e.hidden || e.state === 'dead' || e.state === 'die') continue;
      var dx = e.x - x, dy = e.y - y, dd = dx * dx + dy * dy;
      if (dd < radius * radius * 0.3 || (dd < radius * radius && los(e.x, e.y, x, y))) alert(e, p);
    }
  }

  function shootAtPlayer(e, p, dist) {
    var d = e.def;
    if (W.Audio) W.Audio.play(d.melee ? 'bite' : (d.boss ? 'bossShot' : 'enemyShot'));
    if (!los(e.x, e.y, p.x, p.y)) return;
    if (d.melee && dist > d.range + 0.3) return;

    var chance = d.acc * (d.melee ? 1 : Math.max(0.22, 1 - dist / (d.range * 1.35)));
    chance *= [0.72, 1, 1.3][diff] || 1;
    if (p.moving) chance *= 0.82;
    if (rnd() > chance) { if (hooks.onMiss) hooks.onMiss(e); return; }

    var dmg = d.dmg[0] + rnd() * (d.dmg[1] - d.dmg[0]);
    dmg *= e.dmgMul;
    if (!d.melee) dmg *= Math.max(0.45, 1 - dist / (d.range * 2.4));
    if (hooks.onDamage) hooks.onDamage(Math.max(1, Math.round(dmg)), e);
  }

  /* ============================================================
     ZÁSAH NEPŘÍTELE
     ============================================================ */
  function hurt(e, dmg, fromX, fromY) {
    if (e.state === 'die' || e.state === 'dead') return false;
    e.hp -= dmg;
    e.tint = 1;
    if (!e.alerted) alert(e, { x: fromX, y: fromY });
    e.lkX = fromX; e.lkY = fromY; e.lostT = 0;

    if (e.hp <= 0) {
      e.state = 'die'; e.t = 0; e.af = 0; e.dieFrame = 0;
      e.frame = spr(e.def.spr + '_die0');
      stats.kills++;
      if (W.Audio) W.Audio.play(e.def.dieSnd);
      if (hooks.onKill) hooks.onKill(e);
      return true;
    }
    var painChance = e.def.boss ? 0.08 : (dmg > 20 ? 0.75 : 0.4);
    if (rnd() < painChance && e.state !== 'attack') {
      e.state = 'pain'; e.t = 0;
      if (W.Audio) W.Audio.play('enemyPain');
    }
    return false;
  }

  /** Nejbližší zasažitelný nepřítel v kuželu (hitscan). */
  function pick(px, py, angle, maxDist, spread) {
    var best = null, bestD = 1e9;
    var cos = Math.cos(angle), sin = Math.sin(angle);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hidden || e.state === 'die' || e.state === 'dead') continue;
      var dx = e.x - px, dy = e.y - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDist || dist > bestD) continue;
      var along = dx * cos + dy * sin;
      if (along <= 0) continue;
      var perp = Math.abs(-dx * sin + dy * cos);
      if (perp > e.r + spread * dist + 0.12) continue;
      if (!los(px, py, e.x, e.y)) continue;
      best = e; bestD = dist;
    }
    return best;
  }

  /* ============================================================
     PŘEDMĚTY
     ============================================================ */
  function tryPickup(p) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.taken) continue;
      var dx = it.x - p.x, dy = it.y - p.y;
      if (dx * dx + dy * dy > 0.30) continue;
      if (hooks.onPickup && hooks.onPickup(it) === false) continue;
      it.taken = true;
      if (it.def.treasure) stats.treasure++;
      if (W.Audio) W.Audio.play(it.def.snd);
    }
  }

  /* ============================================================
     HLAVNÍ UPDATE
     ============================================================ */
  var brazierT = 0;

  function update(dt, p) {
    var i;
    updateFlow(p, dt);
    for (i = 0; i < enemies.length; i++) updateEnemy(enemies[i], dt, p);

    brazierT += dt;
    var bf = ((brazierT * 11) | 0) & 1;
    for (i = 0; i < decos.length; i++) if (decos[i].anim) decos[i].frame = spr('brazier' + bf);
    for (i = 0; i < items.length; i++) items[i].bob += dt * 3;

    tryPickup(p);
    rebuildSprites();
  }

  function rebuildSprites() {
    sprites.length = 0;
    var i, e;
    for (i = 0; i < decos.length; i++) {
      e = decos[i];
      sprites.push({ x: e.x, y: e.y, frame: e.frame, scale: e.scale, glow: e.glow, lift: 0 });
    }
    for (i = 0; i < items.length; i++) {
      e = items[i];
      if (e.taken) continue;
      sprites.push({ x: e.x, y: e.y, frame: e.frame, scale: e.scale, lift: Math.sin(e.bob) * 0.012 });
    }
    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e.hidden) continue;
      sprites.push({ x: e.x, y: e.y, frame: e.frame, scale: e.scale, tint: e.tint * 0.55, lift: 0 });
    }
  }

  function occupies(cx, cy) {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hidden || e.state === 'dead') continue;
      if ((e.x | 0) === cx && (e.y | 0) === cy) return true;
    }
    return false;
  }

  function bossAlive() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.def.boss && e.state !== 'dead' && e.state !== 'die') return true;
    }
    return false;
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  W.Ent = {
    ENEMY: ENEMY, ITEM: ITEM, DECO: DECO,
    enemies: enemies, items: items, decos: decos, sprites: sprites,
    stats: stats,
    spawn: spawn,
    update: update,
    hurt: hurt,
    pick: pick,
    los: los,
    makeNoise: makeNoise,
    entityBlocks: entityBlocks,
    occupies: occupies,
    bossAlive: bossAlive,
    revealBoss: revealBoss,
    setHooks: function (h) { hooks = h; }
  };

})(window);
