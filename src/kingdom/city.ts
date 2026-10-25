import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE, type Token } from "../core/palette";
import { radiusAt } from "../island/shapes";
import { cutToon } from "../render/cut";
import { toon } from "../render/toon";
import {
  type KingdomPlan,
  type Lot,
  PALACE,
  RAMPS,
  RAMP_WALL,
  type Ramp,
  WALLS,
  WALL_HALF,
  along,
  groundAt,
  hill,
  palaceTowers,
  polar,
  rampAt,
  rampLocal,
  toPolar,
  wallRuns,
} from "./plan";

type Pt = [number, number];
const up = new Vector3(0, 1, 0);
const q = new Quaternion();
/** where the camera looks from, on the ground plane: faces turned this way are the ones you see */
const SEEN = new Vector3(1, 0, 1).normalize();
const FLOOR = 1.45;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1) => new Matrix4().compose(new Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new Vector3(sx, sy, sz));

/** Flat-shaded, position-and-normal only, so anything can be merged with anything. */
function prep(g: BufferGeometry, m?: Matrix4) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(n.attributes)) if (name !== "position") n.deleteAttribute(name);
  if (m) n.applyMatrix4(m);
  n.computeVertexNormals();
  return n;
}

/** Geometry gathered per palette token and merged into one mesh each: the whole city in a few draw calls. */
class Batch {
  private parts = new Map<string, BufferGeometry[]>();
  constructor(private cut: boolean, private shadows = true) {}

  add(token: Token, g: BufferGeometry, m?: Matrix4) {
    const list = this.parts.get(token) ?? [];
    list.push(prep(g, m));
    this.parts.set(token, list);
  }

  /** A box standing on `y` (its bottom), centred on (x, z), turned by `yaw`. */
  box(token: Token, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
    if (sy <= 0) return;
    this.add(token, UNIT_BOX, mat(x, y + sy / 2, z, yaw, sx, sy, sz));
  }

  /** Raw triangles (x, y, z per vertex). */
  tris(token: Token, pos: number[]) {
    if (!pos.length) return;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    this.add(token, g);
  }

  build(): Group {
    const group = new Group();
    for (const [token, list] of this.parts) {
      const merged = mergeGeometries(list);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const material: Material = this.cut ? cutToon(token as never) : toon(token as never);
      const mesh = new Mesh(merged, material);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);

/** A gable roof (or any prism) W wide along x, D deep along z, H high, standing on y = 0. */
function gable(W: number, D: number, H: number) {
  const w = W / 2;
  const d = D / 2;
  const v = (x: number, y: number, z: number) => [x, y, z];
  const pos = [
    // slopes
    ...v(-w, 0, d), ...v(w, 0, d), ...v(w, H, 0), ...v(-w, 0, d), ...v(w, H, 0), ...v(-w, H, 0),
    ...v(w, 0, -d), ...v(-w, 0, -d), ...v(-w, H, 0), ...v(w, 0, -d), ...v(-w, H, 0), ...v(w, H, 0),
  ];
  const ends = [...v(-w, 0, -d), ...v(-w, 0, d), ...v(-w, H, 0), ...v(w, 0, d), ...v(w, 0, -d), ...v(w, H, 0)];
  const slopes = new BufferGeometry();
  slopes.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  const gables = new BufferGeometry();
  gables.setAttribute("position", new BufferAttribute(new Float32Array(ends), 3));
  return { slopes, gables };
}

/** A lot's own frame: local (x, z) → world (x, z). */
function frame(l: { x: number; z: number; rot: number }) {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  return (lx: number, lz: number): Pt => [l.x + lx * c + lz * s, l.z - lx * s + lz * c];
}

/** Things the kingdom animates after the city is built. */
export interface CityParts {
  group: Group;
  /** the great bell, swung when rung */
  bell: Object3D;
  /** the arcane crystal over the palace, and its rune rings */
  crystal: Object3D;
  rings: Object3D[];
  crystalLight: PointLight;
  /** the glowing lines down the avenue */
  ley: MeshBasicMaterial;
  /** little islands drifting around the kingdom */
  floaters: Object3D[];
  /** flower boxes under windows, for butterflies */
  blooms: Vector3[];
}

/** Build every mesh of Aetherhold from its plan. */
export function buildCity(p: KingdomPlan): CityParts {
  const ground = new Batch(false, false);
  const stone = new Batch(false);
  const city = new Batch(true);
  const blooms: Vector3[] = [];

  buildTerrain(p, ground, stone);
  buildWalls(p, stone);
  buildRamps(stone);
  buildPaving(p, ground);
  buildCurtain(p, city);
  for (const l of p.lots) {
    if (l.kind === "house") house(city, l, blooms);
    else if (l.kind === "tavern") tavern(city, l);
    else if (l.kind === "arcanum") arcanum(city, l);
    else if (l.kind === "palace") palace(city, l);
    else if (l.kind === "gatehouse") gatehouse(city, l);
  }
  const bellLot = p.lots.find((l) => l.kind === "belltower")!;
  const bell = belltower(city, bellLot);
  for (const t of p.tables) {
    const y = groundAt(t[0], t[1]);
    city.add("wood", new CylinderGeometry(0.5, 0.5, 0.08, 8), mat(t[0], y + 0.72, t[1]));
    city.add("wood-dark", new CylinderGeometry(0.08, 0.12, 0.7, 6), mat(t[0], y + 0.35, t[1]));
  }
  const rangeStone = p.spots.find((s) => s.id === "range")!.keeper;
  const ry = groundAt(rangeStone[0], rangeStone[1]);
  city.add("rock", new CylinderGeometry(0.35, 0.45, 1.1, 6), mat(rangeStone[0], ry + 0.55, rangeStone[1]));
  city.add("crystal", new OctahedronGeometry(0.22), mat(rangeStone[0], ry + 1.35, rangeStone[1], 0, 1, 1.5, 1));

  const group = new Group();
  group.add(ground.build(), stone.build(), city.build(), bell);
  for (const f of p.falls) group.add(waterfall(f));

  // the arcane crystal over the great tower
  const palaceLot = p.lots.find((l) => l.kind === "palace")!;
  const top = palaceLot.high + 11;
  const crystal = new Group();
  const pl = frame(palaceLot);
  const [gx, gz] = pl(0, -0.4);
  crystal.position.set(gx, top + 3.8, gz);
  const glow = new MeshBasicMaterial({ color: new Color(PALETTE.crystal).multiplyScalar(1.15) });
  const core = new Mesh(new OctahedronGeometry(1, 0), glow);
  core.scale.set(1.3, 2.7, 1.3);
  const inner = new Mesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: new Color("#ffffff").multiplyScalar(1.5) }));
  inner.scale.set(0.5, 1.2, 0.5);
  crystal.add(core, inner);
  const ringMat = new MeshBasicMaterial({ color: new Color(PALETTE.gold).multiplyScalar(1.25) });
  const runeGeo = new OctahedronGeometry(0.16, 0);
  const rings: Object3D[] = [];
  [[2.1, 0.5, 0], [2.7, -0.35, 0.6], [3.3, 0.15, -0.9]].forEach(([r, tilt, roll], i) => {
    const ring = new Group();
    ring.add(new Mesh(new TorusGeometry(r, 0.05, 4, 72), ringMat));
    for (let k = 0; k < 10 + i * 4; k++) {
      const a = (k / (10 + i * 4)) * Math.PI * 2;
      const rune = new Mesh(runeGeo, ringMat);
      rune.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      rune.scale.set(1, 1.8, 0.5);
      rune.rotation.z = a;
      ring.add(rune);
    }
    ring.rotation.set(Math.PI / 2 + tilt, roll, 0);
    crystal.add(ring);
    rings.push(ring);
  });
  // a column of faint light from the tower to the crystal
  const beam = new Mesh(new CylinderGeometry(0.45, 1.3, 4.6, 12, 1, true), new MeshBasicMaterial({ color: "#9fe8ff", transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }));
  beam.position.set(0, -2.3, 0);
  crystal.add(beam);
  const crystalLight = new PointLight(PALETTE.crystal, 0, 26, 1.4);
  crystalLight.position.copy(crystal.position);
  group.add(crystal, crystalLight);

  // ley lines: a dashed glowing line down the middle of the avenue
  const ley = new MeshBasicMaterial({ color: new Color("#8fe9ff") });
  const avenue = p.streets.find((s) => s.id === "avenue")!;
  const leyPos: number[] = [];
  const pts = along(avenue.pts.slice(3), 0.3);
  for (let i = 0; i < pts.length - 1; i++) {
    if (i % 4 === 3) continue;
    const a = pts[i];
    const b = pts[i + 1];
    if (rampAt(a.p[0], a.p[1])?.steps) continue;
    const n: Pt = [a.dir[1] * 0.08, -a.dir[0] * 0.08];
    const ya = groundAt(a.p[0], a.p[1]) + 0.05;
    const yb = groundAt(b.p[0], b.p[1]) + 0.05;
    leyPos.push(a.p[0] - n[0], ya, a.p[1] - n[1], b.p[0] - n[0], yb, b.p[1] - n[1], b.p[0] + n[0], yb, b.p[1] + n[1]);
    leyPos.push(a.p[0] - n[0], ya, a.p[1] - n[1], b.p[0] + n[0], yb, b.p[1] + n[1], a.p[0] + n[0], ya, a.p[1] + n[1]);
  }
  const leyGeo = new BufferGeometry();
  leyGeo.setAttribute("position", new BufferAttribute(new Float32Array(leyPos), 3));
  group.add(new Mesh(leyGeo, ley));

  return { group, bell, crystal, rings, crystalLight, ley, floaters: floaters(group), blooms };
}

