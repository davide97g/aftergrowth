import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Scene, Vector3 } from "three";
import { prop } from "../core/assets";
import type { Action } from "../game/interact";
import { CANS, CROPS, CROP_IDS, type CropId, type Plot, type Save } from "../game/state";

const ROW = 4;

/** game hours the soil stays wet after watering */
export const WET_HOURS = 10;
const REACH = 1.1;

type Stage = "empty" | "seed" | "sprout" | "young" | "ready";

function stageOf(p: Plot): Stage {
  if (!p.crop) return "empty";
  const k = p.growth / CROPS[p.crop].hours;
  if (k >= 0.999) return "ready"; // float drift must not leave a crop at 99%
  if (k < 0.15) return "seed";
  return k < 0.55 ? "sprout" : "young";
}

interface PlotView { root: Group; wet: Mesh; stage: Stage | null; crop: CropId | null; pop: number }

/** The twelve plots: state lives in the save, this draws it and offers the farming actions. */
export class Farm {
  private views: PlotView[] = [];
  private models: Record<string, Object3D> = {};
  private time = 0;

  /** Set when this is someone else's farm: you may only water it, and that is sent to them. */
  visit: { owner: string; water: (plots: number[]) => void } | null = null;

  private constructor(private spots: Vector3[], private state: Save, private onChange: (msg?: string) => void) {}

