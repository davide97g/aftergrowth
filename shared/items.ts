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

export type ItemCat = "seed" | "crop" | "flower" | "produce";
export type ItemId = `seed:${CropId}` | `crop:${CropId}` | `flower:${FlowerColor}` | "honey";

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
  ITEMS[`crop:${c}`] = { name: d.name, cat: "crop", price: Math.round(d.sellPrice * 1.5), pays: d.sellPrice, grown: true };
}
for (const f of FLOWER_COLORS) ITEMS[`flower:${f}`] = { name: `${f[0].toUpperCase()}${f.slice(1)} flower`, cat: "flower", price: 2, pays: 1, grown: true };
ITEMS.honey = { name: "Honey", cat: "produce", price: 20, pays: 14, grown: true };

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const isItem = (id: unknown): id is ItemId => typeof id === "string" && id in ITEMS;

/** What one drop of ink costs at a shop, and what a shop gives for one. */
export const INK_PRICE = { price: 5, pays: 2 };
