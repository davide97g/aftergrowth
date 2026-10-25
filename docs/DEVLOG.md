# Devlog

Everything built so far, in the order it happened, with the decisions behind it. All work was done
on 2026-10-25 in one long session.

## 1. The aesthetic

**Goal:** a cozy farming + magic game: solarpunk farming with a simple economy, open world, portals to
multiplayer (live and async); magic drawn with rules, like *Witch Hat Atelier*.

- Started from the user's reference pin (Tolan's World): stylized soft-toon 3D, blobby grass,
  flower confetti, tilt-shift blur, saturated greens and cobalt water.
- Decided together: fixed **isometric diorama** camera; **floating sky-islands** joined by bridges;
  **soft toon world + inked magic**; **live day/night cycle**; an **apprentice witch** as the player;
  solarpunk as **"grown, not built"** (glass, brass, vines, leaf-shaped panels).
- Generated six concept pieces with Codex image generation (key art by day/golden/night, witch
  turnaround, ink-magic sheet, solarpunk prop sheet) and published them as the Aesthetic Bible page.
- **Feedback: too detailed and realistic.** Regenerated simpler low-poly targets
  (`art/concept/simple-*.png`). The detailed set moved to `art/concept/v1-detailed/` as mood reference.
- Wrote `docs/aesthetic.md` (palette per hour, shading rules, shape language, "always alive" checklist).

## 2. Assets and the first playable island

- Downloaded CC0 packs: Kenney Nature Kit, KayKit Adventurers, KayKit Medieval Hexagon.
- `tools/blender/build_props.py`: restyles Kenney models by mapping their material names to palette
  tokens, and models hero props from primitives: egg cottage, glass greenhouse, leaf windmill, round
  and cypress trees, flowers, bunny, lantern. Every material is named `pal:<token>`.
- `shared/palette.json` is the single source of colour for Blender and the game.
- Three.js prototype: orthographic iso camera, shared toon materials with a soft 4-band ramp, tinted
  shadows, wind shader (plants sway and bend around the witch), water shaders, bloom + tilt-shift,
  sky shader with stars and moon, day/night moods, butterflies, fireflies, pollen, bunnies, chimney
  smoke, drifting clouds, footstep petals. Walk mask for collision, WASD + click-to-move + touch stick.

## 3. The witch

- First pass: the KayKit Mage, recoloured (atlas cells remapped) with a bigger hat. Fixed shadow acne
  on round shapes by not letting the character receive shadows.
- **Feedback: not cozy enough, "a bit off".** Replaced it with our own chibi
  (`tools/blender/build_chibi.py`): big round head, shiny dot eyes, blush, brown bob with bangs, bright
  dress, moss cape, stubby limbs, bent-tip hat. No skeleton: each part pivots at its joint and is
  animated in code (waddle, bob, lean, hat lag on a spring, cape flutter, breathing, blinking).
- **Feedback: ugly from the side.** Rebuilt the hair as a cap with a face opening, built the hat cone
  ring by ring so the tip curls, tightened the cape. Added `tools/blender/turnaround.py` to check
  all angles at once.

## 4. Ink magic

- Researched the manga's rules: ink + a seal (circle), a sigil sets the element, signs shape it,
  nothing happens until the circle closes, magic on bodies is forbidden. Our glyph shapes are original.
- `magic/recognizer.ts`: $1 unistroke recognizer for five sigils (spiral, wave, curl, star, triangle)
  plus geometric detection of dots, lines and the closing circle. Tests check accuracy on wobbly,
  rotated, rescaled strokes.
- Rules: dots strengthen, a line points, the spell lands under the circle, two sigils combine
  (rainbow, bloom, firefly dance, steam) or argue; mistakes fizzle harmlessly and are recorded.
- The finished glyph burns into the ground in gold and cools to sepia. Spell effects: flowers bloom,
  rain cloud, gust, floating light, campfire. Point lights come from a fixed pool so casting never
  forces shader recompiles.
- The Grimoire records sigils, combinations and mistakes as research.

## 5. Ink, contraptions, farming

- **Ink** costs a drop per sigil and per dot; flowers brew into ink at the cauldron.
- **Contraptions:** closing a seal over a carving stone carves the glyph in (double ink); the stone
  repeats it on a schedule, like the manga's enchanted objects.
