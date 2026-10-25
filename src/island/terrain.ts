import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { prop, scatter } from "../core/assets";
import type { Token } from "../core/palette";
import { toon } from "../render/toon";
import { insidePoly } from "../world/walkmask";
import type { Underside } from "./layout";
import { type Pt, radiusAt } from "./shapes";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects flat-shaded triangles per palette token, each facing away from a reference direction. */
class Tris {
  private by = new Map<Token, number[]>();
  private e1 = new Vector3();
  private e2 = new Vector3();
  private n = new Vector3();

  add(token: Token, a: Vector3, b: Vector3, c: Vector3, out: Vector3) {
    this.n.crossVectors(this.e1.subVectors(b, a), this.e2.subVectors(c, a));
    const list = this.by.get(token) ?? [];
    if (this.n.dot(out) < 0) list.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    else list.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.by.set(token, list);
  }

  meshes(): Mesh[] {
    return [...this.by].map(([token, pos]) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      const m = new Mesh(g, toon(token));
      m.receiveShadow = true;
      m.castShadow = token !== "water" && token !== "water-light";
      return m;
    });
  }
}

export interface Terrain {
  group: Group;
  pond: Pt[] | null;
  channel: Pt[] | null;
}

const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const mat4 = (x: number, y: number, z: number, yaw = 0, s = 1) => new Matrix4().compose(new Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new Vector3(s, s, s));

/**
 * A floating island from its outline radii: grass top with a chunky lip, a faceted underside in one
 * of three styles, and optionally a pond whose channel spills over the edge as a waterfall.
 */
export async function buildTerrain(
  r: number[],
  opts: { underside: Underside; seed: number; depth: number; pond?: { x: number; z: number; scale: number } | null },
): Promise<Terrain> {
  const rand = rng(opts.seed);
  const n = r.length;
  const depth = opts.underside === "roots" ? opts.depth * 0.7 : opts.depth;
  const ang = (i: number) => (i / n) * Math.PI * 2;
  const ring = (f: number, y: number, jitter = 0, yj = 0) =>
    r.map((rr, i) => {
      const k = rr * f * (1 + (rand() * 2 - 1) * jitter * 0.3);
      return new Vector3(Math.cos(ang(i)) * k, y + (rand() * 2 - 1) * yj, Math.sin(ang(i)) * k);
    });

  const tris = new Tris();
  const center = new Vector3(0, 0, 0);
  const upv = new Vector3(0, 1, 0);
  const top = [ring(0.35, 0, 0, 0.03), ring(0.7, 0, 0, 0.03), ring(1, 0)];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.add("grass", center, top[0][i], top[0][j], upv);
    for (let k = 0; k < 2; k++) {
      tris.add("grass", top[k][i], top[k + 1][i], top[k + 1][j], upv);
      tris.add("grass", top[k][i], top[k + 1][j], top[k][j], upv);
    }
  }
  // lip and underside: (radius factor, height, jitter)
  const under: [number, number, number][] = [[1.04, -0.18, 0], [1.02, -0.5, 0.05], [0.88, -1.3, 0.18], [0.62, -0.55 * depth, 0.25], [0.34, -0.8 * depth, 0.2]];
  const rings = [top[2], ...under.map(([f, y, j]) => ring(f, y, j, j))];
  const tip = new Vector3((rand() - 0.5) * 0.8, -depth, (rand() - 0.5) * 0.8);
  const out = new Vector3();
  const centroid = new Vector3();
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = rings[k][i], b = rings[k + 1][i], c = rings[k + 1][j], d = rings[k][j];
      centroid.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
      out.set(centroid.x, -0.4, centroid.z).normalize();
      const y = centroid.y;
      const token: Token = k === 0 ? "grass-dark" : y > -0.6 ? "grass-dark" : out.y < -0.5 ? "rock-dark" : "rock";
      const face: Token = k >= 2 && Math.hypot(centroid.x, centroid.z) < r[i] * 0.7 ? "rock-dark" : token;
      tris.add(face, a, b, c, out);
      tris.add(face, a, c, d, out);
    }
  }
  const last = rings[rings.length - 1];
  for (let i = 0; i < n; i++) tris.add("rock-dark", last[i], tip, last[(i + 1) % n], new Vector3(last[i].x, -1, last[i].z));

  const group = new Group();
  group.add(...tris.meshes());

  // floating rock chunks under the island
  const chunkRings = rings[3];
  for (let k = 0; k < 5; k++) {
    const p = chunkRings[Math.floor(rand() * n)];
    const s = 0.35 + rand() * 0.45;
    const rock = await prop("rock_tall");
    rock.position.set(p.x * 0.9, -depth * (0.55 + rand() * 0.3), p.z * 0.9);
    rock.scale.set(s * 1.4, s * 1.6, s * 1.4);
    rock.rotation.x = Math.PI; // upside down: a hanging spire
    group.add(rock);
  }

  // underside style
  if (opts.underside === "roots") {
    for (let i = 0; i < n; i += 3) {
      const p = rings[2][i];
      const o = await prop("root_tangle");
      o.position.set(p.x * 0.95, p.y + 0.2, p.z * 0.95);
      o.rotation.y = rand() * 6;
      o.scale.setScalar(0.9 + rand() * 0.8);
      group.add(o);
    }
  } else if (opts.underside === "crystal") {
    for (let i = 0; i < n; i += 4) {
      const p = rings[3][i];
      const o = await prop("crystal_hang");
      o.position.set(p.x * 0.95, p.y + 0.3, p.z * 0.95);
      o.rotation.y = rand() * 6;
      o.scale.setScalar(1 + rand() * 1.2);
      group.add(o);
    }
    const big = await prop("crystal_hang");
    big.position.copy(tip).setY(tip.y + 0.4);
    big.scale.setScalar(2.4);
    group.add(big);
  }

  // moss hanging from the lip (more of it under roots)
  const moss: Matrix4[] = [];
  const every = opts.underside === "roots" ? 1 : 2;
  for (let i = 0; i < n; i += every) {
    const p = top[2][i];
    const d = Math.hypot(p.x, p.z);
    moss.push(mat4((p.x / d) * (d + 0.25), -1.15 - rand() * 0.3, (p.z / d) * (d + 0.25), rand() * 6.28, 0.8 + rand() * 0.5));
  }
  group.add(await scatter("moss_hang", moss, false));

  let pond: Pt[] | null = null;
  let channel: Pt[] | null = null;
  if (opts.pond) {
    const built = await buildPond(r, opts.pond, depth, rand);
    group.add(built.group);
    pond = built.pond;
    channel = built.channel;
  }
  return { group, pond, channel };
}

