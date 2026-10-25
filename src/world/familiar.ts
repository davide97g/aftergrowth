import { ConeGeometry, Group, IcosahedronGeometry, Mesh, Object3D, SphereGeometry, Vector3 } from "three";
import type { Token } from "../core/palette";
import type { Action } from "../game/interact";
import type { Witch } from "../player/witch";
import { toon } from "../render/toon";
import type { World } from "./world";

import type { FamiliarKind, FamiliarSave } from "../../shared/familiars";

export { DEFAULT_FAMILIAR, FAMILIAR_KINDS, FAMILIAR_NAMES, type FamiliarKind, type FamiliarSave } from "../../shared/familiars";

/** The parts a familiar is animated by. The model faces +z; `hips` pivots the torso at its back end. */
export interface FamiliarRig {
  kind: FamiliarKind;
  root: Group;
  hips: Object3D;
  head: Object3D;
  /** front left, front right, back left, back right; each pivots at its top */
  legs: Object3D[];
  /** base first; each segment hangs off the one before */
  tail: Object3D[];
  eyes: Object3D[];
  ears: Object3D[];
  /** how high the hips stand */
  hipY: number;
  /** where the front legs join the torso, in the hips' frame */
  shoulder: Vector3;
  legLength: number;
}

const ball = new SphereGeometry(1, 12, 9);

function blob(token: Token, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) {
  const m = new Mesh(ball, toon(token));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/** A leg that pivots at its top and hangs `length` down. */
function leg(token: Token, r: number, length: number, paw: Token) {
  const g = new Group();
  g.add(blob(token, r, length / 2, r, 0, -length / 2, 0), blob(paw, r * 1.15, r * 0.8, r * 1.3, 0, -length + r * 0.5, r * 0.25));
  return g;
}

/** A cat or a fox: the same body, different coats, ears, muzzle and tail. */
function quadruped(kind: "cat" | "fox"): FamiliarRig {
  const fox = kind === "fox";
  const fur: Token = fox ? "terracotta" : "rock-dark";
  const pale: Token = "bunny";
  const root = new Group();
  const hipY = 0.2;
  const hips = new Group();
  hips.position.set(0, hipY, -0.13);
  root.add(hips);
  hips.add(blob(fur, 0.17, 0.15, 0.27, 0, 0.03, 0.15));
  // a pale chest
  hips.add(blob(pale, 0.11, 0.1, 0.1, 0, -0.01, 0.33));

  const head = new Group();
  head.position.set(0, 0.17, 0.4);
  hips.add(head);
  head.add(blob(fur, 0.15, 0.13, 0.14));
  if (fox) {
    const snout = new Mesh(new ConeGeometry(0.07, 0.17, 6), toon(pale));
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.04, 0.17);
    const nose = blob("ink", 0.025, 0.022, 0.022, 0, -0.04, 0.255);
    head.add(snout, nose, blob(pale, 0.1, 0.06, 0.06, 0, -0.07, 0.08));
  } else {
    head.add(blob(pale, 0.075, 0.055, 0.06, 0, -0.05, 0.11), blob("blush", 0.02, 0.015, 0.015, 0, -0.025, 0.155));
  }
  const ears: Object3D[] = [];
  const eyes: Object3D[] = [];
  for (const s of [1, -1]) {
    const ear = new Mesh(new ConeGeometry(fox ? 0.065 : 0.055, fox ? 0.17 : 0.11, 4), toon(fur));
    ear.position.set(0.085 * s, 0.13, -0.01);
    ear.rotation.z = -0.3 * s;
    ears.push(ear);
    const eye = blob("ink", 0.024, 0.032, 0.015, 0.065 * s, 0.02, 0.13);
    eyes.push(eye);
    head.add(ear, eye);
  }

  const legLength = 0.17;
  const shoulder = new Vector3(0, -0.04, 0.3);
  const legs = [
    [0.075, shoulder.y, shoulder.z],
    [-0.075, shoulder.y, shoulder.z],
    [0.085, -0.02, 0],
    [-0.085, -0.02, 0],
  ].map(([x, y, z], i) => {
    const l = leg(fur, 0.045, i < 2 ? legLength : legLength + 0.02, fox ? "ink" : pale);
    l.position.set(x, y, z);
    hips.add(l);
    return l;
  });

  // three segments; a fox's is long, bushy and white-tipped
  const tail: Object3D[] = [];
  let parent: Object3D = hips;
  const seg = fox ? [0.1, 0.12, 0.1] : [0.045, 0.04, 0.035];
  const len = fox ? 0.13 : 0.12;
  seg.forEach((r, i) => {
    const g = new Group();
    g.position.set(0, i === 0 ? 0.06 : 0, i === 0 ? -0.08 : -len);
    g.add(blob(fox && i === 2 ? pale : fur, r, r, len * 0.65, 0, 0, -len / 2));
    parent.add(g);
    tail.push(g);
    parent = g;
  });

  root.traverse((o) => (o.castShadow = true));
  return { kind, root, hips, head, legs, tail, eyes, ears, hipY, shoulder, legLength };
}

