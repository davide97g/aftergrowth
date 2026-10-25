import { Group, Matrix4, Quaternion, Scene, Vector3 } from "three";
import { scatter } from "../core/assets";
import type { FlowerColor } from "../game/state";
import { type IslandLayout, KINDS, type Kind, type Placed } from "../island/layout";
import { radiusAt } from "../island/shapes";
import { buildTerrain } from "../island/terrain";
import { IslandWorld, type Place } from "../world/world";
import { type CityParts, buildCity } from "./city";
import { type KingdomPlan, ISLET_RU, distToLine, groundAt, insideObb, plan, rampAt, ru } from "./plan";

const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const mat4 = (x: number, y: number, z: number, yaw: number, s: number) => new Matrix4().compose(new Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new Vector3(s, s, s));

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The layout the kingdom's props are placed from (lamps, benches, trees, stalls, the fountain). */
export function kingdomLayout(): IslandLayout {
  const p = plan();
  return { v: 1, shape: "round", size: 3.1, underside: "crystal", seed: 7071, meadow: 7071, objects: p.objects.map((o): Placed => ({ ...o })) };
}

/**
 * Aetherhold: an island world whose ground is a terraced hill. The city's meshes come from the plan;
 * placed props, the portal islet and every system that takes an IslandWorld work as on any island.
 */
export class KingdomWorld extends IslandWorld {
  readonly plan: KingdomPlan = plan();
  city!: CityParts;

  static async create(scene: Scene): Promise<KingdomWorld> {
    const w = new KingdomWorld(scene, kingdomLayout(), "kingdom");
    const [ix, iz] = ru(...ISLET_RU);
    w.isletDir.set(ix, 0, iz).normalize();
    await w.rebuildTerrain();
    for (const p of w.layout.objects) await w.addObject(p, false);
    w.refresh();
    await w.rebuildMeadow();
    return w;
  }

  override ground(x: number, z: number) {
    return groundAt(x, z);
  }

  override async rebuildTerrain() {
    const p = this.plan;
    this.city = buildCity(p);
    // the floating rock underneath: the usual island underside, tucked just below the hill
    const under = await buildTerrain(p.coast, { underside: "crystal", seed: 7071, depth: 13 });
    under.group.position.y = -0.08;
    this.terrainG.clear();
    this.terrainG.add(under.group, this.city.group);
    this.pond = null;
    this.channel = null;
    await this.buildIslet(radiusAt(p.coast, this.isletDir.x, this.isletDir.z));
    this.bounds.center.set(0, 4, 0);
    this.bounds.radius = 48;
  }

  protected override rebuildMask() {
    super.rebuildMask();
    const p = this.plan;
    for (const h of p.holes) this.mask.addHole(h);
    for (const b of p.boxes) this.mask.addBox(b.x, b.z, b.hw, b.hd, b.rot);
    for (const c of p.circles) this.mask.addSolid(c.x, c.z, c.r);
  }

  override refresh() {
    super.refresh();
    const [x, z] = this.plan.spawn;
    this.spawn.set(x, this.ground(x, z), z);
  }

  protected override findPlaces(): Place[] {
    const out: Place[] = this.plan.places.map((pl) => ({ id: pl.id, label: pl.label, icon: pl.icon, pos: new Vector3(pl.x, groundAt(pl.x, pl.z), pl.z) }));
    out.push({ id: "portal", label: "Portal", icon: "portal", pos: this.portalPos.clone().add(new Vector3(1.4, 0, 1.4)) });
    return out;
  }

