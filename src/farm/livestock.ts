import type { CropId, Produce } from "../../shared/items.ts";

export type AnimalKind = "chicken" | "duck" | "sheep" | "goat";

export interface AnimalDef {
  /** at the Menagerie */
  price: number;
  /** any one of these makes a meal */
  eats: CropId[];
  gives: Produce;
  /** game days between goods, when fed */
  every: number;
  /** only lays with the pond close by */
  pond?: boolean;
  /** what it says when petted */
  sound: "cluck" | "quack" | "baa" | "bleat";
}

export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  chicken: { price: 40, eats: ["wheat", "corn"], gives: "egg", every: 1, sound: "cluck" },
  duck: { price: 50, eats: ["wheat"], gives: "duck_egg", every: 1, pond: true, sound: "quack" },
  sheep: { price: 90, eats: ["turnip"], gives: "wool", every: 2, sound: "baa" },
  goat: { price: 110, eats: ["carrot"], gives: "milk", every: 1, sound: "bleat" },
};
export const ANIMAL_KINDS = Object.keys(ANIMALS) as AnimalKind[];
export const isAnimal = (k: string): k is AnimalKind => k in ANIMALS;

/** meals a trough holds */
export const TROUGH_MAX = 6;
/** animals eat from a trough this close */
export const TROUGH_REACH = 5;
/** a duck lays only this close to the pond */
export const POND_REACH = 6;
/** every crop some animal eats */
export const FEED: CropId[] = [...new Set(ANIMAL_KINDS.flatMap((k) => ANIMALS[k].eats))];

export interface Herd {
  /** per placed animal: last day fed, last day it made goods, goods waiting to be picked up */
  animals: Record<string, { fed: number; made: number; ready: number }>;
  /** meals in each trough, by placed-object id */
  troughs: Record<string, Partial<Record<CropId, number>>>;
  /** the last morning the animals ate */
  day: number;
}

export const meals = (t: Herd["troughs"][string] | undefined) => Object.values(t ?? {}).reduce((a, b) => a + (b ?? 0), 0);

/** Put one meal in a trough, if there's room. */
export function addMeal(herd: Herd, trough: string, crop: CropId, n = 1): number {
  const t = (herd.troughs[trough] ??= {});
  const fit = Math.max(0, Math.min(n, TROUGH_MAX - meals(t)));
  t[crop] = (t[crop] ?? 0) + fit;
  return fit;
}

interface Spot { id: string; x: number; z: number }

/**
 * One morning: every animal eats a meal it likes from a trough in reach, and fed animals make their
 * goods when it's time (ducks only near the pond). Pure, so it can be tested.
 */
export function morning(herd: Herd, day: number, animals: (Spot & { kind: AnimalKind })[], troughs: Spot[], nearPond: (x: number, z: number) => boolean) {
  for (const a of animals) {
    const def = ANIMALS[a.kind];
    const st = (herd.animals[a.id] ??= { fed: 0, made: day - def.every, ready: 0 });
    const trough = troughs.find((t) => Math.hypot(t.x - a.x, t.z - a.z) <= TROUGH_REACH && def.eats.some((c) => (herd.troughs[t.id]?.[c] ?? 0) > 0));
    if (!trough) continue;
    const t = herd.troughs[trough.id]!;
    const crop = def.eats.find((c) => (t[c] ?? 0) > 0)!;
    t[crop]! -= 1;
    st.fed = day;
    if (day - st.made >= def.every && (!def.pond || nearPond(a.x, a.z))) {
      st.ready = 1;
      st.made = day;
    }
  }
}
