import { Color, Vector3 } from "three";

/** Everything the world needs to know about the light at a given hour. */
export interface Mood {
  skyTop: Color;
  skyBottom: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  /** 0 day … 1 full night: windows, lanterns, glowing flowers */
  glow: number;
  stars: number;
  butterflies: number;
  fireflies: number;
  pollen: number;
  water: Color;
}

interface Key {
  hour: number;
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  glow: number;
  stars: number;
  butterflies: number;
  fireflies: number;
  pollen: number;
  water: string;
}

const NIGHT: Omit<Key, "hour"> = {
  skyTop: "#141A44", skyBottom: "#3A2F6E", sun: "#A8C4FF", sunIntensity: 0.9,
  hemiSky: "#5867B8", hemiGround: "#241A4A", hemiIntensity: 1.1,
  glow: 1, stars: 1, butterflies: 0, fireflies: 1, pollen: 0, water: "#2B4FA8",
};
const DAY: Omit<Key, "hour"> = {
  skyTop: "#7FC8F2", skyBottom: "#CFEFFF", sun: "#FFF4DC", sunIntensity: 2.4,
  hemiSky: "#CFEFFF", hemiGround: "#8A78B8", hemiIntensity: 1.25,
  glow: 0, stars: 0, butterflies: 1, fireflies: 0, pollen: 0, water: "#2F7FD8",
};

const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.5, ...NIGHT },
  {
    hour: 6.5, skyTop: "#8C8FD8", skyBottom: "#FFC2B0", sun: "#FFB89A", sunIntensity: 1.5,
    hemiSky: "#E6C8E8", hemiGround: "#7A5A9A", hemiIntensity: 1.1,
    glow: 0.35, stars: 0.1, butterflies: 0.3, fireflies: 0.2, pollen: 0.4, water: "#4A7AD0",
  },
  { hour: 9, ...DAY },
  { hour: 16, ...DAY },
  {
    hour: 18, skyTop: "#C9A6E0", skyBottom: "#F6B08A", sun: "#FFC27A", sunIntensity: 2.1,
    hemiSky: "#FFD8B0", hemiGround: "#7A4E7E", hemiIntensity: 1.15,
    glow: 0.25, stars: 0, butterflies: 0.5, fireflies: 0.1, pollen: 1, water: "#5A70C8",
  },
  {
    hour: 19.6, skyTop: "#3A3A8A", skyBottom: "#C77FA8", sun: "#FF9A8A", sunIntensity: 1.2,
    hemiSky: "#9A8AD0", hemiGround: "#3A2A5E", hemiIntensity: 1.05,
    glow: 0.8, stars: 0.5, butterflies: 0, fireflies: 0.7, pollen: 0.3, water: "#3A54A8",
  },
  { hour: 21, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const mood: Mood = {
  skyTop: new Color(), skyBottom: new Color(), sun: new Color(), sunIntensity: 0,
  hemiSky: new Color(), hemiGround: new Color(), hemiIntensity: 0,
  glow: 0, stars: 0, butterflies: 0, fireflies: 0, pollen: 0, water: new Color(),
};
const ca = new Color();
const cb = new Color();

function lerpColor(out: Color, a: string, b: string, t: number) {
  out.copy(ca.set(a)).lerp(cb.set(b), t);
}

/** Sample the mood at `hour` (0–24). Returns a shared object: read it, don't keep it. */
export function sampleMood(hour: number): Mood {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const raw = (h - a.hour) / (b.hour - a.hour);
  const t = raw * raw * (3 - 2 * raw);
  lerpColor(mood.skyTop, a.skyTop, b.skyTop, t);
  lerpColor(mood.skyBottom, a.skyBottom, b.skyBottom, t);
  lerpColor(mood.sun, a.sun, b.sun, t);
  lerpColor(mood.hemiSky, a.hemiSky, b.hemiSky, t);
  lerpColor(mood.hemiGround, a.hemiGround, b.hemiGround, t);
  lerpColor(mood.water, a.water, b.water, t);
  for (const k of ["sunIntensity", "hemiIntensity", "glow", "stars", "butterflies", "fireflies", "pollen"] as const) {
    mood[k] = a[k] + (b[k] - a[k]) * t;
  }
  return mood;
}

const sunDir = new Vector3();
const moonDir = new Vector3(-0.35, 1, 0.55).normalize();

/** Direction *towards* the light: the sun arcs east to west by day, the moon stands still at night. */
export function lightDirection(hour: number, out: Vector3): Vector3 {
  const h = ((hour % 24) + 24) % 24;
  const t = (h - 6) / 12; // 0 sunrise, 1 sunset
  const day = Math.min(Math.max(Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)), 0), 1);
  sunDir.set(Math.cos(Math.PI * Math.min(Math.max(t, 0), 1)) * 0.9, 0.35 + day * 0.9, 0.55).normalize();
  const daylight = Math.min(Math.max((h > 12 ? 20 - h : h - 5) / 1.5, 0), 1);
  return out.copy(moonDir).lerp(sunDir, daylight).normalize();
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
