import { ITEMS, type Material, MATERIALS } from "../../shared/items.ts";
import { type IslandLayout, KIND_IDS, type Kind } from "./layout.ts";

/**
 * What each thing costs the first time you place it. Removing something puts it in your shed, and
 * placing it again from the shed is free. Essentials can't be added or removed, and market buildings
 * never stand on a home island, so they cost nothing.
 */
export const PRICES: Record<Kind, number> = {
  cottage: 0, farm: 0, cauldron: 0, market: 0, mailbox: 0, stone: 0, pond: 0,
  greenhouse: 60, windmill: 80, well: 30, gazebo: 50, solar_leaf: 15, tent: 25,
  beehive: 30, scarecrow: 15, rain_barrel: 15, flower_bed: 8, vine_arch: 10, hedge: 8,
  fence_planks: 2, fence_gate: 4, path_stone: 1, path_wood: 2, pot_small: 6,
  tree_round_0: 12, tree_round_2: 18, tree_cypress_0: 12, tree_cypress_2: 16, tree_oak: 15, tree_fat: 15,
  tree_detailed: 15, pine_round: 12, pine_small: 8,
  bush_large: 6, rock_large: 8, rock_tall: 8, crystal: 25, mushroom_red: 4, mushroom_tan: 4,
  flower_pink: 3, flower_yellow: 3, flower_blue: 3,
  lantern: 8, lamp_post: 10, crystal_lamp: 25, campfire: 10, bench: 12, swing: 25, log: 4, stump: 6,
  signpost: 5, statue_obelisk: 15, statue_ring: 20, statue_column: 12, log_stack: 2, canoe: 15,
  stump_old: 6, fence: 2, pot: 4, pumpkin: 5,
  shop_seeds: 0, shop_ink: 0, shop_barn: 0, shop_timber: 0, shop_scriptorium: 0, shop_hat: 0, stall_booth: 0, fountain: 0, notice_board: 0,
};

/** Built things also take materials. Wood and stone grow on your island; glass and brass come from the market. */
export const BUILD: Partial<Record<Kind, Partial<Record<Material, number>>>> = {
  greenhouse: { glass: 6, wood: 4 }, windmill: { wood: 8, brass: 2 }, well: { stone: 6 }, gazebo: { wood: 8 },
  solar_leaf: { glass: 1, brass: 1 }, tent: { wood: 2 }, beehive: { wood: 2 }, scarecrow: { wood: 2 },
  rain_barrel: { wood: 3 }, flower_bed: { wood: 2 }, vine_arch: { wood: 2 },
  fence_planks: { wood: 1 }, fence_gate: { wood: 2 }, path_stone: { stone: 1 }, path_wood: { wood: 1 },
  lantern: { glass: 1 }, lamp_post: { brass: 1 }, crystal_lamp: { glass: 1 }, campfire: { stone: 2 },
  bench: { wood: 3 }, swing: { wood: 4 }, log: { wood: 2 }, signpost: { wood: 2 },
  statue_obelisk: { stone: 4 }, statue_ring: { stone: 6 }, statue_column: { stone: 4 },
  log_stack: { wood: 4 }, canoe: { wood: 4 }, fence: { wood: 1 }, pot: { stone: 1 },
};

/** Growing the island costs this much per step of size beyond the largest you've paid for. */
export const LAND_STEP = 0.05;
export const LAND_PRICE = 25;

export interface Wallet {
  coins: number;
  /** carried items, for the materials */
  bag: Partial<Record<string, number>>;
  /** objects taken off the island earlier, free to place again */
  shed: Record<string, number>;
  /** largest island size paid for */
  land: number;
}

export interface Quote {
  /** coins the edit costs (objects bought plus new land) */
  cost: number;
  /** materials the edit uses */
  mats: Partial<Record<Material, number>>;
  land: number;
  /** the shed after the edit */
  shed: Record<string, number>;
}

function counts(l: IslandLayout) {
  const n: Record<string, number> = {};
  for (const o of l.objects) n[o.kind] = (n[o.kind] ?? 0) + 1;
  return n;
}

/** What turning `before` into `after` costs: added things come from the shed first, then the market. */
export function quote(before: IslandLayout, after: IslandLayout, wallet: Wallet): Quote {
  const was = counts(before);
  const now = counts(after);
  const shed = { ...wallet.shed };
  let cost = 0;
  const mats: Quote["mats"] = {};
  for (const kind of KIND_IDS) {
    const delta = (now[kind] ?? 0) - (was[kind] ?? 0);
    if (delta < 0) shed[kind] = (shed[kind] ?? 0) - delta;
    else if (delta > 0) {
      const free = Math.min(shed[kind] ?? 0, delta);
      shed[kind] = (shed[kind] ?? 0) - free;
      cost += (delta - free) * PRICES[kind];
      for (const [m, n] of Object.entries(BUILD[kind] ?? {}) as [Material, number][]) mats[m] = (mats[m] ?? 0) + (delta - free) * n;
    }
    if (!shed[kind]) delete shed[kind];
  }
  const steps = Math.ceil((after.size - wallet.land) / LAND_STEP - 1e-6);
  if (steps > 0) cost += steps * LAND_PRICE;
  return { cost, mats, land: Math.max(wallet.land, after.size), shed };
}

/** True if the wallet holds the coins and every material the quote asks for. */
export function canPay(q: Quote, w: Wallet) {
  return q.cost <= w.coins && MATERIALS.every((m) => (q.mats[m] ?? 0) <= (w.bag[m] ?? 0));
}

/** "60c, 6 glass, 4 wood" */
export function costLabel(coins: number, mats: Quote["mats"]) {
  const parts = MATERIALS.filter((m) => mats[m]).map((m) => `${mats[m]} ${ITEMS[m].name.toLowerCase()}`);
  return [coins || !parts.length ? `${coins}c` : "", ...parts].filter(Boolean).join(", ");
}

/** What one more of `kind` costs to place. */
export const kindCost = (kind: Kind) => costLabel(PRICES[kind], BUILD[kind] ?? {});
