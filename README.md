# Apocalipse Farmers

A cozy browser game about farming and hand-drawn ink magic on floating sky-islands. You play a chibi
apprentice witch: grow crops, brew ink from wildflowers, draw glyphs that cast spells, carve them into
stones that keep working, shape your own island, and walk through a portal to visit other witches.

The look is soft low-poly with toon shading (inspired by Tolan's World); the magic is inked line art
(inspired by *Witch Hat Atelier*). Built with Three.js, TypeScript and Vite; 3D assets come from CC0
packs restyled in Blender plus our own Blender-modelled props.

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

Useful URL parameters while developing: `?t=18` start at 18:00, `?weather=rain` force weather,
`?island=<id>` visit an island, `?island=commons` the shared island.

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
| Zoom | scroll / pinch |
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
    cottage.ts       going inside, sleeping
    rest.ts          sitting on benches, swings, the armchair
    editing.ts       opening and saving the island editor
    interact.ts      "F to …" prompts and click-to-walk-then-use
    state.ts         the save: inventory, crops, prices, migration
  core/              assets loader, palette + themes, camera, input
  render/            toon materials, wind and water shaders, bloom + tilt-shift
  world/             the island world built from a layout, walk mask, day/night, sky,
                     weather, birds, ambient life (butterflies, fireflies, bunnies, clouds)
  island/            island shapes, layout data, terrain generator, special models, editor
  player/            the witch (procedural animation)
  farm/              plots, wild flowers, cauldron + market, garden objects (wells, hives, seats)
  magic/             glyph recognizer, seal rules, ink overlay, spells, contraptions, grimoire
  net/               profile, WebSocket client, other players, atlas, mailbox
  house/             cottage interior, music box
  fx/                portal veil and ground circle, tweens
  ui/                HUD, fade, styles
server/              island hub (WebSocket rooms, snapshots, deeds) + production server
shared/              protocol types and the colour palette (used by game, server, Blender)
tools/blender/       asset builders: props, the chibi witch, furniture; preview tools
tests/               glyph recognizer and island layout tests
public/assets/       built .glb models (committed; rebuilt by `npm run assets`)
art/                 concept art (Codex image generation, prompts alongside), reference, screenshots
docs/                design and technical docs (below)
```

## Docs

- [docs/DEVLOG.md](docs/DEVLOG.md): everything built so far, in order, with the decisions behind it
- [docs/GAMEPLAY.md](docs/GAMEPLAY.md): every system and its numbers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together, data formats, how to add things
- [docs/magic.md](docs/magic.md): the ink magic design and its Witch Hat Atelier research
- [docs/aesthetic.md](docs/aesthetic.md): the visual bible (palette, shading, shapes)
- [docs/ROADMAP.md](docs/ROADMAP.md): known issues and what could come next
- [CREDITS.md](CREDITS.md): third-party assets (all CC0)
