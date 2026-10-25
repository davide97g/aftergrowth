/**
 * Every item a witch can carry, shared by the game and the server. An item id is `kind:variant`
 * (`seed:wheat`, `crop:melon`, `flower:pink`) or a plain word (`honey`).
 * `price` is what a shop charges, `pays` what a shop gives for it, both before the daily swing.
 */

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
export const FLOWER_COLORS: FlowerColor[] = ["pink", "yellow", "blue", "white"];

export type Material = "wood" | "stone" | "glass" | "brass";
export const MATERIALS: Material[] = ["wood", "stone", "glass", "brass"];

/** spells a charm can hold (the same ids as the game's spells) */
export type CharmSpell = "growth" | "water" | "wind" | "light" | "flame" | "rainbow" | "bloom" | "fireflies" | "steam";
const CHARMS: Record<CharmSpell, { name: string; price: number }> = {
  growth: { name: "Sprout charm", price: 12 },
  water: { name: "Rain charm", price: 15 },
  wind: { name: "Gust charm", price: 12 },
  light: { name: "Light charm", price: 12 },
  flame: { name: "Ember charm", price: 15 },
  rainbow: { name: "Rainbow charm", price: 40 },
  bloom: { name: "Bloom charm", price: 25 },
  fireflies: { name: "Firefly charm", price: 30 },
  steam: { name: "Steam charm", price: 10 },
};
export const CHARM_SPELLS = Object.keys(CHARMS) as CharmSpell[];

/** teas: brewed at the cottage kettle from two flowers of one colour, drunk from the satchel */
export type TeaId = "rosehip" | "sunpetal" | "bluebell" | "chamomile";
export const TEAS: Record<TeaId, { name: string; flower: FlowerColor; effect: string }> = {
  rosehip: { name: "Rosehip tea", flower: "pink", effect: "Warms the ink: +3 drops" },
  sunpetal: { name: "Sunpetal tea", flower: "yellow", effect: "A spring in your step: 20% faster for 3 minutes" },
  bluebell: { name: "Bluebell tea", flower: "blue", effect: "A steady hand: your next 3 glyphs cost a drop less" },
  chamomile: { name: "Chamomile tea", flower: "white", effect: "Sweet dreams: tonight's sleep fills your ink bottle" },
};
export const TEA_IDS = Object.keys(TEAS) as TeaId[];
/** flowers one pot takes, and the cups it makes */
export const TEA_FLOWERS = 2;
export const TEA_CUPS = 2;

export type ItemCat = "seed" | "crop" | "flower" | "produce" | "material" | "charm" | "tea";
export type Produce = "honey" | "egg" | "duck_egg" | "wool" | "milk";
export type ItemId = `seed:${CropId}` | `crop:${CropId}` | `flower:${FlowerColor}` | Produce | Material | `charm:${CharmSpell}` | "charm_blank" | `tea:${TeaId}`;

export interface ItemDef {
  name: string;
  cat: ItemCat;
  price: number;
  pays: number;
  /** made by players (crops, honey…): the only things a shop can be "wanted" for */
  grown?: boolean;
}

export const ITEMS = {} as Record<ItemId, ItemDef>;
for (const c of CROP_IDS) {
  const d = CROPS[c];
  ITEMS[`seed:${c}`] = { name: `${d.name} seeds`, cat: "seed", price: d.seedPrice, pays: Math.ceil(d.seedPrice / 2) };
  // shops sell crops (as feed) at twice what they pay: growing your own is always the better deal
  ITEMS[`crop:${c}`] = { name: d.name, cat: "crop", price: d.sellPrice * 2, pays: d.sellPrice, grown: true };
}
for (const f of FLOWER_COLORS) ITEMS[`flower:${f}`] = { name: `${f[0].toUpperCase()}${f.slice(1)} flower`, cat: "flower", price: 2, pays: 1, grown: true };
ITEMS.honey = { name: "Honey", cat: "produce", price: 20, pays: 14, grown: true };
ITEMS.egg = { name: "Egg", cat: "produce", price: 9, pays: 6, grown: true };
ITEMS.duck_egg = { name: "Duck egg", cat: "produce", price: 12, pays: 8, grown: true };
ITEMS.wool = { name: "Wool", cat: "produce", price: 27, pays: 18, grown: true };
ITEMS.milk = { name: "Milk", cat: "produce", price: 21, pays: 14, grown: true };
// wood and stone are gathered on your island (and bought back cheaply); glass and brass only come from the market
ITEMS.wood = { name: "Wood", cat: "material", price: 4, pays: 2, grown: true };
ITEMS.stone = { name: "Stone", cat: "material", price: 5, pays: 2, grown: true };
ITEMS.glass = { name: "Glass", cat: "material", price: 12, pays: 5 };
ITEMS.brass = { name: "Brass", cat: "material", price: 20, pays: 8 };
// charms are bought, or inscribed at the cauldron onto a blank; shops buy them back at 60%
for (const c of CHARM_SPELLS) ITEMS[`charm:${c}`] = { name: CHARMS[c].name, cat: "charm", price: CHARMS[c].price, pays: Math.round(CHARMS[c].price * 0.6), grown: true };
ITEMS.charm_blank = { name: "Charm blank", cat: "charm", price: 2, pays: 1 };
// a cup of tea is worth a little more than the flower that went into it
for (const t of TEA_IDS) ITEMS[`tea:${t}`] = { name: TEAS[t].name, cat: "tea", price: 6, pays: 3, grown: true };

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItem = (id: unknown): id is ItemId => typeof id === "string" && id in ITEMS;

/** What one drop of ink costs at a shop, and what a shop gives for one. */
export const INK_PRICE = { price: 5, pays: 2 };

/** Player stalls: four listings each, up to 20 of one item, for three real days. */
export const STALL = { slots: 4, maxQty: 20, days: 3 };

/** The unit prices a stall may ask: 40% to 300% of the item's base price. */
export function stallBounds(id: ItemId) {
  const p = ITEMS[id].price;
  return { min: Math.max(1, Math.floor(p * 0.4)), max: Math.ceil(p * 3) };
}
