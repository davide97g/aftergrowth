import { CylinderGeometry, InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
import type { Festival } from "../../shared/seasons";
import type { Action } from "../game/interact";
import { toon } from "../render/toon";
import type { Mood } from "./daycycle";
import type { Sky } from "./sky";
import type { Atmosphere } from "./atmosphere";
import type { World } from "./world";

const LANTERNS = 48;
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const m4 = new Matrix4();
const q = new Quaternion();
const sv = new Vector3();
const one = new Vector3(1, 1, 1);

interface Lantern { pos: Vector3; seed: number; up: number; live: boolean }

/**
 * A season's festival, in the evening and at night: lanterns rising from the island (Lantern Night),
 * a blossom storm (the Petal Festival), shooting stars (the Star Shower) or the Frost Lights.
 */
export class Festivities {
  /** 0 … 1: how much the festival shows right now (it fades in at dusk) */
  level = 0;
  private lanterns: Lantern[] = [];
  private mesh: InstancedMesh | null = null;
  private spawn = 0;

  constructor(scene: Scene, private world: World, readonly festival: Festival | null, private sky: Sky, private atmos: Atmosphere) {
    if (festival?.id !== "lanterns") return;
    // paper lanterns: the window token glows at night, so they bloom
    const geo = new CylinderGeometry(0.13, 0.1, 0.26, 8);
    this.mesh = new InstancedMesh(geo, toon("window"), LANTERNS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < LANTERNS; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.lanterns.push({ pos: new Vector3(), seed: Math.random() * 100, up: 0.5, live: false });
    }
    scene.add(this.mesh);
  }

  /** Let a lantern go from `at`. */
  release(at: Vector3) {
    const l = this.lanterns.find((x) => !x.live) ?? this.lanterns[0];
    l.pos.copy(at).setY(at.y + 1.1);
    l.up = 0.45 + Math.random() * 0.2;
    l.live = true;
  }

  /** Interaction provider: on Lantern Night, light a lantern wherever nothing else is to hand. */
  action = (near: Vector3): Action | null => {
    if (!this.mesh || this.level < 0.3) return null;
    return { pos: near.clone(), reach: 1, label: "Light a paper lantern", act: () => this.release(near.clone()), priority: -1 };
  };

  update(dt: number, mood: Mood) {
    const f = this.festival;
    const want = f ? Math.min(1, Math.max(0, (mood.glow - 0.3) / 0.4)) : 0;
    this.level += (want - this.level) * (1 - Math.exp(-dt * 0.8));
    const k = this.level;
    this.sky.festival(f?.id === "aurora" ? k : 0, f?.id === "stars" ? k : 0);
    this.atmos.petalStorm = f?.id === "petals" ? k : 0;
    if (!this.mesh) return;

    // lanterns drift up from all over the island while it's dark
    this.spawn -= dt * k * 1.4;
    if (this.spawn <= 0 && k > 0.2) {
      this.spawn = 0.5 + Math.random();
      const { center, radius } = this.world.bounds;
      for (let tries = 0; tries < 10; tries++) {
        const x = center.x + (Math.random() * 2 - 1) * radius;
        const z = center.z + (Math.random() * 2 - 1) * radius;
        if (!this.world.mask.onGround(x, z)) continue;
        this.release(sv.set(x, this.world.ground(x, z) - 0.6, z));
        break;
      }
    }
    const t = performance.now() / 1000;
    this.lanterns.forEach((l, i) => {
      if (!l.live) return this.mesh!.setMatrixAt(i, HIDDEN);
      l.pos.y += dt * l.up;
      l.pos.x += dt * (Math.sin(t * 0.5 + l.seed) * 0.15 + 0.08);
      l.pos.z += dt * Math.cos(t * 0.4 + l.seed) * 0.12;
      if (l.pos.y > 28) l.live = false;
      q.setFromAxisAngle(sv.set(0, 0, 1), Math.sin(t * 1.2 + l.seed) * 0.12);
      this.mesh!.setMatrixAt(i, m4.compose(l.pos, q, one));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

