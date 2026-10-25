import { CROP_IDS, FLOWER_COLORS, INK_PRICE, ITEMS, type ItemId, MATERIALS, type Material } from "../../shared/items.ts";
import { SALE, WANTED, type Special, special, swing } from "../../shared/prices.ts";
import { BOTTLES, BREW_FLOWERS, CANS, CAULDRONS, type Save } from "../game/state.ts";
import { PRICES } from "../island/costs.ts";
import { KINDS, type Kind } from "../island/layout.ts";

export type GearId = "can" | "bottle" | "cauldron";

/** Something a shop sells: an item, drops of ink, the next level of a tool, or a sapling for the shed. */
export type Offer = { item: ItemId } | { ink: true } | { gear: GearId } | { sapling: Kind };

export interface Keeper {
  name: string;
  /** hat colour */
  color: string;
  greeting: string;
}

export interface Shop {
  id: string;
  name: string;
  /** the building on the market island (null for the home crate) */
  building: Kind | null;
  keeper: Keeper | null;
  sells: Offer[];
  /** what the shop buys from you */
  buys: (ItemId | "ink")[];
  /** prices follow the market day; the home crate keeps base prices */
  daily: boolean;
  /** share of the usual price this shop pays */
  rate: number;
  /** stock that hasn't arrived yet */
  soon?: string;
}

const SEEDS = CROP_IDS.map((c): Offer => ({ item: `seed:${c}` }));
const CROPS_BOUGHT = CROP_IDS.map((c): ItemId => `crop:${c}`);
const FLOWERS = FLOWER_COLORS.map((c): ItemId => `flower:${c}`);
const SAPLINGS: Kind[] = ["tree_round_0", "tree_round_2", "tree_cypress_0", "tree_cypress_2", "tree_oak", "tree_fat", "pine_round", "pine_small"];

/** The crate on your own island: the basics, at a worse rate than the market. */
export const CRATE: Shop = {
  id: "crate", name: "Market crate", building: null, keeper: null, daily: false, rate: 0.8,
  sells: SEEDS.slice(0, 3),
  buys: [...CROPS_BOUGHT, "honey"],
};

export const SHOPS: Shop[] = [
  {
    id: "seeds", name: "Seed & Sprout", building: "shop_seeds", daily: true, rate: 1,
    keeper: { name: "Fern", color: "#5c9e3a", greeting: "Every seed I have, and saplings for your island." },
    sells: [...SEEDS, ...SAPLINGS.map((k): Offer => ({ sapling: k }))],
    buys: CROPS_BOUGHT,
  },
  {
    id: "ink", name: "The Inkwell", building: "shop_ink", daily: true, rate: 1,
    keeper: { name: "Odile", color: "#3b3570", greeting: "Ink by the drop, flowers by the stem, bottles to keep them in." },
    sells: [{ ink: true }, ...FLOWERS.map((id): Offer => ({ item: id })), { gear: "bottle" }],
    buys: [...FLOWERS, "ink"],
  },
  {
    id: "barn", name: "Menagerie", building: "shop_barn", daily: true, rate: 1,
    keeper: { name: "Bramble", color: "#c98a3a", greeting: "Honey's always welcome here." },
    sells: [],
    buys: ["honey"],
    soon: "Chickens, ducks, sheep and goats are on their way.",
  },
  {
    id: "timber", name: "Timber & Stone", building: "shop_timber", daily: true, rate: 1,
    keeper: { name: "Rowan", color: "#7a5a3c", greeting: "Wood and stone you can find at home. Glass and brass, only here." },
    sells: MATERIALS.map((m): Offer => ({ item: m })),
    buys: ["wood", "stone"],
  },
  {
    id: "scriptorium", name: "Scriptorium", building: "shop_scriptorium", daily: true, rate: 1,
    keeper: { name: "Hazel", color: "#6a4f9e", greeting: "Hush. The scrolls are still drying." },
    sells: [],
    buys: [],
    soon: "Sigil scrolls and charms are being copied out.",
  },
  {
    id: "outfitter", name: "Outfitter", building: "shop_hat", daily: true, rate: 1,
    keeper: { name: "Tilly", color: "#d0587e", greeting: "Better tools, happier witch." },
    sells: [{ gear: "can" }, { gear: "cauldron" }],
    buys: [],
    soon: "Boots, baskets and hats are still on the sewing table.",
  },
];

