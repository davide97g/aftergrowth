import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  Euler,
  Object3D,
} from "three";
import type { Theme } from "../../shared/protocol";
import type { Season } from "../../shared/seasons";
import { PALETTE, type Token } from "../core/palette";
import { KINDS } from "../island/layout";
import { shared, toon, toonRamp } from "../render/toon";
import type { Mood } from "./daycycle";
import type { IslandWorld } from "./world";

/** What a footstep lands on. */
export type Surface = "grass" | "soil" | "wood" | "stone" | "water" | "snow";

/** ground tokens that darken when wet */
const WETTABLE: Token[] = ["grass", "grass-dark", "turf", "soil", "soil-dark", "path", "cobble", "cobble-dark", "moss"];

/** 0..1 bell around `peak` (hours), `width` hours each side */
function bell(hour: number, peak: number, width: number) {
  const d = Math.abs(hour - peak) / width;
  return d >= 1 ? 0 : (1 - d * d) ** 2;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function puddleMaterial(seed: number) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: shared.uTime,
      uSky: { value: new Color() },
      uWater: { value: new Color(PALETTE.water) },
      uRain: { value: 0 },
      uLevel: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSky;
      uniform vec3 uWater;
      uniform float uRain;
      uniform float uLevel;
      uniform float uSeed;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 c = vUv - 0.5;
        float a = atan( c.y, c.x );
        float d = length( c ) * 2.0;
        // a wobbly rim, so no two puddles are round
        float rim = 0.78 + 0.12 * sin( a * 3.0 + uSeed ) + 0.07 * sin( a * 5.0 + uSeed * 2.3 );
        float alpha = smoothstep( rim, rim - 0.18, d ) * uLevel;
        // raindrop rings, like the pond's
        vec2 p = vWorld.xz;
        vec2 cell = floor( p * 2.4 );
        vec2 f = fract( p * 2.4 ) - 0.5;
        float h = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        float rt = fract( uTime * 1.1 + h );
        float ring = smoothstep( 0.05, 0.0, abs( length( f - ( h - 0.5 ) * 0.4 ) - rt * 0.42 ) ) * ( 1.0 - rt );
        // the sky in it, a bright streak of reflection, darker at the deep middle
        vec3 col = mix( uSky * 1.05, uWater, 0.35 + 0.25 * ( 1.0 - d ) );
        float streak = smoothstep( 0.06, 0.0, abs( c.x + c.y * 0.6 - 0.12 ) ) * 0.35;
        col += streak + ring * uRain * 0.4;
        gl_FragColor = vec4( col, alpha * 0.85 );
        #include <colorspace_fragment>
      }`,
  });
}

function mistMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shared.uTime, uColor: { value: new Color("#ffffff") }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float d = length( vUv - 0.5 ) * 2.0;
        float wisp = 0.65 + 0.35 * sin( vWorld.x * 0.9 + uTime * 0.2 ) * sin( vWorld.z * 0.7 - uTime * 0.15 );
        float a = smoothstep( 1.0, 0.1, d ) * wisp * uOpacity;
        gl_FragColor = vec4( uColor, a );
        #include <colorspace_fragment>
      }`,
  });
}

function dewMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: shared.uTime, uOpacity: { value: 0 }, uSize: { value: 5 * Math.min(devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vTw;
      void main() {
        // a glint now and then, each at its own moment
        vTw = pow( max( 0.0, sin( uTime * ( 0.8 + aSeed * 1.7 ) + aSeed * 60.0 ) ), 14.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_PointSize = uSize * ( 0.4 + vTw );
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        // a little four-point star
        float star = max( smoothstep( 0.06, 0.0, abs( c.x ) ) * smoothstep( 0.5, 0.0, abs( c.y ) ),
                          smoothstep( 0.06, 0.0, abs( c.y ) ) * smoothstep( 0.5, 0.0, abs( c.x ) ) );
        float core = smoothstep( 0.2, 0.0, length( c ) );
        float a = max( star, core ) * vTw * uOpacity;
        gl_FragColor = vec4( vec3( 1.0, 0.98, 0.9 ) * a * 1.6, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
}

interface Puddle { mesh: Mesh; mat: ShaderMaterial; x: number; z: number; r: number; aspect: number; level: number; dries: number }
interface Leaf { pos: Vector3; spin: Euler; rate: Vector3; seed: number; landed: number; life: number }
interface Bee { hive: Vector3; from: Vector3; to: Vector3; t: number; len: number; stay: number; out: boolean; seed: number }

const m4 = new Matrix4();
const q = new Quaternion();
const sv = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * The island answering the weather and the witch: puddles after rain and wet, darker ground, dawn
 * mist and dew, leaves falling from the trees, bees between hives and flowers, and what each
 * footstep lands on.
 */
export class Atmosphere {
  /** 0 dry … 1 soaked: rain wets the ground, sun dries it over a few game hours */
  wet = 0;
  private puddles: Puddle[] = [];
  private wetBase = new Map<Token, Color>();
  private mist: Mesh[] = [];
  private mistMat = mistMaterial();
  private dew: Points;
  private dewMat = dewMaterial();
  private leaves: Leaf[] = [];
  private leafMesh: InstancedMesh;
  private canopies: Box3[] = [];
  private leafTimer = 0;
  private bees: Bee[] = [];
  private beeMesh: InstancedMesh | null = null;
  private drops: { mesh: Mesh; vel: Vector3; life: number }[] = [];
  private nextDrop = 0;
  private time = 0;
  /** the hives' hum, 0..1 near one by day */
  hum = 0;

  /** 0..1: the Petal Festival's blossom storm */
  petalStorm = 0;
  private prints: { mesh: Mesh; age: number }[] = [];
  private nextPrint = 0;
  private breaths: { mesh: Mesh; life: number }[] = [];
  private nextBreath = 0;

  constructor(scene: Scene, private world: IslandWorld, private theme: Theme, private season: Season | null = null) {
    const rand = rng(Math.round(world.bounds.radius * 1000) + world.layout.seed);
    const { center, radius } = world.bounds;
    const flatHere = (x: number, z: number) => {
      const g = world.ground(x, z);
      return [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].every(([dx, dz]) => Math.abs(world.ground(x + dx, z + dz) - g) < 0.03);
    };
    const clear = (x: number, z: number, r: number) =>
      world.mask.walkable(x, z, r) && flatHere(x, z) &&
      world.plots.every((p) => Math.hypot(p.x - x, p.z - z) > 1.4) &&
      (!world.door || Math.hypot(world.door.x - x, world.door.z - z) > 1.5);

    // puddles: hollows in the ground that fill when it rains
    const geo = new CircleGeometry(1, 20);
    geo.rotateX(-Math.PI / 2);
    for (let tries = 0; tries < 400 && this.puddles.length < (season === "winter" ? 0 : 9); tries++) {
      const x = center.x + (rand() * 2 - 1) * radius * 0.8;
      const z = center.z + (rand() * 2 - 1) * radius * 0.8;
      const r = 0.7 + rand() * 0.6;
      if (!clear(x, z, r * 0.8) || this.puddles.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 1)) continue;
      const mat = puddleMaterial(rand() * 10);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, world.ground(x, z) + 0.018, z);
      mesh.rotation.y = rand() * Math.PI;
      mesh.renderOrder = 2;
      mesh.visible = false;
      scene.add(mesh);
      this.puddles.push({ mesh, mat, x, z, r, aspect: 0.7 + rand() * 0.4, level: 0, dries: 3 + rand() * 6 });
    }

    for (const t of WETTABLE) this.wetBase.set(t, (toon(t) as MeshToonMaterial).color.clone());

    // mist: soft flat wisps that lie low over the meadow at dawn and after rain
    const plane = new PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new Mesh(plane, this.mistMat);
      const s = 4 + rand() * 4;
      m.scale.set(s, 1, s * (0.6 + rand() * 0.3));
      m.position.set(center.x + (rand() * 2 - 1) * radius * 0.8, 0.25 + rand() * 0.6, center.z + (rand() * 2 - 1) * radius * 0.8);
      m.position.y += world.ground(m.position.x, m.position.z);
      m.userData.speed = 0.15 + rand() * 0.2;
      m.renderOrder = 3;
      m.visible = false;
      scene.add(m);
      this.mist.push(m);
    }

    // dew: glints in the grass on a sunny morning, and after rain
    const pts: number[] = [];
    const seeds: number[] = [];
    for (let tries = 0; tries < 5000 && seeds.length < 320; tries++) {
      const x = center.x + (rand() * 2 - 1) * radius;
      const z = center.z + (rand() * 2 - 1) * radius;
      if (!world.mask.onGround(x, z)) continue;
      pts.push(x, world.ground(x, z) + 0.05 + rand() * 0.2, z);
      seeds.push(rand());
    }
    const dg = new BufferGeometry();
    dg.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    dg.setAttribute("aSeed", new BufferAttribute(new Float32Array(seeds), 1));
    this.dew = new Points(dg, this.dewMat);
    this.dew.frustumCulled = false;
    this.dew.visible = false;
    scene.add(this.dew);

    // leaves fall from every tree on the island; their canopies are where they start
    for (const p of world.layout.objects) {
      if (KINDS[p.kind]?.cat !== "trees") continue;
      const o = world.objects.get(p.id);
      if (!o) continue;
      const box = new Box3().setFromObject(o);
      box.min.y = box.min.y + (box.max.y - box.min.y) * 0.45;
      this.canopies.push(box);
    }
    const leafGeo = new IcosahedronGeometry(1, 0);
    leafGeo.scale(0.07, 0.014, 0.05);
    // foliage takes the island's theme (orange in autumn, pink in blossom); spring trees drop blossom
    const leafColor = season === "spring" ? PALETTE["flower-pink"] : PALETTE.foliage;
    this.leafMesh = new InstancedMesh(leafGeo, new MeshToonMaterial({ color: leafColor, emissive: PALETTE["flower-pink"], emissiveIntensity: 0, gradientMap: toonRamp() }), 140);
    this.leafMesh.frustumCulled = false;
    for (let i = 0; i < 140; i++) {
      this.leafMesh.setMatrixAt(i, HIDDEN);
      this.leaves.push({ pos: new Vector3(), spin: new Euler(), rate: new Vector3(), seed: rand(), landed: 0, life: 1 });
    }
    this.leafMesh.castShadow = true;
    scene.add(this.leafMesh);

    // bees: three to a hive
    const hives = world.uses.hives;
    if (hives.length) {
      const beeGeo = new IcosahedronGeometry(0.055, 0);
      beeGeo.scale(1, 0.85, 1.3);
      this.beeMesh = new InstancedMesh(beeGeo, toon("honey"), hives.length * 3);
      this.beeMesh.frustumCulled = false;
      for (const h of hives) {
        for (let i = 0; i < 3; i++) {
          const hive = h.pos.clone().setY(world.ground(h.pos.x, h.pos.z) + 0.55);
          this.bees.push({ hive, from: hive.clone(), to: hive.clone(), t: 1, len: 1, stay: rand() * 3, out: false, seed: rand() * 100 });
        }
      }
      scene.add(this.beeMesh);
    }

    // footprints in the snow, and breath in the cold
    if (season === "winter") {
      const printGeo = new CircleGeometry(0.09, 8);
      printGeo.rotateX(-Math.PI / 2);
      printGeo.scale(0.75, 1, 1.25);
      const printMat = new MeshToonMaterial({ color: "#8d9db6", gradientMap: toonRamp(), transparent: true, opacity: 0.8, depthWrite: false });
      for (let i = 0; i < 48; i++) {
        const mesh = new Mesh(printGeo, printMat.clone());
        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        this.prints.push({ mesh, age: 99 });
      }
      const breathMat = new MeshToonMaterial({ color: "#ffffff", gradientMap: toonRamp(), transparent: true, opacity: 0.7, depthWrite: false });
      const breathGeo = new IcosahedronGeometry(1, 0);
      for (let i = 0; i < 8; i++) {
        const mesh = new Mesh(breathGeo, breathMat);
        mesh.visible = false;
        scene.add(mesh);
        this.breaths.push({ mesh, life: 1 });
      }
    }

    // splashes from puddles
    const dropMat = new MeshToonMaterial({ color: "#a9d8f5", gradientMap: toonRamp() });
    const dropGeo = new IcosahedronGeometry(1, 0);
    for (let i = 0; i < 16; i++) {
      const mesh = new Mesh(dropGeo, dropMat);
      mesh.visible = false;
      scene.add(mesh);
      this.drops.push({ mesh, vel: new Vector3(), life: 1 });
    }
  }

  /** The puddle under (x, z), if there's water in it. */
  private puddleAt(x: number, z: number) {
    return this.puddles.find((p) => p.level > 0.15 && Math.hypot(p.x - x, p.z - z) < p.r * Math.sqrt(p.level) * 0.85) ?? null;
  }

  /** A footprint pressed into the snow (winter only). `yaw` is the way she faces. */
  footprint(at: Vector3, yaw: number, side: number) {
    if (!this.prints.length) return;
    const p = this.prints[this.nextPrint];
    this.nextPrint = (this.nextPrint + 1) % this.prints.length;
    p.mesh.position.set(at.x + Math.cos(yaw) * 0.09 * side, this.world.ground(at.x, at.z) + 0.012, at.z - Math.sin(yaw) * 0.09 * side);
    p.mesh.rotation.y = yaw;
    p.mesh.visible = true;
    p.age = 0;
  }

  /** A puff of breath in the cold air. */
  breathe(at: Vector3) {
    if (!this.breaths.length) return;
    const b = this.breaths[this.nextBreath];
    this.nextBreath = (this.nextBreath + 1) % this.breaths.length;
    b.mesh.position.copy(at);
    b.life = 0;
    b.mesh.visible = true;
  }

  /** What a footstep at `at` lands on. */
  surface(at: Vector3): Surface {
    if (this.puddleAt(at.x, at.z)) return "water";
    const w = this.world;
    if (w.kind === "kingdom" || w.kind === "market") return "stone";
    // the rope bridge and the portal islet's planks
    const { b0, b1 } = w.bridge;
    const seg = sv.copy(b1).sub(b0);
    const k = Math.max(0, Math.min(1, ((at.x - b0.x) * seg.x + (at.z - b0.z) * seg.z) / Math.max(seg.x * seg.x + seg.z * seg.z, 1e-6)));
    if (Math.hypot(b0.x + seg.x * k - at.x, b0.z + seg.z * k - at.z) < 0.7) return "wood";
    if (w.plots.some((p) => Math.abs(p.x - at.x) + Math.abs(p.z - at.z) < 0.75)) return "soil";
    for (const o of w.layout.objects) {
      if ((o.kind === "path_stone" || o.kind === "path_wood") && Math.hypot(o.x - at.x, o.z - at.z) < 0.65 * o.scale) return o.kind === "path_wood" ? "wood" : "stone";
    }
    return this.season === "winter" ? "snow" : "grass";
  }

  /** Step in a puddle: a ring of droplets. */
  splash(at: Vector3) {
    for (let i = 0; i < 5; i++) {
      const d = this.drops[this.nextDrop];
      this.nextDrop = (this.nextDrop + 1) % this.drops.length;
      const a = Math.random() * Math.PI * 2;
      d.mesh.position.copy(at).setY(at.y + 0.05);
      d.vel.set(Math.cos(a) * 0.9, 1.4 + Math.random() * 0.8, Math.sin(a) * 0.9);
      d.life = 0;
      d.mesh.visible = true;
    }
  }

  /** how lively the hives are right now, near `p` */
  private hiveNear(p: Vector3) {
    let best = 0;
    for (const h of this.world.uses.hives) best = Math.max(best, 1 - Math.hypot(h.pos.x - p.x, h.pos.z - p.z) / 4);
    return best;
  }

  update(dt: number, hours: number, hour: number, mood: Mood, rain: number, wind: number, player: Vector3) {
    this.time += dt;
    const day = 1 - mood.glow;

    // the ground soaks up rain and dries in the sun
    if (rain > 0.3) this.wet = Math.min(1, this.wet + dt * 0.06 * rain);
    else this.wet = Math.max(0, this.wet - hours / (4 - day * 1.5));
    // (snow doesn't darken)
    const darken = this.season === "winter" ? 0 : this.wet * 0.2;
    for (const [t, base] of this.wetBase) (toon(t) as MeshToonMaterial).color.copy(base).multiplyScalar(1 - darken);

    for (const p of this.puddles) {
      if (rain > 0.3) p.level = Math.min(1, p.level + dt * 0.05 * rain);
      else p.level = Math.max(0, p.level - hours / p.dries);
      p.mesh.visible = p.level > 0.01;
      if (!p.mesh.visible) continue;
      const s = Math.sqrt(p.level);
      p.mesh.scale.set(p.r * s, 1, p.r * s * p.aspect);
      p.mat.uniforms.uLevel.value = Math.min(1, p.level * 3);
      p.mat.uniforms.uRain.value = rain;
      p.mat.uniforms.uSky.value.copy(mood.skyBottom).lerp(mood.skyTop, 0.5);
      p.mat.uniforms.uWater.value.copy(mood.water);
    }

    // dawn mist, thicker after a wet night; wind blows it away
    const mist = Math.min(1, bell(hour, 6.2, 2.2) * (0.7 + this.wet * 0.5) + this.wet * 0.25 * day) * (1 - Math.min(1, (wind - 1) * 1.2));
    this.mistMat.uniforms.uOpacity.value = mist * 0.32;
    this.mistMat.uniforms.uColor.value.copy(mood.skyBottom).lerp(new Color("#ffffff"), 0.6);
    const { center, radius } = this.world.bounds;
    for (const m of this.mist) {
      m.visible = mist > 0.02;
      m.position.x += m.userData.speed * dt * wind;
      if (m.position.x > center.x + radius) m.position.x -= radius * 2;
    }

    // dew glints when the morning sun is on wet grass
    const dew = Math.min(1, bell(hour, 7.3, 2) + this.wet * 0.7 * (1 - rain)) * day * (1 - rain);
    this.dewMat.uniforms.uOpacity.value = dew;
    this.dew.visible = dew > 0.02;

    // leaves fall in autumn (or on an autumn island), blossom in spring; bare trees in winter
    const s = this.season;
    const base = s === "winter" ? 0 : s === "autumn" || this.theme === "autumn" ? 1.1 : s === "spring" || this.theme === "blossom" ? 0.7 : 0.15;
    const rate = base * (1 + (wind - 1) * 3) + this.petalStorm * 12;
    this.leafTimer -= dt * rate;
    if (this.leafTimer <= 0 && (this.canopies.length || this.petalStorm > 0)) {
      this.leafTimer = 0.4 + Math.random() * 0.8;
      const leaf = this.leaves.find((l) => l.life >= 1);
      if (leaf) {
        if (this.petalStorm > 0 && (Math.random() < 0.6 || !this.canopies.length)) {
          // the storm comes from the sky, all around her
          leaf.pos.set(player.x + (Math.random() - 0.5) * 16, player.y + 5 + Math.random() * 3, player.z + (Math.random() - 0.5) * 16);
        } else {
          const b = this.canopies[Math.floor(Math.random() * this.canopies.length)];
          leaf.pos.set(b.min.x + Math.random() * (b.max.x - b.min.x), b.min.y + Math.random() * (b.max.y - b.min.y), b.min.z + Math.random() * (b.max.z - b.min.z));
        }
        leaf.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        leaf.rate.set(1 + Math.random() * 2, 0.5 + Math.random(), 1 + Math.random() * 2);
        leaf.landed = 0;
        leaf.life = 0;
      }
    }
    this.leaves.forEach((l, i) => {
      if (l.life >= 1) return;
      const g = this.world.ground(l.pos.x, l.pos.z);
      if (l.landed > 0) {
        // lies on the grass a while, then is gone
        l.landed += dt;
        if (l.landed > (this.petalStorm > 0 ? 4 : 8)) l.life = 1;
        // kicked up by a passing witch
        if (Math.hypot(player.x - l.pos.x, player.z - l.pos.z) < 0.5 && l.landed > 0.5) {
          l.landed = 0;
          l.pos.y = g + 0.4;
          l.pos.x += (l.pos.x - player.x) * 0.6;
          l.pos.z += (l.pos.z - player.z) * 0.6;
        }
      } else {
        const t = this.time * 1.8 + l.seed * 20;
        l.pos.y -= dt * (0.45 + Math.sin(t * 1.3) * 0.15);
        l.pos.x += dt * (Math.sin(t) * 0.6 + (wind - 0.6) * 0.5);
        l.pos.z += dt * (Math.cos(t * 0.8) * 0.4 - (wind - 1) * 0.2);
        l.spin.x += dt * l.rate.x;
        l.spin.y += dt * l.rate.y;
        l.spin.z += dt * l.rate.z;
        if (l.pos.y <= g + 0.015) {
          if (!this.world.mask.onGround(l.pos.x, l.pos.z)) l.life = 1; // blown off the edge
          l.pos.y = g + 0.015;
          l.spin.set(0, l.spin.y, 0);
          l.landed = 0.001;
        }
      }
      const fade = this.petalStorm > 0 ? 3 : 6;
      const shrink = (l.landed > fade ? Math.max(0, 1 - (l.landed - fade) / 1) : 1) * (1 + this.petalStorm * 0.7);
      if (l.life >= 1) this.leafMesh.setMatrixAt(i, HIDDEN);
      else this.leafMesh.setMatrixAt(i, m4.compose(l.pos, q.setFromEuler(l.spin), sv.set(shrink, shrink, shrink)));
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;
    // festival petals glow softly in the dusk
    (this.leafMesh.material as MeshToonMaterial).emissiveIntensity = this.petalStorm * 0.6;

    // bees: out to a flower, a while there, home again; all inside at night and in the rain
    const busy = mood.butterflies > 0.25 && rain < 0.3 && this.season !== "winter";
    if (this.beeMesh) {
      this.bees.forEach((b, i) => {
        if (b.t >= 1) {
          b.stay -= dt;
          if (b.stay <= 0 && (busy || b.out)) {
            b.from.copy(b.to);
            if (b.out) b.to.copy(b.hive);
            else {
              const near = this.world.flowers.filter((f) => f.distanceTo(b.hive) < 6);
              const f = near.length ? near[Math.floor(Math.random() * near.length)] : b.hive.clone().add(new Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
              b.to.set(f.x, this.world.ground(f.x, f.z) + 0.25, f.z);
            }
            b.out = !b.out;
            b.t = 0;
            b.len = Math.max(0.5, b.from.distanceTo(b.to));
            b.stay = b.out ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 3;
          }
        } else b.t = Math.min(1, b.t + (dt * 1.3) / b.len);
        const home = !b.out && b.t >= 1;
        if (home) return this.beeMesh!.setMatrixAt(i, HIDDEN);
        const s = this.time * 9 + b.seed;
        sv.lerpVectors(b.from, b.to, b.t);
        sv.y += Math.sin(Math.PI * b.t) * 0.6;
        // a lazy zig-zag on the way, little circles over the flower
        const r = b.t >= 1 ? 0.12 : 0.08;
        sv.x += Math.sin(s) * r;
        sv.z += Math.cos(s * 1.3) * r;
        sv.y += Math.sin(s * 2.1) * 0.04;
        this.beeMesh!.setMatrixAt(i, m4.compose(sv, q.setFromAxisAngle(Object3D.DEFAULT_UP, s * 0.3), new Vector3(1, 1, 1)));
      });
      this.beeMesh.instanceMatrix.needsUpdate = true;
    }
    this.hum = busy ? this.hiveNear(player) : 0;

    for (const p of this.prints) {
      if (p.age > 30) continue;
      p.age += dt;
      (p.mesh.material as MeshToonMaterial).opacity = 0.8 * Math.min(1, (30 - p.age) / 8);
      if (p.age > 30) p.mesh.visible = false;
    }
    for (const b of this.breaths) {
      if (b.life >= 1) continue;
      b.life = Math.min(1, b.life + dt / 1.6);
      b.mesh.position.y += dt * 0.25;
      b.mesh.position.x += dt * 0.1 * wind;
      b.mesh.scale.setScalar(0.04 + b.life * 0.09);
      if (b.life >= 1) b.mesh.visible = false;
    }
    for (const d of this.drops) {
      if (d.life >= 1) continue;
      d.life = Math.min(1, d.life + dt / 0.45);
      d.vel.y -= dt * 7;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.scale.setScalar(0.035 * (1 - d.life * 0.6));
      if (d.life >= 1) d.mesh.visible = false;
    }
  }
}
