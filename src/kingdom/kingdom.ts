import { Color, Group, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry, Scene, TorusGeometry, Vector3 } from "three";
import { sound } from "../audio/sound";
import { CHARM_SPELLS, CROPS, CROP_IDS, FLOWER_COLORS, ITEMS, type ItemId, MATERIALS } from "../../shared/items";
import { hash01, marketDay } from "../../shared/prices";
import type { Action, Provider } from "../game/interact";
import { type Save, count, give, inkMax, take } from "../game/state";
import type { ShopPanel } from "../market/panel";
import type { Offer, Shop } from "../market/shops";
import { Witch } from "../player/witch";
import type { Hud } from "../ui/hud";
import type { Mood } from "../world/daycycle";
import type { Pt } from "../island/shapes";
import { PALACE, groundAt, polyLength } from "./plan";
import type { KingdomWorld } from "./world";

/** Merchants in the market square (stalls 0–3) and the Royal Arcanum: the usual shop panel, royal rates. */
export const ROYAL_SHOPS: Record<string, Shop> = {
  "stall-0": {
    id: "royal-flora", name: "Fruit & Flora", building: null, daily: true, rate: 1.1,
    keeper: { name: "Marigold", color: "#e08a3a", greeting: "Flowers from every island, seeds for every season." },
    sells: [...FLOWER_COLORS.map((c): Offer => ({ item: `flower:${c}` })), ...CROP_IDS.map((c): Offer => ({ item: `seed:${c}` }))],
    buys: [...FLOWER_COLORS.map((c): ItemId => `flower:${c}`), ...CROP_IDS.map((c): ItemId => `crop:${c}`)],
  },
  "stall-1": {
    id: "royal-glass", name: "Glass & Brass", building: null, daily: true, rate: 1.1,
    keeper: { name: "Tobias", color: "#7a8a9a", greeting: "Glass blown in the palace kilns. Brass from the old mines." },
    sells: MATERIALS.map((m): Offer => ({ item: m })),
    buys: ["wood", "stone"],
  },
  "stall-2": {
    id: "royal-charms", name: "Charm Peddler", building: null, daily: true, rate: 1.1,
    keeper: { name: "Nim", color: "#c04a8a", greeting: "Every charm there is. Even the firefly kind." },
    sells: [{ item: "charm_blank" }, ...CHARM_SPELLS.map((c): Offer => ({ item: `charm:${c}` }))],
    buys: CHARM_SPELLS.map((c): ItemId => `charm:${c}`),
  },
  "stall-3": {
    id: "royal-hive", name: "Dairy & Hive", building: null, daily: true, rate: 1.1,
    keeper: { name: "Bettany", color: "#d9b13a", greeting: "Honey, eggs, milk and wool. The palace kitchens buy everything I don't." },
    sells: [{ item: "honey" }, { item: "egg" }, { item: "milk" }, { item: "wool" }],
    buys: ["honey", "egg", "duck_egg", "wool", "milk"],
  },
  arcanum: {
    id: "arcanum", name: "Royal Arcanum", building: null, daily: true, rate: 1.1,
    keeper: { name: "Archmage Elowen", color: "#3d2f8f", greeting: "Every sigil has a scroll. Every scroll has a price." },
    sells: [{ scroll: "wind" }, { scroll: "light" }, { scroll: "flame" }, { ink: true }, { gear: "bottle" }, { gear: "pen" }, { gear: "cauldron" }],
    buys: ["ink", ...CHARM_SPELLS.map((c): ItemId => `charm:${c}`)],
  },
};

/** What the tavern serves: each does something small and right away. */
const MENU = [
  { id: "mead", name: "Honey mead", price: 12, blurb: "Your steps quicken for three minutes." },
  { id: "pie", name: "Starberry pie", price: 14, blurb: "Five drops of ink, baked in." },
  { id: "cocoa", name: "Hot cocoa", price: 4, blurb: "A warm cup and a drop of ink." },
  { id: "song", name: "A song from the bard", price: 3, blurb: "Pure joy. No other effect." },
] as const;

