import { CHARM_SPELLS, CROP_IDS, FLOWER_COLORS, INK_PRICE, ITEMS, type ItemId, MATERIALS, type Material } from "../../shared/items.ts";
import { SALE, WANTED, type Special, special, swing } from "../../shared/prices.ts";
import type { HatStyle } from "../../shared/protocol.ts";
import { BASKETS, BOOTS, BOTTLES, BREW_FLOWERS, CANS, CAULDRONS, PENS, type Save } from "../game/state.ts";
import { PRICES } from "../island/costs.ts";
import { KINDS, type Kind } from "../island/layout.ts";
import type { Sigil } from "../magic/recognizer.ts";
import { ANIMALS, ANIMAL_KINDS, FEED, isAnimal } from "../farm/livestock.ts";

export type GearId = "can" | "bottle" | "cauldron" | "pen" | "boots" | "basket";

/** Something a shop sells: an item, drops of ink, the next level of a tool, a sapling or an animal for the shed, or a scroll. */
export type Offer = { item: ItemId } | { ink: true } | { gear: GearId } | { shed: Kind } | { scroll: Sigil } | { hat: HatStyle };

/** Scrolls teach the sigils a new witch doesn't know. Flame is only sold once you know light. */
export const SCROLLS: Partial<Record<Sigil, { price: number; needs?: Sigil; blurb: string }>> = {
  wind: { price: 60, blurb: "the curl: gusts, and the windmill races." },
  light: { price: 80, blurb: "the star: a light that floats through the night." },
  flame: { price: 120, needs: "light", blurb: "the triangle: a campfire, warm and safe." },
};

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
    sells: [...SEEDS, ...SAPLINGS.map((k): Offer => ({ shed: k }))],
    buys: CROPS_BOUGHT,
  },
  {
    id: "ink", name: "The Inkwell", building: "shop_ink", daily: true, rate: 1,
    keeper: { name: "Odile", color: "#3b3570", greeting: "Ink by the drop, flowers by the stem, bottles to keep them in." },
    sells: [{ ink: true }, ...FLOWERS.map((id): Offer => ({ item: id })), { gear: "bottle" }, { gear: "pen" }],
    buys: [...FLOWERS, "ink"],
  },
  {
    id: "barn", name: "Menagerie", building: "shop_barn", daily: true, rate: 1,
    keeper: { name: "Bramble", color: "#c98a3a", greeting: "Keep a trough full and they'll keep you in eggs and wool." },
    sells: [...ANIMAL_KINDS.map((k): Offer => ({ shed: k })), ...FEED.map((c): Offer => ({ item: `crop:${c}` }))],
    buys: ["egg", "duck_egg", "wool", "milk", "honey"],
  },
  {
    id: "timber", name: "Timber & Stone", building: "shop_timber", daily: true, rate: 1,
    keeper: { name: "Rowan", color: "#7a5a3c", greeting: "Wood and stone you can find at home. Glass and brass, only here." },
    sells: MATERIALS.map((m): Offer => ({ item: m })),
    buys: ["wood", "stone"],
  },
  {
    id: "scriptorium", name: "Scriptorium", building: "shop_scriptorium", daily: true, rate: 1,
    keeper: { name: "Hazel", color: "#6a4f9e", greeting: "Study a scroll, and the sigil will hold. Or take a charm, and skip the drawing." },
    sells: [
      ...(["wind", "light", "flame"] as Sigil[]).map((s): Offer => ({ scroll: s })),
      { item: "charm_blank" },
      ...(["water", "growth", "light", "wind", "bloom", "rainbow"] as const).map((c): Offer => ({ item: `charm:${c}` })),
    ],
    buys: CHARM_SPELLS.map((c): ItemId => `charm:${c}`),
  },
  {
    id: "outfitter", name: "Outfitter", building: "shop_hat", daily: true, rate: 1,
    keeper: { name: "Tilly", color: "#d0587e", greeting: "Better tools, happier witch." },
    sells: [{ gear: "can" }, { gear: "cauldron" }, { gear: "boots" }, { gear: "basket" }, ...(["wide", "tall", "crown"] as HatStyle[]).map((h): Offer => ({ hat: h }))],
    buys: [],
  },
];

/** The key an offer's daily swing and special are worked out from. */
export function offerKey(o: Offer): string {
  if ("item" in o) return o.item;
  if ("ink" in o) return "ink";
  if ("gear" in o) return `gear:${o.gear}`;
  if ("scroll" in o) return `scroll:${o.scroll}`;
  if ("hat" in o) return `hat:${o.hat}`;
  return `shed:${o.shed}`;
}