/** A round frog: big eyes on top, folded back legs. */
function frog(): FamiliarRig {
  const root = new Group();
  const hipY = 0.13;
  const hips = new Group();
  hips.position.set(0, hipY, -0.08);
  root.add(hips);
  hips.add(blob("cape", 0.2, 0.13, 0.2, 0, 0.02, 0.1), blob("bunny", 0.14, 0.07, 0.15, 0, -0.04, 0.14));
  const head = new Group();
  head.position.set(0, 0.08, 0.22);
  hips.add(head);
  head.add(blob("cape", 0.15, 0.08, 0.1, 0, 0, 0), blob("blush", 0.03, 0.015, 0.01, 0.1, -0.02, 0.08), blob("blush", 0.03, 0.015, 0.01, -0.1, -0.02, 0.08));
  const eyes: Object3D[] = [];
  const ears: Object3D[] = [];
  for (const s of [1, -1]) {
    const bulb = blob("cape", 0.065, 0.065, 0.065, 0.085 * s, 0.07, 0.0);
    const eye = blob("ink", 0.032, 0.036, 0.02, 0.09 * s, 0.075, 0.055);
    eyes.push(eye);
    ears.push(bulb);
    head.add(bulb, eye);
  }
  const legLength = 0.1;
  const shoulder = new Vector3(0, -0.04, 0.2);
  const legs = [
    [0.1, shoulder.y, shoulder.z, 0.035, legLength],
    [-0.1, shoulder.y, shoulder.z, 0.035, legLength],
    [0.15, -0.02, -0.02, 0.06, 0.12],
    [-0.15, -0.02, -0.02, 0.06, 0.12],
  ].map(([x, y, z, r, l]) => {
    const g = leg("cape", r, l, "moss");
    g.position.set(x, y, z);
    hips.add(g);
    return g;
  });
  root.traverse((o) => (o.castShadow = true));
  return { kind: "frog", root, hips, head, legs, tail: [], eyes, ears, hipY, shoulder, legLength };
}

export function buildFamiliar(kind: FamiliarKind): FamiliarRig {
  return kind === "frog" ? frog() : quadruped(kind);
}

/** How a familiar holds itself; `walk` (0..1) and the gait phase come from its speed. */
export interface Pose {
  sit: number;
  lie: number;
  sniff: number;
  /** eyes shut: asleep, or purring */
  sleepy: number;
  /** head up and swaying: being petted */
  purr: number;
  /** a wet shiver */
  shiver: number;
}

export const restPose = (): Pose => ({ sit: 0, lie: 0, sniff: 0, sleepy: 0, purr: 0, shiver: 0 });

/**
 * Pose the rig. `t` is time in seconds, `phase` the gait phase, `walk` 0 standing … 1 trotting,
 * `hop` a jump's height, `shake` 0..1 through a shake-off.
 */
