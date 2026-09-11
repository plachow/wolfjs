# WOLF·JS

Raycastingová FPS v čistém HTML/CSS/JS po vzoru Wolfensteina 3D. Čtyři sektory, čtyři zbraně, dva bossové.
Žádné knihovny, žádné externí obrázky ani zvuky — **všechna grafika i zvuk
vznikají za běhu v kódu**.

**Hraj online: <https://plachow.github.io/wolfjs/>**

## Spuštění

Dvojklik na `index.html`, nebo přes lokální server:

```bash
python -m http.server 8123 --bind 127.0.0.1
```

Skripty jsou schválně načtené klasickými `<script src>` (sdílený namespace `W`),
ne jako ES moduly — díky tomu hra běží i z `file://`.

## Ovládání

| Klávesa | Akce |
|---|---|
| `W` `A` `S` `D` | pohyb a úkroky |
| myš | rozhlížení včetně nahoru/dolů (klikni do obrazu pro uzamčení kurzoru) |
| `PgUp` `PgDn` | pohled nahoru / dolů bez myši |
| `←` `→` | otáčení bez myši |
| `Shift` | sprint |
| `LMB` / `Ctrl` | střelba |
| `E` / `Mezerník` | dveře, páky, tajné zdi |
| `1` `2` `3` `4` (česky `+` `ě` `š` `č`) | nůž / pistole / samopal / brokovnice |
| `Q`, kolečko myši | přepínání zbraní |
| `Tab` | velká mapa (nepřátelé jen ti, na které právě vidíš) |
| `Esc` | pauza a nastavení; další `Esc` vrátí do hry. Nastavení se ukládá v prohlížeči (`localStorage`), tlačítko *Výchozí nastavení* ho smaže |

## Levely

Čtyři sektory na mřížce 40×40, na střídačku místnosti a bludiště. Zdraví,
munice a zbraně se nesou dál, klíče ne.

**1 · Pevnost** (místnosti) — cela → vstupní hala → kasárna (samopal) → sklad
(stříbrný klíč, brokovnice, tajná komora) → jídelna (zlatý klíč) → trůnní sál.

**2 · Bludiště** (chodby) — síť chodeb šířky 1 se smyčkami a slepými konci.
Skladiště s brokovnicí, stříbrná komora na západě, zlatá na východě, výtah na jihu.

**3 · Kasematy** (místnosti) — deset sálů spojených dveřmi ve společných stěnách:
strážnice, pokladnice, kasárna, psinec, zbrojnice, zlatá a stříbrná komora.

**4 · Katakomby** (chodby + aréna) — hustší bludiště kolem centrální arény
s Řezníkem, za ní výtah. Konec hry.

**Arény s bossem** (sektory 1 a 4): boss v nich na začátku není. Jakmile
vejdeš dovnitř, dveře se zavřou a zapečetí, a teprve pak se boss zjeví.
Pečeť povolí až s jeho smrtí.

**Rozmístění nepřátel** je při každém startu trochu jiné: každý se posune na
náhodnou volnou dlaždici do tří kroků od autorské pozice, ale nepřejde dveře,
nevleze do startovní místnosti ani na dekoraci. Stráže u klíčů zůstávají stráže.

Levely 2–4 vznikly z makro-uzlů (5×5, rozestup 8) a hran s dveřmi — mapy jsou
ale uložené jako obyčejné ASCII v [js/map.js](js/map.js), takže se dají upravit
ručně stejně jako první sektor.

Tajné zdi otevřeš tak, že se k nim postavíš a zmáčkneš `E`. Páka jde použít
až po zabití bosse (v sektorech bez bosse hned).

### Kontrola levelu

Po každé úpravě mapy nebo rozmístění objektů spusť:

```bash
node tools/validate-map.js
```

Skript ověří tvar mřížky, že žádný objekt neleží ve zdi, a hlavně projde
level flood fillem, ve kterém **blokující dekorace počítá jako zeď** —
takže odhalí sloup, sud nebo ohniště zaparkované v průchodu. Zároveň
kontroluje pořadí zámků (stříbrný klíč musí být dosažitelný dřív než
stříbrné dveře) a že tajná komora je nedostupná před posunutím zdi
a dostupná po něm. Nakonec hlídá, že ve startovní místnosti (dokud
neotevřeš dveře) nestojí žádný nepřítel.

## Nepřátelé

| Typ | Zdraví | Chování |
|---|---|---|
| Strážný | 26 | pistole; drží odstup 3–7 dlaždic, po výstřelu se často schová |
| Vlčák | 15 | rychlý, jde přímo na tebe, jen na blízko |
| Důstojník | 58 | dávky po třech; drží odstup 4–9, hodně krouží a kryje se |
| **Generál Wolfheim** (L1) | 480 | dva kulomety, devítiranné dávky |
| **Řezník** (L4) | 620 | totéž, jen tužší |

### AI vojáků

- **Odstup místo náběhu** — každý typ má pásmo `keep[min,max]`: blíž couvá,
  dál se přibližuje cik-cak, uvnitř pásma krouží kolmo na tebe a občas se
  zastaví, aby vystřelil.
- **Krytí** — po dávce se s pravděpodobností `coverChance` (vyšší, když je
  zraněný) přesune na blízkou dlaždici, kam nevidíš, chvíli počká a vykoukne.
  **Sudy a sloupy jsou neprůstřelné** — zastaví střelu i pohled oběma směrům,
  takže slouží jako kryt tobě i jim (stoly a ohniště jsou nízké, přes ty se střílí).
