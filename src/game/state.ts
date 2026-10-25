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

export const INK_MAX = 12;
/** Watering can levels: how much it holds and how many plots in a row one pour reaches. */
export const CANS = [
  { name: "Tin can", holds: 6, reach: 1, price: 0 },
  { name: "Copper can", holds: 12, reach: 3, price: 60 },
] as const;

/** two flowers brew into three drops of ink */
export const BREW = { flowers: 2, ink: 3 };

export interface Plot {
  crop: CropId | null;
  /** game hours of growth so far */
  growth: number;
  /** game hours the soil stays wet */
  wet: number;
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
    day: 1,
    flowers: { pink: 0, yellow: 0, blue: 0, white: 0 },
    selected: "turnip",
    plots: Array.from({ length: plots }, () => ({ crop: null, growth: 0, wet: 0 })),
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
