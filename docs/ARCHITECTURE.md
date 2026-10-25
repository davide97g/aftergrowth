# Architecture

How the code fits together, the data it saves and sends, and how to add things.

## A page load

`main.ts` → `game/game.ts startGame()`:

0. **Signed in.** `main.ts` asks `/api/me` (`net/account.ts`); without a session it shows the
   sign-in page first. The answer carries your profile and your save.
1. **Who and where.** `Net` opens the WebSocket (the session cookie signs it in).
   `game/arrival.ts` reads `?island=` and `?via=portal`, joins the island's room and, when visiting,
   waits for the host's snapshot.
2. **Theme and layout.** `core/palette.ts setTheme()` swaps palette tokens before any material exists.
   `layoutFor()` picks your saved layout, the host's published one, the commons or the market.
3. **World.** `world/world.ts IslandWorld.build()` generates terrain, places objects, builds the portal
   islet and bridge, scatters the meadow, and derives spots (plots, cauldron, door…) and the walk mask.
4. **Systems.** Farm, flowers, workshop, magic (+ spells, contraptions), social, weather, birds, life,
   garden, rest, cottage, editor, portal travel. Each takes what it needs in its constructor; they
   talk through small callbacks (hooks) rather than importing each other.
5. **Interactions.** Every system exposes *providers*: `(near) => Action | null`. `game/interact.ts`
   picks the closest (with priorities), shows the prompt and runs it on F, a tap, or on arrival after
   a click.
6. **Frame loop** (in `game.ts`): advance time → sample the mood → weather → light the stage →
   move the witch → tweens → update every system → prompts → camera → render → HUD.

Visiting another island, saving the editor and travelling all **reload the page** with new URL
parameters; every system is built once per load from data.

## Rendering

- `render/toon.ts`: one `MeshToonMaterial` per palette token (soft 4-band ramp). Some tokens sway in
  the wind (vertex shader with gusts and a push away from the witch), some glow at night, some always
  glow (fire). `water` and `water-light` are custom shaders (pond ripples and rain rings, waterfall).
  `applyPalette()` swaps glTF materials named `pal:<token>` for these shared materials.
- `game/stage.ts`: renderer, outdoor scene, sky shader (`world/sky.ts`), sun with soft shadows, sky
  light; `render/post.ts`: multisampled target → bloom (night glow) → tilt-shift → output.
- Static, numerous things (grass, flowers, rows) are drawn with `core/assets.ts scatter()`, one
  `InstancedMesh` per material.
- The cottage interior is its own `Scene`; the composer's render pass switches scenes.
- `render/cut.ts`: `cutToon(token)` is the toon material plus a dithered hole around the witch
  wherever it stands between her and the camera. The kingdom's buildings and walls use it.
