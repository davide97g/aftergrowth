import type { Gift } from "../../shared/protocol";
import type { IslandLayout } from "../island/layout";
import type { SpellId } from "../magic/glyph";
import type { P } from "../magic/recognizer";

export type CropId = "wheat" | "turnip" | "carrot" | "corn" | "pumpkin" | "melon";
export type FlowerColor = "pink" | "yellow" | "blue" | "white";

export interface CropDef {
  name: string;
  /** game hours of wet soil from seed to harvest */
  hours: number;
  seedPrice: number;
  sellPrice: number;
  model: string;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: { name: "Wheat", hours: 7, seedPrice: 3, sellPrice: 7, model: "wheat" },
  turnip: { name: "Turnip", hours: 10, seedPrice: 4, sellPrice: 10, model: "turnip" },
  carrot: { name: "Carrot", hours: 16, seedPrice: 6, sellPrice: 16, model: "carrot" },
  corn: { name: "Corn", hours: 20, seedPrice: 8, sellPrice: 22, model: "corn" },
  pumpkin: { name: "Pumpkin", hours: 28, seedPrice: 12, sellPrice: 36, model: "pumpkin" },
  melon: { name: "Melon", hours: 36, seedPrice: 16, sellPrice: 50, model: "melon" },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];

/** Watering can levels: how much it holds and how many plots in a row one pour reaches. */
export const CANS = [
  { name: "Tin can", holds: 6, reach: 1, price: 0 },
  { name: "Copper can", holds: 12, reach: 3, price: 60 },
] as const;
/** Ink bottle levels: drops it holds. */
export const BOTTLES = [
  { name: "Ink pot", holds: 12, price: 0 },
  { name: "Glass flask", holds: 20, price: 50 },
  { name: "Crystal decanter", holds: 30, price: 140 },
] as const;
/** Cauldron levels: drops of ink one brew makes. */
export const CAULDRONS = [
  { name: "Iron cauldron", ink: 3, price: 0 },
  { name: "Copper cauldron", ink: 4, price: 80 },
  { name: "Moon cauldron", ink: 5, price: 200 },
] as const;

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
  seeds: Record<CropId, number>;
  harvest: Record<CropId, number>;
  flowers: Record<FlowerColor, number>;
  selected: CropId;
  plots: Plot[];
  stones: (Inscription | null)[];
  /** gifts other witches left while you were away */
  mailbox?: Gift[];
  can: { level: number; water: number };
  /** ink bottle and cauldron levels (BOTTLES, CAULDRONS) */
  bottle: number;
  cauldron: number;
  /** objects taken off the island, ready to place again for free */
  shed: Record<string, number>;
  /** largest island size paid for; growing beyond it costs coins */
  land: number;
  /** in-game day number, for the weather */
  day: number;
  /** things that aren't crops: honey for now */
  goods?: { honey: number };
  /** honey waiting in each beehive, by placed-object id */
  hives?: Record<string, number>;
  /** your island's shape and everything placed on it (made on first start) */
  island?: IslandLayout;
  /** newest visitor deed already applied (server time) */
  seenDeeds?: number;
}

const KEY = "af.save.v1";

export function newGame(plots: number, stones: number): Save {
  return {
    version: 1,
    hour: 9,
    coins: 20,
    ink: 8,
    seeds: { wheat: 2, turnip: 4, carrot: 0, corn: 0, pumpkin: 0, melon: 0 },
    harvest: { wheat: 0, turnip: 0, carrot: 0, corn: 0, pumpkin: 0, melon: 0 },
    can: { level: 0, water: CANS[0].holds },
    bottle: 0,
    cauldron: 0,
    shed: {},
    land: 1,
    day: 1,
    flowers: { pink: 0, yellow: 0, blue: 0, white: 0 },
    selected: "turnip",
    plots: Array.from({ length: plots }, (_, i) => ({ crop: null, growth: 0, wet: 0, locked: i >= OPEN_PLOTS })),
    stones: Array.from({ length: stones }, () => null),
  };
}

export function load(plots: number, stones: number): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      if (s.version === 1 && s.plots.length === plots && s.stones.length === stones) {
        // saves from before new crops and tools: fill in what's missing
        for (const c of Object.keys(CROPS) as CropId[]) {
          s.seeds[c] ??= 0;
          s.harvest[c] ??= 0;
        }
        s.can ??= { level: 0, water: CANS[0].holds };
        // saves from before upgrades and editor costs keep everything they had
        s.bottle = Math.min(Math.max(s.bottle ?? 0, 0), BOTTLES.length - 1);
        s.cauldron = Math.min(Math.max(s.cauldron ?? 0, 0), CAULDRONS.length - 1);
        s.shed ??= {};
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

export function totalFlowers(s: Save) {
  return Object.values(s.flowers).reduce((a, b) => a + b, 0);
}

/** Take `n` flowers, most plentiful colour first. */
export function takeFlowers(s: Save, n: number) {
  for (let i = 0; i < n; i++) {
    const color = (Object.keys(s.flowers) as FlowerColor[]).sort((a, b) => s.flowers[b] - s.flowers[a])[0];
    s.flowers[color]--;
  }
}