/** The key an offer's daily swing and special are worked out from. */
export function offerKey(o: Offer): string {
  if ("item" in o) return o.item;
  if ("ink" in o) return "ink";
  if ("gear" in o) return `gear:${o.gear}`;
  return `sapling:${o.sapling}`;
}

export function offerName(o: Offer): string {
  if ("item" in o) return ITEMS[o.item].name;
  if ("ink" in o) return "Ink";
  if ("sapling" in o) return `${KINDS[o.sapling].label} sapling`;
  return o.gear;
}

export function todaysSpecial(shop: Shop, day: number): Special | null {
  if (!shop.daily) return null;
  const sells = shop.sells.filter((o) => !("gear" in o)).map(offerKey);
  const wants = shop.buys.filter((id) => id !== "ink" && ITEMS[id].grown);
  return special(shop.id, sells, wants, day);
}

/** What the shop charges for one of an offer today (gear: the next level; null when there is none). */
export function buyPrice(shop: Shop, o: Offer, s: Save, day: number): number | null {
  if ("gear" in o) return gear(s, o.gear).next?.price ?? null;
  const base = "item" in o ? ITEMS[o.item].price : "ink" in o ? INK_PRICE.price : PRICES[o.sapling];
  if (!shop.daily) return base;
  const key = offerKey(o);
  const sp = todaysSpecial(shop, day);
  return Math.max(1, Math.round(base * swing(key, day) * (sp?.kind === "sale" && sp.item === key ? SALE : 1)));
}

/** What the shop pays for one today. */
export function sellPrice(shop: Shop, id: ItemId | "ink", day: number): number {
  const base = (id === "ink" ? INK_PRICE.pays : ITEMS[id].pays) * shop.rate;
  if (!shop.daily) return Math.max(1, Math.floor(base));
  const sp = todaysSpecial(shop, day);
  return Math.max(1, Math.round(base * swing(id, day) * (sp?.kind === "wanted" && sp.item === id ? WANTED : 1)));
}

/** Up, down or flat against yesterday. */
export function trend(id: string, day: number): -1 | 0 | 1 {
  const d = swing(id, day) - swing(id, day - 1);
  return Math.abs(d) < 0.02 ? 0 : d > 0 ? 1 : -1;
}

/** A tool's current level, the next one (if any), what it does and how to fit it. */
export function gear(s: Save, id: GearId) {
  const next: { name: string; price: number; mats?: Partial<Record<Material, number>> } | undefined =
    id === "can" ? CANS[s.can.level + 1] : id === "bottle" ? BOTTLES[s.bottle + 1] : CAULDRONS[s.cauldron + 1];
  const now = id === "can" ? CANS[s.can.level].name : id === "bottle" ? BOTTLES[s.bottle].name : CAULDRONS[s.cauldron].name;
  const blurb = !next ? "" : id === "can" ? `holds ${CANS[s.can.level + 1].holds} pours and waters ${CANS[s.can.level + 1].reach} plots in a row.`
    : id === "bottle" ? `holds ${BOTTLES[s.bottle + 1].holds} drops of ink.` : `brews ${BREW_FLOWERS} flowers into ${CAULDRONS[s.cauldron + 1].ink} drops.`;
  const mats = next?.mats ?? {};
  return {
    now, next, blurb, mats,
    /** enough materials for the next level (coins are checked by the price) */
    hasMats: () => Object.entries(mats).every(([m, n]) => (s.bag[m as Material] ?? 0) >= n!),
    buy: () => {
      for (const [m, n] of Object.entries(mats)) s.bag[m as Material] = (s.bag[m as Material] ?? 0) - n!;
      if (id === "can") {
        s.can.level++;
        s.can.water = CANS[s.can.level].holds;
      } else if (id === "bottle") s.bottle++;
      else s.cauldron++;
    },
  };
}
