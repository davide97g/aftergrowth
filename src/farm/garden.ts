import { IcosahedronGeometry, Mesh, MeshBasicMaterial, Object3D, Scene, Vector3 } from "three";
import type { Action } from "../game/interact";
import { CANS, type Save } from "../game/state";
import type { Mood } from "../world/daycycle";
import type { IslandWorld } from "../world/world";

/** game hours for a hive to make one jar of honey; a hive holds three */
const HONEY_HOURS = 6;
const HIVE_MAX = 3;
export const HONEY_PRICE = 14;

interface Bee { mesh: Mesh; hive: Vector3; phase: number; speed: number }

/**
 * What placed objects do: wells and barrels fill the can, benches and swings are for sitting,
 * hives make honey, the signpost greets visitors. Also flickers campfires and sways swings.
 */
export class Garden {
  private bees: Bee[] = [];
  private time = 0;
  /** the swing the witch sits on, if any */
  riding: Object3D | null = null;

  constructor(
    scene: Scene,
    private world: IslandWorld,
    private state: Save,
    private hooks: { onChange: (msg?: string) => void; sit: (pos: Vector3, yaw: number) => void; owner: string; mine: boolean },
  ) {
    const geo = new IcosahedronGeometry(0.035, 0);
    const mat = new MeshBasicMaterial({ color: "#f7c843" });
    for (const h of world.uses.hives) {
      for (let i = 0; i < 4; i++) {
        const mesh = new Mesh(geo, mat);
        scene.add(mesh);
        this.bees.push({ mesh, hive: h.pos, phase: Math.random() * 10, speed: 1.5 + Math.random() * 1.5 });
      }
    }
  }

  private near<T extends { x: number; z: number }>(list: T[], at: Vector3, reach: number): T | null {
    let best: T | null = null;
    let d = reach;
    for (const p of list) {
      const dd = Math.hypot(p.x - at.x, p.z - at.z);
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    return best;
  }

  fill = (near: Vector3): Action | null => {
    const at = this.near(this.world.uses.fill, near, 1.6);
    if (!at) return null;
    const can = this.state.can;
    const holds = CANS[can.level].holds;
    if (can.water >= holds) return { pos: at, reach: 1.6, label: `${CANS[can.level].name} is full`, act: null };
    return {
      pos: at, reach: 1.6, label: `Fill the ${CANS[can.level].name.toLowerCase()} (${can.water}/${holds})`, priority: 1,
      act: () => {
        can.water = holds;
        this.hooks.onChange("Can filled");
      },
    };
  };

  seat = (near: Vector3): Action | null => {
    const s = this.near(this.world.uses.seats.map((x) => ({ ...x, x: x.pos.x, z: x.pos.z })), near, 1.4);
    if (!s) return null;
    return {
      pos: s.pos, reach: 1.4, label: s.swing ? "Sit on the swing" : "Sit for a while", priority: 0.6,
      act: () => {
        this.riding = s.swing ? this.world.swings.find((w) => w.id === s.id)?.seat ?? null : null;
        this.hooks.sit(s.pos, s.yaw);
      },
    };
  };

  hive = (near: Vector3): Action | null => {
    const h = this.near(this.world.uses.hives.map((x) => ({ ...x, x: x.pos.x, z: x.pos.z })), near, 1.5);
    if (!h) return null;
    if (!this.hooks.mine) return { pos: h.pos, reach: 1.5, label: `${this.hooks.owner}'s beehive · busy bees`, act: null };
    const stored = Math.floor(this.state.hives?.[h.id] ?? 0);
    if (stored < 1) {
      const left = Math.ceil(HONEY_HOURS - ((this.state.hives?.[h.id] ?? 0) % 1) * HONEY_HOURS);
      return { pos: h.pos, reach: 1.5, label: `Beehive · honey in about ${left}h`, act: null };
    }
    return {
      pos: h.pos, reach: 1.5, label: `Collect honey (${stored})`, priority: 1,
      act: () => {
        this.state.goods = this.state.goods ?? { honey: 0 };
        this.state.goods.honey += stored;
        this.state.hives![h.id] -= stored;
        this.hooks.onChange(`+${stored} honey`);
      },
    };
  };

  sign = (near: Vector3): Action | null => {
    const at = this.near(this.world.uses.signs, near, 1.3);
    if (!at) return null;
    return { pos: at, reach: 1.3, label: `Welcome to ${this.hooks.owner}'s island`, act: null };
  };

  update(dt: number, hours: number, mood: Mood) {
    this.time += dt;
    const t = this.time;
    // honey (only your own hives make it for you)
    if (this.hooks.mine) {
      const hives = (this.state.hives ??= {});
      for (const h of this.world.uses.hives) hives[h.id] = Math.min(HIVE_MAX, (hives[h.id] ?? 0) + hours / HONEY_HOURS);
    }
    // bees by day
    const day = mood.glow < 0.5;
    for (const b of this.bees) {
      b.mesh.visible = day;
      if (!day) continue;
      const p = t * b.speed + b.phase;
      b.mesh.position.set(b.hive.x + Math.sin(p) * 0.7 + Math.sin(p * 2.3) * 0.2, 0.6 + Math.abs(Math.sin(p * 1.7)) * 0.7, b.hive.z + Math.cos(p * 0.8) * 0.7);
    }
    // campfires flicker, swings sway (more when someone sits on them)
    this.world.flames.forEach((f, i) => {
      f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 9 + i * 2) * 0.22, 1 + Math.cos(t * 11 + i) * 0.12);
      f.rotation.y += dt * (1 + i);
    });
    for (const s of this.world.swings) s.seat.rotation.x = Math.sin(t * 1.6) * (s.seat === this.riding ? 0.45 : 0.06);
  }

  /** While swinging, the witch rides the seat: a point on its arc. */
  swingOffset(): { forward: number; up: number } | null {
    if (!this.riding) return null;
    const a = this.riding.rotation.x;
    // a positive turn swings the seat backwards (towards local -Z)
    return { forward: -Math.sin(a) * 1.5, up: (1 - Math.cos(a)) * 1.5 };
  }
}