const LINES = [
  "They say the crystal over the palace grew from one drop of starlight ink.",
  "Best mead in the sky is at the Gilded Griffin. Don't tell my husband.",
  "Ring the great bell once a day and the bellringer leaves you a tip.",
  "The Arcanum teaches flame only to witches who already know light.",
  "Pop the floating runes at the spell range: the range master pays in coin.",
  "The royal steward pays well over the odds when the palace kitchens run short.",
  "Toss a coin in the fountain. Wishes come true here. A little.",
  "Mind the Narrows after dark, the lanterns are few and the cats are many.",
  "The ley lines brighten at night. Some say the whole city is one big glyph.",
  "My grandmother carried every stone of the lower wall. Well, some of them.",
  "Up the slope, past the tavern, and keep climbing: the palace is always up.",
  "The stalls in the square pay a little more than the Lantern Market. Royal rates!",
];
const NAMES = ["Alder", "Bryony", "Cass", "Dorian", "Edda", "Fenn", "Gwen", "Hollis", "Ivo", "Juno", "Kit", "Linnet", "Mabel", "Nell", "Orrin", "Pim"];
const COATS = ["#c9434e", "#3e5fb8", "#5c9e3a", "#8058a8", "#d9b13a", "#3f928c", "#e07a9a", "#7a5a3c", "#5aa7c8", "#2a2230"];
const HATS = ["classic", "wide", "tall", "crown"] as const;

interface Keeper { id: string; witch: Witch; spot: Vector3; yaw: number; use: Vector3 }
interface Walker { name: string; witch: Witch; route: Pt[]; len: number; s: number; dir: number; speed: number; pause: number; line: number }
interface Target { obj: Object3D; base: Vector3; hidden: number }

/** Today's royal request: a crop, how many, and what it pays (well over the shops). */
export function requisition(day: number) {
  const crop = CROP_IDS[Math.floor(hash01("requisition", day) * CROP_IDS.length)];
  const qty = 3 + Math.floor(hash01("requisition:qty", day) * 5);
  return { crop, qty, pays: Math.round(qty * CROPS[crop].sellPrice * 1.8) };
}

/**
 * The life of Aetherhold: merchants and keepers, the tavern, the wishing fountain, the bell, the
 * spell range, the royal steward, and the townsfolk strolling its streets.
 */
export class Kingdom {
  private keepers: Keeper[] = [];
  private walkers: Walker[] = [];
  private targets: Target[] = [];
  private round: { left: number; score: number } | null = null;
  private bellSwing = 0;
  private panel: HTMLElement;
  private badge: HTMLElement;
  private panelKind: "tavern" | "steward" | null = null;
  private time = 0;
  private luteTimer = 4;
  readonly actions: Provider[];

