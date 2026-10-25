/**
 * Seasons follow the market day (a real UTC day), so every witch has the same one: each lasts seven
 * days, and its last two evenings are a festival. Crops grow faster in their seasons and slower in
 * winter.
 */
import type { CropId } from "./items.ts";
import { marketDay } from "./prices.ts";

export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
export const SEASON_NAMES: Record<Season, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };
/** market days in a season */
export const SEASON_DAYS = 7;
/** the year turns in this order, starting from market day 0 */
const CYCLE: Season[] = ["autumn", "winter", "spring", "summer"];

export const seasonOf = (day = marketDay()): Season => CYCLE[Math.floor(day / SEASON_DAYS) % CYCLE.length];
/** 0 … 6: how far into its season `day` is */
export const dayOfSeason = (day = marketDay()) => day % SEASON_DAYS;

export type FestivalId = "petals" | "stars" | "lanterns" | "aurora";
export interface Festival { id: FestivalId; name: string; note: string }
export const FESTIVALS: Record<Season, Festival> = {
  spring: { id: "petals", name: "the Petal Festival", note: "Blossom falls like snow over every island tonight." },
  summer: { id: "stars", name: "the Star Shower", note: "Shooting stars streak across the sky after dark. Look up!" },
  autumn: { id: "lanterns", name: "Lantern Night", note: "Paper lanterns rise from every island. Press F to let one of your own go." },
  winter: { id: "aurora", name: "the Frost Lights", note: "Ribbons of light dance over the sky after dark." },
};
/** festival days: the last two of each season */
const FESTIVAL_FROM = SEASON_DAYS - 2;

/** The festival on `day`, if it is one (it shows in the evening and at night). */
export function festivalOn(day = marketDay()): Festival | null {
  return dayOfSeason(day) >= FESTIVAL_FROM ? FESTIVALS[seasonOf(day)] : null;
}

/** market days until the season's festival begins (0: it's on) */
export const daysToFestival = (day = marketDay()) => Math.max(0, FESTIVAL_FROM - dayOfSeason(day));

/** the seasons each crop loves: it grows a third faster then */
export const CROP_SEASONS: Record<CropId, Season[]> = {
  wheat: ["summer", "autumn"],
  turnip: ["autumn", "winter"],
  carrot: ["spring", "winter"],
  corn: ["summer"],
  pumpkin: ["autumn"],
  melon: ["summer", "spring"],
};

export const inSeason = (crop: CropId, season: Season) => CROP_SEASONS[crop].includes(season);

/** How fast a crop grows in a season: quicker in its own, slow in the cold unless it loves winter. */
export function growthRate(crop: CropId, season: Season) {
  if (inSeason(crop, season)) return 1.3;
  return season === "winter" ? 0.6 : 1;
}