// ---------- the hill ----------

/** The terrain mesh dips to a ramp's surface under the ramp's walls, so no slope pokes through. */
function meshH(x: number, z: number) {
  const h = hill(toPolar(x, z).d);
  for (const rp of RAMPS) {
    const { a, c } = rampLocal(rp, x, z);
    if (a >= -0.05 && a <= rp.len + 0.05 && Math.abs(c) <= rp.w / 2 + RAMP_WALL + 0.05) return Math.min(h, rp.hb + ((rp.ht - rp.hb) * Math.min(Math.max(a, 0), rp.len)) / rp.len - (rp.steps ? 0.45 : 0.04));
  }
  return h;
}

/** Rings around the palace, so every cliff lines up with a ring of vertices; clipped to the coast. */
function buildTerrain(p: KingdomPlan, ground: Batch, stone: Batch) {
  const N = 512;
  const inside = (x: number, z: number) => Math.hypot(x, z) < radiusAt(p.coast, x, z);
  const ds: number[] = [];
  for (let d = 0.35; d < 70; d += 0.4) ds.push(d);
  for (const R of WALLS) ds.push(R - WALL_HALF - 0.02, R - 0.15, R, R + 0.15, R + WALL_HALF + 0.02);
  ds.sort((a, b) => a - b);
  const D: number[] = [];
  for (let j = 0; j < N; j++) {
    const t = (j / N) * Math.PI * 2;
    let lo = 0;
    let hi = 0.5;
    while (hi < 80 && inside(...polar(hi, t))) {
      lo = hi;
      hi += 0.5;
    }
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2;
      if (inside(...polar(m, t))) lo = m;
      else hi = m;
    }
    D.push(lo);
  }
  const vert = (j: number, i: number) => {
    const t = ((j % N) / N) * Math.PI * 2;
    const d = i < 0 ? 0 : Math.min(ds[i], D[j % N]);
    const [x, z] = polar(d, t);
    return new Vector3(x, meshH(x, z), z);
  };
  const by = new Map<Token, number[]>();
  const push = (a: Vector3, b: Vector3, c: Vector3) => {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    const area = n.length();
    if (area < 1e-6) return;
    n.divideScalar(area);
    if (n.y < 0) [b, c] = [c, b];
    const ny = Math.abs(n.y);
    const mx = (a.x + b.x + c.x) / 3;
    const mz = (a.z + b.z + c.z) / 3;
    const noise = Math.sin(mx * 0.37 + mz * 0.21) + Math.sin(mx * 0.13 - mz * 0.29);
    const token: Token = ny < 0.55 ? "rock" : ny < 0.86 || noise > 0.9 ? "turf" : "grass";
    const list = by.get(token) ?? [];
    list.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    by.set(token, list);
  };
  const rows: Vector3[][] = [];
  for (let j = 0; j <= N; j++) rows.push([vert(j, -1), ...ds.map((_, i) => vert(j, i))]);
  for (let j = 0; j < N; j++) {
    const A = rows[j];
    const B = rows[j + 1];
    for (let i = 0; i < A.length - 1; i++) {
      push(A[i], B[i], B[i + 1]);
      push(A[i], B[i + 1], A[i + 1]);
    }
  }
  for (const [token, pos] of by) ground.tris(token, pos);

  // the skirt: from the coast's grass down to the floating rock below
  const skirt: number[] = [];
  const lip: number[] = [];
  for (let j = 0; j < N; j++) {
    const a = rows[j][rows[j].length - 1];
    const b = rows[j + 1][rows[j + 1].length - 1];
    const a0 = a.clone().setY(-0.3);
    const b0 = b.clone().setY(-0.3);
    skirt.push(a.x, a.y, a.z, a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a.x, a.y, a.z, b0.x, b0.y, b0.z, b.x, b.y, b.z);
    // a darker grass lip along the top edge
    const ad = a.clone().setY(a.y - 0.35);
    const bd = b.clone().setY(b.y - 0.35);
    lip.push(a.x, a.y, a.z, ad.x, ad.y, ad.z, bd.x, bd.y, bd.z, a.x, a.y, a.z, bd.x, bd.y, bd.z, b.x, b.y, b.z);
  }
  // the skirt faces outwards: flip any triangle whose normal points at the island's centre
  const outwards = (pos: number[]) => {
    for (let k = 0; k < pos.length; k += 9) {
      const a = new Vector3(pos[k], pos[k + 1], pos[k + 2]);
      const b = new Vector3(pos[k + 3], pos[k + 4], pos[k + 5]);
      const c = new Vector3(pos[k + 6], pos[k + 7], pos[k + 8]);
      const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (n.x * a.x + n.z * a.z < 0) for (let m = 0; m < 3; m++) [pos[k + 3 + m], pos[k + 6 + m]] = [pos[k + 6 + m], pos[k + 3 + m]];
    }
    return pos;
  };
  stone.tris("rock", outwards(skirt));
  stone.tris("turf", outwards(lip.map((v, i) => (i % 3 === 1 ? v : v * 1.004))));
}

