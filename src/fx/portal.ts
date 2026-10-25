import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

/** Little rune marks: short ink strokes in a unit box, the same every time. */
const RUNES: [number, number][][] = (() => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 24 }, () => {
    const n = 2 + Math.floor(r() * 3);
    return Array.from({ length: n }, () => [r() - 0.5, r() - 0.5] as [number, number]);
  });
})();

/**
 * A magic circle in gold ink: rings, a star, rune marks between the rings, ticks on the rim.
 * `spin` turns the rings (inner and outer turn opposite ways).
 */
export function drawMagicCircle(c: CanvasRenderingContext2D, x: number, y: number, R: number, spin: number, alpha = 1, glow = 14, opts: { rimOnly?: boolean; weight?: number } = {}) {
  const wt = opts.weight ?? 1;
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = "#ffd36a";
  c.fillStyle = "#ffd36a";
  c.shadowColor = "rgba(255, 200, 90, 0.9)";
  c.shadowBlur = glow;
  c.lineCap = "round";
  c.lineJoin = "round";
  const ring = (rr: number, w: number) => {
    c.lineWidth = w * wt;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.stroke();
  };
  ring(R, Math.max(2, R * 0.018));
  ring(R * 0.88, Math.max(1, R * 0.008));
  if (!opts.rimOnly) {
    ring(R * 0.62, Math.max(1.5, R * 0.012));
    ring(R * 0.18, Math.max(1, R * 0.01));
  }
  // runes between the outer rings, turning one way
  const runeR = R * 0.94 - R * 0.06;
  for (let i = 0; i < 24; i++) {
    const a = spin + (i / 24) * Math.PI * 2;
    c.save();
    c.translate(x + Math.cos(a) * runeR * 0.995, y + Math.sin(a) * runeR * 0.995);
    c.rotate(a + Math.PI / 2);
    c.lineWidth = Math.max(1, R * 0.008) * wt;
    c.beginPath();
    RUNES[i].forEach(([px, py], k) => {
      const sx = px * R * 0.07;
      const sy = py * R * 0.07;
      if (k) c.lineTo(sx, sy);
      else c.moveTo(sx, sy);
    });
    c.stroke();
    c.restore();
  }
  // ticks on the rim
  for (let i = 0; i < 72; i++) {
    const a = -spin * 0.5 + (i / 72) * Math.PI * 2;
    const l = i % 6 === 0 ? R * 0.06 : R * 0.025;
    c.lineWidth = Math.max(1, R * 0.006) * wt;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
    c.lineTo(x + Math.cos(a) * (R + l), y + Math.sin(a) * (R + l));
    c.stroke();
  }
  if (opts.rimOnly) {
    c.restore();
    return;
  }
  // a seven-point star inside, turning the other way
  c.lineWidth = Math.max(1.2, R * 0.01) * wt;
  c.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = -spin * 1.3 + (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
    const px = x + Math.cos(a) * R * 0.6;
    const py = y + Math.sin(a) * R * 0.6;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.stroke();
  // little moons at the star's points
  for (let i = 0; i < 7; i++) {
    const a = -spin * 1.3 + (i / 7) * Math.PI * 2 - Math.PI / 2;
    c.beginPath();
    c.arc(x + Math.cos(a) * R * 0.75, y + Math.sin(a) * R * 0.75, R * 0.03, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The full-screen part of portal travel: an indigo veil that closes onto the portal through a ring of
 * gold glyphs, holds with a big turning circle while the next island loads, then opens again.
 */
export class PortalOverlay {
  private canvas = document.createElement("canvas");
  private c = this.canvas.getContext("2d")!;
  private mode: { kind: "idle" } | { kind: "hold"; text: string } | { kind: "iris"; from: number; to: number; x: number; y: number; t0: number; ms: number; done: () => void } = { kind: "idle" };
  private start = performance.now();

  constructor() {
    this.canvas.id = "portal-veil";
    document.body.append(this.canvas);
    const fit = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    addEventListener("resize", fit);
    fit();
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private get diag() {
    return Math.hypot(innerWidth, innerHeight);
  }

  /** Cover the screen right away (the page loads already through the portal). */
  hold(text: string) {
    this.mode = { kind: "hold", text };
    this.canvas.hidden = false;
  }

  /** Close the veil onto a point on screen. */
  close(x: number, y: number, ms = 900) {
    return this.iris(this.diag, 0, x, y, ms);
  }

  /** Open the veil from a point on screen. */
  open(x: number, y: number, ms = 1100) {
    return this.iris(0, this.diag, x, y, ms);
  }

  private iris(from: number, to: number, x: number, y: number, ms: number) {
    this.canvas.hidden = false;
    return new Promise<void>((done) => {
      this.mode = { kind: "iris", from, to, x, y, t0: performance.now(), ms, done };
    });
  }

  private veil(holeX: number, holeY: number, hole: number) {
    const c = this.c;
    const w = innerWidth;
    const h = innerHeight;
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, this.diag / 2);
    g.addColorStop(0, "#3a2d6e");
    g.addColorStop(1, "#141233");
    c.globalCompositeOperation = "source-over";
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    if (hole > 0) {
      c.globalCompositeOperation = "destination-out";
      c.beginPath();
      c.arc(holeX, holeY, hole, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = "source-over";
    }
  }

  private draw() {
    const c = this.c;
    const t = (performance.now() - this.start) / 1000;
    c.clearRect(0, 0, innerWidth, innerHeight);
    const m = this.mode;
    if (m.kind === "idle") {
      this.canvas.hidden = true;
      return;
    }
    const centre = Math.min(innerWidth, innerHeight) * 0.28;
    if (m.kind === "hold") {
      this.veil(0, 0, 0);
      drawMagicCircle(c, innerWidth / 2, innerHeight / 2, centre, t * 0.6, 0.95);
      c.fillStyle = "#f3e6c8";
      c.font = `italic ${Math.round(centre * 0.12) + 10}px "IM Fell English", Georgia, serif`;
      c.textAlign = "center";
      c.fillText(m.text, innerWidth / 2, innerHeight / 2 + centre * 1.35);
      return;
    }
    const k = ease(Math.min((performance.now() - m.t0) / m.ms, 1));
    const hole = m.from + (m.to - m.from) * k;
    this.veil(m.x, m.y, hole);
    // the glyph ring rides the edge of the hole
    if (hole > 4) drawMagicCircle(c, m.x, m.y, hole, t * 1.4, Math.min(1, (this.diag - hole) / 200), 14, { rimOnly: true });
    // and a turning circle in the middle while the veil is mostly shut
    const shut = 1 - hole / this.diag;
    if (shut > 0.6) drawMagicCircle(c, m.x + (innerWidth / 2 - m.x) * shut, m.y + (innerHeight / 2 - m.y) * shut, centre * shut, t * 0.6, (shut - 0.6) / 0.4);
    if (k >= 1) {
      const done = m.done;
      if (m.to === 0) this.mode = { kind: "hold", text: "Through the portal…" };
      else this.mode = { kind: "idle" };
      done();
    }
  }
}

/** The glowing circle that spins up on the ground under the portal. */
export function portalGroundCircle() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const tex = new CanvasTexture(canvas);
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 });
  const geo = new PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 6;
  const c = canvas.getContext("2d")!;
  return {
    mesh,
    /** redraw at this spin and set its glow (0..1) and world radius */
    set(spin: number, glow: number, radius: number) {
      c.clearRect(0, 0, 512, 512);
      drawMagicCircle(c, 256, 256, 210, spin, 1, 16, { weight: 2.4 });
      tex.needsUpdate = true;
      mat.opacity = glow;
      mesh.scale.setScalar(Math.max(radius * 2.3, 0.001));
      mesh.visible = glow > 0.01;
    },
  };
}
