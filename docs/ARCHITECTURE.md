# Architecture

How the code fits together, the data it saves and sends, and how to add things.

## A page load

`main.ts` → `game/game.ts startGame()`:

1. **Who and where.** `net/net.ts loadMe()` reads the local profile; `Net` opens the WebSocket.
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

## Data

### Save (`game/state.ts`, localStorage `af.save.v1`)

Coins, ink, the `bag` (every carried item by id, see below), tool levels (can, bottle, cauldron),
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

- Client → server: `hello` (profile + secret token), `enter` (island room), `pose` (10 Hz),
  `publish` (your island snapshot), `atlas`, `water`, `gift`, `say`, `spell`, `ack`.
- Server → client: `welcome` (deeds waiting for you), `atlas`, `island` (a snapshot), `peers`,
  `joined`, `left`, `pose`, `deed`, `say`, `spell`.
- The server keeps one snapshot per island (name, colour, theme, plots, stones, layout) and the deeds
  done there while the owner was away. Deeds stay until the owner sends `ack`. Data in
  `data/world.json`. The token proves an id belongs to this browser; there are no accounts.
- In development the hub runs inside Vite (`vite.config.ts`); in production `server/index.ts` serves
  `dist/` and the hub on one port.

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

## Testing

`npm run check` runs the typecheck and the tests in `tests/` (Node's built-in runner, TypeScript run
directly): glyph recognition on noisy drawings, and island layouts (essentials present, objects stay
on every shape and size, sanitizing). Visual changes are checked in the browser.
