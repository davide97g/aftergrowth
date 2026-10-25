import { AdditiveBlending, Color, IcosahedronGeometry, Mesh, MeshBasicMaterial, Scene, Vector3 } from "three";
import type { Action } from "../game/interact";
import { BREW, CANS, CROPS, CROP_IDS, type CropId, INK_MAX, type Save, takeFlowers, totalFlowers } from "../game/state";
import { type Pt } from "../world/walkmask";
import { HONEY_PRICE } from "./garden";

/** Cauldron (flowers into ink) and market crate (crops into coins, coins into seeds). */
export class Workshop {
  private panel = document.getElementById("market")!;
  private bubbles: { m: Mesh; t: number }[] = [];
  private brewFlash = 0;

  constructor(scene: Scene, private spots: { cauldron: Vector3; market: Vector3 }, private state: Save, private onChange: (msg?: string) => void, private pond: Pt[] | null = null) {
    const bubbleMat = new MeshBasicMaterial({ color: new Color("#b9a0ff").multiplyScalar(1.6), transparent: true, blending: AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const b = new Mesh(new IcosahedronGeometry(0.06, 1), bubbleMat);
      scene.add(b);
      this.bubbles.push({ m: b, t: i / 6 });
    }
    document.getElementById("market-close")!.addEventListener("click", () => this.openMarket(false));
    this.panel.addEventListener("click", (e) => this.onMarketClick(e));
  }

  get marketOpen() {
    return !this.panel.hidden;
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
    if (s.ink >= INK_MAX) return { pos, reach: 1.6, label: "Ink bottle is full", act: null };
    if (totalFlowers(s) < BREW.flowers) return { pos, reach: 1.6, label: `Cauldron · needs ${BREW.flowers} flowers (you have ${totalFlowers(s)})`, act: null };
    return {
      pos, reach: 1.6, label: `Brew ink · ${BREW.flowers} flowers → ${BREW.ink} drops`,
      act: () => {
        takeFlowers(s, BREW.flowers);
        s.ink = Math.min(INK_MAX, s.ink + BREW.ink);
        this.brewFlash = 1.2;
        this.onChange(`+${BREW.ink} ink`);
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
        this.onChange("Can filled");
      },
    };
  };

  market = (near: Vector3): Action | null => {
    const pos = this.spots.market;
    if (Math.hypot(pos.x - near.x, pos.z - near.z) > 1.7) return null;
    return { pos, reach: 1.7, label: "Market crate · sell and buy", act: () => this.openMarket(true) };
  };

  openMarket(open: boolean) {
    this.panel.hidden = !open;
    if (open) this.renderMarket();
  }

  private onMarketClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest("button[data-act]") as HTMLButtonElement | null;
    if (!btn) return;
    const s = this.state;
    const crop = btn.dataset.crop as CropId;
    if (btn.dataset.act === "honey") {
      const n = s.goods?.honey ?? 0;
      s.coins += n * HONEY_PRICE;
      if (s.goods) s.goods.honey = 0;
      this.onChange(`+${n * HONEY_PRICE} coins`);
    } else if (btn.dataset.act === "sell") {
      const n = s.harvest[crop];
      s.coins += n * CROPS[crop].sellPrice;
      s.harvest[crop] = 0;
      this.onChange(`+${n * CROPS[crop].sellPrice} coins`);
    } else if (btn.dataset.act === "can") {
      const next = CANS[s.can.level + 1];
      if (!next || s.coins < next.price) return;
      s.coins -= next.price;
      s.can.level++;
      s.can.water = next.holds;
      this.onChange(`${next.name}!`);
    } else if (btn.dataset.act === "buy") {
      const n = Number(btn.dataset.n);
      const cost = n * CROPS[crop].seedPrice;
      if (s.coins < cost) return;
      s.coins -= cost;
      s.seeds[crop] += n;
      this.onChange();
    }
    this.renderMarket();
  }

  private renderMarket() {
    const s = this.state;
    const rows = CROP_IDS.map((c) => {
      const d = CROPS[c];
      return `<tr>
        <th scope="row">${d.name}<small>${d.hours} wet hours</small></th>
        <td>${s.harvest[c]} <button data-act="sell" data-crop="${c}" ${s.harvest[c] ? "" : "disabled"}>Sell · ${d.sellPrice}c each</button></td>
        <td>${s.seeds[c]} <button data-act="buy" data-crop="${c}" data-n="1" ${s.coins >= d.seedPrice ? "" : "disabled"}>+1 · ${d.seedPrice}c</button><button data-act="buy" data-crop="${c}" data-n="5" ${s.coins >= d.seedPrice * 5 ? "" : "disabled"}>+5</button></td>
      </tr>`;
    }).join("");
    document.getElementById("market-body")!.innerHTML = `
      <p class="coins">${s.coins} coins</p>
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Harvest</th><th>Seeds</th></tr></thead>
        <tbody>${rows}
          <tr><th scope="row">Honey<small>from your beehives</small></th><td>${s.goods?.honey ?? 0} <button data-act="honey" ${s.goods?.honey ? "" : "disabled"}>Sell · ${HONEY_PRICE}c each</button></td><td></td></tr>
        </tbody>
      </table></div>
      ${(() => {
        const next = CANS[s.can.level + 1];
        return next
          ? `<p class="upgrade"><span><strong>${next.name}</strong> holds ${next.holds} pours and waters ${next.reach} plots in a row.</span><button data-act="can" ${s.coins >= next.price ? "" : "disabled"}>Buy · ${next.price}c</button></p>`
          : `<p class="upgrade"><span>Your <strong>${CANS[s.can.level].name}</strong> is the best there is.</span></p>`;
      })()}
      <p class="note">Crops grow only while their soil is wet. Rain magic counts. Fill the can at the pond.</p>`;
  }
}