// ---------- retaining walls, ramps, stairs ----------

function buildWalls(p: KingdomPlan, stone: Batch) {
  const onIsland = (x: number, z: number) => Math.hypot(x, z) < radiusAt(p.coast, x, z) * 0.995;
  WALLS.forEach((R, k) => {
    const low = hill(R + 0.8);
    const high = hill(R - 0.8);
    const top = high + 0.5;
    for (const [a0, a1] of wallRuns(k)) {
      const n = Math.max(2, Math.ceil(((a1 - a0) * R) / 0.7));
      const ring = (d: number, t: number) => polar(d, t);
      const pos: number[] = [];
      const capPos: number[] = [];
      for (let i = 0; i < n; i++) {
        const t0 = a0 + ((a1 - a0) * i) / n;
        const t1 = a0 + ((a1 - a0) * (i + 1)) / n;
        const [mx, mz] = ring(R, (t0 + t1) / 2);
        if (!onIsland(mx, mz)) continue;
        const o0 = ring(R + WALL_HALF, t0);
        const o1 = ring(R + WALL_HALF, t1);
        const i0 = ring(R - WALL_HALF, t0);
        const i1 = ring(R - WALL_HALF, t1);
        const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
        // outer face, top, inner face
        quad(pos, [o0[0], low - 0.6, o0[1]], [o1[0], low - 0.6, o1[1]], [o1[0], top, o1[1]], [o0[0], top, o0[1]]);
        quad(capPos, [o0[0], top, o0[1]], [o1[0], top, o1[1]], [i1[0], top, i1[1]], [i0[0], top, i0[1]]);
        quad(pos, [i0[0], top, i0[1]], [i1[0], top, i1[1]], [i1[0], high - 0.3, i1[1]], [i0[0], high - 0.3, i0[1]]);
        // merlons along the outer edge, a buttress now and then
        const [ox, oz] = ring(R + WALL_HALF - 0.15, (t0 + t1) / 2);
        const yaw = Math.atan2(o1[0] - o0[0], o1[1] - o0[1]);
        if (i % 2 === 0) stone.box("stone", ox, top, oz, 0.3, 0.38, 0.42, yaw);
        if (i % 7 === 3) {
          const [bx, bz] = ring(R + WALL_HALF + 0.22, (t0 + t1) / 2);
          stone.box("stone-dark", bx, low - 0.6, bz, 0.5, top - low + 0.3, 0.6, yaw);
        }
      }
      // faces must point away from the palace on the outside, towards it on the inside: fix winding by normal
      stone.tris("stone", orient(pos, (x, z) => {
        const { d } = toPolar(x, z);
        return d > R ? 1 : -1;
      }));
      stone.tris("stone-dark", capPos.length ? upwards(capPos) : capPos);
    }
  });
}

/** Flip triangles so their normals point away from the palace (sign 1) or towards it (-1), horizontally. */
function orient(pos: number[], side: (x: number, z: number) => number) {
  for (let k = 0; k < pos.length; k += 9) {
    const a = new Vector3(pos[k], pos[k + 1], pos[k + 2]);
    const b = new Vector3(pos[k + 3], pos[k + 4], pos[k + 5]);
    const c = new Vector3(pos[k + 6], pos[k + 7], pos[k + 8]);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    const mx = (a.x + b.x + c.x) / 3;
    const mz = (a.z + b.z + c.z) / 3;
    const out = new Vector3(mx - PALACE[0], 0, mz - PALACE[1]).multiplyScalar(side(mx, mz));
    if (n.dot(out) < 0) for (let m = 0; m < 3; m++) [pos[k + 3 + m], pos[k + 6 + m]] = [pos[k + 6 + m], pos[k + 3 + m]];
  }
  return pos;
}

