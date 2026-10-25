import type { Gift, HatStyle } from "../../shared/protocol";
import type { IslandLayout } from "../island/layout";
import type { SpellId } from "../magic/glyph";
import type { Herd } from "../farm/livestock.ts";
import type { P, Sigil } from "../magic/recognizer";

import { type CropId, FLOWER_COLORS, type FlowerColor, ITEMS, type ItemId } from "../../shared/items.ts";

export { CROPS, CROP_IDS, type CropDef, type CropId, FLOWER_COLORS, type FlowerColor, type ItemId } from "../../shared/items.ts";

/** Watering can levels: how much it holds, how many plots in a row one pour reaches, and how many rows. */
export const CANS = [
  { name: "Tin can", holds: 6, reach: 1, rows: 1, price: 0 },
  { name: "Copper can", holds: 12, reach: 3, rows: 1, price: 60 },
  { name: "Brass sprinkler", holds: 20, reach: 3, rows: 2, price: 180, mats: { brass: 4 } },
] as const;
/** Ink bottle levels: drops it holds. */
export const BOTTLES = [
  { name: "Ink pot", holds: 12, price: 0 },
  { name: "Glass flask", holds: 20, price: 50 },
  { name: "Crystal decanter", holds: 30, price: 140, mats: { glass: 2 } },
] as const;
/** Cauldron levels: drops of ink one brew makes. */
export const CAULDRONS = [
  { name: "Iron cauldron", ink: 3, price: 0 },
  { name: "Copper cauldron", ink: 4, price: 80 },
  { name: "Moon cauldron", ink: 5, price: 200, mats: { brass: 3 } },
] as const;

/** Pens: a silver nib draws dots without ink; a gold nib carves and inscribes for 1.5× instead of 2×. */
export const PENS = [
  { name: "Reed pen", price: 0 },
  { name: "Silver nib", price: 90 },
  { name: "Gold nib", price: 220, mats: { brass: 2 } },
] as const;
/** Mossy boots: walk and run a quarter faster. */
export const BOOTS = [
  { name: "Old boots", price: 0, speed: 1 },
  { name: "Mossy boots", price: 70, speed: 1.25 },
] as const;
/** A wicker basket: every flower picked counts twice. */
export const BASKETS = [
  { name: "Apron pocket", price: 0, per: 1 },
  { name: "Wicker basket", price: 40, per: 2 },
] as const;

/** what a new witch can draw; scrolls teach the rest */
export const FIRST_SIGILS: Sigil[] = ["growth", "water"];

/** flowers one brew takes */
export const BREW_FLOWERS = 2;
/** plots open on a new island; the rest are overgrown until cleared */
export const OPEN_PLOTS = 6;
/** price of clearing the next overgrown plot, by how many are open already */
const CLEAR_PRICES = [20, 30, 45, 60, 80, 100];

export const inkMax = (s: Save) => BOTTLES[s.bottle].holds;
export const brewInk = (s: Save) => CAULDRONS[s.cauldron].ink;
export function clearPrice(s: Save) {
  const open = s.plots.filter((p) => !p.locked).length;
  return CLEAR_PRICES[Math.max(0, Math.min(open - OPEN_PLOTS, CLEAR_PRICES.length - 1))];
}

export interface Plot {
  crop: CropId | null;
  /** game hours of growth so far */
  growth: number;
  /** game hours the soil stays wet */
  wet: number;
  /** overgrown: clear it (for coins) before planting */
  locked?: boolean;
}

export interface Inscription {
  spell: SpellId;
  power: number;
  /** strokes relative to the seal centre, seal radius = 1 */
  strokes: P[][];
  /** game hours until it fires again */
  cooldown: number;
}

export interface Save {
  version: 1;
  hour: number;
  coins: number;
  ink: number;
  /** sigils you can draw; the rest are learned from scrolls */
  sigils: Sigil[];
  /** everything carried: seeds, crops, flowers, honey… by item id */
  bag: Partial<Record<ItemId, number>>;
  selected: CropId;
  plots: Plot[];
  stones: (Inscription | null)[];
  /** gifts other witches left while you were away */
  mailbox?: Gift[];
  can: { level: number; water: number };
  /** tool levels (BOTTLES, CAULDRONS, PENS, BOOTS, BASKETS) */
  bottle: number;
  cauldron: number;
  pen: number;
  boots: number;
  basket: number;
  /** hat shapes bought at the Outfitter (the one you wear is in your profile) */
  hats: HatStyle[];
  /** objects taken off the island, ready to place again for free */
  shed: Record<string, number>;
  /** largest island size paid for; growing beyond it costs coins */
  land: number;
  /** in-game day number, for the weather */
  day: number;
  /** animals, troughs and their last morning */
  herd: Herd;
  /** the game day each tree or rock was last pruned or chipped, by placed-object id */
  gathered?: Record<string, number>;
  /** honey waiting in each beehive, by placed-object id */
  hives?: Record<string, number>;
  /** your island's shape and everything placed on it (made on first start) */
  island?: IslandLayout;
  /** newest visitor deed already applied (server time) */
  seenDeeds?: number;
}

