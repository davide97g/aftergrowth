/**
 * Aetherhold, the royal city, as pure data: the hill and its terraces, the ramps and stairs between
 * them, the streets, every building lot, the props, the walls and the places worth a map pin.
 * No three.js here, so the tests can walk the city too; `city.ts` turns the plan into meshes.
 *
 * The hill is ringed around the palace, which stands near the top of the screen: rings further from
 * it are lower, so the city climbs away from the camera and higher districts never hide lower ones.
 */
import { FACE, type Kind, type Placed, screen } from "../island/layout.ts";
import { type Pt, radii, radiusAt } from "../island/shapes.ts";

import type { Token } from "../core/palette.ts";
/** An oriented rectangle on the ground: centre, half width (local x), half depth (local z), yaw. */
export interface OBB { x: number; z: number; hw: number; hd: number; rot: number }
export interface Circle { x: number; z: number; r: number }

export const SIZE = 3.1;
export const SEED = 7071;
const S = Math.SQRT1_2;
const TAU = Math.PI * 2;

/** the palace's spot in screen terms (right, up) from the island's centre */
export const PALACE_RU: [number, number] = [0, 21];
export const PALACE = screen(...PALACE_RU);
/** retaining walls, by distance from the palace: summit | upper town | middle town | lower town */
export const WALLS = [9, 18, 30];
/** half thickness of a retaining wall, and of the cliff it hides */
export const WALL_HALF = 0.55;
const EDGE = 0.15;
export const ZONES = ["summit", "upper", "middle", "lower"] as const;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const smooth = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};

/** Ground height inside one ring, by distance from the palace: each ring leans a little too. */
function zoneH(zone: number, d: number) {
  if (zone === 0) return 12;
  if (zone === 1) return 8.4 + (0.8 * (18 - d)) / 9;
  if (zone === 2) return 4.8 + (0.8 * (30 - d)) / 12;
  return 2.4 * smooth((50 - d) / 20);
}

export function zoneOf(d: number) {
  const z = WALLS.findIndex((R) => d < R);
  return z < 0 ? 3 : z;
}

/** The hill without its ramps: flat-ish rings with sharp cliffs between them. */
export function hill(d: number) {
  for (let k = 0; k < WALLS.length; k++) {
    const R = WALLS[k];
    if (Math.abs(d - R) < EDGE) return zoneH(k, d) + (zoneH(k + 1, d) - zoneH(k, d)) * smooth((d - (R - EDGE)) / (2 * EDGE));
  }
  return zoneH(zoneOf(d), d);
}

// ---------- screen terms and the palace's polar frame ----------

export const ru = (r: number, u: number): Pt => screen(r, u);
export const toRU = (x: number, z: number): [number, number] => [(x - z) * S, -(x + z) * S];
/** A point `d` from the palace, `theta` around it (0 points at the camera, positive to screen right). */
export const polar = (d: number, theta: number): Pt => screen(PALACE_RU[0] + d * Math.sin(theta), PALACE_RU[1] - d * Math.cos(theta));
export function toPolar(x: number, z: number) {
  const [r, u] = toRU(x, z);
  const dr = r - PALACE_RU[0];
  const du = u - PALACE_RU[1];
  return { d: Math.hypot(dr, du), theta: Math.atan2(dr, -du) };
}

// ---------- ramps and stairs ----------

export interface Ramp {
  wall: number;
  theta: number;
  /** corridor width and length */
  w: number;
  len: number;
  /** drawn as steps rather than a cobbled slope */
  steps: boolean;
  /** bottom and top of the corridor's centre line, its axis (up the ramp) and side */
  b: Pt;
  t: Pt;
  axis: Pt;
  side: Pt;
  hb: number;
  ht: number;
  rot: number;
}

function makeRamp(wall: number, theta: number, w: number, len: number, steps: boolean): Ramp {
  const R = WALLS[wall];
  const b = polar(R + len / 2, theta);
  const t = polar(R - len / 2, theta);
  const l = Math.hypot(t[0] - b[0], t[1] - b[1]);
  const axis: Pt = [(t[0] - b[0]) / l, (t[1] - b[1]) / l];
  return { wall, theta, w, len, steps, b, t, axis, side: [axis[1], -axis[0]], hb: hill(R + len / 2), ht: hill(R - len / 2), rot: Math.atan2(axis[0], axis[1]) };
}

export const RAMPS: Ramp[] = [
  makeRamp(2, 0.3, 3.6, 7, false),
  makeRamp(2, -0.62, 2.0, 6, true),
  makeRamp(1, -0.42, 3.6, 7, false),
  makeRamp(1, 0.74, 2.0, 6, true),
  makeRamp(0, 0, 5.6, 5.5, true),
];
/** thickness of the walls along a ramp's sides */
export const RAMP_WALL = 0.6;

