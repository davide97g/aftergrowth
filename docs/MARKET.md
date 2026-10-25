# Lantern Market: design

A big shared sky-island, reached through the portal like Blossom Commons, where every part of the
economy has its own building and shopkeeper, and where witches sell to each other from stalls.

Decided with the user (2026-10-25):

- **Trading:** NPC shops, plus player stalls that keep selling while the seller is away.
- **Prices:** a daily market. Base prices with a small daily swing, the same for everyone, and one
  "today's special" per shop.
- **Spells:** new witches know two sigils; scrolls teach the rest. Charms are single-use spells,
  bought or inscribed by the player.
- **Animals:** they produce goods and need light care. A fed animal produces; an unfed one only
  sulks. Animals never die.

## Why travel to the market

The home market crate stays, so a quick sale never needs a trip, but it only does the basics:

| | Home crate | Lantern Market |
|---|---|---|
| Buys crops, honey | at 80% of base | full price × today's swing, specials up to 1.5× |
| Sells seeds | wheat, turnip, carrot | every seed, saplings |
| Everything else | nothing | ink, flowers, animals, materials, scrolls, charms, equipment |
| Other witches | no | stalls and the notice board |

## The island

The island is about 2.2× the size of a home island, round with a clover wobble and crystals
underneath. Lanterns hang on strings between the buildings and light up at dusk. The portal islet
joins it at the south.

```
                 Scriptorium          Outfitter
                (book tower,         (giant witch hat)
                 pointed roof)
     Inkwell                                        Menagerie
  (ink-bottle tower)     ~ fountain plaza ~       (round barn, pens,
                         notice board              chickens about)
                         lantern strings
   Seed & Sprout                                  Timber & Stone
  (flower-pot hut,                              (open shed, log
   seed racks)                                    stacks, boulders)
             · · · Stall Row: 8 canopy booths · · ·
                          |
                   bridge → portal islet
```

Each building is a single bold silhouette in the style of the egg cottage: simple low-poly with
soft toon shading and no detailed texturing. They are modelled in Blender from primitives
(`tools/blender/build_market.py`). They are walk-up counters, not interiors: the keeper stands
behind the counter, and F opens the shop panel.

Keepers reuse the chibi witch with their own outfit colours and hat shapes, so no new rig is
needed. Each has a name, a greeting and a line about today's special. Later, keepers can send
letters with quests (roadmap item "letters from NPC witches").

## The shops

Prices below are base values; the shop sells at value × today's swing and buys at about half of
that. Crops, honey and animal goods are bought at their full sell value.

**Seed & Sprout** (keeper: a gardener in green)
- Sells every crop seed (wheat 3c … melon 16c) and tree saplings (12–20c), which go to the shed and
  are placed with the editor.
- Buys crops at their sell price (wheat 7c … melon 50c).

