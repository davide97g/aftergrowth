import { Group, InstancedMesh, Matrix4, Object3D, Vector3 } from "three";
import type { Action } from "../game/interact";
import { type FlowerColor, type Save, give } from "../game/state";

const REGROW_HOURS = 8;
const REACH = 0.9;
const ZERO = new Matrix4().makeScale(0, 0, 0);

interface Flower {
  color: FlowerColor;
  pos: Vector3;
  /** wild flowers live in an instanced bed; grown ones are their own objects */
  bed?: { group: Group; index: number; matrix: Matrix4 };
  obj?: Object3D;
  regrow: number;
}

/** Every flower the witch can pick for ink. */
export class Flowers {
  private all: Flower[] = [];

  constructor(beds: { color: FlowerColor; group: Group }[], private state: Save, private onPick: (color: FlowerColor) => void) {
    for (const { color, group } of beds) {
      const inst = group.children[0] as InstancedMesh | undefined;
      if (!inst) continue;
      for (let i = 0; i < inst.count; i++) {
        const matrix = new Matrix4();
        inst.getMatrixAt(i, matrix);
        this.all.push({ color, pos: new Vector3().setFromMatrixPosition(matrix), bed: { group, index: i, matrix }, regrow: 0 });
      }
    }
  }

  /** Flowers grown by magic join the meadow. */
  addGrown(obj: Object3D, color: FlowerColor) {
    this.all.push({ color, pos: obj.position.clone(), obj, regrow: 0 });
  }

  private setVisible(f: Flower, visible: boolean) {
    if (f.bed) {
      for (const m of f.bed.group.children as InstancedMesh[]) {
        m.setMatrixAt(f.bed.index, visible ? f.bed.matrix : ZERO);
        m.instanceMatrix.needsUpdate = true;
      }
    } else if (f.obj && !visible) {
      f.obj.removeFromParent();
    }
  }

  update(hours: number) {
    for (const f of this.all) {
      if (f.regrow <= 0) continue;
      f.regrow -= hours;
      if (f.regrow <= 0) this.setVisible(f, true);
    }
  }

  action = (near: Vector3): Action | null => {
    let best: Flower | null = null;
    let bestD = REACH;
    for (const f of this.all) {
      if (f.regrow > 0 || (f.obj && !f.obj.parent)) continue;
      const d = Math.hypot(f.pos.x - near.x, f.pos.z - near.z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    if (!best) return null;
    const f = best;
    return {
      pos: f.pos,
      reach: REACH,
      label: `Pick ${f.color} flower`,
      act: () => {
        give(this.state, `flower:${f.color}`);
        if (f.bed) f.regrow = REGROW_HOURS;
        this.setVisible(f, false);
        if (f.obj) this.all.splice(this.all.indexOf(f), 1);
        this.onPick(f.color);
      },
    };
  };
}