- **Stráže** — vojáci do 3 dlaždic od klíče nebo páky drží stanoviště:
  střílejí z místa a nepronásledují dál než na délku vodítka.
- **Navigace** — BFS flow-field od hráče (přepočet ~3× za sekundu); když tě
  nevidí, jdou po něm k místu, kde tě viděli naposled, po pár sekundách to
  vzdají. Obyčejné dveře si otevírají sami.
- **Hluk** — výstřel probudí ty, kdo tě vidí, a na půl dosahu i ty za rohem.

Psi nic z toho nedělají — běží přímo.

## Zbraně

| | Munice | Poznámka |
|---|---|---|
| Nůž | — | na blízko, tichý |
| Pistole P08 | náboje | přesná, semi-auto |
| Samopal MP-40 | náboje | automat, větší rozptyl |
| Brokovnice | broky (max 30) | 8 broků v kuželu, každý vlastní hitscan — může trefit víc cílů. Zblízka ~100 na ránu (důstojník padne na jednu), na 8 dlaždic ~40, na 12 už jako pistole |

## Struktura kódu

| Soubor | Obsah |
|---|---|
| `index.html` | DOM: canvas, status bar, overlaye |
| `css/style.css` | veškerý vzhled UI |
| `js/ui.js` | vrstva mezi hrou a DOMem (HUD, toasty, portrét) |
| `js/textures.js` | procedurální textury stěn/podlahy/stropu + 16 úrovní stínu |
| `js/sprites.js` | procedurální sprity nepřátel, pickupů a dekorací |
| `js/audio.js` | Web Audio syntéza všech zvuků |
| `js/map.js` | data levelu, dveře, zámky, posuvné zdi |
| `js/raycaster.js` | DDA renderer: stěny, podlaha/strop, sprity se z-bufferem |
| `js/entities.js` | AI nepřátel, pickupy, statistiky |
| `js/weapons.js` | tři zbraně, animace, ikony |
| `js/game.js` | hráč, kolize, pravidla, minimapa, výhra/prohra |
| `js/main.js` | canvas, herní smyčka, vstupy, stavy aplikace |
| `tools/validate-map.js` | statická kontrola průchodnosti levelu |

## Poznámky k technice

- **Renderer** kreslí do jednoho `Uint32Array` framebufferu (ABGR) a jednou
  za snímek ho nahraje přes `putImageData`. Na 640×507 se 94 sprity trvá
  jeden snímek ~1 ms.
- **Stínování** není počítané za běhu: každá textura má předgenerovaných
  16 ztmavených kopií a raycaster jen sáhne do správné tabulky.
- **Kvalita textur** (pauza → Mipmapy / Filtr textur / Vyhlazení):
  - *Mipmapy* — každá textura i sprite má kopie 64→32→16→8 px, vybírá se
    podle počtu texelů na pixel. Odstraní třpytění v dálce; za běhu nestojí
    nic navíc (spíš je to rychlejší díky menší cache stopě). Výchozí: zapnuto.
  - *Filtr textur: Svisle* — stěny se interpolují jen mezi řádky textury
    (per pixel jediný lerp, sloupec textury se připraví jednou). Zmizí
    „zuby" na vodorovných hranách kamenů, svislé hrany zůstanou ostré.
    Cena je v šumu měření (~0 ms). Doporučená volba.
  - *Filtr textur: Bilineární* — barva se interpoluje ze čtyř sousedních texelů.
    Kanály se lerpují po dvojicích (maska `0x00FF00FF`), u stěn se
    horizontální interpolace dělá jednou na sloupec. I tak je to ~5–7× dražší:
    ~10 ms na 640 px (60 fps ještě drží), ~40 ms na 1280 px (nedrží).
    Na 64px texturách navíc působí rozmazaně. Výchozí: vypnuto.
  - *Vyhlazení* — prohlížeč zmenší canvas s interpolací (`image-rendering:
    auto`). S rozlišením „Vysoké" je to supersampling: vyhladí hrany stěn,
    spritů i textur za cenu, kterou už platíš za vysoké rozlišení (~4 ms).
    Se „Střední" jen rozmaže zvětšení. Výchozí: vypnuto.
- **Pohled nahoru/dolů** je y-shearing, ne skutečná rotace kamery: posune se
  jen horizont (`cam.pitch`), stěny zůstávají svislé sloupce a podlaha/strop se
  odvíjejí od posunutého horizontu. Ořezáno na ±40 % výšky obrazu, kde perspektiva
  ještě drží.
- **Hrany stěn mají vždy antialiasing.** Výška sloupce a jeho horní hrana
  se nezaokrouhlují; pixel nad a pod stěnou, který je pokrytý jen zčásti, se
  po vykreslení podlahy a stropu přimíchá podle pokrytí (`castEdges`). Bez
  toho vzniká na šikmých stěnách schodiště, které se při pohybu vlní.
- **Kamera v klidu jemně „dýchá"** (±0,4 px horizontu). Díky antialiasingu
  hran a subpixelovému mapování textur to už nevyvolává přeskakující zuby —
  hrany plynule přecházejí místo skoku o celý pixel.
- **Dveře** jsou tenká rovina uprostřed buňky. Paprsek, který dorazí do
  buňky s dveřmi, se testuje proti této rovině; pokud je díra (dveře odjely),
  DDA pokračuje dál.
- **Tajná zeď** se posouvá po dlaždicích přímo v mřížce, stejně jako
  v originále.