export function animateRig(r: FamiliarRig, p: Pose, t: number, phase: number, walk: number, hop = 0, shake = 0) {
  const s = Math.sin(phase);
  const frog = r.kind === "frog";
  const rest = Math.max(p.sit, p.lie);
  const breathe = Math.sin(t * (p.sleepy > 0.5 ? 1.4 : 2.4));

  // hips: sitting tips the torso up, lying lowers it flat
  r.hips.position.y = r.hipY * (1 - p.lie * 0.55 - p.sit * (frog ? 0.1 : 0.3)) + Math.abs(Math.cos(phase)) * 0.03 * walk * (frog ? 3 : 1) + hop;
  r.hips.rotation.x = -(frog ? 0.25 : 0.65) * p.sit * (1 - p.lie) + p.sniff * 0.12 + Math.sin(t * 40) * 0.02 * p.shiver;
  r.hips.rotation.z = Math.sin(t * 38) * 0.35 * shake * (1 - shake) * 4;
  r.hips.scale.set(1 + breathe * 0.02, 1 + breathe * 0.035, 1);

  // legs: diagonal pairs swing; a frog kicks both back legs together
  const swing = 0.7 * walk;
  for (let i = 0; i < 4; i++) {
    const l = r.legs[i];
    const front = i < 2;
    const pair = i === 0 || i === 3 ? 1 : -1;
    l.rotation.set(0, 0, 0);
    l.scale.y = 1;
    if (frog) l.rotation.x = front ? -s * 0.3 * walk : -0.9 + Math.max(0, s) * 1.6 * walk;
    else l.rotation.x = s * swing * pair;
    if (front) {
      // front legs stay upright under a raised chest, stretching to reach the ground
      const tilt = r.hips.rotation.x;
      l.rotation.x -= tilt;
      const top = r.hips.position.y + r.shoulder.y * Math.cos(tilt) - r.shoulder.z * Math.sin(tilt);
      l.scale.y = Math.max(0.3, top / r.legLength) * (1 - p.lie) + p.lie;
      l.rotation.x += -1.35 * p.lie;
    } else {
      l.rotation.x += (frog ? -0.5 : -1.3) * p.sit * (1 - p.lie) + 1.35 * p.lie;
    }
  }

  // head: looks down to sniff, up to be petted, rests on its paws asleep
  r.head.rotation.set(
    p.sniff * 0.75 + p.lie * 0.25 - p.purr * 0.35 - (frog ? 0 : 0.65 * p.sit * (1 - p.lie)) * 0.5 + Math.sin(t * 9) * 0.1 * p.sniff,
    Math.sin(t * 0.7) * 0.35 * (1 - walk) * (1 - p.sleepy) * (1 - p.sniff),
    Math.sin(t * 3) * 0.12 * p.purr,
  );
  r.head.position.y = (frog ? 0.08 : 0.17) - p.lie * 0.07;

  // ears flick now and then
  const flick = Math.max(0, Math.sin(t * 0.9) - 0.96) * 12;
  r.ears.forEach((e, i) => {
    if (!frog) e.rotation.x = -flick * (i ? 0.5 : 1) * 0.4 - p.shiver * 0.5;
  });

  // eyes: blink, shut when asleep or purring
  const blink = (t % 4.3) < 0.12 ? 0.15 : 1;
  const open = Math.min(blink, 1 - Math.max(p.sleepy, p.purr * 0.85) * 0.88);
  for (const e of r.eyes) e.scale.y = (frog ? 0.036 : 0.032) * open;

  // tail: up and swishing when walking, a lazy sway sitting, curled round asleep
  const swish = Math.sin(t * 2.1);
  r.tail.forEach((g, i) => {
    g.rotation.set(0, 0, 0);
    if (i === 0) g.rotation.x = 0.25 + walk * 0.7 + p.sit * 0.2 - rest * 0.4 + p.purr * 0.6;
    else g.rotation.x = (walk * 0.25 + p.sit * -0.2) * (i === 1 ? 1 : 0.5);
    g.rotation.y = swish * (0.25 + walk * 0.25) * (1 - p.lie) + p.lie * 0.9;
  });
  // a little shuffle of the whole body while asleep is too much; keep it still
  r.root.rotation.z = 0;
}