function upwards(pos: number[]) {
  for (let k = 0; k < pos.length; k += 9) {
    const a = new Vector3(pos[k], pos[k + 1], pos[k + 2]);
    const n = new Vector3(pos[k + 3], pos[k + 4], pos[k + 5]).sub(a).cross(new Vector3(pos[k + 6], pos[k + 7], pos[k + 8]).sub(a));
    if (n.y < 0) for (let m = 0; m < 3; m++) [pos[k + 3 + m], pos[k + 6 + m]] = [pos[k + 6 + m], pos[k + 3 + m]];
  }
  return pos;
}

function rampH(rp: Ramp, a: number) {
  return rp.hb + ((rp.ht - rp.hb) * Math.min(Math.max(a, 0), rp.len)) / rp.len;
}

function buildRamps(stone: Batch) {
  for (const rp of RAMPS) {
    const at = (a: number, c: number): Pt => [rp.b[0] + rp.axis[0] * a + rp.side[0] * c, rp.b[1] + rp.axis[1] * a + rp.side[1] * c];
    const grand = rp.wall === 0;
    if (rp.steps) {
      const n = Math.round(rp.len / (grand ? 0.3 : 0.34));
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * rp.len;
        const [x, z] = at(a, 0);
        const y = rampH(rp, (i + 0.75) / n * rp.len);
        stone.box(grand ? "marble" : "stone", x, rp.hb - 0.6, z, rp.w, y - rp.hb + 0.6, rp.len / n + 0.01, rp.rot);
      }
    } else {
      // a cobbled slope: a wedge from the lower terrace up to the top
      const pos: number[] = [];
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const a0 = (i / steps) * rp.len;
        const a1 = ((i + 1) / steps) * rp.len;
        const y0 = rampH(rp, a0) + 0.03;
        const y1 = rampH(rp, a1) + 0.03;
        const [l0x, l0z] = at(a0, -rp.w / 2);
        const [r0x, r0z] = at(a0, rp.w / 2);
        const [l1x, l1z] = at(a1, -rp.w / 2);
        const [r1x, r1z] = at(a1, rp.w / 2);
        pos.push(l0x, y0, l0z, r0x, y0, r0z, r1x, y1, r1z, l0x, y0, l0z, r1x, y1, r1z, l1x, y1, l1z);
        // under the lower half, a block down to the terrace
        const [cx, cz] = at((a0 + a1) / 2, 0);
        const base = rp.hb - 0.6;
        if (y0 > base + 0.2) stone.box("stone-dark", cx, base, cz, rp.w - 0.02, Math.min(y0, y1) - base - 0.02, rp.len / steps, rp.rot);
      }
      stone.tris("cobble", upwards(pos));
    }
    // walls along both sides, stepping up with the slope and the terrace beside it
    const seg = 0.5;
    for (const s of [-1, 1]) {
      for (let a = 0; a < rp.len - 1e-3; a += seg) {
        const m = a + seg / 2;
        const [x, z] = at(m, s * (rp.w / 2 + RAMP_WALL / 2));
        const [ox, oz] = at(m, s * (rp.w / 2 + RAMP_WALL + 0.4));
        const beside = hill(toPolar(ox, oz).d);
        const ramp = rampH(rp, m);
        const top = Math.max(ramp, beside) + (grand ? 0.75 : 0.55);
        const bottom = Math.min(ramp, beside) - 0.6;
        stone.box(grand ? "marble" : "stone", x, bottom, z, RAMP_WALL, top - bottom, seg + 0.01, rp.rot);
      }
      // a post with a cap at each end
      for (const a of [0, rp.len]) {
        const [x, z] = at(a, s * (rp.w / 2 + RAMP_WALL / 2));
        const y = Math.max(rampH(rp, a), hill(toPolar(x, z).d)) + (grand ? 0.75 : 0.55);
        stone.box("stone-dark", x, y - 0.1, z, RAMP_WALL + 0.12, 0.35, RAMP_WALL + 0.12, rp.rot);
      }
    }
  }
}

// ---------- streets and squares ----------

