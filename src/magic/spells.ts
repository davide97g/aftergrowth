import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { prop } from "../core/assets";
import { shared, toon, toonRamp } from "../render/toon";
import type { Mood } from "../world/daycycle";
import type { World } from "../world/world";
import type { Life } from "../world/life";
import type { FlowerColor } from "../game/state";
import type { SpellId } from "./glyph";

interface Effect { update(dt: number, mood: Mood): boolean; dispose?(): void }

/** How spells touch the rest of the game. */
export interface SpellHooks {
  water(at: Vector3, r: number): void;
  grow(at: Vector3, r: number, hours: number): void;
  flower(obj: Object3D, color: FlowerColor): void;
}

const FLOWER_COLORS: FlowerColor[] = ["pink", "yellow", "blue", "white"];

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/** Soft glowing points with simple CPU physics. */
class Sparks {
  readonly points: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private mat: ShaderMaterial;
  constructor(
    count: number,
    color: string,
    size: number,
    private spawn: (i: number, p: Vector3, v: Vector3) => void,
    private opts: { gravity?: number; life?: number; loop?: boolean; drag?: number; steady?: boolean } = {},
  ) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.age = new Float32Array(count);
    const p = new Vector3();
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      spawn(i, p, v);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([v.x, v.y, v.z], i * 3);
      this.age[i] = opts.loop ? Math.random() * (opts.life ?? 1) : 0;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    geo.setAttribute("aAge", new BufferAttribute(this.age, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color(color).multiplyScalar(2.4) }, uSize: { value: size * Math.min(devicePixelRatio, 2) }, uLife: { value: opts.steady ? 1e9 : opts.life ?? 1 }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        uniform float uSize;
        uniform float uLife;
        varying float vA;
        void main() {
          vA = 1.0 - clamp( aAge / uLife, 0.0, 1.0 );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize = uSize * ( 0.4 + 0.6 * vA );
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFade;
        varying float vA;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          float a = smoothstep( 0.5, 0.0, d );
          gl_FragColor = vec4( uColor * a * a * vA * uFade, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  set fade(v: number) { this.mat.uniforms.uFade.value = v; }

  update(dt: number) {
    const g = this.opts.gravity ?? 0;
    const drag = Math.exp(-(this.opts.drag ?? 0) * dt);
    const life = this.opts.life ?? 1;
    const p = new Vector3();
    const v = new Vector3();
    for (let i = 0; i < this.age.length; i++) {
      this.age[i] += dt;
      if (this.opts.loop && this.age[i] > life) {
        this.spawn(i, p, v);
        this.pos.set([p.x, p.y, p.z], i * 3);
        this.vel.set([v.x, v.y, v.z], i * 3);
        this.age[i] = 0;
      }
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - g * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAge.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * Where spell effects go. They are made as if on flat ground; on a hill each cast's effects sit in a
 * group lifted to the ground height where it was cast.
 */
class Lifted {
  lift = 0;
  private groups = new Map<number, Group>();
  constructor(private root: Scene) {}

  add(...objs: Object3D[]) {
    if (!this.lift) return void this.root.add(...objs);
    const key = Math.round(this.lift * 20) / 20;
    let g = this.groups.get(key);
    if (!g) {
      g = new Group();
      g.position.y = key;
      this.root.add(g);
      this.groups.set(key, g);
    }
    g.add(...objs);
  }

  remove(...objs: Object3D[]) {
    for (const o of objs) o.removeFromParent();
  }
}

function ring(center: Vector3, r: number) {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r;
  return new Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d);
}

/** Casts spells into the world and keeps their effects alive. */
export class Spells {
  private effects: Effect[] = [];
  private flowers: Object3D[] = [];
  private grown: Object3D[] = [];
  private lights: PointLight[] = [];
  private sapling: Object3D | null = null;
  private windTarget = 1;
  private windUntil = 0;
  /** while set, spells only show: no watering, growing or flower picking reach the game */
  private quiet = false;
  /** the weather's wind; spells blow on top of it */
  baseWind = 1;

  private scene: Lifted;

  private constructor(root: Scene, private world: World, private life: Life, private hooks: SpellHooks) {
    this.scene = new Lifted(root);
    const scene = this.scene;
    // a fixed pool: adding lights later would recompile every material
    for (let i = 0; i < 4; i++) {
      const l = new PointLight("#ffd28a", 0, 7, 1.6);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push(l);
    }
  }

  static async create(scene: Scene, world: World, life: Life, hooks: SpellHooks) {
    const s = new Spells(scene, world, life, hooks);
    s.flowers = await Promise.all(FLOWER_COLORS.map((c) => prop(`flower_${c}`)));
    s.sapling = await prop("tree_round_1");
    return s;
  }

  /** Solid spell objects must not appear on top of the witch, or she could never walk out. */
  private clearOfPlayer(at: Vector3, r: number) {
    const p = shared.uPlayer.value;
    return Math.hypot(p.x - at.x, p.z - at.z) > r + 0.4;
  }

  private borrowLight(): PointLight | null {
    return this.lights.find((l) => !l.userData.busy) ?? null;
  }

  private add(e: Effect) {
    this.effects.push(e);
  }

  /**
   * Cast a spell; returns how many seconds its effect lasts.
   * `quiet` casts are for show only: someone else's spell, or a stone on an island you're visiting.
   */
  cast(spell: SpellId, at: Vector3, power: number, dir: Vector3 | null, quiet = false): number {
    this.quiet = quiet;
    this.scene.lift = this.world.ground(at.x, at.z);
    try {
      return this.castNow(spell, at.clone().setY(0), power, dir);
    } finally {
      this.quiet = false;
      this.scene.lift = 0;
    }
  }

  private castNow(spell: SpellId, at: Vector3, power: number, dir: Vector3 | null): number {
    switch (spell) {
      case "growth": return this.growth(at, power);
      case "water": return this.water(at, power);
      case "wind": return this.wind(at, power, dir);
      case "light": return this.light(at, power);
      case "flame": return this.flame(at, power);
      case "rainbow": this.water(at, power); return this.rainbow(at, power);
      case "bloom": this.water(at, power); this.growth(at, power + 1); this.growSapling(at); return 8;
      case "fireflies": return this.fireflyDance(at, power);
      case "steam": this.puff(at, "#f4f1ff", 2.4); return 2.2;
    }
  }

  fizzle(at: Vector3) {
    this.scene.lift = this.world.ground(at.x, at.z);
    this.puff(at.clone().setY(0), "#8a8494", 1.2);
    this.scene.lift = 0;
  }

  // ---------- effects ----------

  private sparkle(at: Vector3, color: string, n = 40, spread = 1.5) {
    const s = new Sparks(n, color, 10, (_, p, v) => {
      p.copy(ring(at, spread)).setY(0.2);
      v.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6);
    }, { life: 1.6, drag: 1.2 });
    this.scene.add(s.points);
    let t = 0;
    this.add({
      update: (dt) => { t += dt; s.update(dt); return t < 1.7; },
      dispose: () => { this.scene.remove(s.points); s.dispose(); },
    });
  }

  private growth(at: Vector3, power: number) {
    const r = 1.2 + power * 0.5;
    const spawned: { o: Object3D; delay: number; scale: number }[] = [];
    const n = 4 + power * 5;
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
      const p = ring(at, r);
      if (!this.world.mask.walkable(p.x, p.z, 0.15)) continue;
      const ci = Math.floor(Math.random() * this.flowers.length);
      const o = this.flowers[ci].clone();
      o.position.copy(p);
      o.rotation.y = Math.random() * Math.PI * 2;
      o.scale.setScalar(0.001);
      this.scene.add(o);
      this.grown.push(o);
      spawned.push({ o, delay: Math.random() * 0.6, scale: 0.8 + Math.random() * 0.6 });
      if (!this.quiet) this.hooks.flower(o, FLOWER_COLORS[ci]);
      i++;
    }
    while (this.grown.length > 350) this.scene.remove(this.grown.shift()!);
    if (!this.quiet) this.hooks.grow(at, r, 2 + power * 1.5);
    this.sparkle(at, "#b8f070", 30 + power * 10, r);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        for (const s of spawned) {
          const k = Math.min(Math.max((t - s.delay) / 0.7, 0), 1);
          s.o.scale.setScalar(Math.max(easeOutBack(k) * s.scale, 0.001));
        }
        return t < 1.5;
      },
    });
    return 1.5;
  }

