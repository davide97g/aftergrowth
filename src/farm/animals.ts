import { Group, IcosahedronGeometry, Mesh, Object3D, SphereGeometry, CylinderGeometry, Scene, Vector3 } from "three";
import { ITEMS, type CropId } from "../../shared/items";
import { sound } from "../audio/sound";
import type { Action } from "../game/interact";
import { type Save, count, give, take } from "../game/state";
import { toon } from "../render/toon";
import type { IslandWorld } from "../world/world";
import { ANIMALS, type AnimalKind, FEED, POND_REACH, TROUGH_MAX, TROUGH_REACH, addMeal, isAnimal, meals, morning } from "./livestock";

/** how far an animal strays from where it was placed */
const ROAM = 2.4;
const SPEED: Record<AnimalKind, number> = { chicken: 0.7, duck: 0.6, sheep: 0.5, goat: 0.6 };

interface Beast {
  id: string;
  kind: AnimalKind;
  obj: Object3D;
  head: Object3D | null;
  home: Vector3;
  target: Vector3;
  wait: number;
  phase: number;
  /** a happy hop after petting */
  joy: number;
  goods: Object3D | null;
}

/** A small model of an animal's goods lying in the grass. */
function goodsMesh(kind: AnimalKind): Object3D {
  const g = new Group();
  if (kind === "chicken" || kind === "duck") {
    const egg = new Mesh(new SphereGeometry(0.09, 10, 8), toon(kind === "duck" ? "glass" : "cream"));
    egg.scale.set(1, 1.3, 1);
    egg.position.y = 0.11;
    g.add(egg);
  } else if (kind === "sheep") {
    for (const [x, z, s] of [[0, 0, 0.14], [0.12, 0.05, 0.1], [-0.1, 0.06, 0.1]]) {
      const puff = new Mesh(new IcosahedronGeometry(s, 0), toon("cloud"));
      puff.position.set(x, s, z);
      g.add(puff);
    }
  } else {
    const pail = new Mesh(new CylinderGeometry(0.13, 0.1, 0.22, 8), toon("can"));
    pail.position.y = 0.11;
    const milk = new Mesh(new CylinderGeometry(0.12, 0.12, 0.02, 8), toon("cream"));
    milk.position.y = 0.21;
    g.add(pail, milk);
  }
  g.traverse((o) => (o.castShadow = true));
  g.scale.setScalar(1.4);
  return g;
}

/**
 * The island's animals: they wander near where they were placed, eat from troughs each morning, and
 * leave eggs, wool or milk to collect. Unfed animals droop but never come to harm.
 */
export class Animals {
  private herd: Beast[] = [];
  private time = 0;

  constructor(
    private scene: Scene,
    private world: IslandWorld,
    private state: Save,
    private hooks: {
      onChange: (msg?: string) => void;
      mine: boolean;
      owner: string;
      /** on a visit: put a crop in the owner's trough (sent to them) */
      feedVisit: ((trough: string, crop: CropId) => void) | null;
    },
  ) {
    for (const p of world.layout.objects) {
      if (!isAnimal(p.kind)) continue;
      const obj = world.objects.get(p.id);
      if (!obj) continue;
      const home = new Vector3(p.x, 0, p.z);
      this.herd.push({ id: p.id, kind: p.kind, obj, head: obj.getObjectByName("head") ?? null, home, target: home.clone(), wait: Math.random() * 3, phase: Math.random() * 6, joy: 0, goods: null });
    }
    if (hooks.mine) this.catchUp();
  }

  private get troughs() {
    return this.world.layout.objects.filter((o) => o.kind === "trough");
  }

  private nearPond = (x: number, z: number) => !!this.world.pond && this.world.pond.some(([px, pz]) => Math.hypot(px - x, pz - z) < POND_REACH);

  /** Every morning since the last one the animals saw: eat, then make goods. */
  private catchUp() {
    const h = this.state.herd;
    const from = Math.max(h.day, this.state.day - 3);
    for (let d = from + 1; d <= this.state.day; d++) {
      morning(h, d, this.herd.map((b) => ({ id: b.id, kind: b.kind, x: b.home.x, z: b.home.z })), this.troughs, this.nearPond);
    }
    h.day = this.state.day;
  }

