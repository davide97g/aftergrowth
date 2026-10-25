import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { prop, scatter } from "../core/assets";
import type { FlowerColor } from "../game/state";
import { FACE, type IslandLayout, KINDS, type KindDef, type Placed, coast, footprint, screen } from "../island/layout";
import { cauldronMesh, crateMesh, mailboxMesh, stoneMesh } from "../island/models";
import { WALK_INSET, outline, radii, radiusAt } from "../island/shapes";
import { buildTerrain } from "../island/terrain";
import { shared, toon } from "../render/toon";
import { type Pt, WalkMask, insidePoly } from "./walkmask";


const S = Math.SQRT1_2;
/** the portal islet sits off the edge in this direction (screen right, a little up) */
const ISLET_DIR = (() => {
  const [x, z] = screen(1, 0.12);
  const l = Math.hypot(x, z);
  return new Vector3(x / l, 0, z / l);
})();
const ISLET_GAP = 5;

/** A named spot the map shows and can take you to. `pos` is somewhere the witch can stand. */
export interface Place { id: string; label: string; icon: PlaceIcon; pos: Vector3 }
export type PlaceIcon = "home" | "farm" | "cauldron" | "water" | "portal" | "shop" | "tree" | "fountain" | "stall" | "tavern" | "castle" | "tower" | "gate" | "star";

export interface World {
  mask: WalkMask;
  spawn: Vector3;
  blades: Object3D | null;
  smokeOrigin: Vector3;
  flowers: Vector3[];
  clouds: Group;
  /** centres of the twelve farm plots, row by row */
  plots: Vector3[];
  /** wild flowers, one instanced group per colour (pickable) */
  flowerBeds: { color: FlowerColor; group: Group }[];
  spots: { cauldron: Vector3; market: Vector3; stones: Vector3[]; mailbox: Vector3 | null };
  mailbox: Object3D | null;
  /** just in front of the cottage door, if this island has a cottage */
  door: Vector3 | null;
  /** the pond outline: fill the watering can at its edge */
  pond: Pt[] | null;
  /** centre of the portal ring; visitors arrive just in front of it */
  portalPos: Vector3;
  portal: ShaderMaterial;
  bounds: { center: Vector3; radius: number };
  /** named spots for the map */
  places: Place[];
  /** ground height under (x, z); 0 on flat islands */
  ground(x: number, z: number): number;
}

/** Which island to build: every player's island has its own layout; the commons and the market have no farm. */
export interface IslandSpec { kind: "home" | "commons" | "market" | "kingdom"; layout: IslandLayout }

export function seedOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
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

const q = new Quaternion();
const up = new Vector3(0, 1, 0);
function mat4(x: number, y: number, z: number, yaw = 0, s = 1): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new Vector3(s, s, s));
}

/** Farm plots in the field's own frame: four along, three rows deep. */
function plotOffsets(): Vector3[] {
  const out: Vector3[] = [];
  for (let r = 1; r >= -1; r--) for (let c = -1.5; c <= 1.5; c++) out.push(new Vector3(c, 0, -r * 1.05));
  return out;
}

function transformOf(p: Placed) {
  return new Matrix4().compose(new Vector3(p.x, 0, p.z), new Quaternion().setFromAxisAngle(up, p.rot), new Vector3(p.scale, p.scale, p.scale));
}