  private water(at: Vector3, power: number) {
    const r = 1.4 + power * 0.6;
    const cloud = new Group();
    const puffGeo = new IcosahedronGeometry(1, 1);
    const cloudMat = new MeshToonMaterial({ color: "#c9d3e6", gradientMap: toonRamp(), transparent: true });
    for (let i = 0; i < 5; i++) {
      const m = new Mesh(puffGeo, cloudMat);
      const s = 0.55 + Math.random() * 0.4;
      m.scale.set(s * r * 0.6, s * 0.45, s * r * 0.5);
      m.position.set((i - 2) * r * 0.3, Math.random() * 0.25, (Math.random() - 0.5) * r * 0.5);
      m.castShadow = true;
      cloud.add(m);
    }
    cloud.position.copy(at).setY(4);
    cloud.rotation.y = Math.PI / 4;
    this.scene.add(cloud);
    const drops = 140 + power * 40;
    const pos = new Float32Array(drops * 6);
    const seed = (i: number, y?: number) => {
      const p = ring(at, r);
      const yy = y ?? 3.8 - Math.random() * 3.8;
      pos.set([p.x, yy, p.z, p.x, yy + 0.28, p.z], i * 6);
    };
    for (let i = 0; i < drops; i++) seed(i);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    const rain = new LineSegments(geo, new LineBasicMaterial({ color: "#d8ecff", transparent: true, opacity: 0.7 }));
    rain.frustumCulled = false;
    this.scene.add(rain);
    const wet = new Mesh(new CylinderGeometry(r * 1.05, r * 1.05, 0.01, 24), new MeshBasicMaterial({ color: "#1d3a5e", transparent: true, opacity: 0, depthWrite: false }));
    wet.position.copy(at).setY(0.02);
    this.scene.add(wet);
    const duration = 5 + power * 1.5;
    if (!this.quiet) this.hooks.water(at, r);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        const k = Math.min(t / 0.6, 1) * (1 - Math.max((t - duration) / 1.2, 0));
        cloud.scale.setScalar(Math.max(easeOutBack(Math.min(t / 0.6, 1)), 0.001));
        cloudMat.opacity = Math.max(k, 0);
        (rain.material as LineBasicMaterial).opacity = t < duration ? 0.7 * Math.min(t / 0.5, 1) : 0;
        (wet.material as MeshBasicMaterial).opacity = 0.22 * Math.min(t / 2, 1) * (1 - Math.max((t - duration) / 12, 0));
        for (let i = 0; i < drops; i++) {
          pos[i * 6 + 1] -= dt * 9;
          pos[i * 6 + 4] -= dt * 9;
          if (pos[i * 6 + 1] < 0.02) seed(i, 3.8);
        }
        geo.attributes.position.needsUpdate = true;
        cloud.position.y = 4 + Math.sin(t * 1.3) * 0.1;
        return t < duration + 12;
      },
      dispose: () => {
        this.scene.remove(cloud, rain, wet);
        geo.dispose();
        cloudMat.dispose();
      },
    });
    return duration;
  }

  private wind(at: Vector3, power: number, dir: Vector3 | null) {
    const d = (dir ?? new Vector3(1, 0, -1)).clone().setY(0).normalize();
    const duration = 3 + power * 1.2;
    this.windTarget = 1.6 + power * 0.9;
    this.windUntil = shared.uTime.value + duration;
    const s = new Sparks(60 + power * 20, "#e8ffd0", 7, (_, p, v) => {
      p.copy(ring(at, 3)).addScaledVector(d, -3).setY(0.3 + Math.random() * 1.6);
      v.copy(d).multiplyScalar(4 + Math.random() * 3).setY((Math.random() - 0.3) * 0.6);
    }, { life: 1.6, loop: true });
    this.scene.add(s.points);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        s.fade = Math.min(t / 0.4, 1) * (1 - Math.max((t - duration) / 1, 0));
        s.update(dt);
        return t < duration + 1;
      },
      dispose: () => { this.scene.remove(s.points); s.dispose(); },
    });
    return duration + 1;
  }

  private orbLight(at: Vector3, color: string, life: number, height: number, intensity: number, flicker: number) {
    const light = this.borrowLight();
    if (light) {
      light.userData.busy = true;
      light.color.set(color);
      light.position.copy(at).setY(height + this.scene.lift);
    }
    return {
      light,
      set: (k: number, mood: Mood, t: number) => {
        if (!light) return;
        const f = 1 + Math.sin(t * 17) * flicker * 0.5 + Math.sin(t * 7.3) * flicker * 0.5;
        light.intensity = intensity * k * f * (0.35 + mood.glow * 0.9);
      },
      release: () => {
        if (!light) return;
        light.intensity = 0;
        light.userData.busy = false;
        light.position.y = -50;
      },
      life,
    };
  }

  private light(at: Vector3, power: number) {
    const life = 40 + power * 20;
    const orb = new Mesh(new IcosahedronGeometry(0.16 + power * 0.03, 2), new MeshBasicMaterial({ color: new Color("#fff2c4").multiplyScalar(2) }));
    const halo = new Sparks(24, "#ffe9a8", 8, (_, p, v) => {
      p.copy(at).add(new Vector3((Math.random() - 0.5) * 0.6, 1.6 + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      v.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
    }, { life: 1.8, loop: true });
    this.scene.add(orb, halo.points);
    const l = this.orbLight(at, "#ffe2a8", life, 1.7, 3 + power, 0);
    const lift = this.scene.lift;
    let t = 0;
    this.add({
      update: (dt, mood) => {
        t += dt;
        const k = Math.min(t / 0.6, 1) * (1 - Math.max((t - life + 2) / 2, 0));
        orb.position.copy(at).setY(1.6 + Math.sin(t * 1.4) * 0.15);
        orb.scale.setScalar(Math.max(easeOutBack(Math.min(t / 0.6, 1)) * k, 0.001));
        l.light?.position.copy(orb.position).setY(orb.position.y + lift);
        l.set(k, mood, t);
        halo.fade = k;
        halo.update(dt);
        return t < life;
      },
      dispose: () => { this.scene.remove(orb, halo.points); halo.dispose(); l.release(); },
    });
    return life;
  }

  private flame(at: Vector3, power: number) {
    const life = 45 + power * 15;
    const fire = new Group();
    fire.position.copy(at);
    const logGeo = new CylinderGeometry(0.08, 0.09, 0.9, 6);
    logGeo.rotateZ(Math.PI / 2);
    for (const a of [0.3, -0.4, 1.4]) {
      const log = new Mesh(logGeo, toon("bark-dark"));
      log.rotation.y = a;
      log.position.y = 0.09;
      log.castShadow = true;
      fire.add(log);
    }
    const stoneGeo = new IcosahedronGeometry(0.13, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new Mesh(stoneGeo, toon("rock"));
      st.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55);
      st.castShadow = true;
      fire.add(st);
    }
    const flames = ["#ff8a2a", "#ffb340", "#ffe070"].map((c, i) => {
      const m = new Mesh(new ConeGeometry(0.22 - i * 0.05, 0.7 - i * 0.15, 7), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(2.2 + i * 0.4), transparent: true, opacity: 0.9 }));
      m.position.y = 0.4 - i * 0.04;
      fire.add(m);
      return m;
    });
    fire.scale.setScalar(0.001);
    this.scene.add(fire);
    const embers = new Sparks(26 + power * 8, "#ffb050", 6, (_, p, v) => {
      p.copy(at).add(new Vector3((Math.random() - 0.5) * 0.3, 0.4, (Math.random() - 0.5) * 0.3));
      v.set((Math.random() - 0.5) * 0.4, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4);
    }, { life: 1.4, loop: true, drag: 0.6 });
    this.scene.add(embers.points);
    const l = this.orbLight(at, "#ff9a4a", life, 0.9, 9 + power * 2, 0.35);
    const solid = this.clearOfPlayer(at, 0.55);
    if (solid) this.world.mask.addSolid(at.x, at.z, 0.55);
    let t = 0;
    this.add({
      update: (dt, mood) => {
        t += dt;
        const k = Math.min(t / 0.5, 1) * (1 - Math.max((t - life + 3) / 3, 0));
        fire.scale.setScalar(Math.max(easeOutBack(Math.min(t / 0.5, 1)), 0.001));
        flames.forEach((f, i) => {
          f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, (1 + Math.sin(t * 9 + i * 2) * 0.2) * k, 1 + Math.cos(t * 11 + i) * 0.12);
          f.rotation.y += dt * (1 + i);
        });
        l.set(k, mood, t);
        embers.fade = k;
        embers.update(dt);
        return t < life;
      },
      dispose: () => {
        this.scene.remove(fire, embers.points);
        embers.dispose();
        l.release();
        if (solid) this.world.mask.removeSolid(at.x, at.z);
      },
    });
    return life;
  }

  private rainbow(at: Vector3, power: number) {
    const colors = ["#ff7a8a", "#ffb35c", "#ffe36b", "#8fe07a", "#6cc3f5", "#9a8af0"];
    const arc = new Group();
    const R = 2.4 + power * 0.4;
    colors.forEach((c, i) => {
      const m = new Mesh(new TorusGeometry(R - i * 0.16, 0.085, 6, 40, Math.PI), new MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
      arc.add(m);
    });
    arc.position.copy(at).setY(0.1);
    arc.rotation.y = Math.PI / 4; // face the camera
    this.scene.add(arc);
    let t = 0;
    const life = 14 + power * 3;
    this.add({
      update: (dt) => {
        t += dt;
        const k = Math.min(Math.max((t - 1.5) / 1.5, 0), 1) * (1 - Math.max((t - life + 3) / 3, 0));
        for (const m of arc.children as Mesh[]) (m.material as MeshBasicMaterial).opacity = k * 0.6;
        return t < life;
      },
      dispose: () => this.scene.remove(arc),
    });
    return life;
  }

  private growSapling(at: Vector3) {
    if (!this.sapling || !this.world.mask.walkable(at.x, at.z, 0.6)) return;
    const tree = this.sapling.clone();
    tree.position.copy(at);
    tree.rotation.y = Math.random() * Math.PI * 2;
    tree.scale.setScalar(0.001);
    this.scene.add(tree);
    if (this.clearOfPlayer(at, 0.35)) this.world.mask.addSolid(at.x, at.z, 0.35);
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        tree.scale.setScalar(Math.max(easeOutBack(Math.min((t - 0.8) / 1.6, 1)) * 0.85, 0.001));
        return t < 2.5;
      },
    });
  }

  private fireflyDance(at: Vector3, power: number) {
    const life = 15 + power * 5;
    const n = 40 + power * 15;
    const seeds = Array.from({ length: n }, () => ({ r: 0.6 + Math.random() * 2, h: 0.4 + Math.random() * 2, s: 0.6 + Math.random() * 1.2, o: Math.random() * 6.28 }));
    let t = 0;
    const s = new Sparks(n, "#ffe27a", 9, (i, p) => {
      const q = seeds[i];
      const a = q.o + t * q.s;
      p.set(at.x + Math.cos(a) * q.r, q.h + Math.sin(t * 2 + q.o) * 0.3, at.z + Math.sin(a) * q.r);
    }, { life: 0.05, loop: true, steady: true });
    this.scene.add(s.points);
    this.add({
      update: (dt) => {
        t += dt;
        s.fade = Math.min(t / 1, 1) * (1 - Math.max((t - life + 2) / 2, 0));
        s.update(dt);
        return t < life;
      },
      dispose: () => { this.scene.remove(s.points); s.dispose(); },
    });
    return life;
  }

  private puff(at: Vector3, color: string, size: number) {
    const mat = new MeshToonMaterial({ color, gradientMap: toonRamp(), transparent: true });
    const geo = new IcosahedronGeometry(1, 0);
    const puffs = Array.from({ length: 7 }, () => {
      const m = new Mesh(geo, mat);
      m.position.copy(ring(at, 0.6)).setY(0.3);
      m.userData.v = new Vector3((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6);
      this.scene.add(m);
      return m;
    });
    let t = 0;
    this.add({
      update: (dt) => {
        t += dt;
        const k = Math.min(t / 2.2, 1);
        for (const m of puffs) {
          m.position.addScaledVector(m.userData.v, dt);
          m.scale.setScalar(Math.max(Math.sin(Math.PI * Math.sqrt(k)) * 0.35 * size, 0.001));
        }
        mat.opacity = 1 - k * 0.6;
        return t < 2.2;
      },
      dispose: () => { for (const m of puffs) this.scene.remove(m); mat.dispose(); },
    });
  }

  update(dt: number, mood: Mood) {
    const now = shared.uTime.value;
    const target = now < this.windUntil ? Math.max(this.windTarget, this.baseWind) : this.baseWind;
    shared.uWind.value += (target - shared.uWind.value) * (1 - Math.exp(-dt * 2.5));
    this.life.windBoost = shared.uWind.value;
    this.effects = this.effects.filter((e) => {
      const alive = e.update(dt, mood);
      if (!alive) e.dispose?.();
      return alive;
    });
  }
}
