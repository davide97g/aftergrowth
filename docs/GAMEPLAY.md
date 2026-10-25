# Gameplay reference

Every system and its numbers. Values live in code; the file is named next to each section.

## Time (`game/game.ts`, `world/daycycle.ts`)

- One game day = 24 real minutes at 1× (1 game hour per real minute). The clock pill scrubs time and
  sets 1× / 20× / 120× / pause.
- Moods: night until 4:30, dawn 6:30, day 9–16, golden hour 18:00, dusk 19:36, night from 21:00.
  Night lights windows, lanterns, glowing flowers and crystals, fireflies and stars.

## Your witch and your island

- New players get a cozy random name, hat colour and island theme (meadow, blossom, autumn, mint).
  Change them in the portal Atlas. Identity lives in this browser (`af.profile.v1`).
- Starting inventory: 20 coins, 8 ink, 2 wheat and 4 turnip seeds, a tin can full of water.

## Farming (`game/state.ts`, `farm/farm.ts`)

| Crop | Wet hours to grow | Seed | Sells |
|---|---|---|---|
| Wheat | 7 | 3c | 7c |
| Turnip | 10 | 4c | 10c |
| Carrot | 16 | 6c | 16c |
| Corn | 20 | 8c | 22c |
| Pumpkin | 28 | 12c | 36c |
| Melon | 36 | 16c | 50c |

- 12 plots. A crop grows only while its soil is wet; watering keeps it wet for 10 game hours.
- Water by hand (can), with a rain glyph, a water stone, or rainy weather.
- Watering can: **Tin** holds 6 pours, waters one plot. **Copper** (60c) holds 12, waters 3 in a row.
  Refill at the pond's edge, a wishing well or a rain barrel.
- Sell crops and honey at the market crate; buy seeds there.

## Flowers and ink (`farm/flowers.ts`, `farm/workshop.ts`)

- Wild flowers can be picked; they regrow after 8 game hours. Flowers grown by magic can be picked too.
- Ink bottle holds 12 drops. The cauldron brews **2 flowers → 3 drops**.

## Magic (`magic/`, full design in `docs/magic.md`)

| Sigil | Shape | Effect |
|---|---|---|
| Growth | spiral | flowers bloom around, planted crops jump ahead 2 + 1.5×power hours |
| Water | wave | a rain cloud waters everything under it (radius 1.4 + 0.6×power) |
| Wind | curl | a gust (a straight line sign points it), windmill races |
| Light | five-point star | a floating light for 40 + 20×power seconds |
| Flame | triangle | a campfire for 45 + 15×power seconds |

- Draw sigils first, then close a circle around them. Each dot inside adds power (1–4).
- Two sigils combine: water + light = rainbow, growth + water = bloom (with a new sapling),
  wind + light = firefly dance, water + flame = steam. Other pairs argue and fizzle.
- Ink cost: 1 per sigil + 1 per dot. A smudge spills 1. Not enough ink: nothing is spent.
- Fizzles: empty seal, unclear mark, three sigils, signs without a sigil, sigils that argue, a circle
  over the sky. All are recorded in the Grimoire.

## Contraptions (`magic/contraptions.ts`)

- Three carving stones on your island. Closing a seal over one carves it in for **double ink**.
- Repeats on its own: water every 4 game hours, growth every 6, wind every 3, rainbow/steam every 6,
  bloom every 8; light and firefly stones light up every night; flame stones keep their fire going.
- Only the island owner can carve.

## Garden objects (`farm/garden.ts`, `island/layout.ts`)

| Object | Does |
|---|---|
| Wishing well, rain barrel | fill the watering can |
| Bench, log bench, stump | sit; time runs 8× while resting |
| Swing | sit and swing |
| Beehive | 1 jar of honey per 6 game hours, holds 3; honey sells for 14c |
| Scarecrow | birds keep 4.5 units away |
| Lamp post, leaf solar lamp, crystal lamp, gazebo lantern, lanterns | glow at night |
| Campfire | flickers and glows all day |
| Signpost | greets visitors with the owner's name |

## Weather (`world/weather.ts`)

- Forecast for each island, day and part of the day (before 6, 6–14, 14–22, after 22):
  55% clear, 20% cloudy, 18% rain, 7% windy.
- Rain waters every plot on your own island; a daytime shower can end in a rainbow.
- Birds hide at night and in the rain; butterflies stay home in the rain.

## The cottage (`game/cottage.ts`, `house/`)

- F at the door goes inside (your own island only).
- Sleep after 18:00 (or before 5:00): wake at 6:30, a new day; crops keep growing on the water their
  soil still holds.
- Armchair by the fire: time runs 8×. Bookshelf: the grimoire. Pet the cat. Wind the music box.

## Islands and the editor (`island/`)

- Shapes: round, bean, peanut, clover, long, wavy. Size 0.8–1.6×. Underside: rocky spires, hanging
  roots, crystals (glow at night). A portal islet and rope bridge always attach to the coast.
- Editor (B, own island only): Island tab (shape, size, underside, new meadow) and Place tab (Trees,
  Nature, Garden, Decor, Buildings). Drag to move, Q/E turn, −/+ size, Del remove.
- Essentials can move but not be removed: cottage, farm field, cauldron, market, mailbox,
  3 carving stones, pond. Done saves and reloads; Discard reloads. Changes are free for now.

## Multiplayer (`net/`, `server/`)

- The portal opens the Atlas: Blossom Commons (shared island), other witches' islands, your profile.
- Live: you see others move and draw, with name tags; T says a phrase; spells are seen by everyone.
  A visitor's rain really waters the owner's crops.
- Async: on someone's island you can water their crops and leave a gift (a crop or a flower) in their
  mailbox. Owners get "While you were away…" when they return.
- Visitors can't plant, harvest, carve stones or enter the cottage.
