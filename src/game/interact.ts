import { Camera, Vector3 } from "three";

export interface Action {
  /** where the witch has to stand near */
  pos: Vector3;
  reach: number;
  /** what the prompt says */
  label: string;
  /** null for information-only prompts ("Growing · 40%") */
  act: (() => void) | null;
  /** big things (the portal, a door) win over small things nearby */
  priority?: number;
}

/** Something that can offer the best action near a point. */
export type Provider = (near: Vector3) => Action | null;

/**
 * Picks the closest available action around the witch and shows it as a prompt.
 * F (or tapping the prompt) does it; clicking near something walks there and then does it.
 */
export class Interactions {
  private providers: Provider[] = [];
  private current: Action | null = null;
  private pending: Vector3 | null = null;
  private pendingAge = 0;
  private prompt = document.getElementById("prompt")!;
  private label = document.getElementById("prompt-label")!;
  enabled = true;
  /** called after any action happens, e.g. to play a gesture */
  onAct: () => void = () => {};

  constructor(private camera: Camera) {
    addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "KeyF" || e.code === "Space") {
        e.preventDefault();
        this.doCurrent();
      }
    });
    this.prompt.addEventListener("click", () => this.doCurrent());
  }

  add(p: Provider) {
    this.providers.push(p);
  }

  private best(near: Vector3, slack = 0): Action | null {
    let best: Action | null = null;
    let bestD = Infinity;
    for (const p of this.providers) {
      const a = p(near);
      if (!a) continue;
      const d = Math.hypot(a.pos.x - near.x, a.pos.z - near.z);
      if (d > a.reach + slack) continue;
      // actionable things win over information
      const score = d + (a.act ? 0 : 0.6) - (a.priority ?? 0);
      if (score < bestD) {
        bestD = score;
        best = a;
      }
    }
    return best;
  }

  private doCurrent() {
    if (this.enabled && this.current?.act) {
      this.current.act();
      this.onAct();
    }
  }

  /** A click on the ground: if it lands on something actionable, remember to act on arrival. */
  clicked(point: Vector3): boolean {
    const a = this.best(point, 0.2);
    if (!a?.act) {
      this.pending = null;
      return false;
    }
    this.pending = a.pos.clone();
    this.pendingAge = 0;
    return true;
  }

  update(witch: Vector3, dt: number) {
    // a click-to-act gives up if the witch never gets there
    if (this.pending && (this.pendingAge += dt) > 8) this.pending = null;
    this.current = this.enabled ? this.best(witch) : null;
    if (this.pending && this.current?.act && this.current.pos.distanceTo(this.pending) < 0.05) {
      this.pending = null;
      this.current.act();
      this.onAct();
      this.current = this.best(witch);
    }
    const a = this.current;
    if (!a) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.classList.toggle("info", !a.act);
    this.label.textContent = a.label;
    const p = a.pos.clone().setY(a.pos.y + 1.4).project(this.camera);
    this.prompt.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    this.prompt.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  }
}