function buildPaving(p: KingdomPlan, ground: Batch) {
  const tokenOf = { avenue: "cobble", lane: "path", alley: "cobble-dark" } as const;
  for (const st of p.streets) {
    const pos: number[] = [];
    const pts = along(st.pts, 0.35);
    // the last point too
    const last = st.pts[st.pts.length - 1];
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(last[0] - prev.p[0], last[1] - prev.p[1]) > 0.05) pts.push({ p: last, dir: prev.dir, s: prev.s });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ra = rampAt(a.p[0], a.p[1]);
      const rb = rampAt(b.p[0], b.p[1]);
      // the ramps draw their own surface
      if (ra || rb) continue;
      const hw = st.w / 2;
      const na: Pt = [a.dir[1] * hw, -a.dir[0] * hw];
      const nb: Pt = [b.dir[1] * hw, -b.dir[0] * hw];
      const v = (p0: Pt, n: Pt, k: number) => {
        const x = p0[0] + n[0] * k;
        const z = p0[1] + n[1] * k;
        return [x, groundAt(x, z) + 0.035, z];
      };
      const a0 = v(a.p, na, -1), a1 = v(a.p, na, 1), b0 = v(b.p, nb, -1), b1 = v(b.p, nb, 1);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    }
    ground.tris(tokenOf[st.paving], upwards(pos));
  }
  for (const pl of p.plazas) {
    const pos: number[] = [];
    const n = 36;
    const rings = [0, 0.5, 1];
    const v = (k: number, f: number) => {
      const a = (k / n) * Math.PI * 2;
      const x = pl.x + Math.cos(a) * pl.r * f;
      const z = pl.z + Math.sin(a) * pl.r * f;
      return [x, groundAt(x, z) + 0.03, z];
    };
    for (let k = 0; k < n; k++) {
      for (let r = 0; r < rings.length - 1; r++) {
        const a = v(k, rings[r]), b = v(k + 1, rings[r]), c = v(k + 1, rings[r + 1]), d = v(k, rings[r + 1]);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    ground.tris(pl.id === "forecourt" ? "marble" : "cobble", upwards(pos));
  }
}

// ---------- walls round the lower town ----------

function buildCurtain(p: KingdomPlan, city: Batch) {
  for (const run of p.curtain) {
    for (let i = 0; i < run.length - 1; i++) {
      const [ax, az] = run[i];
      const [bx, bz] = run[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const y = Math.min(groundAt(ax, az), groundAt(bx, bz));
      city.box("stone", mx, y - 0.8, mz, 1.2, 3.8, l + 0.08, yaw);
      // merlons on the outer edge
      const out: Pt = [Math.cos(yaw), -Math.sin(yaw)];
      const sgn = out[0] * mx + out[1] * mz > 0 ? 1 : -1;
      for (let k = 0; k < Math.floor(l / 0.9); k++) {
        const t = (k + 0.5) / Math.floor(l / 0.9);
        city.box("stone", ax + (bx - ax) * t + out[0] * 0.45 * sgn, y + 3.0, az + (bz - az) * t + out[1] * 0.45 * sgn, 0.3, 0.4, 0.42, yaw);
      }
    }
  }
  p.towers.forEach((t, i) => {
    const y = groundAt(t.x, t.z);
    const h = t.r > 1.3 ? 6.8 : 5.2;
    city.add("stone", new CylinderGeometry(t.r, t.r * 1.08, h + 0.8, 8), mat(t.x, y - 0.8 + (h + 0.8) / 2, t.z));
    city.add("stone-dark", new CylinderGeometry(t.r + 0.15, t.r + 0.15, 0.35, 8), mat(t.x, y + h, t.z));
    city.add(i % 2 ? "slate" : "roof-red", new ConeGeometry(t.r + 0.35, t.r * 2.2, 8), mat(t.x, y + h + 0.35 + t.r * 1.1, t.z));
    city.add("window", UNIT_BOX, mat(t.x + SEEN.x * t.r, y + h - 1.4, t.z + SEEN.z * t.r, Math.PI / 4, 0.3, 0.55, 0.1));
  });
}

// ---------- buildings ----------

/** Windows (and a door) on the faces the camera sees; returns nothing, adds to the batch. */
function windows(b: Batch, l: Lot, w: number, d: number, floors: number, opts: { tall?: boolean; door?: boolean; blooms?: Vector3[]; rand: () => number }) {
  const f = frame(l);
  const faces: { n: Pt; len: number; at: (k: number) => Pt; yaw: number; front: boolean }[] = [
    { n: [0, 1], len: w, at: (k) => f(k, d / 2), yaw: l.rot, front: true },
    { n: [0, -1], len: w, at: (k) => f(k, -d / 2), yaw: l.rot, front: false },
    { n: [1, 0], len: d, at: (k) => f(w / 2, k), yaw: l.rot + Math.PI / 2, front: false },
    { n: [-1, 0], len: d, at: (k) => f(-w / 2, k), yaw: l.rot + Math.PI / 2, front: false },
  ];
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  for (const face of faces) {
    const wn = new Vector3(face.n[0] * c + face.n[1] * s, 0, -face.n[0] * s + face.n[1] * c);
    if (wn.dot(SEEN) < 0.15) continue;
    const cols = Math.max(1, Math.floor((face.len - 0.5) / 1.05));
    for (let fl = 0; fl < floors; fl++) {
      for (let k = 0; k < cols; k++) {
        const off = ((k + 0.5) / cols - 0.5) * (face.len - 0.6);
        const [x, z] = face.at(off);
        const px = x + wn.x * 0.03;
        const pz = z + wn.z * 0.03;
        const door = opts.door && face.front && fl === 0 && k === Math.floor(cols / 2);
        if (door) {
          const gy = groundAt(x, z);
          b.box("wood-dark", px, gy - 0.1, pz, 0.62, l.high - gy + 1.15, 0.1, face.yaw);
          continue;
        }
        const y = l.high + fl * FLOOR + (opts.tall ? 0.35 : 0.55);
        const hgt = opts.tall ? 1.0 : 0.5;
        b.box("window", px, y, pz, 0.36, hgt, 0.1, face.yaw);
        if (fl > 0 && opts.blooms && opts.rand() < 0.3) {
          b.box(opts.rand() < 0.5 ? "flower-pink" : "flower-yellow", px + wn.x * 0.1, y - 0.16, pz + wn.z * 0.1, 0.5, 0.14, 0.2, face.yaw);
          opts.blooms.push(new Vector3(px + wn.x * 0.3, y, pz + wn.z * 0.3));
        }
      }
    }
  }
}

function roof(b: Batch, l: Lot, w: number, d: number, y: number, token: Token, wall: Token, pitch = 0.55) {
  const f = frame(l);
  const alongX = w >= d;
  const span = (alongX ? d : w) + 0.5;
  const length = (alongX ? w : d) + 0.4;
  const H = Math.max(0.9, span * pitch);
  const { slopes, gables } = gable(length, span, H);
  const m = mat(l.x, y, l.z, l.rot + (alongX ? 0 : Math.PI / 2));
  b.add(token, slopes, m);
  b.add(wall, gables, m);
  void f;
  return H;
}

function house(b: Batch, l: Lot, blooms: Vector3[]) {
  const rand = rng(l.seed);
  const w = l.hw * 2;
  const d = l.hd * 2;
  const base = l.low - 0.7;
  const first = l.high + FLOOR;
  const top = l.high + l.floors * FLOOR;
  b.box(l.wall, l.x, base, l.z, w, first - base, d, l.rot);
  let rw = w;
  let rd = d;
  if (l.floors > 1) {
    // the upper floors jut out over the street
    const jut = rand() < 0.6 ? 0.18 : 0;
    rw = w + jut * 2;
    rd = d + jut * 2;
    b.box(rand() < 0.3 ? "plaster" : l.wall, l.x, first, l.z, rw, top - first, rd, l.rot);
    b.box("wood-dark", l.x, first - 0.08, l.z, rw + 0.06, 0.16, rd + 0.06, l.rot);
  }
  windows(b, l, w, d, l.floors, { door: true, blooms, rand });
  const H = roof(b, l, rw, rd, top, l.roof, l.floors > 1 ? "wood" : l.wall);
  const f = frame(l);
  if (rand() < 0.45) {
    const [cx, cz] = f((rand() - 0.5) * w * 0.5, (rand() - 0.5) * d * 0.3);
    b.box("chimney", cx, top + H * 0.3, cz, 0.36, H * 0.75 + 0.4, 0.36, l.rot);
  }
  // a shop sign hanging over the street, or a banner down the front
  if (rand() < 0.22) {
    const [sx, sz] = f(w / 2 - 0.35, d / 2 + 0.35);
    b.box("wood-dark", sx, l.high + 2.35, sz, 0.06, 0.06, 0.7, l.rot);
    b.box((["banner-red", "banner-blue", "gold", "awning"] as const)[Math.floor(rand() * 4)], sx, l.high + 1.75, sz + 0.0, 0.06, 0.55, 0.5, l.rot);
  } else if (l.floors >= 3 && rand() < 0.5) {
    const [bx, bz] = f(0, d / 2 + 0.06);
    b.box(rand() < 0.5 ? "banner-red" : "banner-blue", bx, top - 1.9, bz, 0.55, 1.6, 0.06, l.rot);
  }
}

function tavern(b: Batch, l: Lot) {
  const rand = rng(l.seed);
  const w = l.hw * 2;
  const d = l.hd * 2;
  const f = frame(l);
  const top = l.high + 2 * FLOOR + 0.3;
  b.box("plaster", l.x, l.low - 0.7, l.z, w, top - l.low + 0.7, d, l.rot);
  // timber posts and a beam
  for (const k of [-1, -0.33, 0.33, 1]) {
    const [x, z] = f(k * (w / 2 - 0.08), d / 2 + 0.02);
    b.box("wood-dark", x, l.low - 0.2, z, 0.18, top - l.low + 0.2, 0.12, l.rot);
  }
  const [bx, bz] = f(0, d / 2 + 0.03);
  b.box("wood-dark", bx, l.high + FLOOR - 0.1, bz, w + 0.1, 0.18, 0.12, l.rot);
  windows(b, l, w, d, 2, { door: true, rand });
  const H = roof(b, l, w + 0.2, d + 0.2, top, "roof-red", "wood", 0.62);
  // a dormer and a chimney
  const [dx, dz] = f(-w * 0.2, d * 0.2);
  b.box("plaster", dx, top, dz, 1.1, H * 0.55, 0.9, l.rot);
  const [cx, cz] = f(w * 0.32, -d * 0.1);
  b.box("chimney", cx, top + H * 0.2, cz, 0.45, H + 0.4, 0.45, l.rot);
  // the griffin sign: a board on a bracket with a gold emblem
  const [sx, sz] = f(w / 2 + 0.3, d / 2 + 0.3);
  b.box("wood-dark", sx, l.high + 2.6, sz, 0.08, 0.08, 1.1, l.rot + Math.PI / 2);
  b.box("wood", sx, l.high + 1.75, sz, 0.08, 0.8, 0.95, l.rot + Math.PI / 2);
  b.add("gold", new OctahedronGeometry(0.28, 0), mat(sx, l.high + 2.15, sz, l.rot, 0.4, 1, 1));
  // barrels by the door
  for (const k of [-1, 1]) {
    const [x, z] = f(k * 1.5, d / 2 + 0.45);
    const y = groundAt(x, z);
    b.add("wood", new CylinderGeometry(0.3, 0.3, 0.7, 8), mat(x, y + 0.35, z));
    b.add("wood-dark", new CylinderGeometry(0.31, 0.31, 0.06, 8), mat(x, y + 0.5, z));
  }
  void rand;
}

function arcanum(b: Batch, l: Lot) {
  const rand = rng(l.seed);
  const w = l.hw * 2;
  const d = l.hd * 2;
  const f = frame(l);
  const top = l.high + 2 * FLOOR + 0.6;
  b.box("stone", l.x, l.low - 0.7, l.z, w, top - l.low + 0.7, d, l.rot);
  b.box("stone-dark", l.x, top - 0.25, l.z, w + 0.2, 0.25, d + 0.2, l.rot);
  windows(b, l, w, d, 2, { tall: true, door: true, rand });
  roof(b, l, w, d, top, "roof-plum", "stone", 0.5);
  // a round tower with a star-crystal on its spire
  const [tx, tz] = f(-w / 2 + 0.4, -0.1);
  const th = top + 3.4;
  b.add("stone", new CylinderGeometry(1.15, 1.2, th - l.low + 0.7, 8), mat(tx, (th + l.low - 0.7) / 2, tz));
  b.add("roof-plum", new ConeGeometry(1.45, 3.4, 8), mat(tx, th + 1.7, tz));
  b.add("crystal-deep", new OctahedronGeometry(0.4, 0), mat(tx, th + 3.8, tz, 0, 1, 1.6, 1));
  b.add("window", UNIT_BOX, mat(tx + SEEN.x * 1.15, th - 1.2, tz + SEEN.z * 1.15, Math.PI / 4, 0.36, 0.9, 0.1));
  // a domed reading room at the other end
  const [ox, oz] = f(w / 2 - 1.3, 0);
  const dome = new SphereGeometry(1.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add("crystal-deep", dome, mat(ox, top + 0.4, oz));
  b.add("stone", new CylinderGeometry(1.3, 1.3, 0.5, 8), mat(ox, top + 0.15, oz));
  b.add("gold", new OctahedronGeometry(0.22, 0), mat(ox, top + 1.85, oz, 0, 1, 1.6, 1));
}

function belltower(b: Batch, l: Lot): Object3D {
  const f = frame(l);
  const s = l.hw * 2;
  const shaft = l.high + 8;
  b.box("stone", l.x, l.low - 0.7, l.z, s, shaft - l.low + 0.7, s, l.rot);
  b.box("stone-dark", l.x, shaft, l.z, s + 0.4, 0.35, s + 0.4, l.rot);
  for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [x, z] = f(i * (s / 2 - 0.15), k * (s / 2 - 0.15));
    b.box("stone", x, shaft + 0.35, z, 0.35, 2.3, 0.35, l.rot);
  }
  const roofY = shaft + 2.65;
  b.box("stone-dark", l.x, roofY - 0.1, l.z, s + 0.5, 0.3, s + 0.5, l.rot);
  b.add("slate", new ConeGeometry((s + 0.6) * 0.75, 3.4, 4), mat(l.x, roofY + 1.9, l.z, l.rot + Math.PI / 4));
  b.add("gold", new SphereGeometry(0.2, 6, 4), mat(l.x, roofY + 3.75, l.z));
  // a clock on the side you see
  const [cx, cz] = f(0, s / 2 + 0.05);
  b.add("cream", new CylinderGeometry(0.62, 0.62, 0.08, 12), new Matrix4().compose(new Vector3(cx, shaft - 1.6, cz), new Quaternion().setFromAxisAngle(new Vector3(Math.cos(l.rot), 0, -Math.sin(l.rot)), Math.PI / 2), new Vector3(1, 1, 1)));
  b.box("ink", cx + Math.sin(l.rot) * 0.06, shaft - 1.6, cz + Math.cos(l.rot) * 0.06, 0.06, 0.45, 0.04, l.rot);
  windows(b, l, s, s, 3, { tall: true, rand: rng(l.seed) });
  // the bell itself hangs free so it can swing
  const bell = new Group();
  bell.position.set(l.x, shaft + 2.2, l.z);
  const bm = toon("gold");
  const cup = new Mesh(new CylinderGeometry(0.35, 0.75, 1.0, 10, 1, true), bm);
  cup.position.y = -0.6;
  const crown = new Mesh(new SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), bm);
  crown.position.y = -0.12;
  const clapper = new Mesh(new SphereGeometry(0.14, 6, 4), toon("rock-dark"));
  clapper.position.y = -1.0;
  bell.add(cup, crown, clapper);
  bell.traverse((o) => ((o as Mesh).castShadow = true));
  return bell;
}

function palace(b: Batch, l: Lot) {
  const f = frame(l);
  const w = l.hw * 2;
  const d = l.hd * 2;
  const base = l.low - 1;
  const hall = l.high + 6.5;
  b.box("marble", l.x, base, l.z, w, hall - base, d, l.rot);
  b.box("stone", l.x, hall - 0.3, l.z, w + 0.3, 0.35, d + 0.3, l.rot);
  // merlons round the hall's roof
  for (let k = -4; k <= 4; k++) {
    for (const s of [-1, 1]) {
      const [x, z] = f(k * (w / 9), s * (d / 2 + 0.05));
      b.box("marble", x, hall, z, 0.4, 0.5, 0.3, l.rot);
    }
  }
  const tier = hall + 2.6;
  b.box("marble", l.x, hall, l.z, w * 0.66, tier - hall, d * 0.62, l.rot);
  b.add("slate", new ConeGeometry(Math.hypot(w * 0.36, d * 0.34), 3.2, 4), mat(l.x, tier + 1.6, l.z, l.rot + Math.PI / 4, 1, 1, d / w));
  // the great door: a dark arch under a gold lintel, between pillars
  const [gx, gz] = f(0, d / 2 + 0.06);
  b.box("ink", gx, l.high - 0.05, gz, 2.0, 3.2, 0.12, l.rot);
  b.box("gold", gx, l.high + 3.15, gz, 2.6, 0.3, 0.2, l.rot);
  for (const s of [-1, 1]) {
    const [px, pz] = f(s * 1.45, d / 2 + 0.25);
    b.add("marble", new CylinderGeometry(0.26, 0.3, 3.6, 8), mat(px, l.high + 1.8, pz));
  }
  // tall windows across the front, two storeys
  for (const row of [0, 1]) {
    for (const k of [-3, -2, 2, 3]) {
      const [x, z] = f(k * 0.95, d / 2 + 0.04);
      b.box("window", x, l.high + 0.9 + row * 2.8, z, 0.42, 1.5, 0.1, l.rot);
    }
  }
  // banners
  for (const s of [-1, 1]) {
    const [x, z] = f(s * 0.95 * 1.0 + s * 1.0, d / 2 + 0.1);
    b.box("banner-blue", x, hall - 3.2, z, 0.7, 2.8, 0.06, l.rot);
    b.box("gold", x, hall - 0.55, z, 0.8, 0.12, 0.08, l.rot);
  }
  // towers: four corners and the great tower
  const towers = palaceTowers();
  towers.forEach(([lx, lz, r], i) => {
    const [x, z] = f(lx, lz);
    const great = i === 4;
    const h = great ? l.high + 11 : l.high + (lz > 0 ? 10.5 : 9);
    b.add("marble", new CylinderGeometry(r, r * 1.06, h - base, great ? 10 : 8), mat(x, (h + base) / 2, z));
    b.add("stone", new CylinderGeometry(r + 0.25, r + 0.2, 0.7, great ? 10 : 8), mat(x, h + 0.35, z));
    for (let k = 0; k < (great ? 12 : 8); k++) {
      const a = (k / (great ? 12 : 8)) * Math.PI * 2;
      b.box("marble", x + Math.cos(a) * (r + 0.12), h + 0.7, z + Math.sin(a) * (r + 0.12), 0.32, 0.45, 0.32, -a);
    }
    b.add("window", UNIT_BOX, mat(x + SEEN.x * r, h - 2.2, z + SEEN.z * r, Math.PI / 4, 0.4, 1.1, 0.1));
    if (!great) {
      b.add("slate", new ConeGeometry(r + 0.45, r * 3.6, 8), mat(x, h + 0.7 + r * 1.8, z));
      b.add("gold", new SphereGeometry(0.18, 6, 4), mat(x, h + 0.75 + r * 3.6, z));
      // a pennant from the spire
      b.box(lz > 0 ? "banner-red" : "banner-blue", x + 0.35, h + 0.6 + r * 3.6 - 0.9, z, 0.7, 0.4, 0.05, Math.PI / 4);
      b.box("wood-dark", x, h + 0.6 + r * 3.6 - 1.2, z, 0.05, 1.2, 0.05);
    } else {
      // the great tower's open crown, where the crystal's beam lands
      b.add("crystal-deep", new CylinderGeometry(r * 0.6, r * 0.6, 0.15, 10), mat(x, h + 0.75, z));
    }
  });
  // a bridge high between the two front towers
  const [ax, az] = f(towers[0][0], towers[0][1]);
  const [bx2, bz2] = f(towers[1][0], towers[1][1]);
  const by = l.high + 7.6;
  const len = Math.hypot(bx2 - ax, bz2 - az) - 2.2;
  const yaw = Math.atan2(bx2 - ax, bz2 - az);
  b.box("marble", (ax + bx2) / 2, by, (az + bz2) / 2, 1.3, 0.8, len, yaw);
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) {
      const t = (k + 0.5) / 7 - 0.5;
      b.box("marble", (ax + bx2) / 2 + Math.sin(yaw) * t * len + Math.cos(yaw) * 0.55 * s, by + 0.8, (az + bz2) / 2 + Math.cos(yaw) * t * len - Math.sin(yaw) * 0.55 * s, 0.25, 0.4, 0.3, yaw);
    }
  }
}