  /** Grass in the green between the houses, wild flowers along the edges, all on the hill. */
  override async rebuildMeadow() {
    const p = this.plan;
    const rand = rng(4242);
    const paved = (x: number, z: number, pad: number) =>
      p.streets.some((s) => distToLine(x, z, s.pts) < s.w / 2 + pad) || p.plazas.some((pl) => Math.hypot(pl.x - x, pl.z - z) < pl.r + pad) || !!rampAt(x, z);
    const green = (x: number, z: number, pad: number) => this.mask.walkable(x, z, pad) && !paved(x, z, pad) && !p.lots.some((l) => insideObb(l, x, z, pad));
    const tufts: Matrix4[][] = [[], [], []];
    for (let i = 0; i < 3200; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 37;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!green(x, z, 0.1)) continue;
      const k = rand();
      tufts[k < 0.5 ? 0 : k < 0.8 ? 1 : 2].push(mat4(x, this.ground(x, z), z, rand() * 6.28, 0.7 + rand() * 0.6));
    }
    const colors: FlowerColor[] = ["pink", "yellow", "blue", "white"];
    const flowersBy: Record<FlowerColor, Matrix4[]> = { pink: [], yellow: [], blue: [], white: [] };
    const pts: Vector3[] = [];
    for (let c = 0, tries = 0; c < 60 && tries < 2000; tries++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 36;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      if (!green(cx, cz, 0.4)) continue;
      c++;
      const col = colors[Math.floor(rand() * 4)];
      for (let i = 0; i < 6; i++) {
        const x = cx + (rand() - 0.5) * 2;
        const z = cz + (rand() - 0.5) * 2;
        if (!green(x, z, 0.15)) continue;
        const y = this.ground(x, z);
        flowersBy[rand() < 0.8 ? col : colors[Math.floor(rand() * 4)]].push(mat4(x, y, z, rand() * 6.28, 0.8 + rand() * 0.5));
        pts.push(new Vector3(x, y + 0.5, z));
      }
    }
    // the islet's own little meadow
    for (let i = 0; i < 14; i++) {
      const x = this.islet.x + (rand() - 0.5) * 6;
      const z = this.islet.z + (rand() - 0.5) * 6;
      if (!this.mask.walkable(x, z, 0.2)) continue;
      flowersBy[colors[i % 4]].push(mat4(x, 0, z, rand() * 6.28, 0.9));
      pts.push(new Vector3(x, 0.5, z));
    }
    const g = new Group();
    this.flowerBeds = [];
    for (const c of colors) {
      const bed = await scatter(`flower_${c}`, flowersBy[c]);
      g.add(bed);
      this.flowerBeds.push({ color: c, group: bed });
    }
    this.flowers = [...pts, ...this.city.blooms];
    const [t0, t1, t2] = await Promise.all([scatter("grass_tuft", tufts[0]), scatter("grass_tuft_large", tufts[1]), scatter("grass_leafs", tufts[2])]);
    g.add(t0, t1, t2);
    // trees, one instanced draw per kind, with a bush at the foot of some
    const byKind = new Map<string, Matrix4[]>();
    const bushes: Matrix4[] = [];
    for (const t of p.trees) {
      const list = byKind.get(t.kind) ?? [];
      list.push(mat4(t.x, this.ground(t.x, t.z), t.z, t.rot, t.scale));
      byKind.set(t.kind, list);
      if (rand() < 0.4) {
        const a = rand() * 6.28;
        const x = t.x + Math.cos(a) * 0.9;
        const z = t.z + Math.sin(a) * 0.9;
        if (green(x, z, 0.1)) bushes.push(mat4(x, this.ground(x, z), z, rand() * 6.28, 0.7 + rand() * 0.4));
      }
    }
    for (const [kind, list] of byKind) g.add(await scatter(KINDS[kind as Kind].model!, list));
    g.add(await scatter("bush_large", bushes));
    this.meadowG.clear();
    this.meadowG.add(g);
  }

  /** Spin the crystal's rings, bob the floating islets, glow the ley lines at night. */
  animate(t: number, glow: number) {
    const c = this.city;
    c.crystal.position.y = c.crystalLight.position.y + Math.sin(t * 0.7) * 0.25;
    c.crystal.children[0].rotation.y = t * 0.3;
    c.crystal.children[1].rotation.y = -t * 0.5;
    c.rings.forEach((r, i) => (r.rotation.z = t * (0.18 + i * 0.07) * (i % 2 ? -1 : 1)));
    c.crystalLight.intensity = 2 + glow * 9;
    const pulse = 0.55 + glow * 1.4 + Math.sin(t * 1.6) * 0.12;
    c.ley.color.set("#8fe9ff").multiplyScalar(pulse);
    for (const f of c.floaters) f.position.y = f.userData.base + Math.sin(t * 0.4 + f.userData.phase) * 0.5;
  }
}