  private constructor(
    private world: KingdomWorld,
    private state: Save,
    private hud: Hud,
    private shops: ShopPanel,
    private changed: (msg?: string) => void,
  ) {
    this.state.kingdom ??= {};
    this.panel = document.createElement("aside");
    this.panel.id = "kingdom-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Aetherhold");
    this.panel.addEventListener("click", (e) => this.click(e));
    this.badge = document.createElement("div");
    this.badge.id = "range-badge";
    this.badge.hidden = true;
    document.getElementById("hud")!.append(this.panel, this.badge);
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.panelOpen) this.close();
    });
    this.actions = [this.keeperAction, this.fountain, this.bell, this.range, this.townsfolk];
  }

  static async create(scene: Scene, world: KingdomWorld, state: Save, hud: Hud, shops: ShopPanel, changed: (msg?: string) => void) {
    const k = new Kingdom(world, state, hud, shops, changed);
    const colors: Record<string, string> = { tavern: "#b0764a", steward: "#2a2230", range: "#c9434e" };
    for (const s of world.plan.spots) {
      if (s.id === "fountain" || s.id === "bell") continue;
      const color = ROYAL_SHOPS[s.id]?.keeper?.color ?? colors[s.id] ?? "#4a5bb5";
      const w = await Witch.load(color, s.id === "steward" ? "tall" : s.id === "tavern" ? "wide" : "classic");
      const spot = new Vector3(s.keeper[0], groundAt(s.keeper[0], s.keeper[1]), s.keeper[1]);
      w.position.copy(spot);
      w.root.rotation.y = s.yaw;
      scene.add(w.root);
      k.keepers.push({ id: s.id, witch: w, spot, yaw: s.yaw, use: new Vector3(s.use[0], groundAt(s.use[0], s.use[1]), s.use[1]) });
    }
    // townsfolk out for a stroll
    const routes = world.plan.routes.filter((r) => polyLength(r) > 6);
    for (let i = 0; i < 12; i++) {
      const route = routes[i % routes.length];
      const w = await Witch.load(COATS[i % COATS.length], HATS[i % HATS.length]);
      const len = polyLength(route);
      scene.add(w.root);
      k.walkers.push({ name: NAMES[i], witch: w, route, len, s: ((i * 7.3) % 1) * len, dir: i % 2 ? 1 : -1, speed: 0.9 + ((i * 0.37) % 0.6), pause: 0, line: i % LINES.length });
    }
    k.buildTargets(scene);
    return k;
  }

  // ---------- the spell range ----------

  private buildTargets(scene: Scene) {
    const ring = new TorusGeometry(0.55, 0.08, 4, 18);
    const gem = new OctahedronGeometry(0.28, 0);
    const r = this.world.plan.range;
    for (let i = 0; i < 6; i++) {
      const obj = new Group();
      const mat = new MeshBasicMaterial({ color: new Color("#f2c14e") });
      obj.add(new Mesh(ring, mat), new Mesh(gem, new MeshBasicMaterial({ color: new Color("#8fe9ff") })));
      obj.rotation.y = Math.PI / 4;
      const base = this.spotInRange(i);
      obj.position.copy(base);
      scene.add(obj);
      this.targets.push({ obj, base, hidden: 0 });
    }
    void r;
  }

  private spotInRange(i: number) {
    const r = this.world.plan.range;
    const a = i * 2.4 + Math.random() * 1.2;
    const d = Math.sqrt(Math.random()) * r.r;
    const x = r.x + Math.cos(a) * d;
    const z = r.z + Math.sin(a) * d;
    return new Vector3(x, groundAt(x, z) + 1.5 + Math.random() * 0.8, z);
  }

  /** Every spell cast on the island: during a round, runes near it burst. */
  onCast(_spell: string, at: Vector3, power: number) {
    if (!this.round) return;
    let hit = 0;
    for (const t of this.targets) {
      if (t.hidden > 0) continue;
      if (Math.hypot(t.obj.position.x - at.x, t.obj.position.z - at.z) > 1.4 + power * 0.35) continue;
      t.hidden = 1.6;
      hit++;
    }
    if (!hit) return;
    this.round.score += hit;
    sound.chime();
    this.hud.pop(`+${hit} ${hit === 1 ? "rune" : "runes"}`);
  }

  private range = (near: Vector3): Action | null => {
    const k = this.keepers.find((x) => x.id === "range");
    if (!k || k.use.distanceTo(near) > 1.6) return null;
    if (this.round) return { pos: k.use, reach: 1.6, label: `Range master Brannoc · ${Math.ceil(this.round.left)}s left, ${this.round.score} runes`, act: null };
    const best = this.state.kingdom?.rangeBest ?? 0;
    return {
      pos: k.use, reach: 1.6, label: `Spell range · a round for 5c${best ? ` · best ${best}` : ""}`, priority: 1,
      act: () => {
        if (this.state.coins < 5) return this.hud.toast("Range master Brannoc", "Five coins a round. Come back with a full purse.");
        this.state.coins -= 5;
        this.round = { left: 60, score: 0 };
        k.witch.react("gesture");
        sound.bell();
        this.changed();
        this.hud.toast("Sixty seconds!", "Cast any glyph (or break a charm) near the floating runes. Each one pays 6 coins.");
      },
    };
  };

  private endRound() {
    const r = this.round!;
    this.round = null;
    const coins = r.score * 6;
    this.state.coins += coins;
    const ks = (this.state.kingdom ??= {});
    const record = r.score > (ks.rangeBest ?? 0);
    if (record) ks.rangeBest = r.score;
    this.changed(coins ? `+${coins} coins` : undefined);
    this.hud.toast(`${r.score} ${r.score === 1 ? "rune" : "runes"}${record && r.score ? " · a new best!" : ""}`, coins ? `Brannoc pays you ${coins} coins.` : "Not one. Draw quickly, and close the seal right over a rune.");
  }

  // ---------- keepers: shops, the tavern, the steward ----------

  private keeperAction = (near: Vector3): Action | null => {
    let best: Keeper | null = null;
    for (const k of this.keepers) {
      if (k.id === "range") continue;
      if (k.use.distanceTo(near) < 1.8 && (!best || k.use.distanceTo(near) < best.use.distanceTo(near))) best = k;
    }
    if (!best) return null;
    const k = best;
    const shop = ROYAL_SHOPS[k.id];
    if (shop) {
      return {
        pos: k.use, reach: 1.8, label: `${shop.keeper!.name} · ${shop.name}`, priority: 1,
        act: () => {
          k.witch.react("gesture");
          sound.bell();
          this.shops.open(shop);
        },
      };
    }
    if (k.id === "tavern") return { pos: k.use, reach: 1.8, label: "Ottilie · The Gilded Griffin", priority: 1, act: () => this.open("tavern") };
    if (k.id === "steward") return { pos: k.use, reach: 1.8, label: "The royal steward", priority: 1, act: () => this.open("steward") };
    return null;
  };

  get panelOpen() {
    return !this.panel.hidden;
  }

  private close() {
    this.panel.hidden = true;
    this.panelKind = null;
  }

  private open(kind: "tavern" | "steward") {
    this.panelKind = kind;
    this.panel.hidden = false;
    sound.bell();
    this.render();
  }

  /** Redraw if open (coins or crops may have changed). */
  render() {
    if (!this.panelKind || this.panel.hidden) return;
    const s = this.state;
    const head = (title: string) => `<header><h2>${title}</h2><button type="button" data-k="close" aria-label="Close">×</button></header>`;
    if (this.panelKind === "tavern") {
      const mead = (s.kingdom?.meadUntil ?? 0) > Date.now();
      this.panel.innerHTML = `${head("The Gilded Griffin")}
        <p class="keeper"><span class="hat" style="background:#b0764a"></span><span><b>Ottilie:</b> “Sit anywhere, love. The griffin never bites.”</span></p>
        <p class="coins">${s.coins} coins${mead ? " · <small>the mead is working</small>" : ""}</p>
        ${MENU.map((m) => `<p class="upgrade"><span><strong>${m.name}</strong><br>${m.blurb}</span><button type="button" data-k="order" data-id="${m.id}" ${s.coins >= m.price ? "" : "disabled"}>${m.price}c</button></p>`).join("")}
        <p class="note">The benches on the terrace are free. Time drifts by while you sit.</p>`;
      return;
    }
    const day = marketDay();
    const req = requisition(day);
    const done = s.kingdom?.delivered === day;
    const have = count(s, `crop:${req.crop}`);
    this.panel.innerHTML = `${head("Royal requisition")}
      <p class="keeper"><span class="hat" style="background:#2a2230"></span><span><b>The steward:</b> “${done ? "The kitchens are content. Come back tomorrow." : `The palace kitchens need ${req.qty} ${CROPS[req.crop].name.toLowerCase()}${req.qty > 1 ? "s" : ""} today.`}”</span></p>
      ${done ? "" : `<p class="upgrade"><span><strong>${req.qty} × ${CROPS[req.crop].name}</strong> you have ${have}. The crown pays <b>${req.pays}c</b>, nearly double the market.</span><button type="button" data-k="deliver" ${have >= req.qty ? "" : "disabled"}>Deliver</button></p>`}
      <p class="note">A new request every market day.</p>`;
  }

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest("button[data-k]") as HTMLButtonElement | null;
    if (!b) return;
    const s = this.state;
    const ks = (s.kingdom ??= {});
    if (b.dataset.k === "close") return this.close();
    if (b.dataset.k === "order") {
      const m = MENU.find((x) => x.id === b.dataset.id);
      if (!m || s.coins < m.price) return;
      s.coins -= m.price;
      if (m.id === "mead") ks.meadUntil = Math.max(Date.now(), ks.meadUntil ?? 0) + 180_000;
      if (m.id === "pie") s.ink = Math.min(inkMax(s), s.ink + 5);
      if (m.id === "cocoa") s.ink = Math.min(inkMax(s), s.ink + 1);
      if (m.id === "song") sound.lute(14);
      this.changed(m.id === "pie" ? "+5 ink" : m.id === "cocoa" ? "+1 ink" : m.id === "mead" ? "Quick feet!" : "♪");
    }
    if (b.dataset.k === "deliver") {
      const day = marketDay();
      const req = requisition(day);
      if (ks.delivered === day || !take(s, `crop:${req.crop}`, req.qty)) return;
      ks.delivered = day;
      s.coins += req.pays;
      this.changed(`+${req.pays} coins`);
      this.hud.toast("By royal appointment", `The steward stamps your hand with the palace seal and pays ${req.pays} coins.`);
    }
    this.render();
  }

  // ---------- the fountain and the bell ----------

  private fountain = (near: Vector3): Action | null => {
    const sp = this.world.plan.spots.find((x) => x.id === "fountain")!;
    const pos = new Vector3(sp.use[0], groundAt(sp.use[0], sp.use[1]), sp.use[1]);
    if (pos.distanceTo(near) > 1.6) return null;
    const ks = this.state.kingdom ?? {};
    if (ks.wished === marketDay()) return { pos, reach: 1.6, label: "Wishing fountain · one wish a day", act: null };
    return {
      pos, reach: 1.6, label: "Toss a coin in the fountain · 1c",
      act: () => {
        if (this.state.coins < 1) return;
        this.state.coins -= 1;
        (this.state.kingdom ??= {}).wished = marketDay();
        sound.pour();
        const k = Math.random();
        let what: string;
        if (k < 0.35) {
          const c = FLOWER_COLORS[Math.floor(Math.random() * 4)];
          give(this.state, `flower:${c}`, 3);
          what = `Three ${c} flowers float up out of the water.`;
        } else if (k < 0.65) {
          this.state.ink = Math.min(inkMax(this.state), this.state.ink + 3);
          what = "The water turns to ink for a moment: three drops for your bottle.";
        } else if (k < 0.9) {
          this.state.coins += 15;
          what = "The fountain gives back more than it took: 15 coins.";
        } else {
          const c = CHARM_SPELLS[Math.floor(Math.random() * CHARM_SPELLS.length)];
          give(this.state, `charm:${c}`);
          what = `A ${ITEMS[`charm:${c}`].name.toLowerCase()} glitters on the bottom.`;
        }
        this.changed();
        this.hud.toast("Your wish is heard", what);
      },
    };
  };

  private bell = (near: Vector3): Action | null => {
    const sp = this.world.plan.spots.find((x) => x.id === "bell")!;
    const pos = new Vector3(sp.use[0], groundAt(sp.use[0], sp.use[1]), sp.use[1]);
    if (pos.distanceTo(near) > 1.7) return null;
    return {
      pos, reach: 1.7, label: "Pull the rope of the great bell", priority: 1,
      act: () => {
        if (this.bellSwing > 1) return;
        this.bellSwing = 4.5;
        sound.greatBell();
        setTimeout(() => sound.greatBell(), 1400);
        const ks = (this.state.kingdom ??= {});
        if (ks.rang !== marketDay()) {
          ks.rang = marketDay();
          this.state.coins += 5;
          this.changed("+5 coins");
          this.hud.toast("The great bell tolls", "The whole city hears it. The bellringer leaves you a tip: 5 coins.");
        }
      },
    };
  };

  // ---------- townsfolk ----------

  private townsfolk = (near: Vector3): Action | null => {
    let best: Walker | null = null;
    let bd = 1.5;
    for (const w of this.walkers) {
      const d = w.witch.position.distanceTo(near);
      if (d < bd) {
        best = w;
        bd = d;
      }
    }
    if (!best) return null;
    const w = best;
    return {
      pos: w.witch.position, reach: 1.5, label: `Chat with ${w.name}`,
      act: () => {
        w.pause = 5;
        w.witch.react("gesture");
        this.hud.toast(w.name, LINES[w.line]);
        w.line = (w.line + 5) % LINES.length;
      },
    };
  };

  /** Where the camera looks: a little above the witch as she nears the palace, so its towers and crystal fit. */
  lookAt(at: Vector3) {
    const [px, pz] = PALACE;
    const k = Math.min(1, Math.max(0, (26 - Math.hypot(at.x - px, at.z - pz)) / 18));
    this.look.copy(at).y += k * k * (3 - 2 * k) * 4.5;
    return this.look;
  }
  private look = new Vector3();

  /** How lively it sounds here: the square and the tavern are busy, the palace hushed. */
  crowd(at: Vector3) {
    const p = this.world.plan;
    const sq = p.plazas.find((x) => x.id === "square")!;
    const tv = p.plazas.find((x) => x.id === "terrace")!;
    const near = (x: number, z: number, r: number) => Math.max(0, 1 - Math.hypot(x - at.x, z - at.z) / r);
    return Math.min(1, 0.2 + near(sq.x, sq.z, 14) * 0.9 + near(tv.x, tv.z, 10) * 0.8);
  }

  update(dt: number, player: Vector3, mood: Mood) {
    this.time += dt;
    for (const k of this.keepers) {
      const close = k.use.distanceTo(player) < 3.2;
      const yaw = close ? Math.atan2(player.x - k.spot.x, player.z - k.spot.z) : k.yaw;
      k.witch.follow(dt, { x: k.spot.x, z: k.spot.z, yaw, speed: 0, drawing: false });
    }
    for (const w of this.walkers) {
      let speed = 0;
      let yaw = w.witch.yaw;
      if (w.pause > 0) {
        w.pause -= dt;
        yaw = Math.atan2(player.x - w.witch.position.x, player.z - w.witch.position.z);
      } else {
        w.s += w.dir * w.speed * dt;
        if (w.s < 0 || w.s > w.len) {
          w.dir *= -1;
          w.s = Math.min(Math.max(w.s, 0), w.len);
          w.pause = 1 + Math.random() * 3;
        }
        speed = w.speed;
      }
      const here = pointAt(w.route, w.s);
      // stroll a little to the right of the street's middle, like people do
      const side = 0.45 * w.dir;
      const x = here.p[0] + here.dir[1] * side;
      const z = here.p[1] - here.dir[0] * side;
      if (speed) yaw = Math.atan2(here.dir[0] * w.dir, here.dir[1] * w.dir);
      w.witch.follow(dt, { x, z, yaw, speed, drawing: false });
    }
    // the range
    if (this.round) {
      this.round.left -= dt;
      this.badge.hidden = false;
      this.badge.textContent = `Spell range · ${Math.max(0, Math.ceil(this.round.left))}s · ${this.round.score} runes`;
      if (this.round.left <= 0) this.endRound();
    } else this.badge.hidden = true;
    for (const [i, t] of this.targets.entries()) {
      if (t.hidden > 0) {
        t.hidden -= dt;
        const k = Math.min(1, (1.6 - t.hidden) / 0.25);
        t.obj.scale.setScalar(Math.max(0.001, (1 - k) * 1.6));
        if (t.hidden <= 0) {
          t.base.copy(this.spotInRange(i));
          t.obj.scale.setScalar(1);
        }
      }
      const live = !!this.round;
      t.obj.position.set(t.base.x, t.base.y + Math.sin(this.time * 1.3 + i) * 0.15, t.base.z);
      t.obj.rotation.y = Math.PI / 4 + Math.sin(this.time * 0.8 + i) * 0.3;
      const glow = live ? 1.6 + Math.sin(this.time * 6 + i) * 0.3 : 0.55;
      ((t.obj.children[0] as Mesh).material as MeshBasicMaterial).color.set("#f2c14e").multiplyScalar(glow);
    }
    // the bell swings and settles
    if (this.bellSwing > 0) {
      this.bellSwing = Math.max(0, this.bellSwing - dt);
      this.world.city.bell.rotation.x = Math.sin(this.time * 4.2) * 0.45 * Math.min(1, this.bellSwing / 2);
    }
    // the bard plays now and then on the terrace in the evening
    this.luteTimer -= dt;
    if (this.luteTimer <= 0) {
      this.luteTimer = 6 + Math.random() * 8;
      const tv = this.world.plan.plazas.find((x) => x.id === "terrace")!;
      if (Math.hypot(tv.x - player.x, tv.z - player.z) < 9 && mood.glow > 0.2) sound.lute(6);
    }
  }
}

/** A point and direction `s` along a polyline. */
function pointAt(pts: Pt[], s: number): { p: Pt; dir: Pt } {
  let left = s;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!l) continue;
    const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    if (left <= l || i === pts.length - 2) {
      const k = Math.min(left, l);
      return { p: [a[0] + dir[0] * k, a[1] + dir[1] * k], dir };
    }
    left -= l;
  }
  return { p: pts[0], dir: [1, 0] };
}

