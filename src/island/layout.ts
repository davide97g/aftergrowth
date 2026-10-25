import { type Pt, SHAPE_IDS, type ShapeId, clampInside, radii, radiusAt } from "./shapes.ts";

export type Underside = "rock" | "roots" | "crystal";
export const UNDERSIDES: Underside[] = ["rock", "roots", "crystal"];
export type Category = "home" | "trees" | "nature" | "garden" | "decor";
/** what a placed object does when the witch is near it */
export type Use = "fill" | "sit" | "swing" | "hive" | "scare" | "sign";

export interface KindDef {
  label: string;
  cat: Category;
  /** prop model in public/assets/props, or null for things the game draws itself */
  model: string | null;
  /** collision radius at scale 1 */
  solid: number;
  /** can be moved but never removed, and there is always exactly `count` of them */
  essential?: boolean;
  count?: number;
  use?: Use;
}

export const KINDS = {
  cottage: { label: "Cottage", cat: "home", model: "cottage", solid: 1.85, essential: true, count: 1 },
  farm: { label: "Farm field", cat: "home", model: null, solid: 0, essential: true, count: 1 },
  cauldron: { label: "Cauldron", cat: "home", model: null, solid: 0.55, essential: true, count: 1 },
  market: { label: "Market crate", cat: "home", model: null, solid: 0.6, essential: true, count: 1 },
  mailbox: { label: "Mailbox", cat: "home", model: null, solid: 0.25, essential: true, count: 1 },
  stone: { label: "Carving stone", cat: "home", model: null, solid: 0, essential: true, count: 3 },
  pond: { label: "Pond", cat: "home", model: null, solid: 0, essential: true, count: 1 },
  greenhouse: { label: "Greenhouse", cat: "home", model: "greenhouse", solid: 1.3 },
  windmill: { label: "Windmill", cat: "home", model: "windmill", solid: 0.85 },
  well: { label: "Wishing well", cat: "home", model: "well", solid: 0.8, use: "fill" },
  gazebo: { label: "Gazebo", cat: "home", model: "gazebo", solid: 0 },
  solar_leaf: { label: "Leaf solar lamp", cat: "home", model: "solar_leaf", solid: 0.2 },
  tent: { label: "Tent", cat: "home", model: "tent", solid: 0.9 },
  beehive: { label: "Beehive", cat: "garden", model: "beehive", solid: 0.45, use: "hive" },
  scarecrow: { label: "Scarecrow", cat: "garden", model: "scarecrow", solid: 0.2, use: "scare" },
  rain_barrel: { label: "Rain barrel", cat: "garden", model: "rain_barrel", solid: 0.4, use: "fill" },
  flower_bed: { label: "Flower bed", cat: "garden", model: "flower_bed", solid: 0.6 },
  vine_arch: { label: "Vine arch", cat: "garden", model: "vine_arch", solid: 0 },
  hedge: { label: "Hedge", cat: "garden", model: "hedge", solid: 0.45 },
  fence_planks: { label: "Plank fence", cat: "garden", model: "fence_planks", solid: 0.2 },
  fence_gate: { label: "Garden gate", cat: "garden", model: "fence_gate", solid: 0 },
  path_stone: { label: "Stone path", cat: "garden", model: "path_stone", solid: 0 },
  path_wood: { label: "Wooden path", cat: "garden", model: "path_wood", solid: 0 },
  pot_small: { label: "Small planter", cat: "garden", model: "pot_small", solid: 0.25 },
  tree_round_0: { label: "Round tree", cat: "trees", model: "tree_round_0", solid: 0.35 },
  tree_round_2: { label: "Big round tree", cat: "trees", model: "tree_round_2", solid: 0.4 },
  tree_cypress_0: { label: "Cypress", cat: "trees", model: "tree_cypress_0", solid: 0.35 },
  tree_cypress_2: { label: "Tall cypress", cat: "trees", model: "tree_cypress_2", solid: 0.4 },
  tree_oak: { label: "Oak", cat: "trees", model: "tree_oak", solid: 0.35 },
  tree_fat: { label: "Plump tree", cat: "trees", model: "tree_fat", solid: 0.4 },
  tree_detailed: { label: "Leafy tree", cat: "trees", model: "tree_detailed", solid: 0.35 },
  pine_round: { label: "Pine", cat: "trees", model: "pine_round", solid: 0.3 },
  pine_small: { label: "Small pine", cat: "trees", model: "pine_small", solid: 0.25 },
  bush_large: { label: "Bush", cat: "nature", model: "bush_large", solid: 0 },
  rock_large: { label: "Boulder", cat: "nature", model: "rock_large", solid: 0.45 },
  rock_tall: { label: "Standing rock", cat: "nature", model: "rock_tall", solid: 0.35 },
  crystal: { label: "Crystal", cat: "nature", model: "crystal_cluster", solid: 0.35 },
  mushroom_red: { label: "Red mushrooms", cat: "nature", model: "mushroom_red", solid: 0 },
  mushroom_tan: { label: "Tan mushrooms", cat: "nature", model: "mushroom_tan", solid: 0 },
  flower_pink: { label: "Pink flower", cat: "nature", model: "flower_pink", solid: 0 },
  flower_yellow: { label: "Yellow flower", cat: "nature", model: "flower_yellow", solid: 0 },
  flower_blue: { label: "Blue flower", cat: "nature", model: "flower_blue", solid: 0 },
  lantern: { label: "Lantern", cat: "decor", model: "lantern", solid: 0.2 },
  lamp_post: { label: "Lamp post", cat: "decor", model: "lamp_post", solid: 0.15 },
  crystal_lamp: { label: "Crystal lamp", cat: "decor", model: "crystal_lamp", solid: 0.3 },
  campfire: { label: "Campfire", cat: "decor", model: "campfire", solid: 0.5 },
  bench: { label: "Bench", cat: "decor", model: "bench", solid: 0.5, use: "sit" },
  swing: { label: "Swing", cat: "decor", model: "swing", solid: 0.5, use: "swing" },
  log: { label: "Log bench", cat: "decor", model: "log", solid: 0.4, use: "sit" },
  stump: { label: "Stump", cat: "decor", model: "stump", solid: 0.3, use: "sit" },
  signpost: { label: "Signpost", cat: "decor", model: "signpost", solid: 0.15, use: "sign" },
  statue_obelisk: { label: "Obelisk", cat: "decor", model: "statue_obelisk", solid: 0.3 },
  statue_ring: { label: "Stone ring", cat: "decor", model: "statue_ring", solid: 0.45 },
  statue_column: { label: "Column", cat: "decor", model: "statue_column", solid: 0.25 },
  log_stack: { label: "Log pile", cat: "decor", model: "log_stack", solid: 0.5 },
  canoe: { label: "Canoe", cat: "decor", model: "canoe", solid: 0.4 },
  stump_old: { label: "Old stump", cat: "decor", model: "stump_old", solid: 0.3 },
  fence: { label: "Fence", cat: "decor", model: "fence", solid: 0.2 },
  pot: { label: "Planter", cat: "decor", model: "pot", solid: 0.3 },
  pumpkin: { label: "Pumpkin", cat: "decor", model: "pumpkin", solid: 0.3 },
} satisfies Record<string, KindDef>;

