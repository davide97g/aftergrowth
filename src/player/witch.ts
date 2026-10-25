import { Euler, Group, Mesh, MeshToonMaterial, Object3D, Vector3 } from "three";
import { loadGltf } from "../core/assets";
import { applyPalette } from "../render/toon";
import type { WalkMask } from "../world/walkmask";

const SCALE = 1.05;
const WALK = 2.6;
const RUN = 5.2;
const RADIUS = 0.3;

const PARTS = ["Body", "Head", "Hat", "Cape", "LegL", "LegR", "ArmL", "ArmR", "EyeL", "EyeR"] as const;
type Part = (typeof PARTS)[number];

/**
 * The apprentice: a chibi modelled in tools/blender/build_chibi.py.
 * No skeleton; each part pivots at its joint and is animated here.
 */
export class Witch {
  readonly root: Object3D;
  readonly position: Vector3;
  private model: Object3D;
  private parts: Record<Part, Object3D>;
  private rest: Record<Part, { pos: Vector3; rot: Euler }>;
  private velocity = new Vector3();
  private stepDistance = 0;
  private phase = 0;
  private time = 0;
  private blinkIn = 2;
  private hatLag = 0;
  private hatLagVel = 0;
  private lean = 0;
  private drawBlend = 0;
  private reaction: { kind: "cast" | "fizzle" | "gesture"; t: number } | null = null;
  /** kneeling with the pen out */
  drawing = false;
  /** resting in a chair */
  sitting = false;
  private sitBlend = 0;
  onFootstep: (at: Vector3, running: boolean) => void = () => {};

  private constructor(model: Object3D) {
    this.model = model;
    this.root = new Group();
    this.root.add(model);
    this.position = this.root.position;
    this.parts = {} as Record<Part, Object3D>;
    this.rest = {} as Record<Part, { pos: Vector3; rot: Euler }>;
    for (const name of PARTS) {
      const node = model.getObjectByName(name);
      if (!node) throw new Error(`witch.glb is missing node ${name}`);
      this.parts[name] = node;
      this.rest[name] = { pos: node.position.clone(), rot: node.rotation.clone() };
    }
  }

