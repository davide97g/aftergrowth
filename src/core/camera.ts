import { MathUtils, OrthographicCamera, Vector3 } from "three";

const PITCH = MathUtils.degToRad(35);
const S = Math.SQRT1_2;
const OFFSET = new Vector3(Math.cos(PITCH) * S, Math.sin(PITCH), Math.cos(PITCH) * S).multiplyScalar(60);
const VIEW = 16; // world units visible vertically at zoom 1

/** Fixed isometric orthographic camera that softly follows the player. */
export class CameraRig {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 200);
  private focus = new Vector3();
  private zoom = 1;
  private aspect = 1;
  /** how far out you may zoom (the kingdom lets you see more of its hill) */
  minZoom = 0.6;

  constructor(start: Vector3) {
    this.focus.copy(start);
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
    // phones in portrait see a bit more of the island
    this.applyZoom();
  }

  addZoom(delta: number) {
    if (!delta) return;
    this.zoom = MathUtils.clamp(this.zoom * Math.exp(delta), this.minZoom, 1.8);
    this.applyZoom();
  }

  get zoomLevel() {
    return this.zoom;
  }

  /** Jump straight to a zoom and focus (entering or leaving the cottage). */
  snap(zoom: number, focus: Vector3) {
    this.zoom = zoom;
    this.focus.copy(focus);
    this.applyZoom();
  }

  private applyZoom() {
    const view = (VIEW * (this.aspect < 1 ? 1.35 : 1)) / this.zoom;
    const c = this.camera;
    c.top = view / 2;
    c.bottom = -view / 2;
    c.left = (-view / 2) * this.aspect;
    c.right = (view / 2) * this.aspect;
    c.updateProjectionMatrix();
  }

  update(dt: number, target: Vector3) {
    this.focus.lerp(target, 1 - Math.exp(-dt * 3.5));
    this.camera.position.copy(this.focus).add(OFFSET);
    this.camera.lookAt(this.focus);
  }
}