/** The arcs of retaining wall `k` (angles around the palace), broken where its ramps pass through. */
export function wallRuns(k: number): [number, number][] {
  const R = WALLS[k];
  const gaps = RAMPS.filter((r) => r.wall === k).map((r) => {
    const half = Math.asin(Math.min(1, (r.w / 2 + RAMP_WALL * 0.5) / R));
    return [r.theta - half, r.theta + half] as const;
  }).sort((a, b) => a[0] - b[0]);
  return gaps.map((g, i): [number, number] => [g[1], i + 1 < gaps.length ? gaps[i + 1][0] : gaps[0][0] + TAU]);
}

/** Where a point sits along a ramp: `a` up the axis (0 bottom … len top), `c` across from the centre line. */
export function rampLocal(rp: Ramp, x: number, z: number) {
  const dx = x - rp.b[0];
  const dz = z - rp.b[1];
  return { a: dx * rp.axis[0] + dz * rp.axis[1], c: dx * rp.side[0] + dz * rp.side[1] };
}

export function rampAt(x: number, z: number): Ramp | null {
  for (const rp of RAMPS) {
    const { a, c } = rampLocal(rp, x, z);
    if (a >= 0 && a <= rp.len && Math.abs(c) <= rp.w / 2) return rp;
  }
  return null;
}

/** The kingdom's ground height at (x, z): the hill, or the ramp you are on. */
export function groundAt(x: number, z: number) {
  for (const rp of RAMPS) {
    const { a, c } = rampLocal(rp, x, z);
    if (a >= 0 && a <= rp.len && Math.abs(c) <= rp.w / 2 + 0.05) return rp.hb + ((rp.ht - rp.hb) * a) / rp.len;
  }
  return hill(toPolar(x, z).d);
}

// ---------- geometry helpers ----------

export function obbCorners(b: OBB): Pt[] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => {
    const lx = i * b.hw;
    const lz = k * b.hd;
    return [b.x + lx * c + lz * s, b.z - lx * s + lz * c] as Pt;
  });
}

/** (x, z) in a box's own frame */
export function obbLocal(b: OBB, x: number, z: number): Pt {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function insideObb(b: OBB, x: number, z: number, pad = 0) {
  const [lx, lz] = obbLocal(b, x, z);
  return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad;
}

function project(pts: Pt[], ax: Pt) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const v = p[0] * ax[0] + p[1] * ax[1];
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

export function obbOverlap(a: OBB, b: OBB, pad = 0) {
  const A = obbCorners({ ...a, hw: a.hw + pad, hd: a.hd + pad });
  const B = obbCorners(b);
  for (const box of [a, b]) {
    for (const ax of [[Math.cos(box.rot), -Math.sin(box.rot)], [Math.sin(box.rot), Math.cos(box.rot)]] as Pt[]) {
      const [a0, a1] = project(A, ax);
      const [b0, b1] = project(B, ax);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

/** Does the segment p→q come within `r` of the box? (Liang–Barsky against the grown box.) */
export function segmentHitsObb(b: OBB, p: Pt, q: Pt, r: number) {
  const [x0, z0] = obbLocal(b, p[0], p[1]);
  const [x1, z1] = obbLocal(b, q[0], q[1]);
  const dx = x1 - x0;
  const dz = z1 - z0;
  let t0 = 0;
  let t1 = 1;
  const hw = b.hw + r;
  const hd = b.hd + r;
  for (const [pp, qq] of [[-dx, x0 + hw], [dx, hw - x0], [-dz, z0 + hd], [dz, hd - z0]]) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function distToSegment(x: number, z: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / l2) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

export function distToLine(x: number, z: number, pts: Pt[]) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(x, z, pts[i], pts[i + 1]));
  return best;
}

/** Points every `step` along a polyline, with the unit direction there. */
export function along(pts: Pt[], step: number): { p: Pt; dir: Pt; s: number }[] {
  const out: { p: Pt; dir: Pt; s: number }[] = [];
  let s = 0;
  let next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!l) continue;
    const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    while (next <= s + l) {
      const k = next - s;
      out.push({ p: [a[0] + dir[0] * k, a[1] + dir[1] * k], dir, s: next });
      next += step;
    }
    s += l;
  }
  return out;
}

export function polyLength(pts: Pt[]) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
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

/** A polar arc from `t0` to `t1` at distance `d` from the palace. */
function arc(d: number, t0: number, t1: number, step = 0.05): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / step) + 1);
  return Array.from({ length: n }, (_, i) => polar(d, t0 + ((t1 - t0) * i) / (n - 1)));
}

// ---------- the plan ----------