- **Farming:** 12 plots; plant, water, grow while the soil is wet, harvest, sell at the market crate,
  buy seeds. Interaction system (nearest action, F key, click-to-walk-then-act). Save in localStorage.

## 6. Multiplayer, crops, weather, birds, the cottage

- **Island server** (`server/hub.ts`) inside the Vite dev server: a room per island, live poses,
  phrases and spells; async snapshots of each island; deeds (watering, gifts) kept for owners who are
  away and delivered on return, acknowledged so nothing is lost on a half-closed socket.
- **Portal Atlas:** Blossom Commons, other islands (online/away), profile (name, hat colour, island
  theme). Visitors can water crops and leave mailbox gifts; carving and planting stay owner-only.
- Four island themes (meadow, blossom, autumn, mint) swap palette tokens.
- **Crops:** wheat, turnip, carrot, corn, pumpkin, melon. **Watering can** with limited pours, refilled
  at the pond, upgradeable.
- **Weather:** clear / cloudy / rain / windy, forecast per island and day; rain waters crops and can
  end in a rainbow. **Birds:** V-flocks and little pecking birds that flee.
- **Cottage interior** (KayKit Furniture Bits): fireplace, round windows showing the real sky, sleep
  until morning (crops catch up), armchair (time runs faster), cat to pet, generative music box.

## 7. Island shapes and the editor

- Islands moved from a fixed Blender export to a generator in the game (`island/terrain.ts`):
  6 silhouettes, 3 underside styles (rocky spires, hanging roots, glowing crystals; crystals and roots
  modelled in Blender), sizes 0.8–1.6×, a pond whose channel spills off the edge as a waterfall.
- Every island is now **data** (`island/layout.ts`): shape, size, underside, seeds, placed objects.
  Saved with your game, published to visitors, sanitized on load and on the server.
- **Island editor:** reshape and resize live, choose the underside, reshuffle the meadow, place, drag,
  turn, scale and remove objects; essentials can move but not be removed. Unlimited changes for now.
- **Portal travel animation:** walk into the ring, glyph circle on the ground, spiral into the vortex,
  a veil of gold runes closes over the screen and opens on arrival.

## 8. More buildings and decor

- Modelled in Blender: wishing well, beehive, bench, swing, scarecrow, leaf solar lamp, rain barrel,
  vine arch, gazebo, flower bed, lamp post, crystal lamp, campfire. From Kenney: more trees, hedge,
  tent, signpost, statues, canoe, log pile, fences, gate, path tiles.
- They do things: wells and barrels fill the can; benches, logs, stumps and the swing are for
  sitting (the swing really swings); hives make honey to sell; scarecrows keep birds away; lamps,
  crystals and the campfire glow at night; the signpost greets visitors.

## 9. Organizing

- Split the 480-line `main.ts` into `game/` modules (arrival, stage, travel, cottage, rest, editing,
  game loop). Moved loose files into `core/` and `ui/`; renamed `world/islands.ts` to `world/world.ts`.
- Removed dead code from the earlier island format. Fixed: the editor now works on a copy of the
  layout, so Discard (or a timed save during editing) never keeps a half-finished edit.
- Wrote this devlog, `GAMEPLAY.md`, `ARCHITECTURE.md`, `ROADMAP.md`; moved credits to `CREDITS.md`.

## 10. Coins with a purpose, and sound

- **Version control:** the project became a git repository.
- **Economy:** coins had only two sinks (seeds, the copper can). Added market upgrades for the ink
  bottle and the cauldron; new islands start with 6 open plots and the rest overgrown, cleared for
  rising prices; the island editor now charges for new objects and extra land. Removed objects go
  to a shed and come back free, so rearranging never punishes you. The bill is worked out by
  comparing the layout before and after the edit (`island/costs.ts`), so it can't drift from what
  is on screen, and is paid only on Done. Old saves keep everything they had.
- **Sound:** synthesised in Web Audio like the music box, no files to license or load: wind, rain,
  pond, fire, birds, crickets, footsteps, pen scratch, seal bells, spells, pouring, coins, portal.

## How things were checked

Every step was checked in a headless browser (screenshots, scripted clicks, keyboard and mouse
drawing), in two isolated browser sessions for multiplayer, plus `npm run check` (typecheck and the
recognizer and island-layout tests) and a production build.
