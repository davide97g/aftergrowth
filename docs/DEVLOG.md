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

## 11. The Lantern Market, phase 1

- Designed the whole market economy with the user (`docs/MARKET.md`): NPC shops plus player stalls,
  daily prices, learned sigils with scrolls and charms, animals with light care. Built in phases.
- **Items:** one catalog in `shared/items.ts`; the save's separate seeds, harvest, flowers and honey
  became one `bag`, migrated on load. A satchel panel (I) replaced the one-line pouch.
- **Daily prices** (`shared/prices.ts`): a hash of item and real UTC day, so everyone sees the same
  market without the server simulating anything. A test checks over 120 days that nothing can be
  bought and sold back at a profit.
- **The island:** a size-1.9 island with six shop buildings (modelled in Blender by
  `build_market.py`, each with a `keeper` marker), a fountain plaza, a notice board and eight stall
  booths. Keepers are the chibi witch in their own hat colours, turning to greet you.
- **Shops** share one panel with Buy/Sell tabs, today's special and price trends. The home crate
  became the basic shop (80%, three seeds); upgrades moved to the Inkwell and the Outfitter.

## 12. Materials (market phase 2)

- Wood, stone, glass and brass joined the item catalog. Prune trees and chip rocks on your own
  island once per game day (`farm/gather.ts`, with a little shake and a knock or click).
- The editor's bill now includes materials (`BUILD` in `island/costs.ts`), and names what you're
  short of. Coin prices of built things went down to make room for the materials.
- Timber & Stone opened. The Crystal decanter needs 2 glass and the Moon cauldron 3 brass.

## 13. Scrolls and charms (market phase 3)

- Sigils are learned now: new witches start with growth and water (`state.sigils`), and the
  Scriptorium sells scrolls for the rest. An unlearned sigil is recognised but fizzles, and the
  Grimoire marks it "not learned yet". Old saves keep all five.
- Charms: nine charm items, one per spell. Used from the satchel they cast at the witch's feet at
  power 2. Inscribed at the cauldron with a charm blank (double ink), they give magic its own income:
  flowers → ink → charms → coins.
- Checked by drawing real glyphs with the mouse in a headless browser (a scripted wind sigil and seal).

## 14. Animals (market phase 4)

- Chickens, ducks, sheep and goats (modelled in Blender by `build_animals.py`, each with a `head`
  node so the game can peck and nod), bought at the Menagerie and placed from the editor's new
  Animals tab. They wander around their spot, hop when petted, and droop when hungry.
- Troughs and a pure `morning()` rule (`farm/livestock.ts`, tested): each animal eats a meal it likes
  from a trough in reach; fed animals make goods on their schedule; ducks need the pond.
- Visitors can feed your animals through a new `feed` deed.
- Shops now sell crops (as feed) at twice what they pay, and nothing players grow ever goes on sale,
  so no special can be played against another shop's. The price test checks across all shops.

## 15. Player stalls (market phase 5)

- The server holds listings and the goods on them; buying shrinks a listing before anyone is told.
  Sellers are paid with a `sale` deed, returns come back as `return` deeds.
- The notice board lists every stall with filters and a shop-price comparison; the eight booths
  carry the latest sellers' names.
- Found and fixed while testing with two browser sessions: live deeds went to the first socket of a
  player, which after a reload could be a dead one (now every socket gets it); deeds arriving on the
  commons or the market were held back as if you were visiting someone (only on another witch's
  island now); deeds created in the same millisecond could be skipped (each gets its own time now);
  and old hub instances kept a timer running after Vite restarted the server.

## 16. Gear, hats and market sounds (market phase 6)

- Tools are one table now (`TOOLS` in `market/shops.ts`): can, bottle, cauldron, pen, boots, basket,
  each with levels in the save. New: silver and gold nibs, mossy boots, wicker basket, brass sprinkler.
- Hat shapes (wide brim, tall crooked, flower crown) live in the profile, so other witches see them.
  The crown uses non-swaying colour tokens: the wind shader would have bent it off the head.
- Market sounds: a crowd murmur with distant voices, and a counter bell.
- Balance: ink never goes on sale. A test checks that charms made from bought ink earn at most a few
  coins over the shop price, except on days the Scriptorium wants that charm.

## 17. The theme song

- "Seeds on the Wind": an original waltz in 6/8, D major, 66 seconds. Flute over kalimba, pad,
  bass, shaker and bells, with a borrowed C chord in the bridge and a G-minor turn before the end.
- Written as data in `audio/theme.ts`; `scheduleTheme()` plays into any Web Audio context, so the game
  loops it live and the same code renders it offline to `art/music/seeds-on-the-wind.mp3`.
- Mixed by measurement rather than by ear: spectrograms and band levels of the render showed a heavy
  sub-bass, so the bass lost its sub-octave and the song got a 45 Hz high-pass. In game it sits well
  under the sound effects.