export type LotKind = "house" | "tavern" | "arcanum" | "belltower" | "palace" | "gatehouse" | "tower";
export interface Lot extends OBB {
  kind: LotKind;
  floors: number;
  wall: Token;
  roof: Token;
  /** lowest and highest ground under the footprint */
  low: number;
  high: number;
  seed: number;
}

export interface Street { id: string; pts: Pt[]; w: number; paving: "avenue" | "lane" | "alley" }
export interface Plaza { id: string; x: number; z: number; r: number }
export type PlaceId = "gate" | "square" | "tavern" | "narrows" | "arcanum" | "range" | "belltower" | "palace";
export interface PlanPlace { id: PlaceId; label: string; icon: "gate" | "fountain" | "tavern" | "star" | "shop" | "tower" | "castle"; x: number; z: number }
/** where a keeper or activity stands, and where you stand to use it */
export interface Spot { id: string; keeper: Pt; yaw: number; use: Pt }

export interface KingdomPlan {
  coast: number[];
  streets: Street[];
  plazas: Plaza[];
  lots: Lot[];
  objects: Placed[];
  /** the curtain wall around the lower town, as runs of points, with its towers */
  curtain: Pt[][];
  towers: Circle[];
  gate: { at: Pt; inside: Pt; dir: Pt; rot: number };
  /** where the bridge from the portal islet meets the island */
  isletDir: Pt;
  spawn: Pt;
  places: PlanPlace[];
  spots: Spot[];
  /** spell range targets hover over this court */
  range: { x: number; z: number; r: number };
  /** tavern tables (seats are benches in `objects`) */
  tables: Pt[];
  /** where townsfolk stroll */
  routes: Pt[][];
  /** the walk mask's extra parts: cliff bands (holes), building and wall boxes, round solids */
  holes: Pt[][];
  boxes: OBB[];
  circles: Circle[];
  /** waterfalls: from a lip on the island to far below */
  falls: { at: Pt; dir: Pt; top: number; w: number }[];
  /** trees, drawn instanced rather than as placed objects (there are a lot of them) */
  trees: Placed[];
}

let cached: KingdomPlan | null = null;

export function plan(): KingdomPlan {
  return (cached ??= makePlan());
}

/** the bridge to the portal islet arrives at the bottom of the screen, a little right */
export const ISLET_RU: [number, number] = [0.33, -0.94];