export type Kind = keyof typeof KINDS;
export const KIND_IDS = Object.keys(KINDS) as Kind[];

export interface Placed { id: string; kind: Kind; x: number; z: number; rot: number; scale: number }

export interface IslandLayout {
  v: 1;
  shape: ShapeId;
  size: number;
  underside: Underside;
  /** gives the coastline its own wobble */
  seed: number;
  /** reshuffles the wild meadow (grass, flowers, rim rocks) without touching placed objects */
  meadow: number;
  objects: Placed[];
}

export const SIZE_MIN = 0.8;
export const SIZE_MAX = 1.6;
const S = Math.SQRT1_2;
/** Props are modelled facing +Z; this yaw turns them towards the camera. */
export const FACE = Math.PI / 4;

/** Position in the camera's view (right, up) converted to world XZ. */
export function screen(right: number, up: number): Pt {
  return [(right - up) * S, (-right - up) * S];
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
export function newId(kind: string) {
  counter = (counter + 1) % 1e6;
  return `${kind}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** The island every new witch starts with: the cozy farm from the concept art, trees from the seed. */
export function defaultHome(seed: number): IslandLayout {
  const rand = rng(seed);
  const objects: Placed[] = [];
  const put = (kind: Kind, r: number, u: number, rot = FACE, scale = 1) => {
    const [x, z] = screen(r, u);
    objects.push({ id: `${kind}-${objects.length}`, kind, x, z, rot, scale });
  };
  put("cottage", -3.2, 4.4);
  put("greenhouse", 2.2, 4.8);
  put("windmill", 6.3, 2.2);
  put("farm", 4.2, -2.4);
  put("cauldron", -5.4, 1.9);
  put("market", 7.4, -0.6);
  put("mailbox", -1.9, 0.5);
  put("stone", 4.2, 0.05);
  put("stone", 0.7, 3.0);
  put("stone", -1.2, -3.6);
  put("pond", -5.24, -3.02);
  put("lantern", -2.0, 2.1);
  for (const [r, u] of [[6.8, -4.6], [7.3, -4.3], [1.8, -2.3]]) put("pumpkin", r, u, rand() * 6, 0.9 + rand() * 0.3);
  const layout: IslandLayout = { v: 1, shape: "round", size: 1, underside: "rock", seed: seed % 100000, meadow: seed % 100000, objects };
  addTreeRing(layout, rand);
  for (const [r, u, k] of [[-7.2, -0.6, "tree_round_0"], [1.2, -6.6, "tree_round_0"], [-1.6, -6.2, "tree_cypress_0"], [8.6, -2.6, "tree_round_2"], [-0.5, 3.6, "pine_round"]] as const) {
    const [x, z] = screen(r, u);
    if (fits(layout, x, z, 0.9)) put(k, r, u, rand() * 6);
  }
  return layout;
}

/** The shared island everyone meets on: a great tree with log benches, no farm. */
export function commonsLayout(): IslandLayout {
  const rand = rng(42);
  const objects: Placed[] = [];
  const put = (kind: Kind, x: number, z: number, rot = FACE, scale = 1) => objects.push({ id: `${kind}-${objects.length}`, kind, x, z, rot, scale });
  const [cx, cz] = screen(0.5, 1.5);
  put("tree_round_2", cx, cz, 0.4, 2.4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    put("log", cx + Math.cos(a) * 2.8, cz + Math.sin(a) * 2.8, -a, 1.1);
    put("lantern", cx + Math.cos(a + 0.5) * 3.6, cz + Math.sin(a + 0.5) * 3.6, -a);
  }
  const at = (r: number, u: number): Pt => screen(r, u);
  put("cauldron", ...at(-6.0, 2.4));
  put("market", ...at(6.5, -1.0));
  put("pond", ...at(-4.6, -4.2));
  put("windmill", ...at(6.4, 3.6));
  put("crystal", ...at(-1.5, -5.5), 0.3, 1.2);
  put("crystal", ...at(2.6, -5.0), 1.2, 0.9);
  const layout: IslandLayout = { v: 1, shape: "clover", size: 1.15, underside: "crystal", seed: 4242, meadow: 4242, objects };
  addTreeRing(layout, rand);
  return layout;
}

/** Trees along the far edge frame the island like the concept art. */
function addTreeRing(layout: IslandLayout, rand: () => number) {
  const r = coast(layout);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rand() * 0.15;
    const vx = Math.cos(a);
    const vz = Math.sin(a);
    if (-(vx + vz) * S < -0.45) continue; // only towards the top of the screen
    const d = radiusAt(r, vx, vz) * (0.78 + rand() * 0.08);
    const x = vx * d;
    const z = vz * d;
    if (!fits(layout, x, z, 0.9)) continue;
    const kind: Kind = rand() > 0.45 ? (rand() > 0.5 ? "tree_cypress_0" : "tree_cypress_2") : rand() > 0.5 ? "tree_round_0" : "tree_round_2";
    layout.objects.push({ id: `${kind}-${layout.objects.length}`, kind, x, z, rot: rand() * 6, scale: 0.85 + rand() * 0.35 });
  }
}

/** Outline radii of a layout's island. */
export function coast(layout: IslandLayout) {
  return radii(layout.shape, layout.size, layout.seed);
}

/** Space an object needs around it, used when deciding if something fits. */
export function footprint(p: Placed): number {
  if (p.kind === "farm") return 2.6;
  if (p.kind === "pond") return 2.6 * p.scale;
  if (p.kind === "stone") return 1.0;
  return Math.max(KINDS[p.kind].solid * p.scale, 0.3) + 0.4;
}

function fits(layout: IslandLayout, x: number, z: number, r: number) {
  return layout.objects.every((o) => Math.hypot(o.x - x, o.z - z) > footprint(o) + r);
}

/** Bring every object back onto the island after it changed shape or size. */
export function clampObjects(layout: IslandLayout) {
  const r = coast(layout);
  for (const o of layout.objects) {
    const margin = o.kind === "pond" || o.kind === "farm" ? 0.62 : 0.86;
    [o.x, o.z] = clampInside(r, o.x, o.z, margin);
  }
}

/** Accept a layout from storage or the network only if it is well formed; essentials are restored. */
export function sanitizeLayout(raw: unknown, fallback: IslandLayout): IslandLayout {
  const l = raw as Partial<IslandLayout> | null;
  if (!l || l.v !== 1 || !Array.isArray(l.objects)) return fallback;
  const objects: Placed[] = [];
  for (const o of l.objects.slice(0, 400)) {
    if (!o || !(o.kind in KINDS) || ![o.x, o.z, o.rot, o.scale].every(Number.isFinite)) continue;
    objects.push({ id: String(o.id).slice(0, 48), kind: o.kind, x: o.x, z: o.z, rot: o.rot, scale: Math.min(Math.max(o.scale, 0.4), 3) });
  }
  for (const kind of KIND_IDS) {
    const def: KindDef = KINDS[kind];
    if (!def.essential) continue;
    const have = objects.filter((o) => o.kind === kind);
    const missing = fallback.objects.filter((o) => o.kind === kind).slice(have.length, def.count);
    objects.push(...missing);
    if (have.length > (def.count ?? 1)) for (const extra of have.slice(def.count)) objects.splice(objects.indexOf(extra), 1);
  }
  const layout: IslandLayout = {
    v: 1,
    shape: SHAPE_IDS.includes(l.shape as ShapeId) ? (l.shape as ShapeId) : "round",
    size: Math.min(Math.max(Number(l.size) || 1, SIZE_MIN), SIZE_MAX),
    underside: UNDERSIDES.includes(l.underside as Underside) ? (l.underside as Underside) : "rock",
    seed: Number.isFinite(l.seed) ? Number(l.seed) : fallback.seed,
    meadow: Number.isFinite(l.meadow) ? Number(l.meadow) : fallback.meadow,
    objects,
  };
  clampObjects(layout);
  return layout;
}