const KEY = "af.save.v1";

/** Saves from before the bag kept seeds, crops, flowers and honey apart. */
interface Legacy {
  seeds?: Partial<Record<CropId, number>>;
  harvest?: Partial<Record<CropId, number>>;
  flowers?: Partial<Record<FlowerColor, number>>;
  goods?: { honey?: number };
}

export function fromLegacy(s: Legacy): Save["bag"] {
  const bag: Save["bag"] = {};
  for (const [c, n] of Object.entries(s.seeds ?? {})) if (n) bag[`seed:${c as CropId}`] = n;
  for (const [c, n] of Object.entries(s.harvest ?? {})) if (n) bag[`crop:${c as CropId}`] = n;
  for (const [c, n] of Object.entries(s.flowers ?? {})) if (n) bag[`flower:${c as FlowerColor}`] = n;
  if (s.goods?.honey) bag.honey = s.goods.honey;
  return bag;
}

export function newGame(plots: number, stones: number): Save {
  return {
    version: 1,
    hour: 9,
    coins: 20,
    ink: 8,
    bag: { "seed:wheat": 2, "seed:turnip": 4 },
    sigils: [...FIRST_SIGILS],
    herd: { animals: {}, troughs: {}, day: 1 },
    can: { level: 0, water: CANS[0].holds },
    bottle: 0,
    cauldron: 0,
    pen: 0,
    boots: 0,
    basket: 0,
    hats: ["classic"],
    shed: {},
    land: 1,
    day: 1,
    selected: "turnip",
    plots: Array.from({ length: plots }, (_, i) => ({ crop: null, growth: 0, wet: 0, locked: i >= OPEN_PLOTS })),
    stones: Array.from({ length: stones }, () => null),
  };
}

export function load(plots: number, stones: number): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save & Legacy;
      if (s.version === 1 && s.plots.length === plots && s.stones.length === stones) {
        s.bag = { ...fromLegacy(s), ...s.bag };
        delete s.seeds;
        delete s.harvest;
        delete s.flowers;
        delete s.goods;
        s.can ??= { level: 0, water: CANS[0].holds };
        // saves from before upgrades and editor costs keep everything they had
        s.bottle = Math.min(Math.max(s.bottle ?? 0, 0), BOTTLES.length - 1);
        s.cauldron = Math.min(Math.max(s.cauldron ?? 0, 0), CAULDRONS.length - 1);
        s.pen ??= 0;
        s.boots ??= 0;
        s.basket ??= 0;
        s.hats ??= ["classic"];
        s.shed ??= {};
        // saves from before scrolls drew every sigil already
        s.sigils ??= ["growth", "water", "wind", "light", "flame"];
        s.herd ??= { animals: {}, troughs: {}, day: s.day ?? 1 };
        s.land ??= s.island?.size ?? 1;
        s.day ??= 1;
        return s;
      }
    }
  } catch {
    // corrupted or unavailable storage: start over
  }
  return newGame(plots, stones);
}

export function save(state: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: keep playing unsaved
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to remove
  }
}

export const count = (s: Save, id: ItemId) => s.bag[id] ?? 0;

export function give(s: Save, id: ItemId, n = 1) {
  if (!(id in ITEMS)) return;
  s.bag[id] = count(s, id) + n;
}

/** Take `n` of an item; false (and nothing taken) if there aren't enough. */
export function take(s: Save, id: ItemId, n = 1) {
  if (count(s, id) < n) return false;
  s.bag[id] = count(s, id) - n;
  if (!s.bag[id]) delete s.bag[id];
  return true;
}

export function totalFlowers(s: Save) {
  return FLOWER_COLORS.reduce((a, c) => a + count(s, `flower:${c}`), 0);
}

/** Take `n` flowers, most plentiful colour first. */
export function takeFlowers(s: Save, n: number) {
  for (let i = 0; i < n; i++) {
    const color = [...FLOWER_COLORS].sort((a, b) => count(s, `flower:${b}`) - count(s, `flower:${a}`))[0];
    take(s, `flower:${color}`);
  }
}
