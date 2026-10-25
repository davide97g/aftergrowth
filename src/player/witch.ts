import { Box3, CylinderGeometry, DoubleSide, Euler, Group, IcosahedronGeometry, Mesh, MeshToonMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import { color } from "../core/palette";
import type { HatStyle } from "../../shared/protocol";
import { loadGltf } from "../core/assets";
import { applyPalette, toon, toonRamp } from "../render/toon";
import { type Ground, flat } from "../world/ground";
import type { WalkMask } from "../world/walkmask";

const SCALE = 1.05;
const WALK = 2.6;
const RUN = 5.2;
const RADIUS = 0.3;

/** Little things she does when she stands still a while. */
type Idle = "yawn" | "rub" | "stretch" | "hat" | "sky" | "tap" | "twirl" | "hum" | "warm";
const IDLE_LENGTH: Record<Idle, number> = { yawn: 2.6, rub: 2, stretch: 2.6, hat: 3, sky: 2.8, tap: 2.2, twirl: 1.5, hum: 4.5, warm: 5 };
/** idles that need her right hand, which holds the umbrella in the rain */
const HANDY: ReadonlySet<Idle> = new Set<Idle>(["yawn", "rub", "stretch", "hat", "sky", "warm"]);

/** What's around her: only your own witch gets this, and with it the fidgets and the umbrella. */
export interface WitchMood {
  /** 0 day … 1 night */
  night: number;
  dawn: boolean;
  /** 0..1 */
  rain: number;
  /** 0..1 */
  wind: number;
  /** a fire close by, to warm her hands at */
  fire: Vector3 | null;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

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
  /** walking and running speed, ×1.25 with mossy boots */
  speedUp = 1;
  /** resting in a chair */
  sitting = false;
  private sitBlend = 0;
  onFootstep: (at: Vector3, running: boolean) => void = () => {};
  /** set every frame for your own witch; null for everyone else (no fidgets, no umbrella) */
  mood: WitchMood | null = null;
  /** she starts humming a tune */
  onHum: () => void = () => {};
  private still = 0;
  private nextIdle = 5;
  private idle: { kind: Idle; t: number } | null = null;
  private idleBlend = 0;
  private umbrella: Group | null = null;
  private umbrellaBlend = 0;
  /** the island's ground height, for every witch (you, visitors, keepers, townsfolk) */
  static ground: Ground = flat;

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

  /** `hat` tints the hat cone and brim, so every player is recognisable; `style` is its shape. */
  static async load(hat?: string, style: HatStyle = "classic"): Promise<Witch> {
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
    const w = new Witch(model);
    w.setHat(style);
    return w;
  }

  private crown: Object3D | null = null;
  private hatScale: Vector3 | null = null;

  /** Reshape the hat: wider, taller, or swapped for a flower crown. */
  setHat(style: HatStyle) {
    const hat = this.parts.Hat;
    this.hatScale ??= hat.scale.clone();
    const k = style === "wide" ? [1.32, 0.82, 1.32] : style === "tall" ? [0.94, 1.45, 0.94] : [1, 1, 1];
    hat.scale.set(this.hatScale.x * k[0], this.hatScale.y * k[1], this.hatScale.z * k[2]);
    hat.visible = style !== "crown";
    if (style === "crown" && !this.crown) {
      // a ring of little flowers where the hat's brim sits on the head
      const box = new Box3().setFromObject(hat);
      const size = box.getSize(new Vector3());
      const crown = new Group();
      const leaf = toon("cape");
      // not the flower-* tokens: those sway in the wind, which would tear them off the head
      const colors = ["blush", "honey", "cream", "bunny-pink"] as const;
      const geo = new IcosahedronGeometry(1, 0);
      const r = size.x * 0.24;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const bloom = new Mesh(geo, i % 2 ? leaf : toon(colors[(i / 2) % 4 | 0]));
        bloom.scale.setScalar(r * (i % 2 ? 0.24 : 0.34));
        bloom.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        crown.add(bloom);
      }
      const head = this.parts.Head;
      head.updateWorldMatrix(true, false);
      const base = head.worldToLocal(new Vector3((box.min.x + box.max.x) / 2, box.min.y + size.y * 0.04, (box.min.z + box.max.z) / 2));
      crown.position.copy(base);
      // sizes above are in world units; the head is scaled
      crown.scale.setScalar(1 / head.getWorldScale(new Vector3()).x);
      head.add(crown);
      this.crown = crown;
    }
    if (this.crown) this.crown.visible = style === "crown";
  }

  /** Remote players: glide towards the last pose the server sent and animate at its speed. */
  follow(dt: number, pose: { x: number; z: number; yaw: number; speed: number; drawing: boolean }) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 10);
    this.position.x += (pose.x - this.position.x) * k;
    this.position.z += (pose.z - this.position.z) * k;
    this.position.y = Witch.ground(this.position.x, this.position.z);
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

  /** A big leaf on a stem, held over her head in the rain. */
  private makeUmbrella() {
    const g = new Group();
    const leafMat = new MeshToonMaterial({ color: color("turf"), gradientMap: toonRamp(), side: DoubleSide });
    // a shallow dome, a little longer than wide, tipped back over her head
    const leaf = new Mesh(new SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), leafMat);
    leaf.scale.set(0.6, 0.24, 0.5);
    leaf.position.set(0, 1.86, 0);
    leaf.rotation.z = -0.1;
    const rib = new Mesh(new CylinderGeometry(0.012, 0.012, 0.95, 4), toon("cape"));
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, 2.08, 0);
    // from her raised right hand, above the hat's tip, up to the middle of the leaf
    const stem = new Mesh(new CylinderGeometry(0.018, 0.022, 1.3, 5), toon("wood-dark"));
    stem.position.set(-0.185, 1.22, 0);
    stem.rotation.z = -0.3;
    g.add(leaf, rib, stem);
    g.traverse((o) => (o.castShadow = true));
    g.visible = false;
    this.parts.Body.add(g);
    return g;
  }

  private pickIdle(m: WitchMood): Idle {
    const pool: Idle[] = [];
    if (m.fire) pool.push("warm", "warm", "hum");
    if (m.night > 0.6) pool.push("yawn", "rub", "yawn");
    else if (m.dawn) pool.push("stretch", "stretch", "sky", "hum");
    else pool.push("sky", "tap", "twirl", "hum", "hum");
    if (m.wind > 0.4) pool.push("hat", "hat", "hat");
    const ok = m.rain > 0.35 ? pool.filter((k) => !HANDY.has(k)) : pool;
    const from = ok.length ? ok : ["tap", "hum"] as Idle[];
    return from[Math.floor(Math.random() * from.length)];
  }

  /** Your own witch: fidgets when she stands still, holds a leaf over her head in the rain, minds her hat in the wind. */
  private fidget(dt: number, v: number) {
    const m = this.mood;
    const P = this.parts;
    const R = this.rest;
    this.model.rotation.y = 0;
    if (!m) return;

    // the hat flaps in the wind
    P.Hat.rotation.z += Math.sin(this.time * 6.3) * Math.sin(this.time * 1.7) * 0.07 * m.wind;
    P.Cape.rotation.x += (0.1 + Math.sin(this.time * 9) * 0.06) * m.wind;

    // the leaf umbrella: up while it rains (the pen needs her hand, so not while drawing)
    const up = m.rain > 0.35 && !this.drawing ? 1 : 0;
    this.umbrellaBlend += (up - this.umbrellaBlend) * (1 - Math.exp(-dt * 6));
    const u = this.umbrellaBlend;
    if (u > 0.01) this.umbrella ??= this.makeUmbrella();
    if (this.umbrella) {
      this.umbrella.visible = u > 0.02;
      this.umbrella.scale.setScalar(Math.max(0.001, smooth(Math.min(1, u * 1.15))));
      // the right arm reaches up for the stem, no swinging
      P.ArmR.rotation.x += (R.ArmR.rot.x - 0.1 - P.ArmR.rotation.x) * u;
      P.ArmR.rotation.z += (R.ArmR.rot.z - 2.55 - P.ArmR.rotation.z) * u;
    }

    // fidgets: only standing quite still, not drawing, sitting or reacting
    const free = v < 0.1 && !this.drawing && !this.sitting && !this.reaction;
    if (!free) {
      this.still = 0;
      this.nextIdle = 4 + Math.random() * 4;
    } else this.still += dt;
    if (free && !this.idle && this.still > this.nextIdle) {
      this.idle = { kind: this.pickIdle(m), t: 0 };
      if (this.idle.kind === "hum") this.onHum();
    }
    const live = !!this.idle && free && this.idle.t < IDLE_LENGTH[this.idle.kind];
    this.idleBlend += ((live ? 1 : 0) - this.idleBlend) * (1 - Math.exp(-dt * (live ? 6 : 10)));
    const idle = this.idle;
    if (!idle) return;
    idle.t += dt;
    if (!live && this.idleBlend < 0.02) {
      this.idle = null;
      this.nextIdle = this.still + 5 + Math.random() * 6;
      return;
    }
    const len = IDLE_LENGTH[idle.kind];
    const x = Math.min(idle.t / len, 1);
    const k = this.idleBlend;
    const t = idle.t;
    const shut = (amount: number) => {
      P.EyeL.scale.y = Math.min(P.EyeL.scale.y, 1 - 0.88 * amount);
      P.EyeR.scale.y = Math.min(P.EyeR.scale.y, 1 - 0.88 * amount);
    };
    switch (idle.kind) {
      case "yawn": {
        // a big stretch up, head back, eyes shut
        const s = Math.sin(Math.PI * x) * k;
        P.ArmL.rotation.z += 2.6 * s;
        P.ArmR.rotation.z -= 2.6 * s;
        P.Head.rotation.x -= 0.35 * s;
        P.Body.scale.y *= 1 + 0.05 * s;
        shut(s);
        break;
      }
      case "rub": {
        // rubbing a sleepy eye
        const s = Math.sin(Math.PI * x) * k;
        P.ArmR.rotation.x -= 2.3 * s;
        P.ArmR.rotation.z += 0.55 * s + Math.sin(t * 14) * 0.08 * s;
        P.Head.rotation.x += 0.15 * s;
        shut(s);
        break;
      }
      case "stretch": {
        // arms up, a lean one way, then the other
        const s = Math.sin(Math.PI * x) * k;
        P.ArmL.rotation.z += 2.4 * s;
        P.ArmR.rotation.z -= 2.4 * s;
        P.Body.rotation.z += Math.sin(x * Math.PI * 2) * 0.2 * s;
        P.Head.rotation.x -= 0.15 * s;
        shut(s * 0.6);
        break;
      }
      case "hat": {
        // holding her hat on in the wind
        P.ArmR.rotation.x -= 2.5 * k;
        P.ArmR.rotation.z -= 0.15 * k;
        P.Head.rotation.x += 0.12 * k;
        P.Hat.rotation.z *= 1 - 0.7 * k;
        break;
      }
      case "sky": {
        // a hand over her eyes, looking up and around
        P.ArmR.rotation.x -= 2.2 * k;
        P.ArmR.rotation.z += 0.35 * k;
        P.Head.rotation.x -= 0.4 * k;
        P.Head.rotation.y += Math.sin(t * 1.4) * 0.5 * k;
        break;
      }
      case "tap": {
        // tapping a foot, hands behind her back
        P.LegR.rotation.x -= 0.25 * k * (0.5 + 0.5 * Math.sin(t * 13));
        P.ArmL.rotation.x += 0.45 * k;
        P.ArmR.rotation.x += 0.45 * k;
        P.Head.rotation.z += Math.sin(t * 6.5) * 0.06 * k;
        break;
      }
      case "twirl": {
        // a happy little spin
        this.model.rotation.y = Math.PI * 2 * smooth(x);
        const s = Math.sin(Math.PI * x) * k;
        P.ArmL.rotation.z += 1.1 * s;
        P.ArmR.rotation.z -= 1.1 * s;
        this.model.position.y += Math.sin(Math.PI * x) * 0.08;
        P.Cape.rotation.x += 0.5 * s;
        break;
      }
      case "hum": {
        // swaying to a tune
        P.Body.rotation.z += Math.sin(t * 2.6) * 0.07 * k;
        P.Head.rotation.z += Math.sin(t * 2.6 + 0.6) * 0.14 * k;
        P.ArmL.rotation.z += (0.2 + Math.sin(t * 2.6) * 0.1) * k;
        P.ArmR.rotation.z -= (0.2 - Math.sin(t * 2.6) * 0.1) * k;
        shut(0.6 * k);
        break;
      }
      case "warm": {
        // turn to the fire, hands out, rocking gently
        if (m.fire) {
          let d = Math.atan2(m.fire.x - this.position.x, m.fire.z - this.position.z) - this.root.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.root.rotation.y += d * (1 - Math.exp(-dt * 4)) * k;
        }
        P.ArmL.rotation.x -= 1.25 * k;
        P.ArmR.rotation.x -= 1.25 * k;
        P.ArmL.rotation.z -= 0.25 * k;
        P.ArmR.rotation.z += 0.25 * k;
        P.Body.rotation.z += Math.sin(t * 1.8) * 0.05 * k;
        shut(0.5 * k);
        break;
      }
    }
  }

  /** `wish` is the desired world-space direction, length 0..1. */
  update(dt: number, wish: Vector3, running: boolean, mask: WalkMask) {
    this.time += dt;
    const target = wish.clone().multiplyScalar((running ? RUN : WALK) * this.speedUp);
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
    // sitting (and swinging) places her itself
    if (!this.sitting) p.y = Witch.ground(p.x, p.z);

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
    this.fidget(dt, v);
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