## 18. Aetherhold, the royal city

- A third shared island, and the first that isn't flat: a hill in four rings around the palace,
  which stands near the top of the screen, so the city climbs away from the camera and higher
  districts never hide lower ones. Retaining walls between the rings, cobbled ramps for the avenue's
  switchbacks, narrow stairs for the alleys, a grand marble stair to the palace.
- Everything is generated from one seeded plan in plain TypeScript (no Blender): streets first, a few
  landmarks, then houses packed along every street with the odd gap wide enough to squeeze through,
  then backfilled behind. That gives narrow streets and alleys for free. Tests flood-fill the walk
  mask to prove every place is reachable and no walkable step climbs a cliff.
- Heights reached the whole engine: `ground(x, z)` on every world, clicks marched down to the hill,
  spell effects lifted per cast, prompts, name tags, birds, bunnies and rain follow it.
- Two things that went wrong first: the hill's darker grass used a wind token, and the wind shader
  bends by height, so at 12 units up whole slopes swung across the grand stair (now `turf`); and the
  crystal's light bloomed into a white blob until it was turned down.
- Houses only get windows on the faces the camera can see. At night the whole city lights up, and
  the ley lines down the avenue glow.
- Buildings in front of the witch open up in a dithered circle (`render/cut.ts`).
- Gameplay: four merchants, the Royal Arcanum, the tavern's menu (mead makes you faster), a daily
  wishing fountain, the great bell, a timed spell range, the royal steward's daily requisition, and
  twelve townsfolk to chat with.
- Performance: the city merges to about 40 draw calls; trees are instanced. A zoomed-out view of the
  kingdom costs about 1800 draw calls and 0.8 M triangles across all passes (the market: 1100 and
  0.5 M), most of them the witches and props.

## 19. Accounts, friends and the map

- Better Auth with email and password, no verification, on SQLite through Node's own `node:sqlite`
  (no native module to build). The game's tables share the database: profiles, saves, friendships
  and portals. Saves moved from the browser to the server, with a local unsynced copy so a reload
  that beats the upload (travel, the editor) never loses a change.
- Islands are private now. Friends are made by a six-letter code or by meeting on a shared island;
  then each witch decides whether to open their portal to the other. The hub enforces it for every
  visit and every deed, and closing a portal sends a guest home.
- The first account on a browser from before accounts takes its old save, and its island, deeds and
  stall listings on the server (`claim`, proven by the old token).
- The map (Tab) replaced the portal's list: a world chart drawn from each island's real outline and
  a chart of the island you're on, with pins for its places (`world.places`). Clicking travels at
  once: to another island through a vortex where you stand, or across this one behind a fade.

## 20. Inside the palace

- The palace's great door opens now. Rooms are one idea: `game/cottage.ts` swaps in any `Room` (its
  scene, floor, framing and actions) and the floor's height while inside, so the cottage and the
  throne hall share the code.
- The throne hall (`kingdom/palace.ts`): a long cutaway hall turned diagonally so it reads like the
  rest of the game, with the far wall and side left standing and a low balustrade on the open side.
  Checkered marble, a royal carpet, a stepped dais, the throne under a stained rose window, braziers,
  and the Heart of Aether with its rune rings and drifting motes.
- Queen Seraphine gives a daily stipend; the Heart refills ink once a day; guards and lecterns.
- Found while testing: other players' name tags stayed on screen indoors; they hide inside now.

## 21. A more alive, cozier island

Six pieces, one after another:

- **A familiar** (`world/familiar.ts`): a cat, fox or frog built from primitives, with one rig and a
  small state machine (follow, wander, sniff, chase, sit, nap, watch, lap, shelter, fire, play,
  greet). It sleeps on the cottage rug while you're in, and the host's familiar keeps visitors company
  (it rides in the published island snapshot; the hub checks it).
- **The island reacts** (`world/atmosphere.ts`): wet ground darkens through the shared toon
  materials; puddles are seeded flat hollows with their own ripple shader; dawn mist is a few soft
  flat wisps; dew is a point cloud of glints; leaves are one instanced mesh from every tree's canopy
  box; bees shuttle between hives and flowers. Footsteps sound like what they land on.
- **Moods for the witch** (`player/witch.ts`): context-picked fidgets when she stands still (only
  your own witch gets a mood, so keepers and townsfolk stay put), and a leaf umbrella in the rain.
- **Tea and letters** (`ui/kettle.ts`, `game/post.ts`, `ui/letters.ts`): four teas from the four
  flower colours, drunk from the satchel; letters seeded by witch and day, with gifts and favours
  answered the next morning. The post rules are pure and tested.

## How things were checked

Every step was checked in a headless browser (screenshots, scripted clicks, keyboard and mouse
drawing), in two isolated browser sessions for multiplayer, plus `npm run check` (typecheck and the
recognizer and island-layout tests) and a production build.