  /** `hat` tints the hat cone and brim, so every player is recognisable. */
  static async load(hat?: string): Promise<Witch> {
    const gltf = await loadGltf("/assets/witch.glb");
    const model = gltf.scene.clone(true);
    model.scale.setScalar(SCALE);
    // soft round shapes get shadow acne from their own hat; casting is enough
    applyPalette(model, { receive: false });
    if (hat) {
      model.getObjectByName("Hat")?.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || (m.material as MeshToonMaterial).name !== "pal:hat") return;
        const tinted = (m.material as MeshToonMaterial).clone();
        tinted.color.set(hat);
        m.material = tinted;
      });
    }
    return new Witch(model);
  }

  /** Remote players: glide towards the last pose the server sent and animate at its speed. */
  follow(dt: number, pose: { x: number; z: number; yaw: number; speed: number; drawing: boolean }) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 10);
    this.position.x += (pose.x - this.position.x) * k;
    this.position.z += (pose.z - this.position.z) * k;
    let d = pose.yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * k;
    this.drawing = pose.drawing;
    this.animate(dt, pose.speed);
  }

  get speed() {
    return this.velocity.length();
  }

  get yaw() {
    return this.root.rotation.y;
  }

  /** A short body reaction to a spell: a happy hop, or a puzzled head shake. */
  react(kind: "cast" | "fizzle" | "gesture") {
    this.reaction = { kind, t: 0 };
  }

  /** `wish` is the desired world-space direction, length 0..1. */
  update(dt: number, wish: Vector3, running: boolean, mask: WalkMask) {
    this.time += dt;
    const target = wish.clone().multiplyScalar(running ? RUN : WALK);
    this.velocity.lerp(target, 1 - Math.exp(-dt * (wish.lengthSq() > 0 ? 10 : 14)));

    const step = this.velocity.clone().multiplyScalar(dt);
    const p = this.position;
    if (mask.walkable(p.x + step.x, p.z + step.z, RADIUS)) p.add(step);
    else if (mask.walkable(p.x + step.x, p.z, RADIUS)) {
      p.x += step.x;
      this.velocity.z = 0;
    } else if (mask.walkable(p.x, p.z + step.z, RADIUS)) {
      p.z += step.z;
      this.velocity.x = 0;
    } else this.velocity.set(0, 0, 0);

    const v = this.velocity.length();
    if (v > 0.15) {
      const yaw = Math.atan2(this.velocity.x, this.velocity.z);
      let d = yaw - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * (1 - Math.exp(-dt * 14));
      this.stepDistance += v * dt;
      if (this.stepDistance > (running ? 0.9 : 0.6)) {
        this.stepDistance = 0;
        this.onFootstep(p, running);
      }
    }
    this.animate(dt, v);
  }

  private animate(dt: number, v: number) {
    const P = this.parts;
    const R = this.rest;
    const move = Math.min(v / WALK, 1); // 0 idle … 1 walking
    const run = Math.max(Math.min((v - WALK) / (RUN - WALK), 1), 0);
    this.phase += dt * (v > 0.1 ? 5 + v * 2.6 : 0);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    for (const name of PARTS) {
      P[name].position.copy(R[name].pos);
      P[name].rotation.copy(R[name].rot);
    }

    // legs and arms swing opposite; arms flap out a little when running
    const swing = (0.55 + run * 0.35) * move;
    P.LegL.rotation.x += s * swing;
    P.LegR.rotation.x -= s * swing;
    P.ArmL.rotation.x -= s * swing * 0.9;
    P.ArmR.rotation.x += s * swing * 0.9;
    const breathe = Math.sin(this.time * 2.2);
    P.ArmL.rotation.z += 0.08 + run * 0.35 + breathe * 0.03 * (1 - move);
    P.ArmR.rotation.z -= 0.08 + run * 0.35 + breathe * 0.03 * (1 - move);

    // body: bob twice per stride, waddle side to side, lean into the run
    this.lean += (move * 0.12 + run * 0.15 - this.lean) * (1 - Math.exp(-dt * 6));
    P.Body.position.y += Math.abs(c) * 0.07 * move + breathe * 0.006;
    P.Body.rotation.x += this.lean;
    P.Body.rotation.z += s * 0.07 * move;
    P.Body.scale.set(1 - breathe * 0.012, 1 + breathe * 0.015, 1 - breathe * 0.012);
    this.model.rotation.z = s * 0.04 * move;

    // head: gentle counter-tilt and idle glances
    const glance = Math.sin(this.time * 0.6) * Math.sin(this.time * 0.23);
    P.Head.rotation.z += -s * 0.05 * move + glance * 0.08 * (1 - move);
    P.Head.rotation.y += glance * 0.25 * (1 - move);
    P.Head.rotation.x += -this.lean * 0.5;

    // hat lags behind the head on a spring
    const pull = -(Math.abs(c) * 0.15 * move + this.lean * 0.8);
    this.hatLagVel += ((pull - this.hatLag) * 90 - this.hatLagVel * 9) * dt;
    this.hatLag += this.hatLagVel * dt;
    P.Hat.rotation.x += this.hatLag;
    P.Hat.rotation.z += Math.sin(this.time * 1.7) * 0.03 + s * 0.06 * move;

    // cape flies back with speed and flutters
    P.Cape.rotation.x += move * 0.12 + run * 0.25 + Math.sin(this.time * 13) * 0.03 * move + breathe * 0.02;

    // blink
    this.blinkIn -= dt;
    let lid = 1;
    if (this.blinkIn < 0) {
      lid = Math.max(0.1, Math.abs(this.blinkIn + 0.07) / 0.07);
      if (this.blinkIn < -0.14) this.blinkIn = 2 + Math.random() * 3.5;
    }
    P.EyeL.scale.y = lid;
    P.EyeR.scale.y = lid;

    // drawing: crouch, look down at the ink, scribble with the right hand
    this.drawBlend += ((this.drawing ? 1 : 0) - this.drawBlend) * (1 - Math.exp(-dt * 8));
    const db = this.drawBlend;
    P.Body.position.y -= 0.07 * db;
    P.Body.rotation.x += 0.3 * db;
    P.Head.rotation.x += 0.3 * db;
    P.ArmR.rotation.x -= (1.1 + Math.sin(this.time * 9) * 0.25) * db;
    P.ArmR.rotation.z += Math.sin(this.time * 6.5) * 0.18 * db;
    P.ArmL.rotation.x -= 0.4 * db;

    this.model.position.y = 0;
    // sitting: legs forward, lean back a little, hands in the lap
    this.sitBlend += ((this.sitting ? 1 : 0) - this.sitBlend) * (1 - Math.exp(-dt * 8));
    const sb = this.sitBlend;
    if (sb > 0.001) {
      P.LegL.rotation.x -= 1.45 * sb;
      P.LegR.rotation.x -= 1.45 * sb;
      P.Body.rotation.x -= 0.18 * sb;
      P.ArmL.rotation.x -= 0.55 * sb;
      P.ArmR.rotation.x -= 0.55 * sb;
      P.Head.rotation.x += 0.1 * sb * Math.max(0, Math.sin(this.time * 0.3));
      this.model.position.y += 0.22 * sb;
    }
    const r = this.reaction;
    if (r) {
      r.t += dt;
      if (r.kind === "cast") {
        const k = Math.min(r.t / 0.9, 1);
        const up = Math.sin(Math.PI * k);
        P.ArmL.rotation.z += 2.3 * up;
        P.ArmR.rotation.z -= 2.3 * up;
        this.model.position.y = Math.max(Math.sin(Math.PI * Math.min(r.t / 0.45, 1)), 0) * 0.22;
        P.Hat.rotation.x -= 0.25 * up;
        if (r.t > 0.9) this.reaction = null;
      } else if (r.kind === "gesture") {
        // quick crouch and reach, for picking and planting
        const k = Math.sin(Math.PI * Math.min(r.t / 0.5, 1));
        P.Body.position.y -= 0.08 * k;
        P.Body.rotation.x += 0.35 * k;
        P.Head.rotation.x += 0.2 * k;
        P.ArmR.rotation.x -= 1.2 * k;
        P.ArmL.rotation.x -= 0.6 * k;
        if (r.t > 0.5) this.reaction = null;
      } else {
        const k = Math.min(r.t / 1.1, 1);
        P.Head.rotation.y += Math.sin(r.t * 22) * 0.3 * (1 - k);
        P.Hat.rotation.x += 0.35 * Math.sin(Math.PI * k);
        P.Body.rotation.x -= 0.1 * Math.sin(Math.PI * k);
        if (r.t > 1.1) this.reaction = null;
      }
    }
  }
}