- Wind tokens (`grass-dark`, `foliage`…) bend by their local height: never use them for big static
  meshes in world coordinates (the kingdom's hill uses `turf`).

## Ground height

Every island has a `ground(x, z)`: 0 on flat islands, the hill in the kingdom. The witch, peers and
keepers (`Witch.ground`), clicks (`world/ground.ts hitGround`), glyphs, spells (lifted per cast),
glyph decals, prompts, name tags, birds, bunnies, butterflies, fireflies and rain all follow it. The
walk mask stays 2D: cliffs are holes, and it has oriented boxes (`addBox`) for houses and walls.

## Aetherhold (`kingdom/`)

- `plan.ts` is the whole city as pure data, no three.js, so tests can walk it: the hill (rings
  around the palace, `hill(d)`), the ramps and stairs (`RAMPS`, `groundAt` = hill or ramp), streets,
  plazas, lots (landmarks first, then houses packed along every street and backfilled behind them),
  props (as a layout), trees, the curtain wall, walk-mask holes/boxes/circles, keeper and activity
  spots, places for the map, townsfolk routes, waterfalls. Seeded, so it's the same city everywhere.
- `city.ts` turns the plan into meshes merged per palette token: the hill (a mesh in rings around
  the palace, so every cliff lines up with a ring of vertices; it dips under ramp walls), retaining
  walls, ramps, paving, houses (windows only on the faces the camera sees), the tavern, Arcanum,
  bell tower, palace, gatehouse, curtain wall, waterfalls, floating islets, the crystal and its rings,
  ley lines. About 40 draw calls for the whole city.
- `world.ts`: `KingdomWorld extends IslandWorld`, overriding the terrain, walk mask, meadow, places
  and `ground()`; props and the portal islet work as on any island.
- `kingdom.ts`: royal shops (`ROYAL_SHOPS`, through the usual `ShopPanel`), the tavern and steward
  panel, the fountain, the bell, the spell range (hooked to `magic.onCast`), townsfolk, crowd level.
  Its save lives in `state.kingdom`.

## Data

### Accounts (`server/accounts.ts`, `net/account.ts`)

Better Auth with email and password (no verification), on SQLite (`node:sqlite`, file
`aftergrowth.db` next to `world.json`). Its tables are migrated at start. The game's own tables sit in
the same database: `profile` (hat colour and shape, island theme, a six-letter friend code), `save`
(the whole save as JSON), `friend` (one row per pair; `accepted` once the other side agrees) and
`portal` (owner → guest: the guest may visit). `/api/auth/*` is Better Auth; `/api/me` returns the
profile and save; `PUT`/`DELETE /api/save` store or erase it. In development the same handler is a
Vite middleware. The session secret comes from `BETTER_AUTH_SECRET` or is made once in `auth-secret`.

Islands are private: the hub refuses `enter`, `water`, `gift` and `feed` for someone else's island
unless its owner opened their portal to you; closing it sends a guest who is there home (`closed`).
The first account that signs in on a browser from before accounts takes that browser's old save and,
with `claim` (old id + token), its island snapshot, deeds and stall listings.

### Save (`game/state.ts`, on the server)

Kept on the server per account (`/api/save`), sent every 5 seconds when it changed, and with
`keepalive` when the page is leaving. The browser keeps a copy (`af.save.<user>`) marked unsynced
until the server confirms it, and plays that copy if a reload beat the upload. Contents: coins, ink, the `bag` (every carried item by id, see below), tool levels (can, bottle, cauldron),
the 12 plots (crop, growth hours, wet hours, overgrown), the 3 stone inscriptions, the shed, paid-for
land, mailbox gifts, beehive honey, day and hour, and your island layout. `load()` migrates older
saves: missing fields are filled in, and the old separate `seeds`/`harvest`/`flowers`/`goods`
records move into the bag (`fromLegacy`). Use `count`, `give` and `take` to touch the bag.

### Items and prices (`shared/items.ts`, `shared/prices.ts`)

Every item has an id (`seed:wheat`, `crop:melon`, `flower:pink`, `honey`), a name, a category, a
`price` (what a shop charges) and `pays` (what a shop gives). `CROPS` lives here too, shared with the
server. Prices follow the **market day** (a real UTC day): each item swings ±15% by a hash of its id
and the day, and each shop has one special (a sale, or an item it pays 1.5× for). All pure
functions, so every player and the server agree without any state.

### Shops (`market/`)

`shops.ts` defines the home crate (`CRATE`: basic seeds, pays 80%, no daily prices) and the six
market shops (`SHOPS`: keeper, building kind, what it sells and buys, a "soon" note for stock that
comes later), and works out today's prices. `panel.ts` is the buy/sell panel for any shop.
`market.ts` puts a keeper (a recoloured chibi witch) behind each counter on the market island and
offers "talk to the keeper" actions. The shop buildings are `market`-category `KINDS`: the editor
never offers them and `sanitizeLayout` drops them from home layouts.

### Island layout (`island/layout.ts`)

```ts
{ v: 1, shape, size, underside, seed, meadow, objects: [{ id, kind, x, z, rot, scale }] }
```

`KINDS` is the catalog: label, editor category, model, collision radius, whether it is essential (and
how many), and what it does (`use`: fill, sit, swing, hive, scare, sign). `sanitizeLayout()` accepts
only well-formed layouts and restores missing essentials; the server runs it too.

### Island shapes and terrain (`island/shapes.ts`, `island/terrain.ts`)

A shape is a radius function of the angle, so every island is star-shaped around its centre. The
terrain is built from 64 radii: grass fan and rings on top, a grass lip, five underside rings and a
tip, flat-shaded per palette token; then the underside style, hanging moss, and the pond (water,
shore, channel to the nearest edge, waterfall, lilies, stones).

### Network (`shared/protocol.ts`, `server/hub.ts`)

One WebSocket on `/net`, JSON messages.

- Client → server: `profile` (name, hat, theme), `claim`, `enter` (island room), `pose` (10 Hz),
  `publish` (your island snapshot), `atlas`, `water`, `gift`, `feed`, `say`, `spell`, `ack`; for
  friends `friends`, `befriend` (code, someone on the same island, or answering a request),
  `unfriend`, `portal` (open/close yours to a friend); for stalls `listings`, `list`, `unlist`, `buy`.
- Server → client: `welcome` (your profile, deeds waiting for you), `friends` (list + a note),
  `closed`, `atlas` (shared islands, yours, friends who opened their portal), `island` (a snapshot),
  `peers`, `joined`, `left`, `pose`, `deed`, `say`, `spell`, and for stalls `listings`, `listed`, `bought`.
- The server keeps one snapshot per island (name, colour, theme, plots, stones, layout) and the deeds
  done there while the owner was away (water, gift, feed, and the stall's sale and return). Deeds
  stay until the owner sends `ack`; each gets its own increasing time, since owners skip anything not
  newer than what they last applied. Data in `data/world.json`; who you are comes from the session.
- **Stalls:** the server holds the listings (`store.listings`) and so the goods. `buy` shrinks the
  listing before anyone is answered, so two buyers never get the same goods; the buyer's coins are
  set aside on their side until `bought` arrives (and come back if it failed). Prices are checked
  against `stallBounds`; listings expire after three days (a timer, stopped when the dev server
  restarts the hub).
- In development the hub runs inside Vite (`vite.config.ts`); in production `server/index.ts` serves
  `dist/` and the hub on one port.

### The map (`ui/map.ts`, Tab)

Two charts in one SVG, plus a sidebar. **World**: the shared islands at fixed spots, your home and
friends' islands around them, each drawn from its real outline (`radii()` of its shape, size and
seed, sent in the atlas); friends whose portal is closed are greyed with a lock. Clicking one leaves
right away (`PortalTravel.depart(…, here)` opens the vortex where the witch stands). **This island**:
the walk mask's ground, water and solids, projected the way the camera sees them, with a pin for
every `world.places` entry; clicking a pin (or any ground) blinks her there behind a fade. The
sidebar holds friend requests, friends with their portal switches, witches on this island you can
befriend, and your name, hat colour and island theme.

## Assets

- `shared/palette.json`: every colour token. Blender materials are named `pal:<token>`.
- `tools/blender/build_props.py`: Kenney models restyled (material name → token, with per-model
  overrides), plus everything modelled from primitives (buildings, trees, flowers, garden objects,
  crystals, roots). Output: `public/assets/props/*.glb`.
- `tools/blender/build_animals.py`: chicken, duck, sheep, goat (a `body` with a `head` child pivoting
  at the neck) and the trough (with a `feed` mesh the game shows while it has meals).
- `tools/blender/build_market.py`: the market's six shop buildings, stall booth, fountain and notice
  board. Each shop has an empty named `keeper` where its keeper stands.
- `tools/blender/build_chibi.py`: the witch, one node per moving part with its pivot at the joint.
- `tools/blender/build_furniture.py`: KayKit furniture for the cottage (keeps KayKit's texture atlas).
- `tools/blender/preview.py`, `turnaround.py`, `inspect.py`: render previews and inspect files.
- Raw packs live in `assets/raw/` (git-ignored); sources in `CREDITS.md`.
- Concept art in `art/concept/` was made with Codex image generation; prompts sit next to each image.

## How to add…

- **A colour:** add a token to `shared/palette.json`. For wind or night glow, list it in `render/toon.ts`.
  For a theme variant, add it to the theme table in `core/palette.ts`.
- **A prop model:** Kenney: add to `KENNEY_PROPS` in `build_props.py`. Your own: write a builder
  function there. Run `npm run assets`.
- **A placeable object:** add it to `KINDS` in `island/layout.ts` (category, model, solid, optional
  `use`) and give it a price in `island/costs.ts` (`PRICES`, plus `BUILD` for materials). It appears
  in the editor automatically. New behaviour goes in `farm/garden.ts`.
- **A crop:** add it to `CROPS` in `shared/items.ts` (and a model). Its seed and crop items, the
  seed bar and the shops follow.
- **An item:** add it to `ITEMS` in `shared/items.ts` (widen `ItemId`), then list it in a shop's
  `sells` or `buys` in `market/shops.ts`.
- **A sigil:** add a shape to `SIGIL_SHAPES` and templates in `magic/recognizer.ts`, an effect in
  `magic/spells.ts`, an entry in `magic/grimoire.ts`, a repeat interval in `magic/contraptions.ts`.
  Add a test case.
- **A message:** add it to `shared/protocol.ts`, handle it in `server/hub.ts` and `net/social.ts`.
- **A kingdom building or district:** add a landmark lot or a street in `kingdom/plan.ts` (houses fill
  in around it), draw it in `kingdom/city.ts`, give it a place for the map; `npm test` tells you if
  anything became unreachable.

## Testing

`npm run check` runs the typecheck and the tests in `tests/` (Node's built-in runner, TypeScript run
directly): glyph recognition on noisy drawings, and island layouts (essentials present, objects stay
on every shape and size, sanitizing), and the kingdom (`tests/kingdom.test.ts`: flood-fills its walk
mask from the gate and checks every place and keeper can be reached without stepping more than 0.25
up or down between neighbouring cells, ramps meet both terraces, no prop stands in a building).
Visual changes are checked in the browser.