export function offerName(o: Offer): string {
  if ("item" in o) return ITEMS[o.item].name;
  if ("ink" in o) return "Ink";
  if ("shed" in o) return isAnimal(o.shed) ? KINDS[o.shed].label : `${KINDS[o.shed].label} sapling`;
  if ("scroll" in o) return `${o.scroll[0].toUpperCase()}${o.scroll.slice(1)} scroll`;
  if ("hat" in o) return HATS[o.hat].name;
  return o.gear;
}

export function todaysSpecial(shop: Shop, day: number): Special | null {
  if (!shop.daily) return null;
  // things players grow never go on sale (another shop may want them the same day), and neither
  // does ink, or cheap ink would make charms a coin press without ever picking a flower
  const sells = shop.sells.filter((o) => !("gear" in o) && !("scroll" in o) && !("hat" in o) && !("ink" in o) && !("item" in o && ITEMS[o.item].grown)).map(offerKey);
  const wants = shop.buys.filter((id) => id !== "ink" && ITEMS[id].grown);
  return special(shop.id, sells, wants, day);
}

/** What the shop charges for one of an offer today (gear: the next level; null when there is none). */
export function buyPrice(shop: Shop, o: Offer, s: Save, day: number): number | null {
  if ("gear" in o) return gear(s, o.gear).next?.price ?? null;
  if ("scroll" in o) return s.sigils.includes(o.scroll) ? null : SCROLLS[o.scroll]!.price;
  if ("hat" in o) return s.hats.includes(o.hat) ? null : HATS[o.hat].price;
  const base = "item" in o ? ITEMS[o.item].price : "ink" in o ? INK_PRICE.price : isAnimal(o.shed) ? ANIMALS[o.shed].price : PRICES[o.shed];
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

type Level = { name: string; price: number; mats?: Partial<Record<Material, number>> };

/** Every tool with levels: where its level is kept in the save, and what the next one does. */
const TOOLS: Record<GearId, { levels: readonly Level[]; get: (s: Save) => number; up: (s: Save) => void; blurb: (s: Save, next: number) => string }> = {
  can: {
    levels: CANS, get: (s) => s.can.level,
    up: (s) => {
      s.can.level++;
      s.can.water = CANS[s.can.level].holds;
    },
    blurb: (_, n) => `holds ${CANS[n].holds} pours and waters ${CANS[n].reach} plots in a row${CANS[n].rows > 1 ? `, ${CANS[n].rows} rows deep` : ""}.`,
  },
  bottle: { levels: BOTTLES, get: (s) => s.bottle, up: (s) => void s.bottle++, blurb: (_, n) => `holds ${BOTTLES[n].holds} drops of ink.` },
  cauldron: { levels: CAULDRONS, get: (s) => s.cauldron, up: (s) => void s.cauldron++, blurb: (_, n) => `brews ${BREW_FLOWERS} flowers into ${CAULDRONS[n].ink} drops.` },
  pen: { levels: PENS, get: (s) => s.pen, up: (s) => void s.pen++, blurb: (_, n) => (n === 1 ? "draws dots without spending ink." : "carves and inscribes for 1.5× the ink instead of 2×.") },
  boots: { levels: BOOTS, get: (s) => s.boots, up: (s) => void s.boots++, blurb: () => "walk and run a quarter faster." },
  basket: { levels: BASKETS, get: (s) => s.basket, up: (s) => void s.basket++, blurb: () => "every flower you pick counts twice." },
};

/** A tool's current level, the next one (if any), what it does and how to fit it. */
export function gear(s: Save, id: GearId) {
  const t = TOOLS[id];
  const level = t.get(s);
  const next: Level | undefined = t.levels[level + 1];
  const mats = next?.mats ?? {};
  return {
    now: t.levels[level].name, next, blurb: next ? t.blurb(s, level + 1) : "", mats,
    /** enough materials for the next level (coins are checked by the price) */
    hasMats: () => Object.entries(mats).every(([m, n]) => (s.bag[m as Material] ?? 0) >= n!),
    buy: () => {
      for (const [m, n] of Object.entries(mats)) s.bag[m as Material] = (s.bag[m as Material] ?? 0) - n!;
      t.up(s);
    },
  };
}

/** Hat shapes at the Outfitter; the classic one every witch starts with. */
export const HATS: Record<HatStyle, { name: string; price: number; blurb: string }> = {
  classic: { name: "Classic hat", price: 0, blurb: "the one you started with." },
  wide: { name: "Wide-brim hat", price: 30, blurb: "a brim wide enough to nap under." },
  tall: { name: "Tall crooked hat", price: 45, blurb: "taller, and the tip bends twice." },
  crown: { name: "Flower crown", price: 60, blurb: "no hat at all, just flowers." },
};
