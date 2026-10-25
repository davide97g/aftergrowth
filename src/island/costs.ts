import { type IslandLayout, KIND_IDS, type Kind } from "./layout.ts";

/**
 * What each thing costs the first time you place it. Removing something puts it in your shed, and
 * placing it again from the shed is free. Essentials can't be added or removed, and market buildings
 * never stand on a home island, so they cost nothing.
 */
export const PRICES: Record<Kind, number> = {
  cottage: 0, farm: 0, cauldron: 0, market: 0, mailbox: 0, stone: 0, pond: 0,
  greenhouse: 120, windmill: 150, well: 60, gazebo: 100, solar_leaf: 30, tent: 40,
  beehive: 45, scarecrow: 25, rain_barrel: 30, flower_bed: 15, vine_arch: 20, hedge: 8,
  fence_planks: 4, fence_gate: 8, path_stone: 3, path_wood: 3, pot_small: 6,
  tree_round_0: 12, tree_round_2: 18, tree_cypress_0: 12, tree_cypress_2: 16, tree_oak: 15, tree_fat: 15,
  tree_detailed: 15, pine_round: 12, pine_small: 8,
  bush_large: 6, rock_large: 8, rock_tall: 8, crystal: 25, mushroom_red: 4, mushroom_tan: 4,
  flower_pink: 3, flower_yellow: 3, flower_blue: 3,
  lantern: 12, lamp_post: 20, crystal_lamp: 35, campfire: 20, bench: 25, swing: 45, log: 10, stump: 6,
  signpost: 10, statue_obelisk: 30, statue_ring: 40, statue_column: 25, log_stack: 10, canoe: 30,
  stump_old: 6, fence: 4, pot: 8, pumpkin: 5,
  shop_seeds: 0, shop_ink: 0, shop_barn: 0, shop_timber: 0, shop_scriptorium: 0, shop_hat: 0, stall_booth: 0, fountain: 0, notice_board: 0,
};

/** Growing the island costs this much per step of size beyond the largest you've paid for. */
export const LAND_STEP = 0.05;
export const LAND_PRICE = 25;

export interface Wallet {
  coins: number;
  /** objects taken off the island earlier, free to place again */
  shed: Record<string, number>;
  /** largest island size paid for */
  land: number;
}

export interface Quote {
  /** coins the edit costs (objects bought plus new land) */
  cost: number;
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
  for (const kind of KIND_IDS) {
    const delta = (now[kind] ?? 0) - (was[kind] ?? 0);
    if (delta < 0) shed[kind] = (shed[kind] ?? 0) - delta;
    else if (delta > 0) {
      const free = Math.min(shed[kind] ?? 0, delta);
      shed[kind] = (shed[kind] ?? 0) - free;
      cost += (delta - free) * PRICES[kind];
    }
    if (!shed[kind]) delete shed[kind];
  }
  const steps = Math.ceil((after.size - wallet.land) / LAND_STEP - 1e-6);
  if (steps > 0) cost += steps * LAND_PRICE;
  return { cost, land: Math.max(wallet.land, after.size), shed };
}