  static async create(scene: Scene, spots: Vector3[], state: Save, onChange: (msg?: string) => void) {
    const farm = new Farm(spots, state, onChange);
    for (const name of ["sprout_a", "sprout_b", ...CROP_IDS.map((c) => CROPS[c].model)]) farm.models[name] = await prop(name);
    const mound = await prop("rock_small");
    mound.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.scale.set(0.55, 0.35, 0.55);
    });
    farm.models.seed = mound;
    const wetGeo = new CircleGeometry(0.62, 18);
    wetGeo.rotateX(-Math.PI / 2);
    wetGeo.scale(1, 1, 0.55);
    for (const at of spots) {
      const root = new Group();
      root.position.copy(at);
      root.rotation.y = Math.PI / 4;
      const wet = new Mesh(wetGeo, new MeshBasicMaterial({ color: "#2a1a10", transparent: true, opacity: 0, depthWrite: false }));
      wet.position.y = 0.025;
      wet.renderOrder = 2;
      root.add(wet);
      scene.add(root);
      farm.views.push({ root, wet, stage: null, crop: null, pop: 1 });
    }
    return farm;
  }

  /** Advance growth by `hours` of game time. */
  update(dt: number, hours: number) {
    this.time += dt;
    this.state.plots.forEach((p, i) => {
      if (p.crop && p.wet > 0 && stageOf(p) !== "ready") p.growth += Math.min(hours, p.wet);
      p.wet = Math.max(0, p.wet - hours);
      this.draw(i, dt);
    });
  }

  private draw(i: number, dt: number) {
    const p = this.state.plots[i];
    const v = this.views[i];
    const stage = stageOf(p);
    (v.wet.material as MeshBasicMaterial).opacity = Math.min(p.wet / 2, 1) * 0.35;
    if (stage !== v.stage || p.crop !== v.crop) {
      for (const c of [...v.root.children]) if (c !== v.wet) v.root.remove(c);
      const name = stage === "empty" ? null : stage === "seed" ? "seed" : stage === "sprout" ? "sprout_a" : stage === "young" ? "sprout_b" : CROPS[p.crop!].model;
      if (name) {
        const m = this.models[name].clone();
        m.rotation.y = i * 1.3;
        v.root.add(m);
      }
      v.pop = v.stage === null ? 1 : 0;
      v.stage = stage;
      v.crop = p.crop;
    }
    v.pop = Math.min(v.pop + dt * 2.5, 1);
    const k = v.pop;
    const s = 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k) + (stage === "ready" ? Math.sin(this.time * 2 + i) * 0.03 : 0);
    v.root.scale.set(s, k < 1 ? 0.2 + 0.8 * k : s, s);
  }

  private nearestPlot(near: Vector3) {
    let best = -1;
    let bestD = Infinity;
    this.spots.forEach((s, i) => {
      const d = Math.hypot(s.x - near.x, s.z - near.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Interaction provider: plant, water, harvest the closest plot. */
  action = (near: Vector3): Action | null => {
    const i = this.nearestPlot(near);
    if (i < 0) return null;
    const p = this.state.plots[i];
    const pos = this.spots[i];
    const st = this.state;
    const stage = stageOf(p);
    if (this.visit) {
      const owner = this.visit.owner;
      if (!p.crop) return { pos, reach: REACH, label: `${owner}'s empty plot`, act: null };
      const name = CROPS[p.crop].name.toLowerCase();
      const pct = Math.min(100, Math.floor((p.growth / CROPS[p.crop].hours) * 100));
      if (stage === "ready" || p.wet >= 1) return { pos, reach: REACH, label: `${owner}'s ${name} · ${pct}%${stage === "ready" ? " · ready" : " · soil wet"}`, act: null };
      if (st.can.water <= 0) return { pos, reach: REACH, label: "Watering can is empty · fill it at the pond", act: null };
      return {
        pos, reach: REACH, label: `Water ${owner}'s ${name} · ${pct}%`,
        act: () => {
          this.visit!.water(this.pour(i));
          this.onChange(`Watered ${owner}'s ${name}`);
        },
      };
    }
    if (stage === "empty") {
      const seed = st.seeds[st.selected] > 0 ? st.selected : CROP_IDS.find((c) => st.seeds[c] > 0);
      if (!seed) return { pos, reach: REACH, label: "Empty plot · buy seeds at the market crate", act: null };
      return {
        pos, reach: REACH, label: `Plant ${CROPS[seed].name.toLowerCase()} (${st.seeds[seed]} left)`,
        act: () => {
          st.seeds[seed]--;
          p.crop = seed;
          p.growth = 0;
          this.onChange();
        },
      };
    }
    if (stage === "ready") {
      return {
        pos, reach: REACH, label: `Harvest ${CROPS[p.crop!].name.toLowerCase()}`,
        act: () => {
          st.harvest[p.crop!]++;
          this.onChange(`+1 ${CROPS[p.crop!].name}`);
          p.crop = null;
          p.growth = 0;
        },
      };
    }
    const pct = Math.floor((p.growth / CROPS[p.crop!].hours) * 100);
    if (p.wet < 1) {
      if (st.can.water <= 0) return { pos, reach: REACH, label: "Watering can is empty · fill it at the pond", act: null };
      return {
        pos, reach: REACH, label: `Water ${CROPS[p.crop!].name.toLowerCase()} · ${pct}% · can ${st.can.water}/${CANS[st.can.level].holds}`,
        act: () => {
          this.pour(i);
          this.onChange();
        },
      };
    }
    return { pos, reach: REACH, label: `${CROPS[p.crop!].name} · ${pct}% · soil wet`, act: null };
  };

  /** One pour of the watering can: this plot, plus its row neighbours with a bigger can. */
  private pour(i: number): number[] {
    const st = this.state;
    st.can.water--;
    const reach = CANS[st.can.level].reach;
    const row = Math.floor(i / ROW);
    const hit: number[] = [];
    for (let k = -(reach - 1) / 2; k <= (reach - 1) / 2; k++) {
      const j = i + k;
      if (j < 0 || j >= this.state.plots.length || Math.floor(j / ROW) !== row) continue;
      this.state.plots[j].wet = WET_HOURS;
      if (this.state.plots[j].crop) hit.push(j);
    }
    return hit;
  }

  /** Rain from magic or a contraption. On a visit, the owner is told which plots got wet. */
  water(at: Vector3, r: number) {
    const hit: number[] = [];
    this.spots.forEach((s, i) => {
      if (Math.hypot(s.x - at.x, s.z - at.z) < r + 0.4) {
        this.state.plots[i].wet = WET_HOURS;
        if (this.state.plots[i].crop) hit.push(i);
      }
    });
    if (this.visit && hit.length) this.visit.water(hit);
  }

  /** A rain shower wets every plot. */
  rain() {
    for (const p of this.state.plots) p.wet = WET_HOURS;
  }

  /** Growth magic: planted plots in reach jump ahead. */
  grow(at: Vector3, r: number, hours: number) {
    this.spots.forEach((s, i) => {
      const p = this.state.plots[i];
      if (p.crop && Math.hypot(s.x - at.x, s.z - at.z) < r + 0.4) p.growth = Math.min(p.growth + hours, CROPS[p.crop].hours);
    });
  }
}