function gatehouse(b: Batch, l: Lot) {
  const f = frame(l);
  const y = groundAt(l.x, l.z);
  for (const s of [-1, 1]) {
    const [x, z] = f(s * 1.95, 0);
    b.box("stone", x, y - 0.8, z, 1.5, 7.2, 2.2, l.rot);
    for (const [i, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const [mx, mz] = f(s * 1.95 + i * 0.55, k * 0.9);
      b.box("stone", mx, y + 6.4, mz, 0.35, 0.45, 0.35, l.rot);
    }
    const [bx, bz] = f(s * 1.95, 1.12);
    b.box("banner-red", bx, y + 2.2, bz, 0.8, 2.8, 0.06, l.rot);
    b.box("gold", bx, y + 4.9, bz, 0.9, 0.12, 0.08, l.rot);
  }
  b.box("stone", l.x, y + 3.6, l.z, 2.5, 2.8, 2.2, l.rot);
  for (const k of [-1, -0.5, 0, 0.5, 1]) {
    const [x, z] = f(k * 1.0, 0.95);
    b.box("stone", x, y + 6.4, z, 0.3, 0.45, 0.3, l.rot);
    b.box("ink", x, y + 3.15, z, 0.08, 0.5, 0.08, l.rot);
  }
  const [cx, cz] = f(0, 1.12);
  b.add("gold", new OctahedronGeometry(0.4, 0), mat(cx, y + 4.9, cz, l.rot, 1, 1.3, 0.3));
}

// ---------- water and sky ----------

function waterfall(f: KingdomPlan["falls"][number]) {
  const g = new Group();
  const dir = new Vector3(f.at[0], 0, f.at[1]).normalize();
  const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(f.w);
  // a small basin at the lip
  const basin = new Mesh(new CylinderGeometry(1.4, 1.4, 0.1, 12), toon("water"));
  basin.position.set(f.at[0] - dir.x * 1.3, f.top + 0.03, f.at[1] - dir.z * 1.3);
  const rim = new Mesh(new TorusGeometry(1.45, 0.16, 4, 12), toon("stone"));
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(basin.position).setY(f.top + 0.1);
  g.add(basin, rim);
  const segs = 10;
  const fall = f.top + 22;
  const pos: number[] = [];
  const uv: number[] = [];
  const edge = new Vector3(f.at[0], f.top + 0.05, f.at[1]);
  for (let s = 0; s < segs; s++) {
    const quad = [s, s + 1].map((k) => {
      const t = k / segs;
      const o = edge.clone().addScaledVector(dir, 0.2 + 1.2 * t ** 0.6).setY(f.top + 0.05 - fall * t);
      const w = side.clone().multiplyScalar(1 + 0.6 * t);
      return [o.clone().sub(w), o.clone().add(w)];
    });
    const [[a, b], [c, d]] = quad;
    for (const [v, u] of [[a, 0], [c, 0], [d, 1], [a, 0], [d, 1], [b, 1]] as const) {
      pos.push(v.x, v.y, v.z);
      uv.push(u, 0);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geo.computeVertexNormals();
  g.add(new Mesh(geo, toon("water-light")));
  return g;
}

/** Little islands drifting round the kingdom: rocks with a tuft of grass, some with a crystal. */
function floaters(group: Group): Object3D[] {
  const rand = rng(99);
  const out: Object3D[] = [];
  const rockGeo = new IcosahedronGeometry(1, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const d = 44 + rand() * 10;
    const s = 1.2 + rand() * 1.8;
    const o = new Group();
    const rock = new Mesh(rockGeo, toon("rock"));
    rock.scale.set(s * 1.3, s * 1.1, s * 1.3);
    rock.position.y = -s * 0.7;
    const top = new Mesh(new CylinderGeometry(s * 1.15, s * 1.05, 0.3, 7), toon("grass"));
    const tip = new Mesh(new ConeGeometry(s * 0.9, s * 2.4, 6), toon("rock-dark"));
    tip.rotation.x = Math.PI;
    tip.position.y = -s * 1.9;
    o.add(rock, top, tip);
    if (rand() < 0.5) {
      const c = new Mesh(new OctahedronGeometry(0.5 * s, 0), toon("crystal"));
      c.scale.y = 1.8;
      c.position.y = 0.8 * s;
      o.add(c);
    }
    o.position.set(Math.cos(a) * d, -3 + rand() * 16, Math.sin(a) * d);
    o.userData.base = o.position.y;
    o.userData.phase = rand() * 10;
    o.traverse((m) => ((m as Mesh).castShadow = false));
    group.add(o);
    out.push(o);
  }
  return out;
}