**The Inkwell** (keeper: an ink-stained scribe)
- Sells bottled ink (5c a drop, up to the bottle's room) and flowers by colour (2c).
- Buys flowers (1c) and spare ink (2c a drop).
- Equipment: ink bottles (Glass flask 50c, Crystal decanter 140c + 2 glass) and pens:
  - **Silver nib** (90c): dots cost no ink.
  - **Gold nib** (220c + 2 brass): carving and inscribing cost 1.5× instead of 2×.

**Menagerie** (keeper: a farmer with a straw hat)
- Animals, troughs and feed (see Animals). Buys eggs, wool, milk and honey.

**Timber & Stone** (keeper: a carpenter)
- Sells wood 4c, stone 5c, glass 12c, brass 20c. Buys wood 2c and stone 2c (wood and stone can be
  gathered, glass and brass can't).

**Scriptorium** (keeper: an old owl-eyed witch)
- Sigil scrolls, charm blanks and charms (see Spells). Buys charms at 60%.

**Outfitter** (keeper: a tailor)
- Watering cans: Copper 60c; **Brass sprinkler** 180c + 4 brass (20 pours, waters a 3×2 patch).
- Cauldrons: Copper 80c; Moon 200c + 3 brass.
- **Wicker basket** 40c: picking a flower gives two.
- **Mossy boots** 70c: walk and run 25% faster.
- Hats: cosmetic shapes (wide brim, tall crooked, flower crown) 30–60c. The colour stays free in
  the profile.

The can, bottle and cauldron upgrades move from the home crate to the Outfitter and the Inkwell.

## Daily prices

- A **market day** is a real UTC day, so it's the same for everyone even though each player's clock
  runs separately. The market shows "Prices change in 5 h".
- Each item's swing is `1 + 0.15 × (hash(item, day) × 2 − 1)`, between 0.85× and 1.15×. Shop
  rows show a small ↑ or ↓ against yesterday.
- **Today's special** is one item per shop: either a sale (that item sells at 0.6×) or a wanted
  item (the shop buys it at 1.5×). Wanted items are always things players make: crops, honey,
  eggs, wool, charms.
- All of this is a pure function in `shared/prices.ts`, so the client and the server always agree
  and there is no economy for the server to simulate.

## Materials

Wood and stone come from your island; glass and brass only from the market.

- **Prune** a tree (F) once per game day: 1 wood. **Chip** a boulder or standing rock: 1 stone.
- Bigger editor objects cost materials as well as coins. Some examples:

| Object | Coins | Materials |
|---|---|---|
| Plank fence, wooden path | 2c | 1 wood |
| Stone path | 1c | 1 stone |
| Wishing well | 30c | 6 stone |
| Greenhouse | 60c | 6 glass, 4 wood |
| Windmill | 80c | 8 wood, 2 brass |
| Gazebo | 50c | 8 wood |
| Trough | 15c | 2 wood |

- The shed works as it does now: removing something keeps it whole, and placing it again is free.
  Nothing is refunded.

## Spells

**Sigils are learned.** A new witch knows **growth** and **water**. Scrolls teach the rest:

| Scroll | Price | Note |
|---|---|---|
| Wind | 60c | |
| Light | 80c | |
| Flame | 120c | the keeper sells it only once you know light |

- A sigil you don't know yet fizzles as an "unknown mark", and the Grimoire notes it.
- Combinations need no scroll: once you know both sigils you can discover the combination by
  drawing it.
- Saves from before this keep all five sigils.

**Charms** are single-use spells cast at the witch's feet at power 2, without drawing or ink.
- Charms go into the satchel; use one from there or with a hotkey.
- The Scriptorium sells Rain 15c, Light 12c, Gust 12c, Bloom 25c and Rainbow 40c.
- **Inscribe your own:** with a charm blank (2c) in the satchel, draw at the cauldron. The glyph goes
  into the charm instead of being cast, for double ink, like carving.
- Charms sell to the Scriptorium at 60%, or at your own price from a stall. This gives the loop
  flowers → ink → charms → coins, a magic-side income next to farming.

## Animals

Buy animals at the Menagerie. They arrive in your shed; place them with the editor. They wander in
a small radius around where you put them, and you can pet them (F).

| Animal | Price | Eats each morning | Gives | Sells for |
|---|---|---|---|---|
| Chicken | 40c | 1 wheat or corn | an egg every day | 6c |
| Duck | 50c | 1 wheat (needs the pond nearby) | a duck egg every day | 8c |
| Sheep | 90c | 1 turnip | wool every 2 days | 18c |
| Goat | 110c | 1 carrot | milk every day | 14c |

- **Troughs** (15c + 2 wood) hold 6 meals. Fill one with F from your satchel. At dawn each animal
  within 5 m of a trough eats one fitting meal from it.
- Fed animals leave their goods next to them (an egg in the grass, a tuft of wool) for you to pick
  up with F. An unfed animal makes nothing that day and looks droopy, then perks up once fed.
- Sleeping until morning and time passing away from the island catch up, as crops do.
- Bees stay as they are: beehives make honey from nearby flowers, and the Menagerie buys it.
- Visitors can pet animals and fill troughs (a new "deed", like watering), but can't collect goods.
- Limit: 16 animals per island.

## Player stalls

- **One stall per witch, four slots.** At the stall counter on Stall Row, pick an item from your
  satchel, a quantity (up to 20) and a unit price. The price must be between 40% and 300% of today's
  base value.
- **The goods are held by the server.** They leave your satchel when you list them, so you can't
  spend them twice.
- **Buying:**
  - The **notice board** in the plaza lists every listing, with filters by category and a price
    comparison against the shops.
  - Booths on Stall Row show the eight most recent sellers. Each booth has the seller's name banner
    in their hat colour and small models of the goods. If the seller is online on the market, they
    can stand behind it.
  - You can buy part of a listing.
- **Getting paid:** the seller receives a new deed, `sale` (item, quantity, coins). It reaches them
  live, or when they come back, with the existing "While you were away…" note and ack.
- **Unlisting or expiry** (after 3 real days) returns the goods with a `return` deed.
- **The server trusts listings, not wallets.** It checks that a listing exists and marks it sold
  before the buyer gets anything, so two buyers can never get the same goods. Coins still live in
  each player's save, so a determined player could cheat. That's acceptable for a cozy game among
  friends until real accounts exist (roadmap).

## The satchel

The single line of inventory text no longer fits. **I** (or a bag button) opens the satchel: a grid by
category (crops, seeds, flowers, produce, materials, charms, scrolls) with counts. Charms can be
used from there. The seed bar and the ink, coins and can pills stay on the HUD.

The shop panel grows out of today's market crate panel. It has the keeper's portrait and greeting at
the top, **Buy** and **Sell** tabs, rows with today's price, ↑/↓ and a special ribbon, and +1, +5 and
All buttons.

## How it's built

- **`shared/items.ts`:** one catalog of every item: id (`seed:wheat`, `crop:wheat`, `flower:pink`,
  `honey`, `egg`, `wool`, `wood`, `glass`, `scroll:wind`, `charm:rain`, …), name, category and base
  value. The server uses it to validate stalls.
- **`shared/prices.ts`:** market day, swings, specials.
- **The save:**
  - `seeds`, `harvest`, `flowers` and `goods` merge into one `bag: Record<ItemId, number>`, with
    helpers `have`, `give` and `take`. About 35 call sites change.
  - New fields: `sigils`, `gear` (pen, boots, basket, hats) and `animals` (fed and last-produced
    times by placed-object id).
  - The migration fills these from the old fields, as the current loader already does.
- **The island:** the market is a third island kind next to home and commons (`IslandSpec.kind:
  "market"`), with id `market` like `commons`. Its layout lives in `marketLayout()`. Shop buildings,
  booths, the fountain and the notice board are new `KINDS` in a `market` category that the editor
  doesn't offer.
- **`src/market/`:** `shops.ts` (shop definitions: keeper, stock, what it buys), `panel.ts` (shop UI),
  `stalls.ts` (listing UI and booths), `keepers.ts` (the NPCs).
- **Animals and charms:** `src/farm/animals.ts` (wander, troughs, produce) and `src/magic/charms.ts`.
- **Protocol and server:**
  - New messages `list`, `unlist`, `buy`, `listings` and `bought`, and deeds `sale` and `return`.
  - Listings are stored in the hub's `data/world.json` next to the islands, and expire on a timer.
- **Blender** (`tools/blender/build_market.py`): six shop buildings, stall booth, fountain, notice
  board, lantern string, chicken, duck, sheep, goat, trough. Simple low-poly, `pal:` materials.
- **Sound:** a market murmur bed, a counter bell when a shop opens, animal calls.

## Build order

Phase 1 is built (2026-10-25). Phases 2 to 6 are still to do.

Each phase is playable on its own and ends with checks in the browser and `npm run check`.

1. **Items and the island.** Item catalog, satchel, save migration, the market island with the six
   buildings and keepers, shop panel, daily prices. The shops sell what already exists: seeds, crops,
   flowers, ink and the current upgrades. The home crate drops to the basics.
2. **Materials.** Pruning and chipping, Timber & Stone, material costs in the editor.
3. **Spells.** Learned sigils, scrolls, charms bought and inscribed, Scriptorium.
4. **Animals.** Models, wandering, troughs, produce, Menagerie, visitor deeds.
5. **Stalls.** Protocol, server listings, booths, notice board, sale and return deeds.
6. **Polish.** Equipment extras (nibs, boots, basket, hats), market sounds, balance pass with real
   play numbers.

## Open questions

- **Name.** Lantern Market is a placeholder.
- **Night market.** The Scriptorium could sell moon charms only after dark on your clock.
- **Concept art.** A key-art piece for the island, made the same way as `art/concept/simple-*`,
  before modelling.
