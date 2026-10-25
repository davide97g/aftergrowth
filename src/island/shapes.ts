/**
 * Island silhouettes. Every shape is a radius function of the angle, so islands stay
 * star-shaped around their centre: the terrain, the walk mask and the editor all rely on that.
 */

export type ShapeId = "round" | "bean" | "peanut" | "clover" | "long" | "wavy";
export type Pt = [number, number];

/** Base radius of a size-1 island, in world units. */
export const BASE_RADIUS = 11;
export const OUTLINE_POINTS = 64;
/** the walkable edge sits a little inside the drawn grass lip */
export const WALK_INSET = 0.96;

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const bump = (d: number, width: number) => Math.exp(-((d / width) ** 2));
// camera looks along (-1, -1): "screen right" in the world is this angle
const SCREEN_RIGHT = -Math.PI / 4;

export const SHAPES: Record<ShapeId, { label: string; r: (a: number) => number }> = {
  round: { label: "Round", r: () => 1 },
  bean: { label: "Bean", r: (a) => 1.05 - 0.34 * bump(wrap(a - (SCREEN_RIGHT + Math.PI / 2)), 0.75) },
  peanut: { label: "Peanut", r: (a) => 0.76 + 0.36 * Math.abs(Math.cos(a - SCREEN_RIGHT)) ** 1.6 },
  clover: { label: "Clover", r: (a) => 0.86 + 0.2 * Math.cos(4 * (a - SCREEN_RIGHT)) },
  long: {
    label: "Long",
    r: (a) => {
      const t = a - SCREEN_RIGHT;
      return 1 / Math.sqrt((Math.cos(t) / 1.32) ** 2 + (Math.sin(t) / 0.8) ** 2);
    },
  },
  wavy: { label: "Wavy", r: (a) => 0.92 + 0.09 * Math.cos(7 * a) + 0.06 * Math.cos(3 * a + 1) },
};
export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

/** Smooth per-island wobble so two "round" islands never look identical. */
function wobble(seed: number) {
  const r = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const terms = [1, 2, 3, 5].map((f, i) => ({ f, amp: [0.05, 0.04, 0.03, 0.015][i], ph: r(i) * TAU }));
  return (a: number) => terms.reduce((s, t) => s + Math.sin(a * t.f + t.ph) * t.amp, 0);
}

/** Radius at each of OUTLINE_POINTS angles (angle i = i / N * 2π, x = cos, z = sin). */
export function radii(shape: ShapeId, size: number, seed: number): number[] {
  const w = wobble(seed);
  const f = SHAPES[shape].r;
  return Array.from({ length: OUTLINE_POINTS }, (_, i) => {
    const a = (i / OUTLINE_POINTS) * TAU;
    return BASE_RADIUS * size * f(a) * (1 + w(a));
  });
}

export function outline(r: number[], scale = 1, cx = 0, cz = 0): Pt[] {
  return r.map((rr, i) => {
    const a = (i / r.length) * TAU;
    return [cx + Math.cos(a) * rr * scale, cz + Math.sin(a) * rr * scale];
  });
}

/** Radius of the island in the direction of (x, z), interpolated between outline samples. */
export function radiusAt(r: number[], x: number, z: number): number {
  const a = (Math.atan2(z, x) + TAU) % TAU;
  const f = (a / TAU) * r.length;
  const i = Math.floor(f) % r.length;
  const j = (i + 1) % r.length;
  const t = f - Math.floor(f);
  return r[i] * (1 - t) + r[j] * t;
}

/** Pull a point back inside the island (to `margin` of the edge) if it lies outside. */
export function clampInside(r: number[], x: number, z: number, margin = 0.85): Pt {
  const d = Math.hypot(x, z);
  const max = radiusAt(r, x, z) * margin;
  if (d <= max || d === 0) return [x, z];
  return [(x / d) * max, (z / d) * max];
}