type Mode = "think" | "follow" | "wander" | "sniff" | "chase" | "sit" | "nap" | "watch" | "lap" | "shelter" | "fire" | "greet" | "play";

/** What the familiar knows about the moment. */
export interface Surroundings {
  raining: number;
  /** 0 day … 1 night */
  night: number;
  /** seconds the witch has stood still */
  idle: number;
  /** campfires and other flames on the island */
  fires: Vector3[];
  /** a butterfly near `p`, if any */
  butterfly(p: Vector3, range: number): Vector3 | null;
}

const WALK = 2.1;
const RUN = 5.6;
const RADIUS = 0.16;

/**
 * Your familiar: follows you about, sniffs flowers, chases butterflies, naps in the sun and by the
 * fire, watches you draw, hides from the rain (a frog plays in it) and shakes itself dry after.
 */
export class Familiar {
  readonly rig: FamiliarRig;
  readonly position: Vector3;
  private mode: Mode = "think";
  private timer = 0;
  private target: Vector3 | null = null;
  private velocity = new Vector3();
  private pose = restPose();
  private want = restPose();
  private phase = 0;
  private time = Math.random() * 10;
  private hopT = 1;
  private hopHeight = 0;
  private shakeT = 1;
  private wet = 0;
  private stuck = 0;
  private purrT = 0;
  private hearts: { mesh: Mesh; life: number }[] = [];
  /** hidden while the witch is indoors or travelling */
  away = false;
  /** says something when petted, startled or greeting */
  onVoice: (kind: "pet" | "greet") => void = () => {};

  constructor(scene: Object3D, private world: World, private witch: Witch, public spec: FamiliarSave) {
    this.rig = buildFamiliar(spec.kind);
    this.position = this.rig.root.position;
    this.rig.root.scale.setScalar(spec.kind === "frog" ? 1.35 : 1.4);
    scene.add(this.rig.root);
    const heart = new IcosahedronGeometry(1, 0);
    for (let i = 0; i < 6; i++) {
      const mesh = new Mesh(heart, toon("bunny-pink"));
      mesh.visible = false;
      scene.add(mesh);
      this.hearts.push({ mesh, life: 1 });
    }
    this.place();
  }

  /** Put it down beside the witch, out of sight of where it was. */
  place() {
    const w = this.witch.position;
    for (let a = 0; a < Math.PI * 2; a += 0.7) {
      const x = w.x + Math.sin(this.witch.yaw + Math.PI * 0.75 + a) * 0.9;
      const z = w.z + Math.cos(this.witch.yaw + Math.PI * 0.75 + a) * 0.9;
      if (this.world.mask.walkable(x, z, RADIUS)) {
        this.position.set(x, this.world.ground(x, z), z);
        break;
      }
    }
    this.rig.root.rotation.y = this.witch.yaw;
    this.velocity.set(0, 0, 0);
    this.target = null;
    this.mode = "think";
  }

  /** A spell went off nearby: a startled hop. */
  startle() {
    if (this.away) return;
    this.hopT = 0;
    this.hopHeight = 0.35;
    if (this.mode === "nap" || this.mode === "lap") this.mode = "think";
  }

  pet() {
    this.purrT = 2.6;
    this.onVoice("pet");
    for (let i = 0; i < 3; i++) {
      const h = this.hearts.find((x) => x.life >= 1);
      if (!h) break;
      h.life = -i * 0.25;
      h.mesh.position.copy(this.position).add(new Vector3((Math.random() - 0.5) * 0.3, 0.45, (Math.random() - 0.5) * 0.3));
    }
  }

