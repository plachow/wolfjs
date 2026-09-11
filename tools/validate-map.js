/* ============================================================
   WOLF·JS — tools/validate-map.js
   Statická kontrola všech levelů. Spouštěj po každé úpravě mapy:

       node tools/validate-map.js

   Načte js/map.js do sandboxu (žádné regexy nad zdrojákem) a pro
   každý level ověří:
     1. tvar mřížky a zazděný okraj
     2. objekty leží na podlaze, žádné dva na jedné dlaždici
     3. blokující dekorace (sloup, sud, stůl, ohniště) neucpávají
        průchod — flood fill je počítá jako zeď
     4. pořadí zámků: stříbrný klíč bez klíčů, zlatý se stříbrným,
        boss/páka s oběma; k páce se dá postavit
     5. tajné komory jsou nedostupné před posunutím zdi a dostupné po něm
     6. ve startovní místnosti (před otevřením dveří) není nepřítel
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- načtení map.js jako v prohlížeči ---------- */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'map.js'), 'utf8');
const sandbox = { window: {}, Math };
sandbox.window.window = sandbox.window;
vm.runInNewContext(src, sandbox);
const LEVELS = sandbox.window.W.Map.LEVELS;

const BLOCKING_DECO = new Set(['pillar', 'barrel', 'table', 'brazier']);
const ENEMIES = new Set(['guard', 'dog', 'officer', 'boss']);
const DOORS = new Set(['d', 'g', 'v']);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let totalProblems = 0;