  /** `editing`: the editor owns the meshes' positions, so the animals hold still. */
  update(dt: number, editing: boolean) {
    this.time += dt;
    if (this.hooks.mine && this.state.herd.day < this.state.day) this.catchUp();
    // a trough shows its feed while it has meals (on a visit we can't know, so it looks full)
    for (const t of this.troughs) {
      const feed = this.world.objects.get(t.id)?.getObjectByName("feed");
      if (feed) feed.visible = !this.hooks.mine || meals(this.state.herd.troughs[t.id]) > 0;
    }
    for (const b of this.herd) {
      const st = this.hooks.mine ? this.state.herd.animals[b.id] : undefined;
      const hungry = this.hooks.mine && (st?.fed ?? 0) < this.state.day;
      this.showGoods(b, (st?.ready ?? 0) > 0);
      if (editing) continue;
      const p = b.obj.position;
      const to = b.target.clone().sub(p).setY(0);
      let moving = false;
      if (b.wait > 0) b.wait -= dt;
      else if (to.length() < 0.05) {
        // pick somewhere new nearby that the witch could walk on too
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * ROAM;
          const x = b.home.x + Math.cos(a) * r;
          const z = b.home.z + Math.sin(a) * r;
          if (this.world.mask.walkable(x, z, 0.25)) {
            b.target.set(x, 0, z);
            break;
          }
        }
        b.wait = 1.5 + Math.random() * 4;
      } else {
        const step = Math.min(to.length(), dt * SPEED[b.kind] * (hungry ? 0.6 : 1));
        p.addScaledVector(to.normalize(), step);
        const yaw = Math.atan2(to.x, to.z);
        let d = yaw - b.obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        b.obj.rotation.y += d * Math.min(1, dt * 6);
        moving = true;
      }
      b.phase += dt * (moving ? 12 : 2);
      b.joy = Math.max(0, b.joy - dt);
      p.y = (moving ? Math.abs(Math.sin(b.phase)) * 0.05 : 0) + Math.abs(Math.sin(b.joy * 9)) * 0.25 * b.joy;
      b.obj.rotation.z = moving ? Math.sin(b.phase) * 0.08 : 0;
      if (b.head) {
        // idle animals peck or nod now and then; hungry ones hang their heads
        const peck = !moving && Math.sin(this.time * 0.7 + b.phase * 0.1) > 0.8 ? Math.max(0, Math.sin(this.time * 9)) * 0.6 : 0;
        b.head.rotation.x = (hungry ? 0.35 : 0) + peck;
      }
    }
  }

  private showGoods(b: Beast, ready: boolean) {
    if (ready && !b.goods) {
      b.goods = goodsMesh(b.kind);
      b.goods.position.copy(b.home).add(new Vector3(0.5, 0, 0.3));
      this.scene.add(b.goods);
    } else if (!ready && b.goods) {
      this.scene.remove(b.goods);
      b.goods = null;
    }
  }

  /** Interaction provider: collect goods, or pet the nearest animal. */
  action = (near: Vector3): Action | null => {
    let best: Beast | null = null;
    let bestD = 1.3;
    let goods = false;
    for (const b of this.herd) {
      if (b.goods && b.goods.position.distanceTo(near) < bestD) {
        best = b;
        bestD = b.goods.position.distanceTo(near);
        goods = true;
      }
      const d = b.obj.position.distanceTo(near);
      if (d < bestD) {
        best = b;
        bestD = d;
        goods = false;
      }
    }
    if (!best) return null;
    const b = best;
    const def = ANIMALS[b.kind];
    if (goods && this.hooks.mine) {
      return {
        pos: b.goods!.position, reach: 1.3, label: `Collect ${ITEMS[def.gives].name.toLowerCase()}`, priority: 0.5,
        act: () => {
          this.state.herd.animals[b.id].ready = 0;
          give(this.state, def.gives);
          sound.pop();
          this.hooks.onChange(`+1 ${ITEMS[def.gives].name.toLowerCase()}`);
        },
      };
    }
    const st = this.state.herd.animals[b.id];
    const hungry = this.hooks.mine && (st?.fed ?? 0) < this.state.day;
    return {
      pos: b.obj.position, reach: 1.3, label: hungry ? `Pet the ${b.kind} · hungry, fill a trough nearby` : `Pet the ${b.kind}`,
      act: () => {
        b.joy = 0.6;
        b.target.copy(b.obj.position);
        sound.animal(def.sound);
      },
    };
  };

  /** Interaction provider: put feed in a trough (on a visit, it's sent to the owner). */
  trough = (near: Vector3): Action | null => {
    const t = this.troughs.find((o) => Math.hypot(o.x - near.x, o.z - near.z) < 1.4);
    if (!t) return null;
    const pos = new Vector3(t.x, 0, t.z);
    // the crop the animals around this trough want most, that you carry
    const around = this.herd.filter((b) => b.home.distanceTo(pos) <= TROUGH_REACH);
    const wanted = FEED.filter((c) => count(this.state, `crop:${c}`) > 0).sort((a, b) =>
      around.filter((x) => ANIMALS[x.kind].eats.includes(b)).length - around.filter((x) => ANIMALS[x.kind].eats.includes(a)).length);
    const crop = wanted[0];
    if (this.hooks.feedVisit) {
      if (!crop) return { pos, reach: 1.4, label: `${this.hooks.owner}'s trough · bring wheat, corn, turnips or carrots`, act: null };
      return {
        pos, reach: 1.4, label: `Leave a ${crop} in ${this.hooks.owner}'s trough`, priority: 0.8,
        act: () => {
          if (!take(this.state, `crop:${crop}`)) return;
          this.hooks.feedVisit!(t.id, crop);
          this.hooks.onChange(`Fed ${this.hooks.owner}'s animals`);
        },
      };
    }
    if (!this.hooks.mine) return null;
    const have = meals(this.state.herd.troughs[t.id]);
    const label = `Trough ${have}/${TROUGH_MAX}`;
    if (have >= TROUGH_MAX) return { pos, reach: 1.4, label: `${label} · full`, act: null };
    if (!crop) return { pos, reach: 1.4, label: `${label} · bring wheat, corn, turnips or carrots`, act: null };
    const n = Math.min(TROUGH_MAX - have, count(this.state, `crop:${crop}`));
    return {
      pos, reach: 1.4, label: `${label} · add ${n} ${crop}`, priority: 0.8,
      act: () => {
        const put = addMeal(this.state.herd, t.id, crop, n);
        take(this.state, `crop:${crop}`, put);
        sound.pour(true);
        this.hooks.onChange(`Trough: +${put} ${crop}`);
      },
    };
  };
}