  /** Interaction provider: pet it. Anything else nearby wins. */
  action = (near: Vector3): Action | null => {
    if (this.away || Math.hypot(this.position.x - near.x, this.position.z - near.z) > 1.1) return null;
    return { pos: this.position, reach: 1.1, label: `Pet ${this.spec.name}`, act: () => this.pet(), priority: -0.6 };
  };

  private go(mode: Mode, target: Vector3 | null, timer = 0) {
    this.mode = mode;
    this.target = target;
    this.timer = timer;
  }

  /** a free spot about `r` from `at`, preferring the side `toward` faces */
  private spotNear(at: Vector3, r: number, angle = Math.random() * Math.PI * 2) {
    for (let i = 0; i < 8; i++) {
      const a = angle + i * 0.8 * (i % 2 ? 1 : -1);
      const x = at.x + Math.sin(a) * r;
      const z = at.z + Math.cos(a) * r;
      if (this.world.mask.walkable(x, z, RADIUS)) return new Vector3(x, 0, z);
    }
    return null;
  }

  private nearestFlower(range: number) {
    let best: Vector3 | null = null;
    let bd = range;
    for (const f of this.world.flowers) {
      const d = Math.hypot(f.x - this.position.x, f.z - this.position.z);
      if (d < bd && d > 0.4 && this.world.mask.walkable(f.x, f.z, 0.05)) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Choose what to do next. */
  private think(env: Surroundings) {
    const w = this.witch;
    const d = this.position.distanceTo(w.position);
    const frog = this.spec.kind === "frog";
    if (w.drawing) return this.go("watch", this.spotNear(w.position, 1.4, w.yaw + 0.6));
    if (w.sitting) return this.go("lap", this.spotNear(w.position, 0.75, w.yaw + Math.PI / 2));
    if (env.raining > 0.45) {
      // a frog loves the rain; a cat or a fox huddles up by you
      if (frog) return this.go("play", this.spotNear(w.position, 1 + Math.random() * 1.5), 0);
      return this.go("shelter", this.spotNear(w.position, 0.7, w.yaw + Math.PI * 0.8));
    }
    if (env.night > 0.55) {
      let fire: Vector3 | null = null;
      for (const f of env.fires) if (Math.hypot(f.x - w.position.x, f.z - w.position.z) < 7 && (!fire || f.distanceTo(w.position) < fire.distanceTo(w.position))) fire = f;
      if (fire && d < 8) return this.go("fire", this.spotNear(fire, 0.95, Math.atan2(w.position.x - fire.x, w.position.z - fire.z)), 0);
    }
    if (d > 3.2) return this.go("follow", null);
    if (env.idle > 22 && Math.random() < 0.7) return this.go("nap", this.spotNear(w.position, 1.1), 15);
    const r = Math.random();
    const bug = env.night < 0.4 ? env.butterfly(this.position, 3.5) : null;
    if (bug && r < 0.3 && !frog) return this.go("chase", null, 4 + Math.random() * 2);
    if (r < 0.35) return this.go("sit", null, 3 + Math.random() * 4);
    if (r < 0.6) {
      const f = this.nearestFlower(4);
      if (f) return this.go("sniff", f.clone(), 0);
    }
    const spot = this.spotNear(w.position, 1 + Math.random() * 1.8);
    return spot ? this.go("wander", spot) : this.go("sit", null, 2);
  }

  update(dt: number, env: Surroundings) {
    this.time += dt;
    const root = this.rig.root;
    const wasAway = !root.visible;
    root.visible = !this.away;
    if (this.away) return;
    if (wasAway) {
      // back outside (or arrived somewhere): appear beside her and say hello
      this.place();
      this.go("greet", null, 1.2);
      this.hopT = 0;
      this.hopHeight = 0.25;
      this.onVoice("greet");
    }
    const w = this.witch;
    const p = this.position;
    const d = Math.hypot(w.position.x - p.x, w.position.z - p.z);
    const frog = this.spec.kind === "frog";

    // too far to catch up (she ran off, or crossed the map): turn up beside her
    if (d > 13) this.place();

    // things that interrupt whatever it was doing
    const calm = this.mode === "sit" || this.mode === "wander" || this.mode === "sniff" || this.mode === "nap" || this.mode === "chase";
    if (w.drawing && this.mode !== "watch") this.mode = "think";
    else if (!w.drawing && this.mode === "watch") this.mode = "think";
    else if (w.sitting !== (this.mode === "lap")) this.mode = "think";
    else if (env.raining > 0.45 && calm) this.mode = "think";
    else if ((this.mode === "shelter" || this.mode === "play") && env.raining < 0.3) {
      // the rain stopped: shake dry
      if (this.wet > 0.4 && !frog) this.shakeT = 0;
      this.mode = "think";
    } else if (calm && d > 4.2) this.mode = "think";
    else if ((this.mode === "lap" || this.mode === "shelter") && !this.target && d > 2.5) this.mode = "think";
    else if (this.mode === "fire" && (d > 8 || env.night < 0.45)) this.mode = "think";
    if (this.mode === "think") this.think(env);

    this.wet = Math.max(0, Math.min(1, this.wet + (env.raining > 0.3 ? dt * 0.3 : -dt * 0.02)));

    // where to go
    let goal: Vector3 | null = this.target;
    let speed = WALK;
    if (this.mode === "follow") {
      // trot to a spot just behind and beside her
      const back = w.yaw + Math.PI + 0.7;
      goal = new Vector3(w.position.x + Math.sin(back) * 1.1, 0, w.position.z + Math.cos(back) * 1.1);
      speed = d > 5 ? Math.max(RUN, w.speed * 1.08) : Math.max(WALK * 1.3, w.speed * 1.02);
      if (d < 1.6 && w.speed < 0.3) this.go("think", null);
    } else if (this.mode === "chase") {
      const bug = env.butterfly(p, 4);
      this.timer -= dt;
      if (!bug || this.timer <= 0) {
        // a pounce at the end, caught or not
        this.hopT = 0;
        this.hopHeight = 0.3;
        this.go("sit", null, 2 + Math.random() * 2);
      } else {
        goal = bug.clone();
        speed = RUN * 0.75;
      }
    } else if (this.mode === "play" && !this.target) {
      // hop about in the puddles
      this.timer -= dt;
      if (this.timer <= 0) this.go("play", this.spotNear(w.position, 0.8 + Math.random() * 1.8), 0);
    }

    // move
    const wish = new Vector3();
    if (goal) {
      const to = new Vector3(goal.x - p.x, 0, goal.z - p.z);
      const dist = to.length();
      const near = this.mode === "sniff" ? 0.35 : this.mode === "chase" ? 0.3 : 0.18;
      if (dist < near) {
        if (this.mode !== "follow" && this.mode !== "chase") this.arrive();
      } else {
        wish.copy(to).divideScalar(dist).multiplyScalar(Math.min(1, dist / 0.5) * speed);
      }
    }
    // a frog only moves while it is in the air
    const hopping = frog && wish.lengthSq() > 0.01;
    if (hopping) wish.multiplyScalar(Math.max(0, Math.sin(this.phase)) * 1.9);
    this.velocity.lerp(wish, 1 - Math.exp(-dt * 8));
    const step = this.velocity.clone().multiplyScalar(dt);
    const m = this.world.mask;
    const before = p.clone();
    if (m.walkable(p.x + step.x, p.z + step.z, RADIUS)) p.add(step);
    else if (m.walkable(p.x + step.x, p.z, RADIUS)) p.x += step.x;
    else if (m.walkable(p.x, p.z + step.z, RADIUS)) p.z += step.z;
    const moved = Math.hypot(p.x - before.x, p.z - before.z) / Math.max(dt, 1e-4);
    // stuck behind something: give up on that spot (or catch up with her)
    this.stuck = wish.lengthSq() > 0.5 && moved < 0.2 ? this.stuck + dt : 0;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      if (d > 5) this.place();
      else this.go("think", null);
    }
    p.y = this.world.ground(p.x, p.z);

    // face where it's going, or her when it's watching
    const v = moved;
    let yaw = root.rotation.y;
    if (this.velocity.lengthSq() > 0.05) yaw = Math.atan2(this.velocity.x, this.velocity.z);
    else if (this.mode === "watch" || this.mode === "lap" || this.mode === "greet" || this.mode === "shelter" || this.purrT > 0) yaw = Math.atan2(w.position.x - p.x, w.position.z - p.z);
    let dy = yaw - root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.rotation.y += dy * (1 - Math.exp(-dt * 8));

    // how to hold itself
    const resting = !goal || this.velocity.lengthSq() < 0.05;
    const want = this.want;
    want.sit = resting && (this.mode === "sit" || this.mode === "watch" || this.mode === "greet" || (this.mode === "shelter" && this.wet < 0.2)) ? 1 : 0;
    want.lie = resting && (this.mode === "nap" || this.mode === "lap" || this.mode === "fire" || (this.mode === "shelter" && this.wet >= 0.2)) ? 1 : 0;
    want.sniff = resting && this.mode === "sniff" ? 1 : 0;
    want.sleepy = resting && (this.mode === "nap" || this.mode === "fire" || this.mode === "lap") ? 1 : 0;
    this.purrT = Math.max(0, this.purrT - dt);
    want.purr = this.purrT > 0 ? 1 : 0;
    want.shiver = this.mode === "shelter" && this.wet > 0.2 ? 1 : 0;
    if (want.purr) {
      want.lie = 0;
      want.sleepy = 0;
      want.sit = 1;
    }
    const k = 1 - Math.exp(-dt * 5);
    for (const key of Object.keys(want) as (keyof Pose)[]) this.pose[key] += (want[key] - this.pose[key]) * k;

    // timers for the rest poses
    if (resting && !this.target && (this.mode === "sit" || this.mode === "greet" || this.mode === "sniff" || this.mode === "nap")) {
      this.timer -= dt;
      if (this.timer <= 0) this.mode = "think";
    }

    const walk = Math.min(v / WALK, 1);
    this.phase += dt * (v > 0.1 ? (frog ? 9 : 7 + v * 2.2) : 0);
    if (hopping) this.phase += dt * 2;
    this.hopT = Math.min(1, this.hopT + dt / 0.45);
    const hop = Math.sin(Math.PI * this.hopT) * this.hopHeight + (frog ? Math.max(0, Math.sin(this.phase)) * 0.12 * walk : 0);
    this.shakeT = Math.min(1, this.shakeT + dt / 0.9);
    if (this.shakeT < 1) this.wet = 0;
    animateRig(this.rig, this.pose, this.time, this.phase, walk, hop, this.shakeT < 1 ? this.shakeT : 0);

    for (const h of this.hearts) {
      if (h.life >= 1) continue;
      h.life += dt / 1.3;
      h.mesh.visible = h.life > 0;
      if (h.life <= 0) continue;
      h.mesh.position.y += dt * 0.5;
      h.mesh.scale.setScalar(Math.sin(Math.PI * Math.min(h.life, 1)) * 0.09);
      if (h.life >= 1) h.mesh.visible = false;
    }
  }

  /** Reached where it was going: settle into what it came for. */
  private arrive() {
    this.target = null;
    this.velocity.multiplyScalar(0.3);
    switch (this.mode) {
      case "wander": return this.go("sit", null, 1.5 + Math.random() * 3);
      case "sniff": return this.go("sniff", null, 2.5 + Math.random() * 2);
      case "nap": return this.go("nap", null, 12 + Math.random() * 15);
      case "play": return this.go("play", null, 0.4 + Math.random() * 1.2);
      default: return; // watch, lap, shelter, fire: stay until something changes
    }
  }

  dispose() {
    this.rig.root.removeFromParent();
    for (const h of this.hearts) h.mesh.removeFromParent();
  }
}
