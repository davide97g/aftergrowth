import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, Points, PointsMaterial, Scene, Vector3 } from "three";
import type { Season } from "../../shared/seasons";
import type { Mood } from "./daycycle";

export type Sky = "clear" | "cloudy" | "rain" | "windy";

const GREY_TOP = new Color("#6f7f99");
const GREY_LOW = new Color("#aab6c4");
const NIGHT_GREY = new Color("#262a44");
const DROPS = 1100;
const FLAKES = 1400;
const BOX = 26;

function hash(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return ((h >>> 0) % 10000) / 10000;
}

/** Chances of clear, cloudy and wet skies in each season (the rest is windy); wet is snow in winter. */
const CLIMATE: Record<Season | "any", [number, number, number]> = {
  any: [0.55, 0.2, 0.18],
  spring: [0.45, 0.2, 0.28],
  summer: [0.7, 0.15, 0.1],
  autumn: [0.45, 0.25, 0.18],
  winter: [0.45, 0.25, 0.25],
};

/** Weather for a part of a day, the same every time for the same island and day. */
export function forecast(seed: number, day: number, hour: number, season: Season | null = null): Sky {
  const slot = hour < 6 ? 0 : hour < 14 ? 1 : hour < 22 ? 2 : 3;
  const r = hash(seed, day * 4 + slot);
  const [clear, cloudy, wet] = CLIMATE[season ?? "any"];
  return r < clear ? "clear" : r < clear + cloudy ? "cloudy" : r < clear + cloudy + wet ? "rain" : "windy";
}

/** Rain, clouds and wind on top of the day/night mood. */
export class Weather {
  private rain = 0;
  private cloud = 0;
  private wind = 0;
  private drops: LineSegments;
  private pos: Float32Array;
  private rainedToday = false;
  sky: Sky = "clear";
  /** debug override (?weather=rain) */
  force: Sky | null = null;
  /** fires once when a daytime shower ends: a good moment for a rainbow */
  onRainbow: () => void = () => {};
  /** in winter the rain falls as snow */
  private flakes: Points | null = null;
  private flakePos: Float32Array | null = null;

  constructor(scene: Scene, private seed: number, private season: Season | null = null) {
    if (season === "winter") {
      this.flakePos = new Float32Array(FLAKES * 3);
      for (let i = 0; i < FLAKES; i++) this.seedFlake(i, new Vector3(), true);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(this.flakePos, 3));
      this.flakes = new Points(geo, new PointsMaterial({ color: "#ffffff", size: 4 * Math.min(devicePixelRatio, 2), sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
      this.flakes.frustumCulled = false;
      this.flakes.visible = false;
      scene.add(this.flakes);
    }
    this.pos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) this.seedDrop(i, new Vector3(), true);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.drops = new LineSegments(geo, new LineBasicMaterial({ color: "#dce9ff", transparent: true, opacity: 0, depthWrite: false }));
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    scene.add(this.drops);
  }

  private seedDrop(i: number, around: Vector3, anyHeight = false) {
    const x = around.x + (Math.random() - 0.5) * BOX * 2;
    const z = around.z + (Math.random() - 0.5) * BOX * 2;
    const y = around.y + (anyHeight ? Math.random() * 14 - 4 : 10 + Math.random() * 2);
    this.pos.set([x, y, z, x + 0.06, y + 0.5, z - 0.06], i * 6);
  }

  private seedFlake(i: number, around: Vector3, anyHeight = false) {
    this.flakePos!.set([
      around.x + (Math.random() - 0.5) * BOX * 2,
      around.y + (anyHeight ? Math.random() * 14 - 4 : 10 + Math.random() * 2),
      around.z + (Math.random() - 0.5) * BOX * 2,
    ], i * 3);
  }

  /** snow falls instead of rain */
  get snowing() {
    return this.flakes !== null;
  }

  /** 0..1 rain strength right now */
  get raining() {
    return this.rain;
  }

  /** 0..1 cloud cover */
  get overcast() {
    return this.cloud;
  }

  /** extra wind for the plant shader */
  get windStrength() {
    return 1 + this.wind * 1.4 + this.rain * 0.5;
  }

  update(dt: number, day: number, hour: number, focus: Vector3, mood: Mood) {
    this.sky = this.force ?? forecast(this.seed, day, hour, this.season);
    const k = 1 - Math.exp(-dt * 0.5);
    const wasRaining = this.rain > 0.5;
    this.rain += ((this.sky === "rain" ? 1 : 0) - this.rain) * k;
    this.cloud += ((this.sky === "rain" ? 1 : this.sky === "cloudy" ? 0.6 : 0) - this.cloud) * k;
    this.wind += ((this.sky === "windy" ? 1 : 0) - this.wind) * k;
    if (wasRaining && this.rain <= 0.5 && mood.glow < 0.3 && !this.rainedToday) {
      this.rainedToday = true;
      this.onRainbow();
    }
    if (hour < 1) this.rainedToday = false;

    // grey the sky, dim the sun, hush the butterflies
    const c = this.cloud;
    mood.skyTop.lerp(mood.glow > 0.5 ? NIGHT_GREY : GREY_TOP, c * 0.75);
    mood.skyBottom.lerp(mood.glow > 0.5 ? NIGHT_GREY : GREY_LOW, c * 0.7);
    mood.sunIntensity *= 1 - c * 0.55;
    mood.hemiIntensity *= 1 - c * 0.12;
    mood.stars *= 1 - c;
    mood.butterflies *= 1 - this.rain;
    mood.fireflies *= 1 - this.rain * 0.85;
    mood.pollen *= 1 - c;
    mood.water.lerp(GREY_TOP, this.rain * 0.3);

    if (this.flakes) return this.snow(dt, focus);
    this.drops.visible = this.rain > 0.02;
    if (!this.drops.visible) return;
    (this.drops.material as LineBasicMaterial).opacity = this.rain * 0.55;
    const fall = dt * 16;
    const drift = dt * (2 + this.wind * 4);
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      this.pos[o + 1] -= fall;
      this.pos[o + 4] -= fall;
      this.pos[o] += drift;
      this.pos[o + 3] += drift;
      if (this.pos[o + 1] < focus.y - 6 || Math.abs(this.pos[o] - focus.x) > BOX || Math.abs(this.pos[o + 2] - focus.z) > BOX) this.seedDrop(i, focus);
    }
    this.drops.geometry.attributes.position.needsUpdate = true;
  }

  /** Snowflakes drift down slowly, swaying, and blow sideways in the wind. */
  private snow(dt: number, focus: Vector3) {
    const flakes = this.flakes!;
    const pos = this.flakePos!;
    flakes.visible = this.rain > 0.02;
    if (!flakes.visible) return;
    (flakes.material as PointsMaterial).opacity = Math.min(1, this.rain * 1.2);
    const t = performance.now() / 1000;
    for (let i = 0; i < FLAKES; i++) {
      const o = i * 3;
      pos[o + 1] -= dt * (1.1 + (i % 7) * 0.08);
      pos[o] += dt * (Math.sin(t * 0.9 + i) * 0.5 + this.wind * 2.5);
      pos[o + 2] += dt * Math.cos(t * 0.7 + i * 1.3) * 0.4;
      if (pos[o + 1] < focus.y - 6 || Math.abs(pos[o] - focus.x) > BOX || Math.abs(pos[o + 2] - focus.z) > BOX) this.seedFlake(i, focus);
    }
    flakes.geometry.attributes.position.needsUpdate = true;
  }
}
