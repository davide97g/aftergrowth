import { Camera, Raycaster, Vector2, Vector3 } from "three";
import { type Ground, flat, hitGround } from "../world/ground";

const S = Math.SQRT1_2;
// camera-relative axes on the ground plane
const RIGHT = new Vector3(S, 0, -S);
const UP = new Vector3(-S, 0, -S);

/** Keyboard, click/tap-to-walk, touch stick, wheel/pinch zoom. */
export class Input {
  private keys = new Set<string>();
  private target: Vector3 | null = null;
  private holding = false;
  private stick = new Vector2();
  private stickId: number | null = null;
  private pinch: { a: number; b: number; dist: number } | null = null;
  private touches = new Map<number, Vector2>();
  private ray = new Raycaster();
  /** the island's ground height, so clicks land on hills too */
  ground: Ground = flat;
  zoomDelta = 0;
  /** false while something else owns clicks (the island editor) */
  enabled = true;
  /** a fresh click/tap on the ground (not a drag) */
  onPick: (p: Vector3) => void = () => {};
  anyInput = false;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera) {
    addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      this.keys.add(e.code);
      this.anyInput = true;
      if (e.code.startsWith("Key") || e.code.startsWith("Arrow")) this.target = null;
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomDelta -= e.deltaY * 0.0012;
    }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    addEventListener("pointermove", (e) => this.onMove(e));
    addEventListener("pointerup", (e) => this.onUp(e));
    addEventListener("pointercancel", (e) => this.onUp(e));

    const stickEl = document.getElementById("stick")!;
    if (matchMedia("(pointer: coarse)").matches) stickEl.hidden = false;
    stickEl.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.stickId = e.pointerId;
      stickEl.setPointerCapture(e.pointerId);
      this.target = null;
      this.updateStick(e);
    });
  }

  private updateStick(e: PointerEvent) {
    const el = document.getElementById("stick")!;
    const r = el.getBoundingClientRect();
    const v = new Vector2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))).divideScalar(r.width / 2);
    if (v.length() > 1) v.normalize();
    this.stick.copy(v);
    const knob = document.getElementById("stick-knob")!;
    knob.style.transform = `translate(${v.x * 34}px, ${-v.y * 34}px)`;
  }

  private onDown(e: PointerEvent) {
    this.anyInput = true;
    if (!this.enabled) return;
    this.touches.set(e.pointerId, new Vector2(e.clientX, e.clientY));
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.keys()];
      this.pinch = { a, b, dist: this.touchDist(a, b) };
      this.holding = false;
      return;
    }
    this.holding = true;
    this.pick(e.clientX, e.clientY);
    if (this.target) this.onPick(this.target.clone());
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.stickId) return this.updateStick(e);
    if (this.touches.has(e.pointerId)) this.touches.get(e.pointerId)!.set(e.clientX, e.clientY);
    if (this.pinch) {
      const d = this.touchDist(this.pinch.a, this.pinch.b);
      this.zoomDelta += (d - this.pinch.dist) * 0.004;
      this.pinch.dist = d;
      return;
    }
    if (this.holding && e.pointerType === "mouse") this.pick(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stick.set(0, 0);
      document.getElementById("stick-knob")!.style.transform = "";
      return;
    }
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    this.holding = false;
  }

  private touchDist(a: number, b: number) {
    const pa = this.touches.get(a);
    const pb = this.touches.get(b);
    return pa && pb ? pa.distanceTo(pb) : 0;
  }

  private pick(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = hitGround(this.ray.ray, this.ground);
    if (hit) this.target = hit;
  }

  get running() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.stick.length() > 0.92;
  }

  /** Desired world-space move direction (length 0..1) for a player standing at `from`. */
  wish(from: Vector3): Vector3 {
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.stick.lengthSq() > 0.02) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const out = new Vector3();
    if (x || y) {
      out.addScaledVector(RIGHT, x).addScaledVector(UP, y);
      if (out.length() > 1) out.normalize();
      return out;
    }
    if (this.target) {
      out.set(this.target.x - from.x, 0, this.target.z - from.z);
      const d = out.length();
      if (d < 0.15) {
        this.target = null;
        return out.set(0, 0, 0);
      }
      return out.divideScalar(d).multiplyScalar(Math.min(1, d / 0.6));
    }
    return out;
  }

  /** Called when the player could not move towards the click target. */
  dropTarget() {
    this.target = null;
  }
}
