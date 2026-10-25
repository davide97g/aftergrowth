import { Vector3 } from "three";
import type { Witch } from "../player/witch";
import type { Hud } from "../ui/hud";
import type { Action } from "./interact";

/** How much faster time passes while the witch sits and rests. */
const REST_SPEED = 8;

/** Sitting down anywhere (bench, swing, armchair) and getting up again. */
export class Rest {
  private base = new Vector3();
  private normalSpeed = 1;
  /** called when she stands, e.g. so the swing stops carrying her */
  onStand: () => void = () => {};

  constructor(private witch: Witch, private clock: { speed: number }, private hud: Hud) {}

  sitAt = (seat: Vector3, yaw: number) => {
    const w = this.witch;
    this.base.copy(seat);
    w.position.copy(seat);
    w.root.rotation.y = yaw;
    w.sitting = true;
    this.normalSpeed = this.clock.speed;
    this.clock.speed = Math.max(this.clock.speed, REST_SPEED);
    this.hud.pop("Time drifts by while you rest");
  };

  standUp = () => {
    const w = this.witch;
    w.sitting = false;
    this.clock.speed = this.normalSpeed;
    this.onStand();
    const fwd = new Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw));
    w.position.copy(this.base).setY(0).addScaledVector(fwd, 0.95);
  };

  /** Interaction provider: while sitting, F stands up. */
  action = (): Action | null => (this.witch.sitting ? { pos: this.witch.position, reach: 3, label: "Stand up", act: this.standUp, priority: 5 } : null);

  /** Moving stands her up; a swing carries her along its arc. */
  update(wish: Vector3, swing: { forward: number; up: number } | null): Vector3 {
    const w = this.witch;
    if (!w.sitting) return wish;
    if (wish.lengthSq() > 0.05) this.standUp();
    if (swing && w.sitting) {
      const fwd = new Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw));
      w.position.copy(this.base).addScaledVector(fwd, swing.forward).setY(swing.up);
    }
    return new Vector3();
  }
}