async function buildPond(r: number[], at: { x: number; z: number; scale: number }, depth: number, rand: () => number) {
  const group = new Group();
  const tris = new Tris();
  const rad = 2.4 * at.scale;
  const m = 18;
  const pts: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2;
    const k = rad * (1 + 0.16 * Math.sin(a * 3 + at.x) + 0.06 * Math.sin(a * 5 + at.z));
    pts.push([at.x + Math.cos(a) * k, at.z + Math.sin(a) * k]);
  }
  const c = new Vector3(at.x, 0, at.z);
  const upv = new Vector3(0, 1, 0);
  for (let i = 0; i < m; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % m];
    tris.add("moss", c.clone().setY(0.02), new Vector3(at.x + (ax - at.x) * 1.12, 0.02, at.z + (az - at.z) * 1.12), new Vector3(at.x + (bx - at.x) * 1.12, 0.02, at.z + (bz - at.z) * 1.12), upv);
  }
  const shore = tris.meshes();
  const water = new Tris();
  for (let i = 0; i < m; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % m];
    water.add("water", c.clone().setY(0.035), new Vector3(ax, 0.035, az), new Vector3(bx, 0.035, bz), upv);
  }
  // channel to the nearest edge, then over it
  const len = Math.hypot(at.x, at.z);
  const dir = len > 0.5 ? new Vector3(at.x / len, 0, at.z / len) : new Vector3(-0.3, 0, 0.95).normalize();
  const edge = radiusAt(r, dir.x, dir.z);
  const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(0.55);
  const start = c.clone().addScaledVector(dir, rad * 0.6).setY(0.036);
  const end = dir.clone().multiplyScalar(edge + 0.15).setY(0.036);
  const channel: Pt[] = [];
  if (edge - len > rad * 0.6) {
    water.add("water", start.clone().sub(side), end.clone().sub(side), end.clone().add(side), upv);
    water.add("water", start.clone().sub(side), end.clone().add(side), start.clone().add(side), upv);
    for (const v of [start.clone().addScaledVector(side, -1.2), end.clone().addScaledVector(side, -1.2), end.clone().addScaledVector(side, 1.2), start.clone().addScaledVector(side, 1.2)]) channel.push([v.x, v.z]);
  }
  group.add(...shore, ...water.meshes());

  // waterfall: a strip falling from the edge, uv.x across for the flow shader
  const segs = 8;
  const fall = depth * 1.4;
  const pos: number[] = [];
  const uv: number[] = [];
  const edgeP = dir.clone().multiplyScalar(edge);
  for (let s = 0; s < segs; s++) {
    const quad = [s, s + 1].map((k) => {
      const t = k / segs;
      const o = edgeP.clone().addScaledVector(dir, 0.15 + 0.9 * t ** 0.6).setY(0.036 - fall * t);
      const w = side.clone().multiplyScalar(1 + 0.4 * t);
      return [o.clone().sub(w), o.clone().add(w)];
    });
    const [[a, b], [c2, d]] = quad;
    for (const [v, u] of [[a, 0], [c2, 0], [d, 1], [a, 0], [d, 1], [b, 1]] as const) {
      pos.push(v.x, v.y, v.z);
      uv.push(u, 0);
    }
  }
  const fallGeo = new BufferGeometry();
  fallGeo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  fallGeo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  fallGeo.computeVertexNormals();
  group.add(new Mesh(fallGeo, toon("water-light")));

  // lilies on the water, flat stones on the shore
  const lilies: Matrix4[] = [];
  for (let i = 0; i < 9; i++) {
    const x = at.x + (rand() - 0.5) * rad * 1.4;
    const z = at.z + (rand() - 0.5) * rad * 1.4;
    if (insidePoly(x, z, pts)) lilies.push(mat4(x, 0.04, z, rand() * 6.28, 0.8 + rand() * 0.6));
  }
  group.add(await scatter("lily", lilies, false));
  const stones: Matrix4[] = [];
  pts.forEach(([x, z], i) => {
    if (i % 3) return;
    stones.push(mat4(x + (x - at.x) * 0.12, 0, z + (z - at.z) * 0.12, rand() * 6.28, 0.6 + rand() * 0.4));
  });
  group.add(await scatter("rock_flat", stones));
  return { group, pond: pts, channel: channel.length ? channel : null };
}