function makePlan(): KingdomPlan {
  const rand = rng(SEED);
  const coast = radii("round", SIZE, SEED);
  const edge = (x: number, z: number) => radiusAt(coast, x, z);
  const inside = (x: number, z: number, f: number) => Math.hypot(x, z) < edge(x, z) * f;

  // ---------- the gate ----------
  const [ix, iz] = ru(...ISLET_RU);
  const il = Math.hypot(ix, iz);
  const isletDir: Pt = [ix / il, iz / il];
  const gateR = edge(isletDir[0], isletDir[1]) * 0.93;
  const gateAt: Pt = [isletDir[0] * gateR, isletDir[1] * gateR];
  const gateIn: Pt = [isletDir[0] * (gateR - 4), isletDir[1] * (gateR - 4)];
  const gate = { at: gateAt, inside: gateIn, dir: isletDir, rot: Math.atan2(isletDir[0], isletDir[1]) };

  // ---------- squares and streets ----------
  const square = ru(3, -18);
  const plazas: Plaza[] = [
    { id: "gate", x: gateIn[0], z: gateIn[1], r: 3.2 },
    { id: "square", x: square[0], z: square[1], r: 5.4 },
    { id: "terrace", ...xz(polar(27.4, 0.02)), r: 2.6 },
    { id: "range", ...xz(polar(13.5, 0.52)), r: 3.9 },
    { id: "forecourt", ...xz(polar(3.4, 0)), r: 4.6 },
    { id: "bell", ...xz(polar(13.6, 1.04)), r: 2.2 },
    { id: "arcanum", ...xz(polar(13.6, -0.95)), r: 2.6 },
  ];
  const [r1, r2, r3, r4, r5] = RAMPS;
  const avenue: Pt[] = [
    gateAt, gateIn, ru(7.6, -22.5), ru(7.6, -18.4), ru(6.9, -14.2), r1.b, r1.t,
    polar(24.8, 0.27), polar(24, 0.2), ...arc(24, 0.14, -0.34), polar(23, -0.4), r3.b, r3.t,
    polar(13.7, -0.36), ...arc(13.5, -0.3, -0.06), polar(12.3, -0.015), r5.b, r5.t, polar(2.2, 0),
  ];
  const streets: Street[] = [
    { id: "avenue", pts: avenue, w: 3.2, paving: "avenue" },
    // lower town
    { id: "west-lane", pts: [ru(1.2, -22.6), ru(-5.6, -18.8), ru(-11.5, -12.2), ru(-16.4, -8.4), r2.b], w: 2.2, paving: "lane" },
    { id: "east-lane", pts: [ru(7.6, -18.4), ru(10.4, -17.4), ru(15.4, -14.4), ru(19.6, -9.6), ru(21.6, -4.8)], w: 2.0, paving: "lane" },
    { id: "south-lane", pts: [gateIn, ru(1.4, -26.6), ru(-6.6, -25.6), ru(-13.4, -21.2), ru(-18.6, -15.6)], w: 1.8, paving: "lane" },
    { id: "west-wall-lane", pts: [ru(-16.4, -8.4), ru(-20.6, -12.6), ru(-22.4, -18.2), ru(-18.6, -22.4)], w: 1.6, paving: "alley" },
    { id: "east-wall-lane", pts: [ru(15.4, -14.4), ru(18.8, -19.6), ru(16.2, -24.6), ru(10.8, -26.2)], w: 1.6, paving: "alley" },
    { id: "lower-alley", pts: [ru(-11.5, -12.2), ru(-7.6, -6.6), ru(-1.8, -6.8), ru(4.6, -10.8), ru(6.9, -14.2)], w: 1.5, paving: "alley" },
    // middle town: the avenue's arc, the Narrows beyond it, alleys down to the walls
    { id: "narrows-west", pts: [polar(24, -0.36), ...arc(24, -0.44, -1.1)], w: 1.6, paving: "alley" },
    { id: "narrows-east", pts: [polar(24.4, 0.3), ...arc(24.2, 0.36, 1.1)], w: 1.6, paving: "alley" },
    { id: "stair-west", pts: [r2.t, polar(25.2, -0.62), polar(24, -0.62)], w: 1.4, paving: "alley" },
    { id: "stair-east", pts: [polar(24.2, 0.74), polar(22.2, 0.74), r4.b], w: 1.4, paving: "alley" },
    { id: "alley-a", pts: [polar(24, -0.2), polar(28.2, -0.24)], w: 1.3, paving: "alley" },
    { id: "alley-b", pts: [polar(24.2, 0.52), polar(28.4, 0.5)], w: 1.3, paving: "alley" },
    { id: "alley-c", pts: [polar(24, -0.86), polar(19.8, -0.88)], w: 1.3, paving: "alley" },
    // upper town: east to the spell range and the bell tower, west to the Arcanum
    { id: "upper-east", pts: [polar(12.3, -0.015), polar(13.2, 0.2), ...arc(13.5, 0.3, 1.0), r4.t], w: 2.2, paving: "lane" },
    { id: "upper-west", pts: [polar(13.6, -0.36), ...arc(13.6, -0.46, -0.95)], w: 2.2, paving: "lane" },
  ];

  // ---------- lots: the landmarks first, then houses packed along every street ----------
  const lots: Lot[] = [];
  const reserved: (OBB | Circle)[] = [...plazas.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.2 }))];
  const footprint = (b: OBB) => {
    const pts = [...obbCorners(b), [b.x, b.z] as Pt];
    const h = pts.map(([x, z]) => groundAt(x, z));
    return { low: Math.min(...h), high: Math.max(...h) };
  };
  const landmark = (kind: LotKind, at: Pt, w: number, d: number, rot: number, floors: number, wall: Token, roof: Token) => {
    const b: OBB = { x: at[0], z: at[1], hw: w / 2, hd: d / 2, rot };
    const lot: Lot = { ...b, kind, floors, wall, roof, ...footprint(b), seed: Math.floor(rand() * 1e6) };
    lots.push(lot);
    return lot;
  };
  /** yaw that turns a building's front towards the camera-ward side of the palace's rings */
  const facing = (theta: number) => {
    const [ax, az] = polar(1, theta);
    const [bx, bz] = polar(0, theta);
    return Math.atan2(ax - bx, az - bz);
  };
  const tavern = landmark("tavern", polar(20.4, 0.02), 6.6, 3.2, facing(0.02), 2, "plaster", "roof-red");
  const arcanum = landmark("arcanum", polar(11.0, -0.95), 6.4, 2.8, facing(-0.95), 2, "stone", "roof-plum");
  const bell = landmark("belltower", polar(11.2, 1.04), 2.4, 2.4, facing(1.04), 6, "stone", "slate");
  landmark("palace", ru(0, 25.2), 8.6, 6.4, facing(0), 3, "stone", "slate");
  landmark("gatehouse", gateAt, 5.2, 2.2, gate.rot, 2, "stone", "slate");
  reserved.push(...lots);

  const zonesOk = (b: OBB) => {
    const pts = [...obbCorners(b), [b.x, b.z] as Pt];
    const zones = new Set<number>();
    for (const [x, z] of pts) {
      const { d } = toPolar(x, z);
      if (WALLS.some((R) => Math.abs(d - R) < WALL_HALF + 0.2)) return false;
      zones.add(zoneOf(d));
    }
    return zones.size === 1 && !zones.has(0);
  };
  const rampBoxes: OBB[] = RAMPS.map((rp) => ({ x: (rp.b[0] + rp.t[0]) / 2, z: (rp.b[1] + rp.t[1]) / 2, hw: rp.w / 2 + RAMP_WALL + 0.5, hd: rp.len / 2 + 0.6, rot: rp.rot }));
  const fits = (b: OBB) => {
    const corners = obbCorners(b);
    if (!corners.every(([x, z]) => inside(x, z, 0.86))) return false;
    if (!zonesOk(b)) return false;
    if (rampBoxes.some((r) => obbOverlap(b, r))) return false;
    for (const r of reserved) {
      if ("r" in r) {
        const [lx, lz] = obbLocal(b, r.x, r.z);
        if (Math.hypot(Math.max(Math.abs(lx) - b.hw, 0), Math.max(Math.abs(lz) - b.hd, 0)) < r.r) return false;
      } else if (obbOverlap(b, r, 0.12)) return false;
    }
    for (const s of streets) for (let i = 0; i < s.pts.length - 1; i++) if (segmentHitsObb(b, s.pts[i], s.pts[i + 1], s.w / 2 + 0.06)) return false;
    return true;
  };
  const WALLS_T: Token[] = ["plaster", "plaster", "plaster-rose", "plaster-sky", "plaster-sage", "cream", "stone", "plaster-gold"];
  const ROOFS_T: Token[] = ["roof-red", "roof-red", "slate", "roof-teal", "roof-plum", "terracotta", "slate"];
  for (const st of streets) {
    const len = polyLength(st.pts);
    const samples = along(st.pts, 0.1);
    const at = (s: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.round(s / 0.1)))];
    for (const side of [-1, 1]) {
      let s = 0.4 + rand();
      while (s < len - 1) {
        const w = 2.0 + rand() * 1.3;
        const here = at(s + w / 2);
        const n: Pt = [here.dir[1] * side, -here.dir[0] * side];
        let placed = false;
        for (const depth of [3.0 + rand() * 0.6, 2.6, 2.2]) {
          const off = st.w / 2 + 0.12 + depth / 2;
          const b: OBB = { x: here.p[0] + n[0] * off, z: here.p[1] + n[1] * off, hw: w / 2, hd: depth / 2, rot: Math.atan2(-n[0], -n[1]) };
          if (!fits(b)) continue;
          const zone = zoneOf(toPolar(b.x, b.z).d);
          const lot: Lot = {
            ...b, kind: "house",
            floors: zone === 3 ? 1 + Math.floor(rand() * 2.2) : 2 + Math.floor(rand() * 1.6),
            wall: WALLS_T[Math.floor(rand() * WALLS_T.length)],
            roof: ROOFS_T[Math.floor(rand() * ROOFS_T.length)],
            ...footprint(b), seed: Math.floor(rand() * 1e6),
          };
          lots.push(lot);
          reserved.push(lot);
          placed = true;
          break;
        }
        // most houses touch; now and then a gap wide enough to squeeze through
        s += placed ? w + (rand() < 0.28 ? 1.1 + rand() * 0.5 : 0.04 + rand() * 0.2) : 0.6;
      }
    }
  }

  // backfill: houses packed in behind the street fronts, turned like their nearest street
  for (let tries = 0, made = 0; tries < 6000 && made < 110; tries++) {
    const a = rand() * TAU;
    const dd = 6 + Math.sqrt(rand()) * 30;
    const x = Math.cos(a) * dd;
    const z = Math.sin(a) * dd;
    let best: { dir: Pt; dist: number } | null = null;
    for (const st of streets) {
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = st.pts[i];
        const [bx, bz] = st.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        if (!l) continue;
        const dist = distToLine(x, z, [st.pts[i], st.pts[i + 1]]);
        if (!best || dist < best.dist) best = { dir: [(bx - ax) / l, (bz - az) / l], dist };
      }
    }
    if (!best || best.dist > 9) continue;
    const w = 2.0 + rand() * 1.2;
    const depth = 2.2 + rand() * 0.9;
    const b: OBB = { x, z, hw: w / 2, hd: depth / 2, rot: Math.atan2(best.dir[1], -best.dir[0]) };
    if (!fits(b)) continue;
    const zone = zoneOf(toPolar(x, z).d);
    const lot: Lot = {
      ...b, kind: "house", floors: zone === 3 ? 1 + Math.floor(rand() * 2.2) : 2 + Math.floor(rand() * 1.6),
      wall: WALLS_T[Math.floor(rand() * WALLS_T.length)], roof: ROOFS_T[Math.floor(rand() * ROOFS_T.length)],
      ...footprint(b), seed: Math.floor(rand() * 1e6),
    };
    lots.push(lot);
    reserved.push(lot);
    made++;
  }

  // ---------- the curtain wall around the lower town ----------
  const curtain: Pt[][] = [];
  const towers: Circle[] = [];
  {
    let run: Pt[] = [];
    const N = 120;
    const gateA = Math.atan2(isletDir[1], isletDir[0]);
    for (let i = 0; i <= N; i++) {
      const a = gateA + (i / N) * TAU;
      const vx = Math.cos(a);
      const vz = Math.sin(a);
      const R = radiusAt(coast, vx, vz) * 0.93;
      const p: Pt = [vx * R, vz * R];
      const low = toPolar(p[0], p[1]).d > WALLS[2] + 1.6;
      const nearGate = Math.hypot(p[0] - gateAt[0], p[1] - gateAt[1]) < 2.7;
      if (low && !nearGate) run.push(p);
      else if (run.length) {
        if (run.length > 1) curtain.push(run);
        run = [];
      }
    }
    if (run.length > 1) curtain.push(run);
    for (const r of curtain) {
      const pts = along(r, 9.5);
      for (const { p } of pts) towers.push({ x: p[0], z: p[1], r: 1.15 });
      const last = r[r.length - 1];
      towers.push({ x: last[0], z: last[1], r: 1.15 });
    }
  }
  const gateSide: Pt = [isletDir[1], -isletDir[0]];
  for (const k of [-1, 1]) towers.push({ x: gateAt[0] + gateSide[0] * 3.3 * k, z: gateAt[1] + gateSide[1] * 3.3 * k, r: 1.45 });

  // ---------- props ----------
  const objects: Placed[] = [];
  const free = (x: number, z: number, r: number) =>
    inside(x, z, 0.84) &&
    !lots.some((l) => insideObb(l, x, z, r)) &&
    !rampBoxes.some((b) => insideObb(b, x, z, r)) &&
    !WALLS.some((R) => Math.abs(toPolar(x, z).d - R) < WALL_HALF + r + 0.1) &&
    !towers.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r) &&
    objects.every((o) => Math.hypot(o.x - x, o.z - z) > r + 0.6);
  const clearOfStreets = (x: number, z: number, r: number) => streets.every((s) => distToLine(x, z, s.pts) > s.w / 2 + r);
  const put = (kind: Kind, at: Pt, rot = FACE, scale = 1) => objects.push({ id: `${kind}-${objects.length}`, kind, x: at[0], z: at[1], rot, scale });

  // the market square: a wishing fountain and four merchants' stalls facing it
  put("fountain", square, FACE, 1.1);
  const stallAngles = [-2.3, -1.5, -0.7, 0.05];
  const stallSpots: Pt[] = stallAngles.map((a) => {
    const [ox, oz] = ru(Math.sin(a) * 4.3, Math.cos(a) * 4.3);
    return [square[0] + ox, square[1] + oz];
  });
  stallSpots.forEach((p) => put("stall_booth", p, Math.atan2(square[0] - p[0], square[1] - p[1])));
  const rel = (r: number, u: number): Pt => [square[0] + ru(r, u)[0], square[1] + ru(r, u)[1]];
  put("notice_board", rel(-5.6, 1.8), FACE);
  for (const p of [rel(-0.9, -3.8), rel(2.6, 3.4)]) put("bench", p, Math.atan2(square[0] - p[0], square[1] - p[1]));

  // the tavern terrace: tables with benches either side
  const terrace = plazas.find((p) => p.id === "terrace")!;
  const tables: Pt[] = [];
  for (const k of [-1, 0, 1]) {
    const th = 0.02 + k * 0.085;
    const t = polar(27.0 + (k === 0 ? 0.4 : 0), th);
    tables.push(t);
    const f = facing(th);
    const out: Pt = [Math.sin(f), Math.cos(f)];
    for (const s of [-1, 1]) put("bench", [t[0] + out[0] * 0.95 * s, t[1] + out[1] * 0.95 * s], s > 0 ? f + Math.PI : f, 0.8);
  }
  put("lantern", [terrace.x + 2.2, terrace.z + 0.4], FACE);
  put("lantern", [terrace.x - 0.4, terrace.z + 2.2], FACE);

  // lamps along the avenue, on alternating sides
  {
    let flip = 1;
    for (const { p, dir } of along(avenue, 6.5).slice(1)) {
      const n: Pt = [dir[1] * flip, -dir[0] * flip];
      const at: Pt = [p[0] + n[0] * 1.95, p[1] + n[1] * 1.95];
      flip = -flip;
      if (!rampAt(at[0], at[1]) && free(at[0], at[1], 0.2)) put("lamp_post", at, FACE);
    }
  }
  // crystal lamps and statues flank the grand stair; the forecourt gets gardens
  {
    const rp = RAMPS[4];
    for (const s of [-1, 1]) {
      for (const [a, kind] of [[-0.6, "statue_column"], [rp.len + 0.7, "crystal_lamp"]] as const) {
        const at: Pt = [rp.b[0] + rp.axis[0] * a + rp.side[0] * (rp.w / 2 + 1.0) * s, rp.b[1] + rp.axis[1] * a + rp.side[1] * (rp.w / 2 + 1.0) * s];
        put(kind, at, FACE);
      }
    }
    for (const t of [-0.75, 0.75]) put("flower_bed", polar(4.6, t), facing(t) + Math.PI / 2);
    for (const t of [-1.25, 1.25]) put("crystal_lamp", polar(5.2, t), FACE);
  }
  // a bench and lamps at the range, crystal lamps by the Arcanum
  put("crystal_lamp", polar(13.4, 0.18), FACE);
  put("bench", polar(10.7, 0.5), facing(0.5), 1);
  for (const t of [-0.8, -1.1]) put("crystal_lamp", polar(15.6, t), FACE);
  put("signpost", rel(5.0, 3.4), FACE);
  // trees in whatever green is left, cypresses up the hill, round trees below; gardens behind the palace
  for (let i = 0, tries = 0; i < 70 && tries < 2400; tries++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * 36;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!free(x, z, 0.7) || !clearOfStreets(x, z, 0.8) || plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.8) || rampAt(x, z)) continue;
    const zone = zoneOf(toPolar(x, z).d);
    if (zone === 0 && Math.hypot(x - PALACE[0], z - PALACE[1]) < 7.4) continue;
    const kind: Kind = zone <= 1 ? (rand() < 0.7 ? "tree_cypress_2" : "tree_cypress_0") : rand() < 0.5 ? "tree_round_2" : rand() < 0.5 ? "tree_round_0" : "tree_cypress_0";
    put(kind, [x, z], rand() * TAU, 0.85 + rand() * 0.35);
    i++;
  }
  // flower beds and planters tucked against walls
  for (let i = 0, tries = 0; i < 18 && tries < 900; tries++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * 32;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!free(x, z, 0.5) || !clearOfStreets(x, z, 0.1) || plazas.some((p) => Math.hypot(p.x - x, p.z - z) < p.r)) continue;
    put(rand() < 0.5 ? "flower_bed" : "pot", [x, z], rand() * TAU);
    i++;
  }

  // ---------- keepers and activities ----------
  const front = (l: Lot, d: number): Pt => [l.x + Math.sin(l.rot) * (l.hd + d), l.z + Math.cos(l.rot) * (l.hd + d)];
  const spots: Spot[] = [];
  stallSpots.forEach((p, i) => {
    const rot = Math.atan2(square[0] - p[0], square[1] - p[1]);
    const f: Pt = [Math.sin(rot), Math.cos(rot)];
    spots.push({ id: `stall-${i}`, keeper: [p[0] - f[0] * 0.2, p[1] - f[1] * 0.2], yaw: rot, use: [p[0] + f[0] * 1.5, p[1] + f[1] * 1.5] });
  });
  spots.push({ id: "tavern", keeper: front(tavern, 0.55), yaw: tavern.rot, use: front(tavern, 1.7) });
  spots.push({ id: "arcanum", keeper: front(arcanum, 0.55), yaw: arcanum.rot, use: front(arcanum, 1.7) });
  spots.push({ id: "bell", keeper: front(bell, 0.6), yaw: bell.rot, use: front(bell, 1.2) });
  const rangeC = plazas.find((p) => p.id === "range")!;
  const rangeStone = polar(16.7, 0.36);
  spots.push({ id: "range", keeper: rangeStone, yaw: facing(0.36) + Math.PI, use: polar(15.6, 0.36) });
  spots.push({ id: "steward", keeper: polar(0.6, 0.0), yaw: facing(0), use: polar(1.8, 0) });
  spots.push({ id: "fountain", keeper: square, yaw: 0, use: [square[0] + ru(0, -2.4)[0], square[1] + ru(0, -2.4)[1]] });

  // ---------- walk mask parts ----------
  const holes: Pt[][] = [];
  for (let k = 0; k < WALLS.length; k++) {
    const R = WALLS[k];
    for (const [a0, a1] of wallRuns(k)) {
      const out = arc(R + WALL_HALF, a0, a1, 0.03);
      const inn = arc(R - WALL_HALF, a1, a0, 0.03);
      holes.push([...out, ...inn]);
    }
  }
  const boxes: OBB[] = lots.filter((l) => l.kind !== "gatehouse").map((l) => ({ x: l.x, z: l.z, hw: l.hw, hd: l.hd, rot: l.rot }));
  // the gatehouse is two piers and an arch you walk under
  for (const k of [-1, 1]) boxes.push({ x: gateAt[0] + gateSide[0] * 1.95 * k, z: gateAt[1] + gateSide[1] * 1.95 * k, hw: 0.75, hd: 1.1, rot: gate.rot });
  for (const rp of RAMPS) {
    for (const s of [-1, 1]) {
      const c: Pt = [(rp.b[0] + rp.t[0]) / 2 + rp.side[0] * (rp.w / 2 + RAMP_WALL / 2) * s, (rp.b[1] + rp.t[1]) / 2 + rp.side[1] * (rp.w / 2 + RAMP_WALL / 2) * s];
      boxes.push({ x: c[0], z: c[1], hw: RAMP_WALL / 2, hd: rp.len / 2, rot: rp.rot });
    }
  }
  for (const run of curtain) {
    for (let i = 0; i < run.length - 1; i++) {
      const [ax, az] = run[i];
      const [bx, bz] = run[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      boxes.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: 0.6, hd: l / 2 + 0.05, rot: Math.atan2(bx - ax, bz - az) });
    }
  }
  const trees = objects.filter((o) => o.kind.startsWith("tree"));
  objects.splice(0, objects.length, ...objects.filter((o) => !o.kind.startsWith("tree")));
  const circles: Circle[] = [...trees.map((t) => ({ x: t.x, z: t.z, r: 0.4 * t.scale })), ...towers, ...tables.map(([x, z]) => ({ x, z, r: 0.5 })), { x: rangeStone[0], z: rangeStone[1], r: 0.45 }];
  // the palace's corner towers and great tower stand on the summit
  const palace = lots.find((l) => l.kind === "palace")!;
  for (const [lx, lz, r] of palaceTowers()) {
    const c = Math.cos(palace.rot);
    const s = Math.sin(palace.rot);
    circles.push({ x: palace.x + lx * c + lz * s, z: palace.z - lx * s + lz * c, r });
  }

  // ---------- places, routes, waterfalls ----------
  const places: PlanPlace[] = [
    { id: "gate", label: "City gate", icon: "gate", x: gateIn[0], z: gateIn[1] },
    { id: "square", label: "Market square", icon: "fountain", ...xz(spots.find((s) => s.id === "fountain")!.use) },
    { id: "tavern", label: "The Gilded Griffin", icon: "tavern", ...xz(front(tavern, 2.4)) },
    { id: "narrows", label: "The Narrows", icon: "star", ...xz(polar(24, -0.8)) },
    { id: "arcanum", label: "Royal Arcanum", icon: "shop", ...xz(front(arcanum, 2.0)) },
    { id: "range", label: "Spell range", icon: "star", ...xz(spots.find((s) => s.id === "range")!.use) },
    { id: "belltower", label: "Bell tower", icon: "tower", ...xz(front(bell, 1.6)) },
    { id: "palace", label: "Palace of Aether", icon: "castle", ...xz(polar(5.6, 0)) },
  ];
  const routes = [avenue.slice(1), ...streets.filter((s) => s.id !== "avenue").map((s) => s.pts)];
  const falls = [
    { theta: -1.38, d: 24 },
    { theta: 1.32, d: 13 },
  ].map(({ theta, d }) => {
    const p = polar(d, theta);
    const l = Math.hypot(p[0], p[1]);
    const dir: Pt = [p[0] / l, p[1] / l];
    const e = edge(dir[0], dir[1]);
    return { at: [dir[0] * e, dir[1] * e] as Pt, dir, top: groundAt(dir[0] * e * 0.97, dir[1] * e * 0.97), w: 1.1 };
  });

  return {
    coast, streets, plazas, lots, objects, trees, curtain, towers, gate, isletDir, spawn: [gateIn[0] - isletDir[0] * 0.6, gateIn[1] - isletDir[1] * 0.6],
    places, spots, range: { x: rangeC.x, z: rangeC.z, r: rangeC.r - 0.6 }, tables, routes, holes, boxes, circles, falls,
  };
}

/** Palace towers in the palace lot's own frame: x, z, radius (the great tower is in the middle). */
export function palaceTowers(): [number, number, number][] {
  return [[-4.6, 3.1, 1.25], [4.6, 3.1, 1.25], [-4.2, -3.0, 1.1], [4.2, -3.0, 1.1], [0, -0.4, 2.1]];
}

function xz(p: Pt) {
  return { x: p[0], z: p[1] };
}
