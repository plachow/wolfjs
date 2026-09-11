/* ============================================================
   WOLF·JS — js/game.js
   Lepidlo mezi vším ostatním: hráč, vstupy, kolize, pravidla,
   minimapa, HUD, výhra a prohra.
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};
  var UI, Map, Ent, Ray, Weap, Audio;

  /* ============================================================
     HRÁČ
     ============================================================ */
  var P = {
    x: 3.5, y: 8.5, a: 0,
    health: 100, ammo: 8, maxAmmo: 99, shells: 0, maxShells: 30,
    score: 0, lives: 3,
    keys: { gold: false, silver: false },
    bobT: 0, bobX: 0, bobY: 0, pitch: 0,
    moving: false, dead: false, hurtT: 0,
    stepT: 0
  };

  var SPEED = 3.5, RUN = 1.5, RADIUS = 0.22;

  var running = false, assetsReady = false;
  var difficulty = 1;
  var levelTime = 0;
  var levelIndex = 0;
  var mapBig = false;
  var attractA = 0;
  var lastRoom = null;
  var flashT = 0;

  /* ============================================================
     BOOT — generování všech textur a spritů
     ============================================================ */
  function boot() {
    UI = W.UI; Map = W.Map; Ent = W.Ent; Ray = W.Ray; Weap = W.Weap; Audio = W.Audio;

    UI.showOverlay('loading');
    UI.setLoading(0);

    W.Tex.build(
      function (p) { UI.setLoading(p * 0.35); },
      function () {
        W.Spr.build(
          function (p) { UI.setLoading(0.35 + p * 0.55); },
          function () {
            Weap.build();
            UI.setLoading(1);
            assetsReady = true;
            UI.setWeaponIconDrawer(Weap.drawIcon);
            prepareLevel();
            setTimeout(function () { UI.showOverlay('menu'); }, 220);
          }
        );
      }
    );

    Map.setOccupancyTest(function (cx, cy) {
      if ((P.x | 0) === cx && (P.y | 0) === cy) return true;
      return Ent.occupies(cx, cy);
    });

    Ent.setHooks({
      onDamage: playerHurt,
      onKill: onEnemyKilled,
      onPickup: onPickup,
      onBoss: function (e) { UI.toast((e.def.name || 'BOSS').toUpperCase() + '!', 'bad'); }
    });
  }

  function prepareLevel(index) {
    Map.build(index);
    Ent.spawn(Map.level, difficulty);
  }

  /* ============================================================
     START / STOP
     ============================================================ */
  function start(diffLevel) {
    if (!assetsReady) { UI.toast('Ještě se generují textury…'); return false; }
    difficulty = (typeof diffLevel === 'number') ? diffLevel : 1;
    if (P.lives <= 0) P.lives = 3;              // po vyčerpání životů začínáme nanovo

    Audio.init();
    P.health = 100; P.ammo = 8; P.shells = 0; P.score = 0;
    Weap.reset();
    startLevel(0);
    return true;
  }

  /** Vstup do levelu: zdraví, munice a zbraně se nesou dál, klíče ne. */
  function startLevel(index) {
    levelIndex = index;
    prepareLevel(index);

    var s = Map.level.start;
    P.x = s.x; P.y = s.y; P.a = s.a;
    P.keys.gold = P.keys.silver = false;
    P.bobT = 0; P.bobX = P.bobY = 0; P.pitch = 0;
    P.dead = false; P.hurtT = 0;

    levelTime = 0;
    lastRoom = Map.roomAt(P.x | 0, P.y | 0);     // ať se hláška nezopakuje hned
    flashT = 0;
    running = true;

    UI.setFloor(index + 1);
    syncHud(true);
    UI.setMinimap(true, false);
    UI.toast('SEKTOR ' + (index + 1) + ' — ' + Map.level.name.toUpperCase(), 'good');
  }

  /** Další sektor po výtahu; false, když už žádný není. */
  function nextLevel() {
    if (levelIndex + 1 >= Map.levelCount) return false;
    startLevel(levelIndex + 1);
    return true;
  }

  /** Po smrti: znovu tentýž sektor. */
  function retryLevel() {
    if (!assetsReady) return false;
    if (P.lives <= 0) return start(difficulty);
    P.health = 100;
    if (P.ammo < 8) P.ammo = 8;
    startLevel(levelIndex);
    return true;
  }

  function stop() {
    running = false;
    P.lives = 3;                                // návrat do menu = nová hra
    UI.setMinimap(false, false);
  }

  function onResize() { /* buffery si přeloží raycaster sám */ }

  /* ============================================================
     VSTUPY A POHYB
     ============================================================ */
  function update(dt, keys, mouse, press) {
    if (!running) return;
    levelTime += dt;

    if (P.dead) { updateDeadCam(dt); return; }

    /* ---------- rozhlížení ---------- */
    // Vertikální pohled je y-shearing: P.pitch je posun horizontu jako zlomek
    // výšky obrazu (-0.4 … 0.4), takže nezávisí na zvoleném rozlišení.
    var sens = UI.settings.sens;
    var look = UI.settings.look;                       // 0 jen do stran, 1 volný, 2 s návratem
    P.a += mouse.dx * 0.0022 * sens;
    if (look) P.pitch -= mouse.dy * 0.0017 * sens;

    var turn = 2.6 * dt;
    if (keys['arrowleft']) P.a -= turn;
    if (keys['arrowright']) P.a += turn;
    if (keys['pageup']) P.pitch += 0.55 * dt;
    if (keys['pagedown']) P.pitch -= 0.55 * dt;

    var maxPitch = look === 1 ? 0.40 : 0.24;
    if (P.pitch > maxPitch) P.pitch = maxPitch;
    if (P.pitch < -maxPitch) P.pitch = -maxPitch;
    if (look !== 1) P.pitch *= (1 - dt * 2.2);         // nakouknutí – vrací se k horizontu

    if (P.a > Math.PI) P.a -= Math.PI * 2;
    if (P.a < -Math.PI) P.a += Math.PI * 2;

    /* ---------- chůze ---------- */
    var fwd = 0, side = 0;
    if (keys['w'] || keys['arrowup']) fwd += 1;
    if (keys['s'] || keys['arrowdown']) fwd -= 1;
    if (keys['d']) side += 1;
    if (keys['a']) side -= 1;

    var run = (keys['shift'] ? RUN : 1);
    var sp = SPEED * run;
    var len = Math.sqrt(fwd * fwd + side * side);
    P.moving = len > 0.01;

    if (P.moving) {
      fwd /= len; side /= len;
      var cos = Math.cos(P.a), sin = Math.sin(P.a);
      var dx = (cos * fwd - sin * side) * sp * dt;
      var dy = (sin * fwd + cos * side) * sp * dt;
      tryMove(dx, dy);

      P.bobT += dt * (run > 1 ? 13 : 9.5);
      P.stepT -= dt * run;
      if (P.stepT <= 0) { P.stepT = 0.42; Audio.play('step'); }
    } else {
      P.bobT += dt * 1.6;
      P.stepT = 0.12;
    }

    var amp = P.moving ? (run > 1 ? 9 : 6) : 1.6;
    P.bobX = Math.sin(P.bobT) * amp;
    P.bobY = Math.abs(Math.cos(P.bobT)) * amp * 0.8;

    /* ---------- akce ---------- */
    if (press('e') || press('space')) useAction();

    if (press('1')) Weap.select(0);
    if (press('2')) Weap.select(1);
    if (press('3')) Weap.select(2);
    if (press('4')) Weap.select(3);
    if (press('q')) Weap.next(1);

    if (press('tab')) {
      mapBig = !mapBig;
      UI.setMinimap(true, mapBig);
    }

    /* ---------- střelba ---------- */
    var wantFire = mouse.down || keys['control'];
    if (!Weap.def().auto && !wantFire) fireLatch = false;
    Weap.update(dt, wantFire && (Weap.def().auto || !fireLatch), tryShot);

    if (flashT > 0) flashT -= dt;

    /* ---------- svět ---------- */
    Map.updateDoors(dt);
    Map.updateSecrets(dt);
    Ent.update(dt, P);
    markSeen();
    checkRoom();
    syncHud(false);
  }

  var fireLatch = false;

  /** Posun s klouzáním po stěnách a objektech. */
  function tryMove(dx, dy) {
    var nx = P.x + dx;
    var edgeX = nx + (dx > 0 ? RADIUS : -RADIUS);
    if (!Map.blocked(edgeX | 0, P.y | 0) &&
        !Map.blocked(edgeX | 0, (P.y + RADIUS) | 0) &&
        !Map.blocked(edgeX | 0, (P.y - RADIUS) | 0) &&
        !Ent.entityBlocks(nx, P.y, null)) P.x = nx;

    var ny = P.y + dy;
    var edgeY = ny + (dy > 0 ? RADIUS : -RADIUS);
    if (!Map.blocked(P.x | 0, edgeY | 0) &&
        !Map.blocked((P.x + RADIUS) | 0, edgeY | 0) &&
        !Map.blocked((P.x - RADIUS) | 0, edgeY | 0) &&
        !Ent.entityBlocks(P.x, ny, null)) P.y = ny;
  }

  /* ============================================================
     POUŽITÍ (dveře, tajné zdi, páka)
     ============================================================ */
  function useAction() {
    var cos = Math.cos(P.a), sin = Math.sin(P.a);
    for (var d = 0.45; d <= 1.15; d += 0.35) {
      var cx = (P.x + cos * d) | 0, cy = (P.y + sin * d) | 0;
      var id = Map.at(cx, cy);
      if (id === 0) continue;

      /* dveře */
      if (id === 7 || id === 8 || id === 9) {
        var door = Map.doorAt(cx, cy);
        if (!door) return;
        if (door.lock === 1 && !P.keys.gold) {
          UI.toast('Potřebuješ ZLATÝ klíč', 'bad'); Audio.play('doorLocked'); return;
        }
        if (door.lock === 2 && !P.keys.silver) {
          UI.toast('Potřebuješ STŘÍBRNÝ klíč', 'bad'); Audio.play('doorLocked'); return;
        }
        if (door.state === 'closed' || door.state === 'closing') {
          door.state = 'opening';
          Audio.play('door');
        } else if (door.state === 'open') {
          door.hold = 0.1;
        }
        return;
      }

      /* páka výtahu */
      if (id === 10) {
        if (!Map.level.needBoss || !Ent.bossAlive()) { Map.level.switchOn = true; Audio.play('lever'); victory(); }
        else { UI.toast('Výtah je zablokovaný. Zabij bosse: ' + Map.level.bossName + '.', 'bad'); Audio.play('doorLocked'); }
        return;
      }

      /* tajná posuvná zeď */
      var secs = Map.level.secrets;
      for (var i = 0; i < secs.length; i++) {
        if (secs[i].x === cx && secs[i].y === cy) {
          if (Map.pushSecret(secs[i])) {
            Ent.stats.secrets++;
            UI.toast('TAJNÁ CHODBA!', 'good');
            Audio.play('secret');
          }
          return;
        }
      }

      // pevná zeď — dál už nemá smysl hledat
      return;
    }
  }

  /* ============================================================
     STŘELBA
     ============================================================ */
  function tryShot(def) {
    if (def.useAmmo > 0) {
      if (def.ammoType === 'shells') {
        if (P.shells < def.useAmmo) return false;
        P.shells -= def.useAmmo;
      } else {
        if (P.ammo < def.useAmmo) return false;
        P.ammo -= def.useAmmo;
      }
    }
    if (!def.auto) fireLatch = true;

    Audio.play(def.snd);
    if (def.noise > 0) {
      Ent.makeNoise(P.x, P.y, def.noise);
      flashT = def.pellets ? 0.09 : 0.06;
    }

    // brokovnice: každý brok je vlastní hitscan v kuželu – může trefit víc cílů
    var pellets = def.pellets || 1;
    var hitAny = false;
    for (var i = 0; i < pellets; i++) {
      var spread = def.spread * (P.moving ? (pellets > 1 ? 1.25 : 1.7) : 1);
      var angle = P.a + (Math.random() - 0.5) * spread;
      var e = Ent.pick(P.x, P.y, angle, def.range, pellets > 1 ? 0.01 : spread * 0.6);
      if (!e) continue;
      var dist = Math.hypot(e.x - P.x, e.y - P.y);
      var dmg = def.dmg[0] + Math.random() * (def.dmg[1] - def.dmg[0]);
      if (def.useAmmo > 0) dmg *= Math.max(pellets > 1 ? 0.3 : 0.55, 1 - dist / (def.range * (pellets > 1 ? 1.1 : 2.2)));
      dmg = Math.max(1, Math.round(dmg));
      Ent.hurt(e, dmg, P.x, P.y);
      hitAny = true;
    }
    if (hitAny) { Audio.play('hitFlesh'); UI.crosshairHit(); }
    else Audio.play('hitWall');
    return true;
  }

  /* ============================================================
     ZÁSAHY HRÁČE
     ============================================================ */
  function playerHurt(dmg) {
    if (P.dead) return;
    P.health -= dmg;
    P.hurtT = 0.25;
    UI.flashDamage();
    UI.faceHurt();
    Audio.play('playerPain');
    if (P.health <= 0) {
      P.health = 0;
      playerDie();
    }
    syncHud(true);
  }

  function playerDie() {
    P.dead = true;
    Audio.play('playerDie');
    P.lives--;
    UI.setLives(Math.max(0, P.lives));
    setTimeout(function () {
      var st = Ent.stats;
      var txt = P.lives > 0
        ? 'Zbývá životů: ' + P.lives + '   •   Zabito: ' + st.kills + '/' + st.totalKills
        : 'Konec. Skóre ' + P.score + '   •   Zabito: ' + st.kills + '/' + st.totalKills;
      running = false;
      W.App.gameOver(txt);
    }, 1400);
  }

  /** Kamera po smrti klesne k zemi. */
  function updateDeadCam(dt) {
    P.pitch -= dt * 0.22;
    if (P.pitch < -0.38) P.pitch = -0.38;
    Map.updateDoors(dt);
    Ent.update(dt, P);
  }

  /* ============================================================
     ODMĚNY
     ============================================================ */
  function onEnemyKilled(e) {
    P.score += e.def.score;
    if (e.def.boss) {
      Map.level.switchOn = true;
      Audio.play('bossDown');
      UI.toast((e.def.name || 'BOSS').toUpperCase() + ' PADL — VÝTAH ODEMČEN!', 'good');
    }
    syncHud(true);
  }

  function onPickup(it) {
    var d = it.def;

    if (d.heal) {
      if (P.health >= 100) return false;              // plné zdraví → nech ležet
      P.health = Math.min(100, P.health + d.heal);
    }
    if (d.ammo) {
      if (P.ammo >= P.maxAmmo && d.weapon === undefined) return false;
      P.ammo = Math.min(P.maxAmmo, P.ammo + d.ammo);
    }
    if (d.shells) {
      if (P.shells >= P.maxShells && d.weapon === undefined) return false;
      P.shells = Math.min(P.maxShells, P.shells + d.shells);
    }
    if (d.weapon !== undefined) Weap.give(d.weapon);
    if (d.key === 1) P.keys.gold = true;
    if (d.key === 2) P.keys.silver = true;
    if (d.score) P.score += d.score;

    UI.flashPickup();
    UI.toast(d.msg, d.key || d.weapon !== undefined ? 'good' : null);
    syncHud(true);
    return true;
  }

  /* ============================================================
     KONEC LEVELU
     ============================================================ */
  function victory() {
    running = false;
    var st = Ent.stats;
    var mins = Math.floor(levelTime / 60), secs = Math.floor(levelTime % 60);
    var kp = st.totalKills ? Math.round(st.kills / st.totalKills * 100) : 100;
    var tp = st.totalTreasure ? Math.round(st.treasure / st.totalTreasure * 100) : 100;
    var sp = st.totalSecrets ? Math.round(st.secrets / st.totalSecrets * 100) : 100;

    var bonus = (kp === 100 ? 5000 : 0) + (tp === 100 ? 5000 : 0) + (sp === 100 ? 5000 : 0);
    P.score += bonus;

    Audio.play('victory');
    var hasNext = levelIndex + 1 < Map.levelCount;
    W.App.victory([
      ['Čas', mins + ':' + (secs < 10 ? '0' : '') + secs],
      ['Zabito', st.kills + '/' + st.totalKills + '  (' + kp + '%)', kp === 100],
      ['Poklady', st.treasure + '/' + st.totalTreasure + '  (' + tp + '%)', tp === 100],
      ['Tajemství', st.secrets + '/' + st.totalSecrets + '  (' + sp + '%)', sp === 100],
      ['Bonus', '+' + bonus, bonus > 0],
      ['SKÓRE', String(P.score), true]
    ], hasNext, hasNext ? 'Sektor ' + (levelIndex + 1) + ' vyčištěn!' : 'Pevnost padla!');
  }

  /* ============================================================
     HUD
     ============================================================ */
  var lastHud = { h: -1, a: -1, s: -1, k: '', w: -1, at: '' };

  function syncHud(force) {
    if (force || lastHud.h !== P.health) { UI.setHealth(P.health); lastHud.h = P.health; }
    // políčko munice ukazuje zásobu pro právě drženou zbraň
    var wd = Weap.def();
    var usesShells = wd.ammoType === 'shells';
    var cur = usesShells ? P.shells : P.ammo, max = usesShells ? P.maxShells : P.maxAmmo;
    var at = usesShells ? 'Broky' : 'Náboje';
    if (force || lastHud.at !== at) { UI.setAmmoLabel(at); lastHud.at = at; lastHud.a = -1; }
    if (force || lastHud.a !== cur) { UI.setAmmo(cur, max); lastHud.a = cur; }
    if (force || lastHud.s !== P.score) { UI.setScore(P.score); lastHud.s = P.score; }
    var k = (P.keys.gold ? 'G' : '') + (P.keys.silver ? 'S' : '');
    if (force || lastHud.k !== k) { UI.setKeys(P.keys.gold, P.keys.silver); lastHud.k = k; }
    if (force || lastHud.w !== Weap.state.index) {
      UI.refreshWeaponIcon(Weap.state.index);
      lastHud.w = Weap.state.index;
    }
    if (force) UI.setLives(Math.max(0, P.lives));
  }

  function checkRoom() {
    var r = Map.roomAt(P.x | 0, P.y | 0);
    if (r && r !== lastRoom) {
      lastRoom = r;
      UI.toast(r.name.toUpperCase());
    }
  }

  /* ============================================================
     MINIMAPA
     ============================================================ */
  function markSeen() {
    var lv = Map.level, seen = lv.seen;
    var px = P.x | 0, py = P.y | 0;
    for (var y = py - 5; y <= py + 5; y++) {
      if (y < 0 || y >= lv.h) continue;
      for (var x = px - 5; x <= px + 5; x++) {
        if (x < 0 || x >= lv.w) continue;
        var dx = x - px, dy = y - py;
        if (dx * dx + dy * dy > 30) continue;
        seen[y * lv.w + x] = 1;
      }
    }
  }

  var mmT = 0;

  function drawMinimap(dt) {
    mmT -= dt;
    if (mmT > 0) return;
    mmT = 0.08;

    var cv = document.getElementById('minimap');
    if (!cv) return;
    var g = cv.getContext('2d');
    var lv = Map.level;
    var cs = cv.width / lv.w;

    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(6,8,12,.88)';
    g.fillRect(0, 0, cv.width, cv.height);

    for (var y = 0; y < lv.h; y++) {
      for (var x = 0; x < lv.w; x++) {
        var i = y * lv.w + x;
        if (!lv.seen[i]) continue;
        var id = lv.grid[i];
        var col;
        if (id === 0) col = 'rgba(120,132,150,.22)';
        else if (id === 7) col = '#7f8b9c';
        else if (id === 8) col = '#ffb02e';
        else if (id === 9) col = '#dbe4f0';
        else if (id === 10) col = lv.switchOn ? '#4ade80' : '#c1121f';
        else {
          var r = Map.roomAt(x, y);
          col = r ? r.col : '#586074';
        }
        g.fillStyle = col;
        g.fillRect(x * cs, y * cs, Math.ceil(cs), Math.ceil(cs));
      }
    }

    // předměty a nepřátelé
    var i2;
    for (i2 = 0; i2 < Ent.items.length; i2++) {
      var it = Ent.items[i2];
      if (it.taken || !lv.seen[(it.y | 0) * lv.w + (it.x | 0)]) continue;
      g.fillStyle = it.def.key ? '#ffe07a' : (it.def.treasure ? '#ffb02e' : '#6ee7a8');
      g.fillRect(it.x * cs - 1, it.y * cs - 1, 2.5, 2.5);
    }
    for (i2 = 0; i2 < Ent.enemies.length; i2++) {
      var e = Ent.enemies[i2];
      if (e.state === 'dead') continue;
      var dd = (e.x - P.x) * (e.x - P.x) + (e.y - P.y) * (e.y - P.y);
      if (dd > 90) continue;
      g.fillStyle = e.def.boss ? '#ff2d55' : (e.alerted ? '#ff6b6b' : '#a9576b');
      var s = e.def.boss ? 4 : 2.6;
      g.fillRect(e.x * cs - s / 2, e.y * cs - s / 2, s, s);
    }

    // hráč
    g.save();
    g.translate(P.x * cs, P.y * cs);
    g.rotate(P.a);
    g.fillStyle = '#4ade80';
    g.beginPath();
    g.moveTo(5, 0); g.lineTo(-3.5, 3.2); g.lineTo(-1.8, 0); g.lineTo(-3.5, -3.2);
    g.closePath(); g.fill();
    g.restore();
  }

  /* ============================================================
     RENDER
     ============================================================ */
  var cam = { x: 0, y: 0, a: 0, pitch: 0, w: 0, h: 0, flash: 0 };

  function render(ctx, w, h, time) {
    if (!assetsReady) {
      ctx.fillStyle = '#08080b';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    var dt = W.App.dt;

    if (running || P.dead) {
      cam.x = P.x; cam.y = P.y; cam.a = P.a;
      cam.pitch = P.pitch * h + Math.sin(P.bobT * 2) * (P.moving ? 1.6 : 0.4);   // v klidu jemné dýchání
      cam.flash = (flashT > 0 || Weap.isFlashing()) ? 1 : 0;
    } else {
      // atrakce v menu: pomalá otočka ve vstupní hale
      attractA += dt * 0.16;
      cam.x = 7.5; cam.y = 5.5; cam.a = attractA;
      cam.pitch = Math.sin(time * 0.4) * 8;
      cam.flash = 0;
    }
    cam.w = w; cam.h = h;

    Ray.render(ctx, cam, Ent.sprites);

    if (running && !P.dead) {
      Weap.render(ctx, w, h, P.bobX, P.bobY);
      drawMinimap(dt);
    }

    // rudý nádech při zásahu
    if (P.hurtT > 0) {
      P.hurtT -= dt;
      ctx.fillStyle = 'rgba(150,10,16,' + (P.hurtT * 0.36) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  W.Game = {
    boot: boot,
    start: start,
    nextLevel: nextLevel,
    retryLevel: retryLevel,
    stop: stop,
    update: update,
    render: render,
    onResize: onResize,
    player: P,
    get running() { return running; }
  };

})(window);
