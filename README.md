# Aftergrowth

A cozy browser game about farming and hand-drawn ink magic on floating sky-islands. You play a chibi
apprentice witch: grow crops, brew ink from wildflowers, draw glyphs that cast spells, carve them into
stones that keep working, shape your own island, and walk through a portal to visit other witches.

The look is soft low-poly with toon shading (inspired by Tolan's World); the magic is inked line art
(inspired by *Witch Hat Atelier*). Built with Three.js, TypeScript and Vite; 3D assets come from CC0
packs restyled in Blender plus our own Blender-modelled props.

Play it at **https://aftergrowth.davideghiotto.it** (hosted on a homelab; see
[deploy/README.md](deploy/README.md)).

## Run it

Requires Node 22+ (the server runs TypeScript directly). Blender 4+ only to rebuild assets.

```sh
npm install
npm run dev        # game + island server on http://localhost:5173
npm run check      # typecheck + tests
npm run build      # production bundle in dist/
npm start          # serve dist/ and the island server on :8787 (PORT, DATA env vars)
npm run assets     # rebuild public/assets with Blender (raw packs: see CREDITS.md)
```

Everyone signs in (email and password, no verification) and their island and save live on the
server, so a witch can play from any browser. Islands are private: two witches become friends (by
friend code, or by meeting on a shared island) and each can then open their portal to the other.

Useful URL parameters while developing: `?t=18` start at 18:00, `?weather=rain` force weather,
`?island=<id>` visit an island (yours, or a friend's whose portal is open to you),
`?island=commons` the shared island, `?island=market` the market, `?island=kingdom` Aetherhold, the
royal city. `?at=<place>` starts at one of the island's map places (`square`, `tavern`, `range`,
`palace`… in the kingdom), `?zoom=0.5` starts zoomed out, and `?fps` shows frames per second, draw
calls and triangles in the tab title. The dev server keeps accounts in `data/aftergrowth.db`.

## Controls

| | |
|---|---|
| Walk | WASD / arrows, or click the ground (touch: stick + tap) |
| Run | Shift |
| Use the nearest thing | F (or Space, or tap the prompt) |
| Draw a glyph | E, then draw a sigil and close a circle around it |
| Grimoire | G |
| Seeds | 1–6 |
| Say a phrase | T |
| Edit your island | B |
| Map, friends, travel | Tab (click a place or an island to go there at once) |
| Zoom | scroll / pinch |
| Satchel | I |
| Mute | M (or the clock panel) |
| Music on/off | N (or the clock panel) |
| Time of day | clock pill, top right |

## Where things are

```
src/
  main.ts            entry: starts the game
  game/              how a session is put together
    game.ts          builds every system and runs the frame loop
    arrival.ts       which island this page load is on (home, a visit, the commons)
    stage.ts         renderer, sky, sun, post-processing
    travel.ts        portal departure / arrival animation
    cottage.ts       going inside rooms (the cottage, the palace hall), sleeping
    rest.ts          sitting on benches, swings, the armchair
    editing.ts       opening and saving the island editor
    interact.ts      "F to …" prompts and click-to-walk-then-use
    state.ts         the save: inventory, crops, prices, migration
  core/              assets loader, palette + themes, camera, input
  render/            toon materials, wind and water shaders, bloom + tilt-shift
  world/             the island world built from a layout, walk mask, day/night, sky,
                     weather, birds, ambient life (butterflies, fireflies, bunnies, clouds)
  island/            island shapes, layout data, terrain generator, special models, editor, costs
  player/            the witch (procedural animation)
  farm/              plots, wild flowers, cauldron, market crate, garden objects (wells, hives, seats)
  market/            the Lantern Market: shops, prices, shop panel, keepers
  kingdom/           Aetherhold, the royal city: its plan (hill, streets, lots), meshes, world, life
  magic/             glyph recognizer, seal rules, ink overlay, spells, contraptions, grimoire
  net/               account (sign-in page), WebSocket client, other players, mailbox
  house/             cottage interior, music box
  fx/                portal veil and ground circle, tweens
  ui/                HUD, the map (world chart, island chart, friends), fade, styles
  audio/             every sound and the theme song, synthesised with Web Audio
server/              accounts (Better Auth on SQLite, saves, friends, portals), island hub (WebSocket
                     rooms, snapshots, deeds) + production server
shared/              protocol types, items and daily prices, the colour palette (game, server, Blender)
tools/blender/       asset builders: props, the chibi witch, furniture; preview tools
tests/               glyph recognizer, island layout, economy and market tests
public/assets/       built .glb models (committed; rebuilt by `npm run assets`)
art/                 concept art (Codex image generation, prompts alongside), reference, screenshots,
                     and the theme song (art/music)
docs/                design and technical docs (below)
```

## Docs

- [docs/DEVLOG.md](docs/DEVLOG.md): everything built so far, in order, with the decisions behind it
- [docs/GAMEPLAY.md](docs/GAMEPLAY.md): every system and its numbers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together, data formats, how to add things
- [docs/magic.md](docs/magic.md): the ink magic design and its Witch Hat Atelier research
- [docs/aesthetic.md](docs/aesthetic.md): the visual bible (palette, shading, shapes)
- [docs/MARKET.md](docs/MARKET.md): design of the Lantern Market island and the full economy
- [docs/ROADMAP.md](docs/ROADMAP.md): known issues and what could come next
- [CREDITS.md](CREDITS.md): third-party assets (all CC0)
