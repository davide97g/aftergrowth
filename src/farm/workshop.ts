import { AdditiveBlending, Color, IcosahedronGeometry, Mesh, MeshBasicMaterial, Scene, Vector3 } from "three";
import { sound } from "../audio/sound";
import type { Action } from "../game/interact";
import { BOTTLES, BREW_FLOWERS, CANS, type Save, brewInk, inkMax, takeFlowers, totalFlowers } from "../game/state";
import { type Pt } from "../world/walkmask";

/** Cauldron (flowers into ink), the pond's edge (filling the can) and the market crate. */
export class Workshop {
  private bubbles: { m: Mesh; t: number }[] = [];
  private brewFlash = 0;

  constructor(scene: Scene, private spots: { cauldron: Vector3; market: Vector3 }, private state: Save, private onChange: (msg?: string) => void, private pond: Pt[] | null, private openCrate: () => void) {
    const bubbleMat = new MeshBasicMaterial({ color: new Color("#b9a0ff").multiplyScalar(1.6), transparent: true, blending: AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const b = new Mesh(new IcosahedronGeometry(0.06, 1), bubbleMat);
      scene.add(b);
      this.bubbles.push({ m: b, t: i / 6 });
    }
  }

  update(dt: number) {
    this.brewFlash = Math.max(0, this.brewFlash - dt);
    for (const b of this.bubbles) {
      b.t = (b.t + dt * (0.5 + this.brewFlash * 2)) % 1;
      const a = b.t * 9 + this.bubbles.indexOf(b) * 2;
      b.m.position.set(this.spots.cauldron.x + Math.cos(a) * 0.2, 0.7 + b.t * (0.9 + this.brewFlash), this.spots.cauldron.z + Math.sin(a) * 0.2);
      b.m.scale.setScalar(Math.sin(b.t * Math.PI) * (1 + this.brewFlash * 2));
    }
  }

  cauldron = (near: Vector3): Action | null => {
    const pos = this.spots.cauldron;
    if (Math.hypot(pos.x - near.x, pos.z - near.z) > 1.6) return null;
    const s = this.state;
    if (s.ink >= inkMax(s)) return { pos, reach: 1.6, label: `${BOTTLES[s.bottle].name} is full`, act: null };
    if (totalFlowers(s) < BREW_FLOWERS) return { pos, reach: 1.6, label: `Cauldron · needs ${BREW_FLOWERS} flowers (you have ${totalFlowers(s)})`, act: null };
    const drops = brewInk(s);
    return {
      pos, reach: 1.6, label: `Brew ink · ${BREW_FLOWERS} flowers → ${drops} drops`,
      act: () => {
        takeFlowers(s, BREW_FLOWERS);
        s.ink = Math.min(inkMax(s), s.ink + drops);
        this.brewFlash = 1.2;
        this.onChange(`+${drops} ink`);
      },
    };
  };

  /** Kneel at the pond's edge to fill the watering can. */
  pondside = (near: Vector3): Action | null => {
    if (!this.pond) return null;
    let best = Infinity;
    let at: Vector3 | null = null;
    for (let i = 0, j = this.pond.length - 1; i < this.pond.length; j = i++) {
      const [ax, az] = this.pond[j];
      const [bx, bz] = this.pond[i];
      const ex = bx - ax;
      const ez = bz - az;
      const t = Math.max(0, Math.min(1, ((near.x - ax) * ex + (near.z - az) * ez) / (ex * ex + ez * ez)));
      const d = Math.hypot(ax + ex * t - near.x, az + ez * t - near.z);
      if (d < best) {
        best = d;
        at = new Vector3(ax + ex * t, 0, az + ez * t);
      }
    }
    if (!at || best > 1.2) return null;
    const can = this.state.can;
    const holds = CANS[can.level].holds;
    if (can.water >= holds) return { pos: at, reach: 1.2, label: `${CANS[can.level].name} is full`, act: null };
    return {
      pos: at, reach: 1.2, label: `Fill the ${CANS[can.level].name.toLowerCase()} (${can.water}/${holds})`,
      act: () => {
        can.water = holds;
        sound.pour(true);
        this.onChange("Can filled");
      },
    };
  };

  /** The market crate opens its shop panel. */
  market = (near: Vector3): Action | null => {
    const pos = this.spots.market;
    if (Math.hypot(pos.x - near.x, pos.z - near.z) > 1.7) return null;
    return { pos, reach: 1.7, label: "Market crate · sell and buy", act: () => this.openCrate() };
  };
}