function checkLevel(L, li) {
  const GRID = L.grid;
  const THINGS = L.things.map(t => ({ type: t[0], x: t[1], y: t[2] }));
  const SECRETS = L.secrets || [];
  const START = { x: Math.floor(L.start.x), y: Math.floor(L.start.y) };
  const H = GRID.length, W = GRID[0].length;
  const problems = [], notes = [];

  /* ---------- 1. tvar mřížky ---------- */
  GRID.forEach((row, y) => {
    if (row.length !== W) problems.push(`řádek ${y} má délku ${row.length}, čekáno ${W}`);
  });
  for (let x = 0; x < W; x++) {
    if (GRID[0][x] === '.') problems.push(`díra v horním okraji na x=${x}`);
    if (GRID[H - 1][x] === '.') problems.push(`díra v dolním okraji na x=${x}`);
  }
  for (let y = 0; y < H; y++) {
    if (GRID[y][0] === '.') problems.push(`díra v levém okraji na y=${y}`);
    if (GRID[y][W - 1] === '.') problems.push(`díra v pravém okraji na y=${y}`);
  }
  if (GRID[START.y][START.x] !== '.') problems.push('start leží ve zdi');

  /* ---------- 2. umístění objektů ---------- */
  const seenTile = new Map();
  for (const t of THINGS) {
    const c = (GRID[t.y] || '')[t.x];
    if (c !== '.') problems.push(`${t.type} na ${t.x},${t.y} leží ve zdi ('${c}')`);
    const k = t.x + ',' + t.y;
    if (seenTile.has(k)) problems.push(`dva objekty na ${k}: ${seenTile.get(k)} + ${t.type}`);
    seenTile.set(k, t.type);
  }
  const blockedByDeco = new Set(
    THINGS.filter(t => BLOCKING_DECO.has(t.type)).map(t => t.x + ',' + t.y)
  );

  /* ---------- flood fill ---------- */
  function flood(openLocks, secretsMoved) {
    const opened = new Set(), parked = new Set();
    for (const s of secretsMoved) {
      opened.add(s.x + ',' + s.y);
      parked.add((s.x + s.dx * s.tiles) + ',' + (s.y + s.dy * s.tiles));
    }
    const passable = (x, y) => {
      const k = x + ',' + y;
      if (parked.has(k) || blockedByDeco.has(k)) return false;
      const c = GRID[y][x];
      if (c === '.') return true;
      if (c === '?') return opened.has(k);
      if (DOORS.has(c)) return c === 'd' || openLocks.has(c);
      return false;
    };
    const seen = new Set([START.x + ',' + START.y]);
    const q = [[START.x, START.y]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k)) continue;
        if (!passable(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  }
  const thingAt = type => { const t = THINGS.find(t => t.type === type); return t ? t.x + ',' + t.y : null; };
  const hasChar = ch => GRID.some(r => r.includes(ch));

  /* ---------- 3.+4. postup po zámcích ---------- */
  const noKeys = flood(new Set(), []);
  notes.push(`bez klíčů dosažitelných dlaždic: ${noKeys.size}`);

  if (hasChar('v')) {
    const ks = thingAt('keySilver');
    if (!ks) problems.push('jsou stříbrné dveře, ale žádný stříbrný klíč');
    else if (!noKeys.has(ks)) problems.push(`stříbrný klíč (${ks}) je nedosažitelný bez klíčů`);
  }
  const withSilver = flood(new Set(['v']), []);
  if (hasChar('g')) {
    const kg = thingAt('keyGold');
    if (!kg) problems.push('jsou zlaté dveře, ale žádný zlatý klíč');
    else if (!withSilver.has(kg)) problems.push(`zlatý klíč (${kg}) je nedosažitelný se stříbrným klíčem`);
  }
  const withBoth = flood(new Set(['v', 'g']), []);

  if (L.needBoss) {
    const b = thingAt('boss');
    if (!b) problems.push('level vyžaduje bosse, ale žádný v něm není');
    else if (!withBoth.has(b)) problems.push(`boss (${b}) je nedosažitelný i s oběma klíči`);
  }
  let lever = null;
  for (let y = 0; y < H && !lever; y++) for (let x = 0; x < W; x++) if (GRID[y][x] === 'e') { lever = { x, y }; break; }
  if (!lever) problems.push('v mapě není páka výtahu (znak "e")');
  else if (!DIRS.some(([dx, dy]) => withBoth.has((lever.x + dx) + ',' + (lever.y + dy)))) {
    problems.push(`k páce na ${lever.x},${lever.y} se nedá postavit`);
  }

  /* ---------- 5. tajné komory ---------- */
  const secretTiles = new Set();
  for (const s of SECRETS) {
    const reach = (s.x - s.dx) + ',' + (s.y - s.dy);
    if (!withBoth.has(reach)) problems.push(`na tajnou zeď ${s.x},${s.y} se nedá dosáhnout`);
    const opened = flood(new Set(['v', 'g']), [s]);
    let added = 0;
    for (const k of opened) if (!withBoth.has(k)) { secretTiles.add(k); added++; }
    if (!added) problems.push(`posunutí tajné zdi ${s.x},${s.y} nic neodemkne`);
    notes.push(`tajná zeď ${s.x},${s.y} odemkne ${added} dlaždic`);
  }

  for (const t of THINGS) {
    const k = t.x + ',' + t.y;
    if (BLOCKING_DECO.has(t.type)) continue;
    if (withBoth.has(k) || secretTiles.has(k)) continue;
    problems.push(`${t.type} na ${k} je nedosažitelný`);
  }

  /* ---------- 6. startovní místnost bez nepřátel ---------- */
  {
    const seen = new Set([START.x + ',' + START.y]);
    const q = [[START.x, START.y]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (seen.has(k) || GRID[ny][nx] !== '.' || blockedByDeco.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    notes.push(`startovní místnost má ${seen.size} volných dlaždic`);
    for (const t of THINGS) {
      if (ENEMIES.has(t.type) && seen.has(t.x + ',' + t.y)) problems.push(`${t.type} na ${t.x},${t.y} stojí ve startovní místnosti`);
    }
    if (seen.size < 4) problems.push('startovní místnost je příliš malá');
  }

  /* ---------- dekorace v úzkých místech ---------- */
  for (const t of THINGS) {
    if (!BLOCKING_DECO.has(t.type)) continue;
    for (const [dx, dy] of DIRS) {
      const c = GRID[t.y + dy] && GRID[t.y + dy][t.x + dx];
      if (c && DOORS.has(c)) problems.push(`${t.type} na ${t.x},${t.y} stojí přímo ve dveřích na ${t.x + dx},${t.y + dy}`);
    }
    const openN = DIRS.filter(([dx, dy]) => { const c = GRID[t.y + dy] && GRID[t.y + dy][t.x + dx]; return c === '.' || DOORS.has(c); }).length;
    const horiz = GRID[t.y][t.x - 1] !== '.' && GRID[t.y][t.x + 1] !== '.';
    const vert = GRID[t.y - 1][t.x] !== '.' && GRID[t.y + 1][t.x] !== '.';
    if (openN <= 2 && (horiz || vert)) problems.push(`${t.type} na ${t.x},${t.y} ucpává úzkou chodbu`);
  }

  /* ---------- výstup ---------- */
  const enemies = THINGS.filter(t => ENEMIES.has(t.type)).length;
  console.log(`\n[${li + 1}] ${L.name}: ${W}×${H}, objektů ${THINGS.length}, nepřátel ${enemies}, start ${START.x},${START.y}`);
  notes.forEach(n => console.log('  · ' + n));
  if (problems.length) {
    console.log('  PROBLÉMY (' + problems.length + '):');
    problems.forEach(p => console.log('  ✗ ' + p));
  } else console.log('  ✓ v pořádku');
  totalProblems += problems.length;
}

LEVELS.forEach(checkLevel);
console.log(totalProblems ? `\n✗ celkem problémů: ${totalProblems}` : '\n✓ všechny levely jsou v pořádku');
process.exit(totalProblems ? 1 : 0);
