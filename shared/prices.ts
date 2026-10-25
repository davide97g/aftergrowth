/**
 * The daily market. A market day is a real UTC day, so every witch sees the same prices even though
 * each one's clock runs on its own. Pure functions: game and server always agree.
 */

const DAY_MS = 86_400_000;
/** prices drift up to this much either way from one day to the next */
export const SWING = 0.15;
/** today's special: a sale price, or what a shop pays for an item it wants */
export const SALE = 0.6;
export const WANTED = 1.5;

export const marketDay = (now = Date.now()) => Math.floor(now / DAY_MS);
export const msToNextDay = (now = Date.now()) => DAY_MS - (now % DAY_MS);

/** 0..1, the same for the same key and day */
export function hash01(key: string, day: number) {
  let h = 2166136261 ^ day;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Today's multiplier for one item, 1 ± SWING. */
export const swing = (id: string, day: number) => 1 + SWING * (hash01(id, day) * 2 - 1);

export interface Special { item: string; kind: "sale" | "wanted" }

/**
 * One special per shop per day: a sale on something it sells, or a high price for something it buys
 * that players make. Either list may be empty.
 */
export function special(shop: string, sells: string[], wants: string[], day: number): Special | null {
  const sale = hash01(`${shop}:kind`, day) < 0.5;
  const pool = sale && sells.length ? sells : wants.length ? wants : sells;
  if (!pool.length) return null;
  const item = pool[Math.floor(hash01(`${shop}:item`, day) * pool.length)];
  return { item, kind: pool === sells ? "sale" : "wanted" };
}
