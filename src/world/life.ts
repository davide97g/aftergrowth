import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  Object3D,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from "three";
import { prop } from "../core/assets";
import { PALETTE } from "../core/palette";
import { shared, toon, toonRamp } from "../render/toon";
import type { Mood } from "./daycycle";
import type { World } from "./world";

/** Glowing drifting motes: fireflies at night, golden pollen at sunset. */
class Motes {
  readonly points: Points;
  private mat: ShaderMaterial;

  constructor(positions: Vector3[], tint: string, size: number) {
    const geo = new BufferGeometry();
    const pos = new Float32Array(positions.length * 3);
    const seed = new Float32Array(positions.length);
    positions.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3);
      seed[i] = Math.random();
    });
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: shared.uTime,
        uOpacity: { value: 0 },
        uSize: { value: size * Math.min(devicePixelRatio, 2) },
        uColor: { value: new Color(tint).multiplyScalar(2.2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        varying float vTw;
        void main() {
          vec3 p = position;
          float t = uTime * ( 0.25 + aSeed * 0.35 );
          p.x += sin( t + aSeed * 20.0 ) * 0.9;
          p.y += sin( t * 1.3 + aSeed * 11.0 ) * 0.45;
          p.z += cos( t * 0.9 + aSeed * 7.0 ) * 0.9;
          vTw = 0.5 + 0.5 * sin( uTime * ( 1.5 + aSeed * 3.0 ) + aSeed * 30.0 );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
          gl_PointSize = uSize * ( 0.55 + 0.45 * vTw );
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vTw;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          float a = smoothstep( 0.5, 0.0, d );
          a = a * a;
          gl_FragColor = vec4( uColor * a * ( 0.35 + 0.65 * vTw ) * uOpacity, 1.0 );
          #include <colorspace_fragment>
        }`,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  set opacity(v: number) {
    this.mat.uniforms.uOpacity.value = v;
    this.points.visible = v > 0.01;
  }
}

interface Butterfly { obj: Group; wings: Mesh[]; home: Vector3; f: [number, number, number]; phase: number }

class Bunny {
  private state: "idle" | "hop" = "idle";
  private timer = 1 + Math.random() * 2;
  private from = new Vector3();
  private to = new Vector3();
  private hops = 0;
  constructor(readonly obj: Object3D, private world: World) {}

  update(dt: number, player: Vector3) {
    const p = this.obj.position;
    const scared = p.distanceTo(player) < 1.8;
    if (this.state === "idle") {
      this.timer -= dt * (scared ? 6 : 1);
      if (this.timer <= 0) this.pickHop(player, scared);
      return;
    }
    this.timer += dt / 0.42;
    const t = Math.min(this.timer, 1);
    p.lerpVectors(this.from, this.to, t);
    p.y = this.world.ground(p.x, p.z) + Math.sin(Math.PI * t) * 0.28;
    if (t >= 1) {
      p.y = this.world.ground(p.x, p.z);
      if (--this.hops > 0) this.pickHop(player, scared, true);
      else {
        this.state = "idle";
        this.timer = 1.5 + Math.random() * 4;
      }
    }
  }

  private pickHop(player: Vector3, scared: boolean, keepDir = false) {
    const p = this.obj.position;
    let yaw = keepDir ? this.obj.rotation.y : Math.random() * Math.PI * 2;
    if (scared) yaw = Math.atan2(p.x - player.x, p.z - player.z) + (Math.random() - 0.5);
    for (let tries = 0; tries < 6; tries++) {
      const tx = p.x + Math.sin(yaw) * 0.55;
      const tz = p.z + Math.cos(yaw) * 0.55;
      if (this.world.mask.walkable(tx, tz, 0.2)) {
        this.from.set(p.x, 0, p.z);
        this.to.set(tx, 0, tz);
        this.obj.rotation.y = yaw;
        this.state = "hop";
        this.timer = 0;
        if (!keepDir) this.hops = 2 + Math.floor(Math.random() * (scared ? 5 : 3));
        return;
      }
      yaw += 1.1;
    }
    this.state = "idle";
    this.timer = 1;
  }
}

class Puffs {
  private items: { mesh: Mesh; life: number; vel: Vector3 }[] = [];
  private next = 0;
  constructor(scene: Scene, count: number, make: (i: number) => Mesh) {
    for (let i = 0; i < count; i++) {
      const mesh = make(i);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 1, vel: new Vector3() });
    }
  }

  emit(at: Vector3, vel: Vector3) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.mesh.position.copy(at);
    it.vel.copy(vel);
    it.life = 0;
    it.mesh.visible = true;
  }

  update(dt: number, duration: number, size: number) {
    for (const it of this.items) {
      if (it.life >= 1) continue;
      it.life = Math.min(it.life + dt / duration, 1);
      it.mesh.position.addScaledVector(it.vel, dt);
      it.mesh.scale.setScalar(Math.sin(Math.PI * Math.sqrt(it.life)) * size);
      it.mesh.rotation.y += dt;
      if (it.life >= 1) it.mesh.visible = false;
    }
  }
}

/** Everything that moves on its own: the island must never look still. */
export class Life {
  private butterflies: Butterfly[] = [];
  private fireflies: Motes;
  private pollen: Motes;
  private smoke: Puffs;
  private petals: Puffs;
  private bunnies: Bunny[] = [];
  private smokeTimer = 0;
  /** wind strength multiplier; spells raise it */
  windBoost = 1;

  private constructor(scene: Scene, private world: World) {
    const pts = (n: number, yMin: number, yMax: number) => {
      const out: Vector3[] = [];
      const { center, radius } = world.bounds;
      while (out.length < n) {
        const x = center.x + (Math.random() * 2 - 1) * radius;
        const z = center.z + (Math.random() * 2 - 1) * radius;
        if (world.mask.onGround(x, z)) out.push(new Vector3(x, world.ground(x, z) + yMin + Math.random() * (yMax - yMin), z));
      }
      return out;
    };
    this.fireflies = new Motes(pts(110, 0.3, 2.2), "#FFE27A", 9);
    this.pollen = new Motes(pts(70, 0.4, 2.8), "#FFD08A", 5);
    scene.add(this.fireflies.points, this.pollen.points);

    const smokeMat = new MeshToonMaterial({ color: "#EEE8F2", gradientMap: toonRamp() });
    const puffGeo = new IcosahedronGeometry(1, 0);
    this.smoke = new Puffs(scene, 9, () => new Mesh(puffGeo, smokeMat));
    const petalColors = ["flower-pink", "flower-yellow", "flower-white", "grass"] as const;
    const petalGeo = new IcosahedronGeometry(1, 0);
    this.petals = new Puffs(scene, 24, (i) => new Mesh(petalGeo, toon(petalColors[i % petalColors.length])));

    const wingGeo = new BufferGeometry();
    wingGeo.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, -0.06, 0.16, 0, 0.02, 0.02, 0, 0.12, 0, 0, -0.06, 0.12, 0, -0.1, 0.16, 0, 0.02]), 3));
    wingGeo.computeVertexNormals();
    const tints = [PALETTE["flower-pink"], PALETTE["flower-yellow"], PALETTE["flower-blue"], PALETTE["flower-white"]];
    for (let i = 0; i < 14; i++) {
      const mat = new MeshToonMaterial({ color: tints[i % tints.length], gradientMap: toonRamp(), side: DoubleSide });
      const obj = new Group();
      const wings = [1, -1].map((s) => {
        const w = new Mesh(wingGeo, mat);
        w.scale.x = s;
        obj.add(w);
        return w;
      });
      const home = world.flowers[Math.floor(Math.random() * world.flowers.length)].clone();
      scene.add(obj);
      this.butterflies.push({ obj, wings, home, f: [0.3 + Math.random() * 0.3, 0.7 + Math.random() * 0.5, 0.25 + Math.random() * 0.3], phase: Math.random() * 100 });
    }
  }

  static async create(scene: Scene, world: World) {
    const life = new Life(scene, world);
    for (let i = 0; i < 3; i++) {
      const obj = await prop("bunny");
      let x = 0;
      let z = 0;
      do {
        x = (Math.random() * 2 - 1) * 8;
        z = (Math.random() * 2 - 1) * 8;
      } while (!world.mask.walkable(x, z, 0.4));
      obj.position.set(x, world.ground(x, z), z);
      scene.add(obj);
      life.bunnies.push(new Bunny(obj, world));
    }
    return life;
  }

  /** The nearest butterfly within `range` of `p` (on the wing, by day), for the familiar to chase. */
  butterfly(p: Vector3, range: number): Vector3 | null {
    let best: Vector3 | null = null;
    let bd = range;
    for (const b of this.butterflies) {
      if (!b.obj.visible) continue;
      const d = Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z);
      if (d < bd) {
        bd = d;
        best = b.obj.position;
      }
    }
    return best;
  }

  /** Called by the player each footstep. */
  footstep(at: Vector3, running: boolean) {
    const n = running ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.petals.emit(
        at.clone().add(new Vector3((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3)),
        new Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6),
      );
    }
  }

  update(dt: number, mood: Mood, player: Vector3) {
    const t = shared.uTime.value;
    if (this.world.blades) this.world.blades.rotation.z -= dt * 0.9 * this.windBoost ** 1.5;
    this.world.portal.uniforms.uGlow.value = mood.glow;

    this.fireflies.opacity = mood.fireflies;
    this.pollen.opacity = mood.pollen;

    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.7;
      this.smoke.emit(this.world.smokeOrigin, new Vector3(0.25, 0.9, -0.1));
    }
    this.smoke.update(dt, 4.5, 0.45);
    this.petals.update(dt, 0.9, 0.06);

    const visible = mood.butterflies > 0.05;
    for (const b of this.butterflies) {
      b.obj.visible = visible;
      if (!visible) continue;
      const p = t + b.phase;
      const prev = b.obj.position.clone();
      b.obj.position.set(
        b.home.x + Math.sin(p * b.f[0]) * 1.4 + Math.sin(p * b.f[1] * 1.7) * 0.3,
        b.home.y + 0.05 + Math.abs(Math.sin(p * b.f[1])) * 0.6,
        b.home.z + Math.cos(p * b.f[2]) * 1.4,
      );
      const d = b.obj.position.clone().sub(prev);
      if (d.lengthSq() > 1e-8) b.obj.rotation.y = Math.atan2(d.x, d.z);
      const flap = 0.2 + (Math.sin(p * 22) * 0.5 + 0.5) * 1.1;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
      b.obj.scale.setScalar(mood.butterflies * 1.6);
    }

    for (const bunny of this.bunnies) bunny.update(dt, player);

    const clouds = this.world.clouds;
    const center = clouds.userData.center as Vector3;
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      c.position.z -= c.userData.speed * dt * 0.4;
      if (c.position.x - center.x > 50) c.position.x -= 100;
      if (center.z - c.position.z > 50) c.position.z += 100;
    }
  }
}
