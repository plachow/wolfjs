/* ============================================================
   WOLF·JS — js/map.js
   Tři levely na mřížce 40×40: pevnost s místnostmi, bludiště chodeb
   a katakomby s arénou. Dveře, zámky, tajné zdi, páka výtahu.

   ZNAKY MŘÍŽKY
     .  podlaha          #  kámen (hala)     %  cihla (chodby)
     =  dřevo (kasárna)  +  ocel (sklad)     *  kámen s praporcem (jídelna)
     X  temný kámen (bossova hala)
     d  dveře            g  dveře na zlatý klíč   v  dveře na stříbrný klíč
     ?  tajná posuvná zeď                     e  páka výtahu (konec levelu)
   ============================================================ */
(function (global) {
  'use strict';

  var W = global.W = global.W || {};

  /* ============================================================
     LEVELY
     ============================================================ */
  var LEVELS = [
    /* ---------------------------------------------------------- */
    {
      name: 'Pevnost',
      bossName: 'Generál Wolfheim', bossHp: 480, needBoss: true,
      grid: [
        /* 00 */ '########################################',
        /* 01 */ '####################===================#',
        /* 02 */ '##............######=.................=#',
        /* 03 */ '##............######=.................=#',
        /* 04 */ '##............#%%%%%=.................=#',
        /* 05 */ '##............d.....d.................=#',
        /* 06 */ '##............#%%%%%=.................=#',
        /* 07 */ '##............######=.................=#',
        /* 08 */ '##............######=.................=#',
        /* 09 */ '##............######=.................=#',
        /* 10 */ '###d################=.................=#',
        /* 11 */ '##....##############=.................=#',
        /* 12 */ '##....##############==========d========#',
        /* 13 */ '##....#######################%.%########',
        /* 14 */ '##....#######################%.%########',
        /* 15 */ '#############################%.%########',
        /* 16 */ '######################++++++++d++++++++#',
        /* 17 */ '#***************#++++++...............+#',
        /* 18 */ '#*.............*#+....+...............+#',
        /* 19 */ '#*.............*#+....+...............+#',
        /* 20 */ '#*.............*#+....?...............+#',
        /* 21 */ '#*.............*#+....+...............+#',
        /* 22 */ '#*.............*#+....+...............+#',
        /* 23 */ '#*.............*#++++++...............+#',
        /* 24 */ '#*.............d......v...............+#',
        /* 25 */ '#*.............*%%%%%%+...............+#',
        /* 26 */ '#*.............*######+...............+#',
        /* 27 */ '#*.............*######+++++++++++++++++#',
        /* 28 */ '#*.............*########################',
        /* 29 */ '#*******g*******########################',
        /* 30 */ '#######%.%#########XXXXXXXXXXXXXXXXXXXX#',
        /* 31 */ '#######%.%#########X..................X#',
        /* 32 */ '#######%.%#########X..................X#',
        /* 33 */ '#######%.%#########X..................X#',
        /* 34 */ '#######%.%#########X..................e#',
        /* 35 */ '#######%...........d..................X#',
        /* 36 */ '#######%%%%%%%%%%%%X..................X#',
        /* 37 */ '###################X..................X#',
        /* 38 */ '###################X..................X#',
        /* 39 */ '###################XXXXXXXXXXXXXXXXXXXX#'
      ],
      things: [
      /* --- 0. CELA (start, bez nepřátel) --- */
      ['ammo', 5, 11], ['bones', 2, 14],

      /* --- 1. VSTUPNÍ HALA --- */
      ['brazier', 2, 2], ['brazier', 13, 2],
      ['guard', 10, 3], ['guard', 11, 7], ['guard', 6, 2],
      ['ammo', 5, 3], ['barrel', 7, 5], ['table', 12, 2],
      ['cross', 13, 9], ['bones', 4, 9],

      /* --- spojovací chodba --- */
      ['guard', 17, 5], ['blood', 16, 5],

      /* --- 2. KASÁRNA --- */
      ['brazier', 21, 2], ['brazier', 37, 2],
      ['guard', 24, 3], ['guard', 31, 4], ['guard', 35, 8], ['guard', 23, 10],
      ['dog', 33, 3],
      ['smg', 36, 2], ['medkit', 22, 11], ['food', 25, 7],
      ['ammo', 30, 9], ['ammo', 28, 2],
      ['table', 26, 5], ['table', 27, 5],
      ['barrel', 34, 11], ['barrel', 35, 11], ['pillar', 29, 6],
      ['crown', 37, 11],

      /* --- chodba ke skladu --- */
      ['dog', 30, 14],

      /* --- 3. SKLAD (stříbrný klíč, brokovnice) --- */
      ['keySilver', 36, 25], ['shotgun', 24, 24],
      ['guard', 25, 18], ['guard', 33, 22],
      ['dog', 28, 25], ['dog', 35, 18],
      ['officer', 30, 21],
      ['ammo', 24, 26], ['ammo', 34, 17], ['medkit', 23, 22],
      ['barrel', 26, 20], ['barrel', 27, 20], ['barrel', 26, 21], ['barrel', 27, 21],
      ['chalice', 37, 17], ['bones', 24, 17], ['brazier', 23, 26],

      /* --- TAJNÁ KOMORA (za posuvnou zdí 22,20) --- */
      ['cross', 19, 19], ['cross', 20, 19],
      ['crown', 19, 21], ['chalice', 20, 21],
      ['ammoBig', 21, 18], ['medkit', 18, 22], ['shells', 18, 18],

      /* --- chodba do jídelny --- */
      ['officer', 18, 24], ['blood', 20, 24],

      /* --- 4. JÍDELNA / VELITELSTVÍ (zlatý klíč) --- */
      ['keyGold', 3, 27],
      ['officer', 6, 20], ['officer', 11, 25],
      ['guard', 9, 19], ['guard', 4, 23],
      ['dog', 13, 27],
      ['medkit', 2, 18], ['food', 14, 28], ['shells', 13, 19],
      ['ammo', 7, 22], ['ammo', 12, 19],
      ['table', 6, 24], ['table', 7, 24], ['table', 8, 24],
      ['pillar', 5, 21], ['pillar', 10, 21],
      ['cross', 2, 28], ['chalice', 14, 18],
      ['brazier', 2, 20], ['brazier', 13, 21], ['bones', 12, 22],

      /* --- chodba k bossovi --- */
      ['ammo', 8, 32], ['medkit', 14, 35], ['guard', 16, 35], ['blood', 8, 31],

      /* --- 5. BOSSOVA HALA --- */
      ['boss', 34, 35],
      ['officer', 24, 32], ['officer', 24, 38],
      ['ammoBig', 21, 31], ['ammoBig', 21, 38], ['medkit', 20, 35], ['shells', 22, 35],
      ['pillar', 26, 33], ['pillar', 26, 37], ['pillar', 31, 33], ['pillar', 31, 37],
      ['brazier', 20, 31], ['brazier', 20, 38], ['brazier', 37, 31], ['brazier', 37, 38],
      ['crown', 36, 31]
      ],
      secrets: [{ x: 22, y: 20, dx: -1, dy: 0, tiles: 3 }],
      rooms: [
        { name: 'Cela',         x0: 1, y0: 10, x1: 6, y1: 15, col: '#4f4f58' },
        { name: 'Vstupní hala', x0: 1, y0: 1, x1: 14, y1: 10, col: '#6a6a74' },
        { name: 'Kasárna',      x0: 20, y0: 1, x1: 38, y1: 12, col: '#7a5a34' },
        { name: 'Sklad',        x0: 22, y0: 16, x1: 38, y1: 27, col: '#4e5a6d' },
        { name: 'Tajná komora', x0: 17, y0: 17, x1: 22, y1: 23, col: '#8a6a20' },
        { name: 'Jídelna',      x0: 1, y0: 17, x1: 15, y1: 29, col: '#6d4046' },
        { name: 'Trůnní sál',   x0: 19, y0: 30, x1: 38, y1: 39, col: '#3d2a4e' }
      ],
      start: { x: 3.5, y: 13.5, a: -Math.PI / 2 }
    },
    /* ---------------------------------------------------------- */
    {
      name: 'Bludiště',
      bossName: null, bossHp: 0, needBoss: false,
      grid: [
        /* 00 */ '################################=======#',
        /* 01 */ '################################=.....=#',
        /* 02 */ '##...#%%%%%%%%%%%%%%%###########=.....=#',
        /* 03 */ '##...d..............%###########=.....=#',
        /* 04 */ '##...#%%%%%%%%%%%%%d%###########=.....=#',
        /* 05 */ '##################%.%###########=.....=#',
        /* 06 */ '##################%.%###########===.===#',
        /* 07 */ '##################%.%#############%.%###',
        /* 08 */ '################===.===###########%.%###',
        /* 09 */ '################=.....=###########%.%###',
        /* 10 */ '################=.....=%%%%%%%%%%%%.%###',
        /* 11 */ '################=...........d.......%###',
        /* 12 */ '################=.....=%%%%.%%%%%%%%%###',
        /* 13 */ '################=.....=###%.%###########',
        /* 14 */ '################=======###%.%###########',
        /* 15 */ '##########################%.%###########',
        /* 16 */ '##########################%.%###*******#',
        /* 17 */ '#########################%%.%%##*.....*#',
        /* 18 */ '##%%%%%%%%%%%#####%%%%%%%%...%##*.....*#',
        /* 19 */ '##%.........%#####%..........%##*.....*#',
        /* 20 */ '##%d%%%%%%%.%#####%.%%%%%%...%##*.....*#',
        /* 21 */ '##%.%#####%.%#####%.%####%%.%%##*.....*#',
        /* 22 */ '##%.%#####%.%#####%.%#####%.%###***.***#',
        /* 23 */ '##%.%#####%.%#####%.%#####%.%#####%.%###',
        /* 24 */ '+++.+++###%.%#####%.%#####%.%#####%.%###',
        /* 25 */ '+.....+##%%.%%###%%.%%###%%.%%####%.%###',
        /* 26 */ '+.....+%%%...%%%%%...%###%...%%%%%%d%###',
        /* 27 */ '+........d...........%###%...v......%###',
        /* 28 */ '+.....+%%%...%%%%%...%###%...%%%%%%.%###',
        /* 29 */ '+.....+##%%%%%###%%.%%###%%%%%####%.%###',
        /* 30 */ '+++++++###########%.%#############%.%###',
        /* 31 */ '##################%.%#############%.%###',
        /* 32 */ '##################%.%###XXXXXXX###%.%###',
        /* 33 */ '#############+++++%.%%##X.....X###%.%###',
        /* 34 */ '#############+...+...%##X.....X%%%%.%###',
        /* 35 */ '#############+...?...%##X.........g.%###',
        /* 36 */ '#############+...+...%##X.....X%%%%%%###',
        /* 37 */ '#############+++++%%%%##X.....X#########',
        /* 38 */ '########################XXXeXXX#########',
        /* 39 */ '########################################'
      ],
      things: [
      /* --- start --- */
      ['ammo', 4, 4], ['shells', 2, 2],
      /* --- horní chodba a sestup --- */
      ['guard', 9, 3], ['guard', 16, 3], ['dog', 19, 6],
      /* --- strážnice --- */
      ['guard', 18, 10], ['guard', 20, 12], ['officer', 21, 9],
      ['table', 19, 11], ['barrel', 17, 13], ['medkit', 21, 13], ['ammo', 17, 9],
      /* --- východní chodba --- */
      ['guard', 25, 11], ['guard', 33, 11], ['dog', 35, 8],
      /* --- skladiště (brokovnice) --- */
      ['shotgun', 35, 3], ['shells', 33, 1], ['shells', 37, 1], ['ammoBig', 34, 5],
      ['crown', 36, 5], ['officer', 34, 2], ['barrel', 36, 4], ['bones', 33, 5],
      /* --- střed --- */
      ['guard', 26, 18], ['medkit', 28, 20],
      ['dog', 19, 27], ['ammo', 18, 26],
      ['guard', 10, 26], ['chalice', 12, 28],
      ['guard', 7, 19],
      /* --- stříbrná komora --- */
      ['keySilver', 3, 27], ['officer', 2, 26], ['officer', 4, 28],
      ['medkit', 1, 29], ['ammo', 5, 25], ['cross', 1, 25], ['brazier', 5, 29],
      /* --- k stříbrným dveřím --- */
      ['officer', 27, 26], ['shells', 26, 28],
      /* --- zlatá komora --- */
      ['keyGold', 35, 19], ['officer', 33, 17], ['officer', 37, 21], ['guard', 37, 17],
      ['medkit', 33, 21], ['ammoBig', 35, 21], ['crown', 37, 19],
      /* --- výtah --- */
      ['officer', 26, 34], ['officer', 28, 36], ['guard', 27, 33],
      ['medkit', 25, 37], ['ammoBig', 29, 33], ['brazier', 25, 33], ['brazier', 29, 37],
      /* --- jižní slepá chodba + tajný výklenek --- */
      ['dog', 19, 36], ['ammo', 20, 34], ['bones', 18, 36],
      ['cross', 14, 34], ['cross', 16, 34], ['chalice', 15, 36], ['crown', 14, 36],
      ['shells', 16, 36], ['medkit', 15, 34]
      ],
      secrets: [{ x: 17, y: 35, dx: -1, dy: 0, tiles: 2 }],
      rooms: [
        { name: 'Bludiště',        x0: 0, y0: 0, x1: 39, y1: 39, col: '#5a4a3a' },
        { name: 'Cela',            x0: 1, y0: 1, x1: 5, y1: 5, col: '#4f4f58' },
        { name: 'Skladiště',       x0: 32, y0: 0, x1: 38, y1: 6, col: '#7a5a34' },
        { name: 'Strážnice',       x0: 16, y0: 8, x1: 22, y1: 14, col: '#7a5a34' },
        { name: 'Zlatá komora',    x0: 32, y0: 16, x1: 38, y1: 22, col: '#6d4046' },
        { name: 'Stříbrná komora', x0: 0, y0: 24, x1: 6, y1: 30, col: '#4e5a6d' },
        { name: 'Tajný výklenek',  x0: 13, y0: 33, x1: 17, y1: 37, col: '#8a6a20' },
        { name: 'Výtah',           x0: 24, y0: 32, x1: 30, y1: 38, col: '#3d2a4e' }
      ],
      start: { x: 3.5, y: 3.5, a: 0 }
    },
    /* ---------------------------------------------------------- */
    {
      name: 'Katakomby',
      bossName: 'Řezník', bossHp: 620, needBoss: true,
      grid: [
        /* 00 */ '########################################',
        /* 01 */ '########################################',
        /* 02 */ '##########%%%%%%%%%%%%%%%%%%%###########',
        /* 03 */ '##########%.................%###########',
        /* 04 */ '##########%.%%%%%%%.%%%%%%%.%###########',
        /* 05 */ '##########%.%#####%.%#####%.%###########',
        /* 06 */ '##########%.%#####%.%#####%.%###########',
        /* 07 */ '##########%.%#####%.%#####%.%###########',
        /* 08 */ '##########%.%#####%.%#####%.%###+++++++#',
        /* 09 */ '##########%.%#####%.%####%%.%%##+.....+#',
        /* 10 */ '##%%%%%%%%%.%%%%%%%.%%%%%%...%%%+.....+#',
        /* 11 */ '##%.........d................d........+#',
        /* 12 */ '##%.%%%%%%%%%%%%%%%%%%%%%%...%%%+.....+#',
        /* 13 */ '##%.%####################%%%%%##+.....+#',
        /* 14 */ '##%.%###########################+++.+++#',
        /* 15 */ '##%.%##########XXXXXXXXX##########%.%###',
        /* 16 */ '##%.%##########X.......X##########%.%###',
        /* 17 */ '##%.%##########X.......X#*****###%%.%%##',
        /* 18 */ '##%.%%%%%%%%%%%X.......X%*...*###%...%##',
        /* 19 */ '##%.........g..........d.....e###%...%##',
        /* 20 */ '##%.%%%%%%%.%%%X.......X%*...*###%...%##',
        /* 21 */ '##%.%#####%.%##X.......X#*****###%%%%%##',
        /* 22 */ '##%.%#####%.%##X.......X################',
        /* 23 */ '##%.%#####%.%##XXXXXXXXX################',
        /* 24 */ '##%.%#####%.%###################=======#',
        /* 25 */ '##%.%####%%.%%##################=.....=#',
        /* 26 */ '##%.%%%%%%...%%%%%%%%%%%%%%%%%%%=.....=#',
        /* 27 */ '##%.d...............d.......v.........=#',
        /* 28 */ '##%.%%%%%%...%%%%%%.%%%%%%%.%%%%=.....=#',
        /* 29 */ '##%.%####%%.%%####%.%#####%.%###=.....=#',
        /* 30 */ '##%.%#####%.%#####%.%#####%.%###===.===#',
        /* 31 */ '##%.%#####%.%#####%.%#####%.%#####%.%###',
        /* 32 */ '##%.%#####%.%#####%.%#####%.%#####%.%###',
        /* 33 */ '###d#####%%.%%###%%.%+++++%.%%###%%.%%##',
        /* 34 */ '##...####%...%###%...+...+...%###%...%##',
        /* 35 */ '##...####%...%###%...?...+...%###%...%##',
        /* 36 */ '##...####%...%###%...+...+...%###%...%##',
        /* 37 */ '#########%%%%%###%%%%+++++%%%%###%%%%%##',
        /* 38 */ '########################################',
        /* 39 */ '########################################'
      ],
      things: [
      /* --- krypta (start) --- */
      ['ammo', 2, 36], ['shells', 4, 36],
      /* --- západní chodby --- */
      ['dog', 3, 30], ['guard', 10, 26], ['medkit', 12, 28],
      ['ammoBig', 11, 35], ['guard', 12, 34], ['cross', 10, 36],
      ['guard', 11, 22], ['guard', 6, 19], ['dog', 3, 23], ['guard', 7, 11],
      /* --- sever --- */
      ['officer', 17, 11], ['dog', 19, 7], ['guard', 14, 3], ['guard', 24, 3],
      ['ammo', 19, 3], ['medkit', 27, 3], ['officer', 26, 10], ['shells', 28, 12],
      ['guard', 22, 11],
      /* --- stříbrná komora --- */
      ['keySilver', 35, 11], ['officer', 33, 9], ['officer', 37, 13], ['guard', 37, 9],
      ['medkit', 33, 13], ['ammoBig', 35, 13], ['chalice', 35, 9],
      ['shells', 34, 18], ['medkit', 36, 20], ['guard', 35, 20],
      /* --- aréna --- */
      ['boss', 20, 19], ['officer', 17, 17], ['officer', 17, 21],
      ['pillar', 18, 17], ['pillar', 18, 21], ['pillar', 21, 17], ['pillar', 21, 21],
      ['ammoBig', 16, 16], ['ammoBig', 16, 22], ['shells', 22, 16], ['medkit', 22, 22],
      ['crown', 19, 16],
      /* --- výtah --- */
      ['medkit', 27, 18], ['shells', 27, 20],
      /* --- jih --- */
      ['guard', 24, 27], ['dog', 19, 35], ['ammo', 18, 34], ['bones', 20, 36],
      ['cross', 22, 34], ['cross', 24, 34], ['crown', 22, 36], ['chalice', 24, 36],
      ['shells', 22, 35], ['medkit', 24, 35],
      ['officer', 27, 35], ['medkit', 26, 34], ['ammoBig', 28, 36],
      /* --- zlatá komora --- */
      ['keyGold', 35, 27], ['officer', 33, 25], ['officer', 37, 29], ['officer', 37, 25],
      ['guard', 33, 29], ['medkit', 35, 29], ['ammoBig', 35, 25], ['crown', 33, 27],
      /* --- přepad u výtahu --- */
      ['officer', 34, 34], ['officer', 36, 36], ['shells', 35, 35], ['medkit', 36, 34]
      ],
      secrets: [{ x: 21, y: 35, dx: 1, dy: 0, tiles: 2 }],
      rooms: [
        { name: 'Katakomby',       x0: 0, y0: 0, x1: 39, y1: 39, col: '#4a4a52' },
        { name: 'Krypta',          x0: 1, y0: 33, x1: 5, y1: 37, col: '#4f4f58' },
        { name: 'Stříbrná komora', x0: 32, y0: 8, x1: 38, y1: 14, col: '#4e5a6d' },
        { name: 'Aréna',           x0: 15, y0: 15, x1: 23, y1: 23, col: '#3d2a4e' },
        { name: 'Výtah',           x0: 25, y0: 17, x1: 29, y1: 21, col: '#6d4046' },
        { name: 'Zlatá komora',    x0: 32, y0: 24, x1: 38, y1: 30, col: '#7a5a34' },
        { name: 'Tajný výklenek',  x0: 21, y0: 33, x1: 25, y1: 37, col: '#8a6a20' }
      ],
      start: { x: 3.5, y: 35.5, a: -Math.PI / 2 }
    }
  ];

  /* ============================================================
     PŘEVOD NA DATOVÉ STRUKTURY
     ============================================================ */
  var CHAR2ID = {
    '.': 0, '#': 1, '%': 2, '=': 3, '+': 4, '*': 5, 'X': 6,
    'd': 7, 'g': 8, 'v': 9, 'e': 10, '?': 11
  };
  var ID2TEX = [null, 'stone', 'brick', 'wood', 'steel', 'banner', 'hell',
                'door', 'doorG', 'doorS', 'switch0', 'steel'];

  var MW = 40, MH = 40;

  var Level = {
    index: 0, name: '',
    w: MW, h: MH,
    grid: null,          // Uint8Array – id stěny (0 = průchozí)
    doorIdx: null,       // Int16Array – index dveří v cele, jinak -1
    doors: [],
    secrets: [],
    things: [],
    rooms: [],
    start: null,
    bossName: null, bossHp: 0, needBoss: false,
    switchOn: false,
    seen: null           // Uint8Array – co už hráč viděl (minimapa)
  };

  function idx(x, y) { return y * MW + x; }

  /** Načte level podle indexu do sdílené struktury Level. */
  function build(index) {
    var L = LEVELS[index] || LEVELS[0];
    var GRID = L.grid, SECRETS = L.secrets;
    MW = GRID[0].length; MH = GRID.length;
    Level.index = index; Level.name = L.name;
    Level.w = MW; Level.h = MH;
    Level.things = L.things; Level.rooms = L.rooms; Level.start = L.start;
    Level.bossName = L.bossName; Level.bossHp = L.bossHp; Level.needBoss = !!L.needBoss;

    var g = new Uint8Array(MW * MH);
    var di = new Int16Array(MW * MH);
    Level.doors.length = 0;
    Level.secrets.length = 0;

    for (var y = 0; y < MH; y++) {
      var row = GRID[y];
      for (var x = 0; x < MW; x++) {
        var id = CHAR2ID[row.charAt(x)];
        if (id === undefined) id = 1;
        g[idx(x, y)] = id;
        di[idx(x, y)] = -1;
      }
    }
    Level.grid = g;
    Level.doorIdx = di;
    Level.seen = new Uint8Array(MW * MH);

    // dveře
    for (y = 0; y < MH; y++) {
      for (x = 0; x < MW; x++) {
        var v = g[idx(x, y)];
        if (v !== 7 && v !== 8 && v !== 9) continue;
        var solidNS = isWallId(g[idx(x, y - 1)]) && isWallId(g[idx(x, y + 1)]);
        var d = {
          x: x, y: y,
          vertical: solidNS,           // rovina dveří v ose X
          lock: v === 8 ? 1 : (v === 9 ? 2 : 0),
          tex: ID2TEX[v],
          open: 0,                     // 0 zavřeno … 1 otevřeno
          state: 'closed',             // closed | opening | open | closing
          hold: 0
        };
        di[idx(x, y)] = Level.doors.length;
        Level.doors.push(d);
      }
    }

    // tajné zdi
    for (var i = 0; i < SECRETS.length; i++) {
      var s = SECRETS[i];
      Level.secrets.push({
        x: s.x, y: s.y, dx: s.dx, dy: s.dy,
        left: s.tiles, moving: false, t: 0, found: false,
        id: g[idx(s.x, s.y)]
      });
    }

    Level.switchOn = false;
    return Level;
  }

  /** Je dané id pevná stěna (ne podlaha)? Dveře se počítají. */
  function isWallId(id) { return id !== 0 && id !== undefined; }

  /** Blokuje buňka pohyb? Otevřené dveře ne. */
  function blocked(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    var id = Level.grid[idx(x, y)];
    if (id === 0) return false;
    if (id === 7 || id === 8 || id === 9) {
      var d = Level.doors[Level.doorIdx[idx(x, y)]];
      return !d || d.open < 0.8;
    }
    return true;
  }

  /** Neprůhledná pro střelbu / dohled? */
  function opaque(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    var id = Level.grid[idx(x, y)];
    if (id === 0) return false;
    if (id === 7 || id === 8 || id === 9) {
      var d = Level.doors[Level.doorIdx[idx(x, y)]];
      return !d || d.open < 0.5;
    }
    return true;
  }

  function at(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return 1;
    return Level.grid[idx(x, y)];
  }

  function doorAt(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return null;
    var i = Level.doorIdx[idx(x, y)];
    return i < 0 ? null : Level.doors[i];
  }

  function texFor(id) {
    if (id === 10) return Level.switchOn ? 'switch1' : 'switch0';
    return ID2TEX[id] || 'stone';
  }

  function roomAt(x, y) {
    var ROOMS = Level.rooms;
    for (var i = ROOMS.length - 1; i >= 0; i--) {
      var r = ROOMS[i];
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
    }
    return null;
  }

  /* ---------- posun tajné zdi ---------- */
  function pushSecret(sec) {
    if (sec.moving || sec.left <= 0) return false;
    sec.moving = true;
    sec.t = 0;
    sec.found = true;
    return true;
  }

  function updateSecrets(dt) {
    for (var i = 0; i < Level.secrets.length; i++) {
      var s = Level.secrets[i];
      if (!s.moving) continue;
      s.t += dt;
      if (s.t < 0.32) continue;
      s.t = 0;
      var nx = s.x + s.dx, ny = s.y + s.dy;
      if (at(nx, ny) !== 0 || s.left <= 0) { s.moving = false; continue; }
      Level.grid[idx(s.x, s.y)] = 0;               // uvolnit původní buňku
      Level.grid[idx(nx, ny)] = s.id;
      s.x = nx; s.y = ny;
      s.left--;
      if (s.left <= 0) s.moving = false;
    }
  }

  /* ---------- animace dveří ---------- */
  function updateDoors(dt) {
    for (var i = 0; i < Level.doors.length; i++) {
      var d = Level.doors[i];
      if (d.state === 'opening') {
        d.open += dt * 1.9;
        if (d.open >= 1) { d.open = 1; d.state = 'open'; d.hold = 4.5; }
      } else if (d.state === 'open') {
        d.hold -= dt;
        if (d.hold <= 0 && !occupied(d)) d.state = 'closing';
      } else if (d.state === 'closing') {
        d.open -= dt * 1.5;
        if (d.open <= 0) { d.open = 0; d.state = 'closed'; }
      }
    }
  }

  /** Stojí ve dveřích hráč nebo nepřítel? Pak je nezavírej. */
  var occupancyTest = null;      // dosadí game.js
  function occupied(d) { return occupancyTest ? occupancyTest(d.x, d.y) : false; }

  /* ============================================================
     EXPORT
     ============================================================ */
  W.Map = {
    LEVELS: LEVELS,
    level: Level,
    build: build,
    get levelCount() { return LEVELS.length; },
    idx: idx,
    at: at,
    blocked: blocked,
    opaque: opaque,
    doorAt: doorAt,
    texFor: texFor,
    roomAt: roomAt,
    isWallId: isWallId,
    updateDoors: updateDoors,
    updateSecrets: updateSecrets,
    pushSecret: pushSecret,
    setOccupancyTest: function (fn) { occupancyTest = fn; },
    get width() { return MW; },
    get height() { return MH; }
  };

})(window);
