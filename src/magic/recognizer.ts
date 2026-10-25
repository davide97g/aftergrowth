/**
 * Stroke classification for glyph drawing.
 * Sigils use the $1 unistroke recognizer (Wobbrock, Wilson, Li 2007); dots, lines and the
 * seal circle are detected geometrically first.
 */

export interface P { x: number; y: number }
export type Sigil = "growth" | "water" | "wind" | "light" | "flame";

const N = 64;
const SIZE = 250;
const HALF_DIAG = 0.5 * Math.sqrt(2 * SIZE * SIZE);
const ANGLE_RANGE = (45 * Math.PI) / 180;
const ANGLE_STEP = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));

export function pathLength(pts: P[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

export function centroid(pts: P[]): P {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function resample(points: P[], n: number): P[] {
  const pts = points.map((p) => ({ ...p }));
  const interval = pathLength(pts) / (n - 1);
  let acc = 0;
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}

function rotateBy(pts: P[], a: number): P[] {
  const c = centroid(pts);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function normalize(points: P[]): P[] {
  let pts = resample(points, N);
  const c = centroid(pts);
  pts = rotateBy(pts, -Math.atan2(c.y - pts[0].y, c.x - pts[0].x));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  pts = pts.map((p) => ({ x: (p.x * SIZE) / w, y: (p.y * SIZE) / h }));
  const c2 = centroid(pts);
  return pts.map((p) => ({ x: p.x - c2.x, y: p.y - c2.y }));
}

function pathDistance(a: P[], b: P[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

function distanceAtBestAngle(pts: P[], tpl: P[]): number {
  let a = -ANGLE_RANGE;
  let b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = pathDistance(rotateBy(pts, x1), tpl);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = pathDistance(rotateBy(pts, x2), tpl);
  while (Math.abs(b - a) > ANGLE_STEP) {
    if (f1 < f2) {
      b = x2; x2 = x1; f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = pathDistance(rotateBy(pts, x1), tpl);
    } else {
      a = x1; x1 = x2; f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = pathDistance(rotateBy(pts, x2), tpl);
    }
  }
  return Math.min(f1, f2);
}

// ---------- templates: drawn in code so they also render in the grimoire ----------

function curve(n: number, f: (t: number) => P): P[] {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}
const reversed = (pts: P[]) => [...pts].reverse();
const mirrored = (pts: P[]) => pts.map((p) => ({ x: -p.x, y: p.y }));

function spiral(turns: number): P[] {
  return curve(80, (t) => {
    const a = t * turns * Math.PI * 2;
    return { x: Math.cos(a) * t, y: Math.sin(a) * t };
  });
}
function wave(cycles: number): P[] {
  return curve(60, (t) => ({ x: t * 2, y: -Math.sin(t * cycles * Math.PI * 2) * 0.35 }));
}
function curl(): P[] {
  // a gust: line in, one loop, line out
  return curve(70, (t) => {
    if (t < 0.3) return { x: (t / 0.3) * 0.9, y: 0 };
    if (t > 0.7) return { x: 0.9 + ((t - 0.7) / 0.3) * 0.9, y: 0 };
    const a = ((t - 0.3) / 0.4) * Math.PI * 2;
    return { x: 0.9 + Math.sin(a) * 0.35, y: -(1 - Math.cos(a)) * 0.35 };
  });
}
function star(): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + i * ((4 * Math.PI) / 5);
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}
function triangle(): P[] {
  return [{ x: 0, y: -1 }, { x: 0.9, y: 0.6 }, { x: -0.9, y: 0.6 }, { x: 0, y: -1 }];
}

/** One canonical drawing per sigil, in a -1..1 box (screen coords, y down). Used for the grimoire. */
export const SIGIL_SHAPES: Record<Sigil, P[]> = {
  growth: spiral(2.3),
  water: wave(1.5).map((p) => ({ x: p.x - 1, y: p.y })),
  wind: curl().map((p) => ({ x: p.x - 0.9, y: p.y + 0.15 })),
  light: star(),
  flame: triangle(),
};

const TEMPLATES: { sigil: Sigil; pts: P[] }[] = [];
function add(sigil: Sigil, raw: P[]) {
  for (const v of [raw, reversed(raw), mirrored(raw), reversed(mirrored(raw))]) {
    TEMPLATES.push({ sigil, pts: normalize(v) });
  }
}
add("growth", spiral(2.3));
add("growth", spiral(1.6));
add("growth", spiral(3));
add("water", wave(1.5));
add("water", wave(2));
add("water", wave(1));
add("wind", curl());
add("light", star());
add("flame", triangle());
add("flame", [{ x: 0.9, y: 0.6 }, { x: 0, y: -1 }, { x: -0.9, y: 0.6 }, { x: 0.9, y: 0.6 }]);

export function recognize(points: P[]): { sigil: Sigil; score: number } | null {
  if (points.length < 5) return null;
  const pts = normalize(points);
  let best = Infinity;
  let sigil: Sigil | null = null;
  for (const t of TEMPLATES) {
    const d = distanceAtBestAngle(pts, t.pts);
    if (d < best) {
      best = d;
      sigil = t.sigil;
    }
  }
  return sigil ? { sigil, score: 1 - best / HALF_DIAG } : null;
}

// ---------- geometric marks ----------

export type Mark =
  | { kind: "dot"; at: P }
  | { kind: "line"; from: P; to: P }
  | { kind: "circle"; center: P; radius: number }
  | { kind: "sigil"; sigil: Sigil; score: number; at: P }
  | { kind: "unclear"; at: P };

export function classify(points: P[]): Mark {
  const len = pathLength(points);
  const c = centroid(points);
  if (len < 16) return { kind: "dot", at: c };
  const first = points[0];
  const last = points[points.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord / len > 0.92 && len > 30) return { kind: "line", from: first, to: last };
  // circle: closed, and every point sits near the mean radius
  const radii = points.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length) / mean;
  const closed = chord < Math.max(mean * 0.45, 24);
  const sweep = len / (2 * Math.PI * mean);
  if (closed && spread < 0.16 && sweep > 0.8 && sweep < 1.6 && mean > 40) return { kind: "circle", center: c, radius: mean };
  const hit = recognize(points);
  if (hit && hit.score > 0.74) return { kind: "sigil", sigil: hit.sigil, score: hit.score, at: c };
  return { kind: "unclear", at: c };
}
