import { Object3D, Vector3 } from "three";
import { sound } from "../audio/sound";
import type { Action } from "../game/interact";
import { type Save, give } from "../game/state";
import { KINDS, type Placed } from "../island/layout";
import type { IslandWorld } from "../world/world";

/** what each kind of placed thing gives once a day */
const YIELD: Partial<Record<Placed["kind"], "wood" | "stone">> = {};
for (const k of Object.keys(KINDS) as Placed["kind"][]) {
  if (k.startsWith("tree_") || k.startsWith("pine_")) YIELD[k] = "wood";
}
YIELD.rock_large = "stone";
YIELD.rock_tall = "stone";

/**
 * Pruning trees for wood and chipping boulders for stone, once per game day each, on your own island.
 * The tree or rock gives a little shake.
 */
export class Gather {
  private shakes: { obj: Object3D; t: number; base: number }[] = [];

  constructor(private world: IslandWorld, private state: Save, private onChange: (msg?: string) => void, private mine: boolean) {}

  action = (near: Vector3): Action | null => {
    if (!this.mine) return null;
    let best: Placed | null = null;
    let bestD = Infinity;
    for (const o of this.world.layout.objects) {
      if (!YIELD[o.kind]) continue;
      const d = Math.hypot(o.x - near.x, o.z - near.z) - KINDS[o.kind].solid * o.scale;
      if (d < bestD && d < 1.1 && (this.state.gathered?.[o.id] ?? 0) < this.state.day) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return null;
    const o = best;
    const what = YIELD[o.kind]!;
    const name = KINDS[o.kind].label.toLowerCase();
    return {
      pos: new Vector3(o.x, 0, o.z), reach: 1.1 + KINDS[o.kind].solid * o.scale,
      label: what === "wood" ? `Prune the ${name} · +1 wood` : `Chip the ${name} · +1 stone`,
      act: () => {
        (this.state.gathered ??= {})[o.id] = this.state.day;
        give(this.state, what);
        const obj = this.world.objects.get(o.id);
        if (obj && !this.shakes.some((s) => s.obj === obj)) this.shakes.push({ obj, t: 0, base: obj.rotation.z });
        if (what === "wood") sound.chop();
        else sound.chip();
        this.onChange(`+1 ${what}`);
      },
    };
  };

  update(dt: number) {
    for (const s of this.shakes) {
      s.t += dt;
      s.obj.rotation.z = s.base + Math.sin(s.t * 32) * 0.05 * Math.max(0, 1 - s.t / 0.6);
    }
    this.shakes = this.shakes.filter((s) => {
      if (s.t < 0.6) return true;
      s.obj.rotation.z = s.base;
      return false;
    });
  }
}