/** Draw one placed object. Everything gets `userData.layoutId` so the editor can pick it. */
async function objectMesh(p: Placed): Promise<Object3D> {
  let o: Object3D;
  switch (p.kind) {
    case "farm": {
      o = new Group();
      o.add(await scatter("crop_row", plotOffsets().map((v) => mat4(v.x, 0.01, v.z)), false));
      // an invisible pad so the whole field can be grabbed in the editor
      const pad = new Mesh(new BoxGeometry(4.2, 0.05, 3.3), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      o.add(pad);
      break;
    }
    case "cauldron": o = cauldronMesh(); break;
    case "market": o = crateMesh(); break;
    case "mailbox": o = mailboxMesh(); break;
    case "stone": o = stoneMesh(); break;
    case "pond": {
      // the terrain draws the water; this is only the editor's handle
      o = new Mesh(new CylinderGeometry(2.4, 2.4, 0.1, 18), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      break;
    }
    default: o = await prop(KINDS[p.kind].model!);
  }
  o.position.set(p.x, 0, p.z);
  o.rotation.y = p.rot;
  o.scale.setScalar(p.scale);
  o.userData.layoutId = p.id;
  return o;
}

/**
 * A home (or the commons) built from its layout. The editor changes the layout and asks the
 * world to rebuild the parts that depend on it.
 */
export class IslandWorld implements World {
  mask = new WalkMask();
  spawn = new Vector3();
  blades: Object3D | null = null;
  smokeOrigin = new Vector3(0, -100, 0);
  flowers: Vector3[] = [];
  clouds: Group;
  plots: Vector3[] = [];
  flowerBeds: World["flowerBeds"] = [];
  spots: World["spots"] = { cauldron: new Vector3(0, 0, -999), market: new Vector3(0, 0, -999), stones: [], mailbox: null };
  mailbox: Object3D | null = null;
  door: Vector3 | null = null;
  pond: Pt[] | null = null;
  portalPos = new Vector3();
  portal: ShaderMaterial;
  bounds = { center: new Vector3(), radius: 20 };
  places: Place[] = [];
  /** the placed objects' meshes, by layout id */
  readonly objects = new Map<string, Object3D>();
  /** campfire flames to flicker, swing seats to sway */
  flames: Object3D[] = [];
  swings: { id: string; seat: Object3D }[] = [];
  /** where placed objects do something */
  uses: {
    fill: Vector3[];
    seats: { id: string; pos: Vector3; yaw: number; swing: boolean }[];
    hives: { id: string; pos: Vector3 }[];
    scare: Vector3[];
    signs: Vector3[];
  } = { fill: [], seats: [], hives: [], scare: [], signs: [] };

  protected terrainG = new Group();
  protected objectsG = new Group();
  protected meadowG = new Group();
  protected surroundG = new Group();
  protected channel: Pt[] | null = null;
  protected islet = new Vector3();
  protected isletR: number[] = [];
  protected bridge: { b0: Vector3; b1: Vector3 } = { b0: new Vector3(), b1: new Vector3() };
  protected portalGroup: Group;
  /** the portal islet sits off the edge this way */
  protected isletDir = ISLET_DIR.clone();

  protected constructor(scene: Scene, public layout: IslandLayout, readonly kind: IslandSpec["kind"]) {
    scene.add(this.terrainG, this.objectsG, this.meadowG, this.surroundG);
    const portal = buildPortal();
    this.portal = portal.material;
    this.portalGroup = portal.group;
    this.clouds = buildClouds(new Vector3(8, 0, -8));
    scene.add(this.clouds);
  }

  static async build(scene: Scene, spec: IslandSpec): Promise<IslandWorld> {
    const w = new IslandWorld(scene, spec.layout, spec.kind);
    await w.rebuildTerrain();
    for (const p of w.layout.objects) await w.addObject(p, false);
    w.refresh();
    await w.rebuildMeadow();
    return w;
  }

  ground(_x: number, _z: number) {
    return 0;
  }

  // ---------- terrain, islet, bridge ----------

  /** Rebuild the island's ground (shape, size, underside, pond) and the portal islet beside it. */
  async rebuildTerrain() {
    const r = coast(this.layout);
    const pond = this.layout.objects.find((o) => o.kind === "pond");
    const t = await buildTerrain(r, { underside: this.layout.underside, seed: this.layout.seed, depth: 6.5 * Math.sqrt(this.layout.size), pond: pond ? { x: pond.x, z: pond.z, scale: pond.scale } : null });
    this.terrainG.clear();
    this.terrainG.add(t.group);
    this.pond = t.pond;
    this.channel = t.channel;

    await this.buildIslet(radiusAt(r, this.isletDir.x, this.isletDir.z));
  }

  /** The islet with the portal, joined by a rope bridge to the island's edge `homeEdge` away. */
  protected async buildIslet(homeEdge: number) {
    this.isletR = radii("round", 0.45, this.layout.seed + 1);
    const isletEdge = radiusAt(this.isletR, -this.isletDir.x, -this.isletDir.z);
    const dist = homeEdge + ISLET_GAP + isletEdge;
    this.islet.copy(this.isletDir).multiplyScalar(dist);
    const isle = await buildTerrain(this.isletR, { underside: this.layout.underside, seed: this.layout.seed + 1, depth: 4 });
    isle.group.position.copy(this.islet);
    this.surroundG.clear();
    this.surroundG.add(isle.group);
    this.bridge.b0 = this.isletDir.clone().multiplyScalar(homeEdge - 0.8);
    this.bridge.b1 = this.isletDir.clone().multiplyScalar(homeEdge + ISLET_GAP + 0.8);
    buildBridge(this.surroundG, this.bridge.b0, this.bridge.b1);
    const side = new Vector3(-this.isletDir.z, 0, this.isletDir.x);
    for (const [p, s] of [[this.bridge.b0, 1], [this.bridge.b1, -1]] as const) {
      for (const k of [1, -1]) {
        const l = await prop("lantern");
        l.position.copy(p).addScaledVector(side, 1.0 * k).addScaledVector(this.isletDir, 0.3 * s);
        l.rotation.y = Math.atan2(this.isletDir.x, this.isletDir.z) + (k > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.surroundG.add(l);
      }
    }
    const [ux, uz] = screen(0, 1.4);
    this.portalPos.set(this.islet.x - this.isletDir.x * 0.2 + ux, 0, this.islet.z - this.isletDir.z * 0.2 + uz);
    this.portalGroup.position.copy(this.portalPos);
    this.portalGroup.rotation.y = FACE;
    this.surroundG.add(this.portalGroup);
    const pax = new Vector3(1, 0, 0).applyAxisAngle(up, FACE);
    for (const k of [-1, 1]) {
      const l = await prop("lantern");
      l.position.copy(this.portalPos).addScaledVector(pax, 2.1 * k).add(new Vector3(0.6 * S, 0, 0.6 * S));
      l.rotation.y = FACE;
      this.surroundG.add(l);
    }
    const rand = rng(this.layout.seed + 7);
    for (const [rr, u, n] of [[-2.4, 2.2, "tree_cypress_0"], [2.6, 1.6, "tree_round_0"], [3.2, -1.6, "tree_cypress_2"]] as const) {
      const [ox, oz] = screen(rr, u);
      const tr = await prop(n);
      tr.position.set(this.islet.x + ox, 0, this.islet.z + oz);
      tr.rotation.y = rand() * 6;
      tr.scale.setScalar(0.9);
      this.surroundG.add(tr);
    }
    this.bounds.center.copy(this.islet).multiplyScalar(0.5);
    this.bounds.radius = dist / 2 + 12 * this.layout.size;
  }

  /** Show a helper (like the editor's selection ring) with the island's objects. */
  overlay(o: Object3D) {
    this.surroundG.parent?.add(o);
  }

  // ---------- placed objects ----------

  async addObject(p: Placed, refresh = true) {
    const o = await objectMesh(p);
    this.objects.set(p.id, o);
    o.position.y = this.ground(p.x, p.z);
    this.objectsG.add(o);
    if (refresh) this.refresh();
    return o;
  }

  removeObject(id: string) {
    const o = this.objects.get(id);
    if (o) this.objectsG.remove(o);
    this.objects.delete(id);
    this.refresh();
  }

  /** Copy a placed object's transform onto its mesh. */
  syncObject(p: Placed) {
    const o = this.objects.get(p.id);
    if (!o) return;
    o.position.set(p.x, this.ground(p.x, p.z), p.z);
    o.rotation.y = p.rot;
    o.scale.setScalar(p.scale);
  }

  /** Recompute everything derived from object positions: spots, plots, walk mask, spawn. */
  refresh() {
    const objs = this.layout.objects;
    const first = (k: Placed["kind"]) => objs.find((o) => o.kind === k);
    const v = (p: Placed | undefined, fallback: Vector3) => (p ? new Vector3(p.x, 0, p.z) : fallback);
    this.spots = {
      cauldron: v(first("cauldron"), new Vector3(0, 0, -999)),
      market: v(first("market"), new Vector3(0, 0, -999)),
      stones: objs.filter((o) => o.kind === "stone").map((o) => new Vector3(o.x, 0, o.z)),
      mailbox: first("mailbox") ? v(first("mailbox"), new Vector3()) : null,
    };
    this.mailbox = first("mailbox") ? this.objects.get(first("mailbox")!.id) ?? null : null;
    const farm = first("farm");
    this.plots = farm ? plotOffsets().map((o) => o.applyMatrix4(transformOf(farm)).setY(0.04)) : [];
    const cottage = first("cottage");
    if (cottage) {
      const m = this.objects.get(cottage.id);
      m?.updateMatrixWorld(true);
      m?.getObjectByName("smoke_origin")?.getWorldPosition(this.smokeOrigin);
      this.door = new Vector3(0, 0, 2.3 * 0.85).applyMatrix4(transformOf(cottage));
    } else this.door = null;
    const windmill = first("windmill");
    this.blades = windmill ? this.objects.get(windmill.id)?.getObjectByName("Blades") ?? null : null;
    // in front of the cottage door, or of the fountain on the market, or the middle of the commons
    const fountain = first("fountain");
    const [sx, sz] = fountain ? screen(0, -3.2) : screen(0, 0.8);
    this.spawn.copy(this.door ? this.door.clone().add(new Vector3(0.9, 0, 0.9)) : new Vector3(sx + (fountain?.x ?? 0), 0, sz + (fountain?.z ?? 0)));

    const u: IslandWorld["uses"] = { fill: [], seats: [], hives: [], scare: [], signs: [] };
    this.flames = [];
    this.swings = [];
    for (const o of objs) {
      const at = new Vector3(o.x, this.ground(o.x, o.z), o.z);
      const use = (KINDS[o.kind] as KindDef).use;
      if (use === "fill") u.fill.push(at);
      else if (use === "sit" || use === "swing") u.seats.push({ id: o.id, pos: at, yaw: o.rot, swing: use === "swing" });
      else if (use === "hive") u.hives.push({ id: o.id, pos: at });
      else if (use === "scare") u.scare.push(at);
      else if (use === "sign") u.signs.push(at);
      this.objects.get(o.id)?.traverse((n) => {
        if (n.name.startsWith("Flame")) this.flames.push(n);
        if (n.name === "SwingSeat") this.swings.push({ id: o.id, seat: n });
      });
    }
    this.uses = u;
    this.rebuildMask();
    this.places = this.findPlaces();
  }

  /** The spots worth a map pin: where things are done, and the portal. */
  protected findPlaces(): Place[] {
    const out: Place[] = [];
    const objs = this.layout.objects;
    const put = (id: string, label: string, icon: PlaceIcon, at: Vector3) => out.push({ id, label, icon, pos: at.clone() });
    // a step towards the camera from an object, so the witch lands in front of it
    const before = (o: Placed, d: number) => {
      const [fx, fz] = screen(0, -1);
      return new Vector3(o.x + fx * d * o.scale, 0, o.z + fz * d * o.scale);
    };
    if (this.door) put("cottage", "Cottage", "home", this.door);
    const farm = objs.find((o) => o.kind === "farm");
    if (farm) put("farm", "Farm field", "farm", before(farm, 2.4));
    if (this.kind === "home") {
      const c = objs.find((o) => o.kind === "cauldron");
      if (c) put("cauldron", "Cauldron", "cauldron", before(c, 1));
    }
    const pond = objs.find((o) => o.kind === "pond");
    if (pond && this.pond) put("pond", "Pond", "water", before(pond, 2.9));
    for (const o of objs) {
      const def = KINDS[o.kind] as KindDef;
      if (o.kind.startsWith("shop_")) put(o.id, def.label, "shop", before(o, 2.6));
      else if (o.kind === "fountain") put(o.id, "Fountain", "fountain", before(o, 2.3));
      else if (o.kind === "notice_board") put(o.id, "Notice board", "stall", before(o, 1.4));
    }
    if (this.kind === "commons") {
      const tree = objs.find((o) => o.kind === "tree_round_2");
      if (tree) put("tree", "The great tree", "tree", before(tree, 3.4));
    }
    put("portal", "Portal", "portal", this.portalPos.clone().add(new Vector3(1.4, 0, 1.4)));
    return out;
  }

  protected rebuildMask() {
    const m = new WalkMask();
    m.addGround(outline(coast(this.layout), WALK_INSET));
    m.addGround(outline(this.isletR, WALK_INSET, this.islet.x, this.islet.z));
    const side = new Vector3(-this.isletDir.z, 0, this.isletDir.x).multiplyScalar(0.75);
    const { b0, b1 } = this.bridge;
    m.addGround([[b0.x + side.x, b0.z + side.z], [b1.x + side.x, b1.z + side.z], [b1.x - side.x, b1.z - side.z], [b0.x - side.x, b0.z - side.z]]);
    if (this.pond) m.addHole(this.pond);
    if (this.channel) m.addHole(this.channel);
    for (const o of this.layout.objects) {
      const solid = KINDS[o.kind].solid * o.scale;
      if (solid > 0) m.addSolid(o.x, o.z, solid);
    }
    const pax = new Vector3(1, 0, 0).applyAxisAngle(up, FACE);
    for (const k of [-1.25, 0, 1.25]) m.addSolid(this.portalPos.x + pax.x * k, this.portalPos.z + pax.z * k, k ? 0.4 : 0.35);
    this.mask = m;
  }

  // ---------- meadow: grass, wild flowers, rim rocks, bushes ----------

  /** Re-scatter the wild meadow around the placed objects. */
  async rebuildMeadow() {
    const rand = rng(this.layout.meadow);
    const r = coast(this.layout);
    const size = this.layout.size;
    const objs = this.layout.objects;
    const clearOf = (x: number, z: number, pad: number) =>
      objs.every((o) => Math.hypot(o.x - x, o.z - z) > footprint(o) + pad) &&
      (!this.door || Math.hypot(this.door.x - x, this.door.z - z) > 1.3) &&
      Math.hypot(this.bridge.b0.x - x, this.bridge.b0.z - z) > 1.6;
    const g = new Group();

    const flowersBy: Record<FlowerColor, Matrix4[]> = { pink: [], yellow: [], blue: [], white: [] };
    const pts: Vector3[] = [];
    const colors: FlowerColor[] = ["pink", "yellow", "blue", "white"];
    const pick = () => {
      const k = rand();
      return colors[k < 0.35 ? 0 : k < 0.65 ? 1 : k < 0.85 ? 2 : 3];
    };
    const sow = (cx: number, cz: number, radius: (a: number) => number, clusters: number, per: number) => {
      for (let k = 0; k < clusters; k++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * radius(a) * 0.8;
        const ccx = cx + Math.cos(a) * d;
        const ccz = cz + Math.sin(a) * d;
        const col = pick();
        for (let i = 0; i < per; i++) {
          const x = ccx + (rand() - 0.5) * 2.2;
          const z = ccz + (rand() - 0.5) * 2.2;
          if (!this.mask.walkable(x, z, 0.15) || !clearOf(x, z, 0.1)) continue;
          flowersBy[rand() < 0.75 ? col : pick()].push(mat4(x, 0, z, rand() * 6.28, 0.8 + rand() * 0.5));
          pts.push(new Vector3(x, 0.5, z));
        }
      }
    };
    sow(0, 0, (a) => r[Math.floor((a / (Math.PI * 2)) * r.length) % r.length], Math.round(16 * size * size), 7);
    sow(this.islet.x, this.islet.z, () => 4, 4, 6);
    this.flowerBeds = [];
    for (const c of colors) {
      const bed = await scatter(`flower_${c}`, flowersBy[c]);
      g.add(bed);
      this.flowerBeds.push({ color: c, group: bed });
    }
    this.flowers = pts;

    const tufts: Matrix4[][] = [[], [], []];
    const sprinkle = (cx: number, cz: number, radius: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * radius;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (!this.mask.onGround(x, z) || this.mask.blocked(x, z, 0.1)) continue;
        const k = rand();
        tufts[k < 0.5 ? 0 : k < 0.8 ? 1 : 2].push(mat4(x, 0, z, rand() * 6.28, 0.7 + rand() * 0.6));
      }
    };
    sprinkle(0, 0, Math.max(...r), Math.round(260 * size * size));
    sprinkle(this.islet.x, this.islet.z, 4.6, 50);
    const [t0, t1, t2] = await Promise.all([scatter("grass_tuft", tufts[0]), scatter("grass_tuft_large", tufts[1]), scatter("grass_leafs", tufts[2])]);
    g.add(t0, t1, t2);

    // bushes and mushrooms gather around trees
    const bushes: Matrix4[] = [];
    const mush: Matrix4[] = [];
    for (const o of objs) {
      if (!o.kind.startsWith("tree") && !o.kind.startsWith("pine")) continue;
      if (rand() < 0.45) {
        const a = rand() * 6.28;
        const x = o.x + Math.cos(a) * 1.0;
        const z = o.z + Math.sin(a) * 1.0;
        if (this.mask.onGround(x, z)) bushes.push(mat4(x, 0, z, rand() * 6.28, 0.8 + rand() * 0.5));
      }
      if (rand() < 0.3) {
        const a = rand() * 6.28;
        const x = o.x + Math.cos(a) * 0.7;
        const z = o.z + Math.sin(a) * 0.7;
        if (this.mask.onGround(x, z)) mush.push(mat4(x, 0, z, rand() * 6.28, 0.9 + rand() * 0.4));
      }
    }
    // a few boulders near the rim
    const rocks: Matrix4[] = [];
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = radiusAt(r, Math.cos(a), Math.sin(a)) * 0.88;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (clearOf(x, z, 0.4) && this.mask.onGround(x, z) && (!this.pond || !insidePoly(x, z, this.pond))) rocks.push(mat4(x, 0, z, rand() * 6.28, 0.7 + rand() * 0.6));
    }
    const extra = await Promise.all([scatter("bush_large", bushes), scatter("mushroom_red", mush.filter((_, i) => i % 2 === 0)), scatter("mushroom_tan", mush.filter((_, i) => i % 2 === 1)), scatter("rock_small", rocks)]);
    g.add(...extra);
    this.meadowG.clear();
    this.meadowG.add(g);
  }
}

/** Build an island world from its layout. */
export async function buildWorld(scene: Scene, spec: IslandSpec): Promise<IslandWorld> {
  return IslandWorld.build(scene, spec);
}

function buildBridge(scene: Object3D, a: Vector3, b: Vector3) {
  const len = a.distanceTo(b);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const group = new Group();
  group.position.copy(a);
  group.rotation.y = yaw;
  const n = Math.floor(len / 0.42);
  const planks = new InstancedMesh(new BoxGeometry(1.7, 0.1, 0.34), toon("wood"), n);
  const rnd = rng(11);
  for (let i = 0; i < n; i++) {
    const z = (i + 0.5) * (len / n);
    const sag = Math.sin((z / len) * Math.PI) * -0.18;
    planks.setMatrixAt(i, mat4((rnd() - 0.5) * 0.06, sag + 0.03, z, (rnd() - 0.5) * 0.08));
  }
  planks.castShadow = planks.receiveShadow = true;
  group.add(planks);
  const posts = Math.max(2, Math.round(len / 2.2) + 1);
  const postMesh = new InstancedMesh(new BoxGeometry(0.12, 0.75, 0.12), toon("wood-dark"), posts * 2);
  const ropeGeo = new CylinderGeometry(0.025, 0.025, 1, 5);
  ropeGeo.rotateX(Math.PI / 2);
  ropeGeo.translate(0, 0, 0.5);
  const ropes = new InstancedMesh(ropeGeo, toon("bark"), (posts - 1) * 2);
  const tops: Vector3[][] = [[], []];
  for (let i = 0; i < posts; i++) {
    const z = (i / (posts - 1)) * len;
    const sag = Math.sin((z / len) * Math.PI) * -0.18;
    [-0.9, 0.9].forEach((x, k) => {
      postMesh.setMatrixAt(i * 2 + k, mat4(x, sag + 0.3, z));
      tops[k].push(new Vector3(x, sag + 0.62, z));
    });
  }
  let r = 0;
  for (const side of tops) {
    for (let i = 0; i < side.length - 1; i++) {
      const p = side[i];
      const d = side[i + 1].clone().sub(p);
      const m = new Matrix4().lookAt(new Vector3(), d, up);
      m.scale(new Vector3(1, 1, d.length()));
      m.setPosition(p);
      ropes.setMatrixAt(r++, m);
    }
  }
  postMesh.castShadow = ropes.castShadow = true;
  group.add(postMesh, ropes);
  scene.add(group);
}

function buildPortal() {
  const group = new Group();
  const ring = new Mesh(new TorusGeometry(1.25, 0.24, 6, 14), toon("rock"));
  ring.position.y = 1.45;
  ring.castShadow = ring.receiveShadow = true;
  const base = new Mesh(new CylinderGeometry(1.5, 1.7, 0.25, 8), toon("rock-dark"));
  base.position.y = 0.12;
  base.scale.z = 0.55;
  base.receiveShadow = true;
  const stones = [-1, 1].map((k) => {
    const s = new Mesh(new IcosahedronGeometry(0.42, 0), toon("rock"));
    s.position.set(1.25 * k, 0.35, 0);
    s.castShadow = true;
    return s;
  });
  const material = new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: shared.uTime, uGlow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlow;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length( p );
        float a = atan( p.y, p.x );
        float swirl = sin( a * 3.0 + r * 9.0 - uTime * 1.6 ) * 0.5 + 0.5;
        vec3 deep = vec3( 0.12, 0.1, 0.35 );
        vec3 violet = vec3( 0.45, 0.3, 0.85 );
        vec3 c = mix( deep, violet, swirl * ( 1.0 - r ) );
        float ring = smoothstep( 0.035, 0.0, abs( fract( r * 3.0 - uTime * 0.25 ) - 0.5 ) - 0.46 );
        float ticks = step( 0.86, fract( a * 3.8197 + uTime * 0.15 ) ) * smoothstep( 0.03, 0.0, abs( r - 0.82 ) - 0.04 );
        vec3 gold = vec3( 1.0, 0.79, 0.3 ) * ( 1.2 + uGlow * 1.2 );
        c += gold * ( ring * 0.7 + ticks );
        float alpha = smoothstep( 1.0, 0.94, r );
        gl_FragColor = vec4( c * alpha, alpha );
        #include <colorspace_fragment>
      }`,
  });
  const disc = new Mesh(new CircleGeometry(1.08, 40), material);
  disc.position.y = 1.45;
  group.add(ring, base, ...stones, disc);
  return { group, material };
}

function buildClouds(center: Vector3) {
  const group = new Group();
  group.name = "clouds";
  const rnd = rng(23);
  const geo = new IcosahedronGeometry(1, 1);
  const mat = toon("cloud");
  for (let i = 0; i < 22; i++) {
    const cloud = new Group();
    const puffs = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < puffs; k++) {
      const m = new Mesh(geo, mat);
      const s = 0.8 + rnd() * 1.1;
      m.scale.set(s * 1.2, s * 0.75, s);
      m.position.set((k - puffs / 2) * 1.5 + rnd(), rnd() * 0.6, rnd() * 1.2);
      cloud.add(m);
    }
    const a = rnd() * Math.PI * 2;
    const d = 20 + rnd() * 34;
    cloud.position.set(center.x + Math.cos(a) * d, -8 - rnd() * 10, center.z + Math.sin(a) * d);
    cloud.rotation.y = rnd() * Math.PI;
    cloud.userData.speed = 0.25 + rnd() * 0.35;
    group.add(cloud);
  }
  group.userData.center = center;
  return group;
}
