import { sound } from "../audio/sound";
import type { P } from "./recognizer";

interface Stroke { pts: P[]; widths: number[] }

const INK = "#3a2a20";
const GOLD = "#ffcf5a";

/** Full-screen sheet the witch draws on. Strokes are in CSS pixels. */
export class InkOverlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private pointer: number | null = null;
  private guide: { x: number; y: number; r: number } = { x: 0, y: 0, r: 100 };
  private state: "draw" | "cast" | "fizzle" | "closed" = "closed";
  private stateTime = 0;
  onStroke: (strokes: P[][]) => void = () => {};

  constructor() {
    this.canvas = document.getElementById("ink") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.addEventListener("pointerdown", (e) => this.down(e));
    this.canvas.addEventListener("pointermove", (e) => this.move(e));
    this.canvas.addEventListener("pointerup", (e) => this.up(e));
    this.canvas.addEventListener("pointercancel", (e) => this.up(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get isOpen() {
    return this.state !== "closed";
  }

  get busy() {
    return this.state === "cast" || this.state === "fizzle";
  }

  open(guideX: number, guideY: number) {
    this.strokes = [];
    this.current = null;
    this.guide = { x: guideX, y: guideY, r: Math.min(innerWidth, innerHeight) * 0.26 };
    this.state = "draw";
    this.stateTime = 0;
    this.canvas.hidden = false;
    document.body.classList.add("drawing");
  }

  close() {
    this.state = "closed";
    this.canvas.hidden = true;
    this.pointer = null;
    document.body.classList.remove("drawing");
  }

  undo() {
    if (this.state === "draw") this.strokes.pop();
  }

  /** Play the result: the glyph burns gold, or the ink smudges. Closes itself afterwards. */
  finish(kind: "cast" | "fizzle") {
    this.state = kind;
    this.stateTime = 0;
    this.current = null;
    this.pointer = null;
  }

  private local(e: PointerEvent): P {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent) {
    if (this.state !== "draw" || this.pointer !== null) return;
    if (e.button === 2) return this.undo();
    this.pointer = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.current = { pts: [p], widths: [4] };
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.pointer || !this.current) return;
    const p = this.local(e);
    const last = this.current.pts[this.current.pts.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 1.5) return;
    sound.scratch(d);
    // fast strokes thin out like a dip pen running dry
    const w = Math.max(2.2, Math.min(6.5, 7 - d * 0.12));
    const prev = this.current.widths[this.current.widths.length - 1];
    this.current.pts.push(p);
    this.current.widths.push(prev + (w - prev) * 0.35);
  }

  private up(e: PointerEvent) {
    if (e.pointerId !== this.pointer || !this.current) return;
    this.pointer = null;
    this.strokes.push(this.current);
    this.current = null;
    this.onStroke(this.strokes.map((s) => s.pts));
  }

  resize(w: number, h: number) {
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(dt: number) {
    if (this.state === "closed") return;
    this.stateTime += dt;
    if ((this.state === "cast" || this.state === "fizzle") && this.stateTime > 1.1) {
      this.close();
      return;
    }
    this.draw();
  }

  private draw() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.restore();

    const t = this.stateTime;
    if (this.state === "draw") {
      // faint parchment wash and a dashed guide ring around the witch
      const g = this.guide;
      const grad = c.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r * 1.5);
      grad.addColorStop(0, "rgba(243,230,200,0.28)");
      grad.addColorStop(1, "rgba(243,230,200,0)");
      c.fillStyle = grad;
      c.fillRect(g.x - g.r * 1.6, g.y - g.r * 1.6, g.r * 3.2, g.r * 3.2);
      c.setLineDash([6, 10]);
      c.lineDashOffset = -t * 12;
      c.strokeStyle = "rgba(58,42,32,0.35)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }

    let color = INK;
    let alpha = 1;
    let glow = 0;
    let jitter = 0;
    if (this.state === "cast") {
      color = GOLD;
      glow = 18 * (1 - Math.min(t / 1.1, 1)) + 6;
      alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.6;
    } else if (this.state === "fizzle") {
      color = "#6b6270";
      jitter = t * 6;
      alpha = 1 - t / 1.1;
    }
    c.globalAlpha = Math.max(alpha, 0);
    c.shadowColor = glow ? "rgba(255,200,80,0.9)" : "transparent";
    c.shadowBlur = glow;
    for (const s of this.current ? [...this.strokes, this.current] : this.strokes) this.stroke(s, color, jitter);
    c.globalAlpha = 1;
    c.shadowBlur = 0;
  }

  private stroke(s: Stroke, color: string, jitter: number) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (s.pts.length === 1) {
      c.beginPath();
      c.arc(s.pts[0].x, s.pts[0].y, 3.5, 0, Math.PI * 2);
      c.fill();
      return;
    }
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1];
      const b = s.pts[i];
      const j = jitter ? Math.sin(i * 1.7) * jitter : 0;
      c.lineWidth = s.widths[i];
      c.beginPath();
      c.moveTo(a.x + j, a.y + j * 0.5);
      c.lineTo(b.x + j, b.y + j * 0.5);
      c.stroke();
    }
  }
}
