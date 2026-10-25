import type { Vector3 } from "three";
import { type AtlasEntry, type FriendEntry, HUB_ID, KINGDOM_ID, MARKET_ID, type Outline, type Theme } from "../../shared/protocol";
import { PALETTE } from "../core/palette";
import { type IslandLayout, commonsLayout, marketLayout } from "../island/layout";
import { type ShapeId, SHAPE_IDS, outline, radii } from "../island/shapes";
import { type Me, signOut } from "../net/account";
import { COLORS, type Net, THEMES } from "../net/net";
import type { Social } from "../net/social";
import type { PlaceIcon, World } from "../world/world";
import type { Hud } from "./hud";

type Pt = [number, number];
type View = "world" | "here";

const NS = "http://www.w3.org/2000/svg";
const S = Math.SQRT1_2;
const W = 1000;
const H = 680;
const THEME_NAMES: Record<Theme, string> = { meadow: "Meadow", blossom: "Blossom", autumn: "Autumn", mint: "Mint" };
const THEME_GRASS: Record<Theme, string> = { meadow: "#A6D94A", blossom: "#F2B5D2", autumn: "#E8A050", mint: "#9EDFB2" };
/** where the shared islands sit on the world chart, and how big they are drawn */
const FIXED: Record<string, { at: Pt; r: number }> = {
  [KINGDOM_ID]: { at: [500, 270], r: 100 },
  [MARKET_ID]: { at: [810, 150], r: 60 },
  [HUB_ID]: { at: [190, 150], r: 54 },
};
const HOME_AT: Pt = [215, 470];
/** friends' islands fill these spots, then spill around a wider ring */
const FRIEND_SLOTS: Pt[] = [[790, 470], [560, 545], [900, 320], [80, 320], [380, 560], [680, 590], [940, 545], [330, 60], [665, 50], [70, 560]];
/** matches kingdomLayout() in kingdom/world.ts, without pulling the whole city plan into the map */
const KINGDOM_OUTLINE: Outline = { shape: "round", size: 3.1, seed: 7071 };

/** World x/z to the map's right/down, matching the camera's view. */
const project = (x: number, z: number): Pt => [(x - z) * S, (x + z) * S];
const unproject = (r: number, d: number): Pt => [(r + d) * S, (d - r) * S];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | string)[]) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

const path = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;

/** Small ink glyphs, drawn in a 24×24 box centred on 0,0. */
const GLYPHS: Record<PlaceIcon | "lock" | "hat", string> = {
  home: "M-8,1 L0,-7 L8,1 M-6,-1 V8 H6 V-1 M-2,8 V3 H2 V8",
  farm: "M-8,7 H8 M-6,7 C-6,1 -2,-1 -2,-5 M0,7 C0,0 3,-2 3,-7 M5,7 C5,3 7,1 7,-2",
  cauldron: "M-8,-3 H8 M-7,-3 C-7,6 7,6 7,-3 M-5,6 L-6,8 M5,6 L6,8 M-2,-6 C-2,-8 0,-8 0,-6 M2,-7 C2,-9 4,-9 4,-7",
  water: "M0,-8 C4,-2 6,1 6,3 A6,6 0 0 1 -6,3 C-6,1 -4,-2 0,-8Z",
  portal: "M0,-8 A6,8 0 1 1 -0.1,-8 M0,-4 A3,4 0 1 0 0.1,-4 M-8,8 H8",
  shop: "M-8,-2 L-6,-7 H6 L8,-2 Z M-6,-2 V8 H6 V-2 M-2,8 V3 H2 V8",
  tree: "M0,8 V1 M0,1 C-8,1 -8,-8 0,-8 C8,-8 8,1 0,1",
  fountain: "M-8,4 H8 L6,8 H-6 Z M0,4 V-3 M-5,-1 C-4,-6 4,-6 5,-1 M0,-3 C-1,-6 1,-8 0,-8",
  stall: "M-8,-4 H8 M-8,-4 L-6,-8 H6 L8,-4 M-7,-4 V8 M7,-4 V8 M-7,2 H7",
  tavern: "M-6,-5 H4 V7 H-6 Z M4,-2 H7 V4 H4 M-4,-8 C-3,-7 -1,-9 0,-8 C1,-7 3,-9 4,-8",
  castle: "M-9,8 V-2 H-6 V-5 H-3 V-2 H-1 V-8 H1 V-2 H3 V-5 H6 V-2 H9 V8 Z M-2,8 V3 A2,2 0 0 1 2,3 V8",
  tower: "M-4,8 V-3 H4 V8 Z M-6,-3 L0,-9 L6,-3 Z M-1,1 H1",
  gate: "M-9,8 V-6 H9 V8 M-5,8 V0 A5,5 0 0 1 5,0 V8 M-9,-6 V-8 M-4,-6 V-8 M4,-6 V-8 M9,-6 V-8",
  star: "M0,-9 L2.5,-3 L9,-3 L4,1 L6,8 L0,4 L-6,8 L-4,1 L-9,-3 L-2.5,-3 Z",
  lock: "M-5,-1 H5 V7 H-5 Z M-3,-1 V-4 A3,3 0 0 1 3,-4 V-1",
  hat: "M-9,5 C-4,3 4,3 9,5 C4,7 -4,7 -9,5 Z M-5,4 L1,-9 L5,4",
};

function glyph(icon: PlaceIcon | "lock" | "hat", x: number, y: number, size = 1, fill = "none") {
  return el("path", { d: GLYPHS[icon], transform: `translate(${x},${y}) scale(${size})`, fill, stroke: "var(--ink)", "stroke-width": 1.6 / size, "stroke-linejoin": "round", "stroke-linecap": "round" });
}

export interface MapDeps {
  net: Net;
  me: Me;
  social: Social;
  hud: Hud;
  world: World & { layout: IslandLayout };
  witch: { position: Vector3 };
  islandId: string;
  /** your own island's layout, so it is on the chart before the server has it */
  home: IslandLayout | null;
  /** leave for another island (null: home) */
  travel: (island: string | null) => void;
  /** blink to a spot on this island */
  teleport: (to: Vector3) => void;
  /** why the witch can't blink right now, or null */
  stuck: () => string | null;
}

/**
 * The map (Tab): the world chart of every island you can reach, this island's own chart with its
 * places, and the sidebar with your friends and yourself. Click a place to go there at once.
 */
export class WorldMap {
  private root = document.getElementById("map")!;
  private svg = document.getElementById("map-svg") as unknown as SVGSVGElement;
  private side = document.getElementById("map-side")!;
  private tip = document.getElementById("map-tip")!;
  private view: View = "here";
  private atlas: AtlasEntry[] | null = null;
  private friends: FriendEntry[] = [];
  private you: SVGGElement | null = null;
  private peerDots: SVGGElement | null = null;
  /** local chart: world units to map units */
  private fit = { k: 1, ox: 0, oy: 0 };

  constructor(private d: MapDeps) {
    d.net.on("friends", (m) => {
      this.friends = m.friends;
      if (m.note) d.hud.toast("Friends", m.note);
      this.badge();
      if (this.isOpen) {
        this.renderSide();
        if (this.view === "world") this.askAtlas();
      }
    });
    d.net.send({ t: "friends" });
    addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === "Tab" && tag !== "INPUT") {
        e.preventDefault();
        this.toggle();
      } else if (e.code === "Escape" && this.isOpen) this.close();
    });
    document.getElementById("btn-map")!.addEventListener("click", () => this.toggle());
    document.getElementById("map-close")!.addEventListener("click", () => this.close());
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("[data-view]")) b.addEventListener("click", () => this.show(b.dataset.view as View));
    this.side.addEventListener("click", (e) => this.onSide(e));
    this.side.addEventListener("submit", (e) => this.onSubmit(e));
    this.svg.addEventListener("pointermove", (e) => this.hover(e));
    this.svg.addEventListener("pointerleave", () => (this.tip.hidden = true));
    this.svg.addEventListener("click", (e) => this.onChart(e));
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(view: View = this.view) {
    this.root.hidden = false;
    document.body.classList.add("map-open");
    this.show(view);
    this.renderSide();
    this.d.net.send({ t: "friends" });
  }

  close() {
    this.root.hidden = true;
    this.tip.hidden = true;
    document.body.classList.remove("map-open");
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private show(view: View) {
    this.view = view;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("[data-view]")) b.setAttribute("aria-selected", String(b.dataset.view === view));
    if (view === "world") {
      this.drawWorld();
      this.askAtlas();
    } else this.drawHere();
  }

  private askAtlas() {
    if (!this.d.net.online) return;
    this.d.net.send({ t: "atlas" });
    void this.d.net.next("atlas", 3000).then((m) => {
      if (!m) return;
      this.atlas = m.islands;
      if (this.isOpen && this.view === "world") this.drawWorld();
    });
  }

  /** The count of friend requests waiting for you, on the map button. */
  private badge() {
    const n = this.friends.filter((f) => f.status === "incoming").length;
    const b = document.querySelector<HTMLElement>("#btn-map .badge")!;
    b.textContent = String(n);
    b.hidden = !n;
  }

  // ---------- the world chart ----------

  private drawWorld() {
    const svg = this.svg;
    svg.replaceChildren(this.defs());
    // drifting wind lines and a compass, for the feel of an old sky-chart
    for (let i = 0; i < 9; i++) {
      const y = 40 + i * 75;
      svg.append(el("path", { d: `M${-40 + (i % 3) * 30},${y} q120,-26 240,0 t240,0 t240,0 t240,0 t240,0`, fill: "none", stroke: "#2a223018", "stroke-width": 1.4, "stroke-dasharray": "2 9", "stroke-linecap": "round" }));
    }
    svg.append(this.compass(925, 610));

    const me = this.d.me;
    const reach = new Map((this.atlas ?? []).map((e) => [e.id, e]));
    type Isle = { id: string; name: string; at: Pt; r: number; outline: Outline; fill: string; icon: PlaceIcon; status: string; go: boolean; locked?: boolean };
    const isles: Isle[] = [];
    const shared = (id: string, name: string, o: Outline, fill: string, icon: PlaceIcon, blurb: string) => {
      const e = reach.get(id);
      isles.push({ id, name, ...FIXED[id], outline: o, fill, icon, status: `${blurb}${e ? ` · ${e.here} here now` : ""}`, go: true });
    };
    const l = (x: IslandLayout): Outline => ({ shape: x.shape, size: x.size, seed: x.seed });
    shared(KINGDOM_ID, "Aetherhold", KINGDOM_OUTLINE, "#c9b8f0", "castle", "The royal city, seat of magic");
    shared(MARKET_ID, "Lantern Market", l(marketLayout()), "#f7d98a", "shop", "Six shops, new prices daily");
    shared(HUB_ID, "Blossom Commons", l(commonsLayout()), THEME_GRASS.blossom, "tree", "Everyone's island meets here");
    const home = reach.get(me.id);
    const homeOutline = home?.outline ?? (this.d.home ? l(this.d.home) : { shape: "round", size: 1, seed: 1 });
    isles.push({ id: me.id, name: `${me.name} (home)`, at: HOME_AT, r: 44, outline: homeOutline, fill: THEME_GRASS[me.theme], icon: "home", status: "Your island", go: true });
    const friends = this.friends.filter((f) => f.status === "friend");
    friends.forEach((f, i) => {
      const slot = FRIEND_SLOTS[i % FRIEND_SLOTS.length];
      const ring = Math.floor(i / FRIEND_SLOTS.length);
      const at: Pt = [slot[0] + ring * 26, slot[1] - ring * 22];
      const e = reach.get(f.id);
      const status = !f.open ? `${f.name} hasn't opened their portal to you` : !e ? "Their island isn't ready yet" : e.online ? `Online${e.here ? ` · ${e.here} here` : ""}` : "Away";
      isles.push({ id: f.id, name: f.name, at, r: 38, outline: e?.outline ?? { shape: "round", size: 1, seed: f.id.length }, fill: THEME_GRASS[f.theme], icon: "home", status, go: !!e, locked: !f.open });
    });

    // sky routes from here to everywhere you can go
    const here = isles.find((i) => i.id === this.d.islandId);
    if (here) {
      for (const isle of isles) {
        if (isle === here || !isle.go) continue;
        const [x0, y0] = here.at;
        const [x1, y1] = isle.at;
        const mx = (x0 + x1) / 2 + (y1 - y0) * 0.18;
        const my = (y0 + y1) / 2 - (x1 - x0) * 0.18;
        svg.append(el("path", { d: `M${x0},${y0} Q${mx},${my} ${x1},${y1}`, fill: "none", stroke: "#b8892a", "stroke-width": 2, "stroke-dasharray": "1 8", "stroke-linecap": "round", class: "route" }));
      }
    }

    for (const isle of isles) {
      const g = el("g", { class: `isle${isle.go ? " go" : ""}${isle.locked ? " locked" : ""}${isle.id === this.d.islandId ? " here" : ""}`, "data-id": isle.id, "data-tip": `${isle.name}\n${isle.status}`, transform: `translate(${isle.at[0]},${isle.at[1]})` });
      if (isle.id === KINGDOM_ID) {
        g.append(el("circle", { r: isle.r * 1.45, fill: "url(#map-halo)" }));
        g.append(el("circle", { r: isle.r * 1.18, fill: "none", stroke: "#8a6ad8", "stroke-width": 1.5, "stroke-dasharray": "3 6 14 6", class: "runes" }));
      }
      g.append(...this.isleShape(isle.outline, isle.r, isle.fill));
      g.append(glyph(isle.icon, 0, -isle.r * 0.12, isle.id === KINGDOM_ID ? 2.6 : 1.4, "#fffaf0"));
      if (isle.locked) g.append(glyph("lock", isle.r * 0.55, -isle.r * 0.5, 1.1, "#fffaf0"));
      const label = el("text", { y: isle.r * 1.5 + 20, "text-anchor": "middle", class: "label" }, isle.name);
      g.append(label);
      if (isle.id === this.d.islandId) g.append(this.youAreHere(0, -isle.r - 22));
      svg.append(g);
    }
    if (!this.d.net.online) svg.append(el("text", { x: W / 2, y: H - 24, "text-anchor": "middle", class: "label quiet" }, "The portal is quiet: the island server is offline. You can still go home."));
    else if (!friends.length) svg.append(el("text", { x: W / 2, y: H - 24, "text-anchor": "middle", class: "label quiet" }, "Islands of friends appear here when they open their portal to you."));
  }

  /** A floating island seen from above: rock underside, grass top, ink edge. */
  private isleShape(o: Outline, r: number, fill: string): SVGElement[] {
    const shape = (SHAPE_IDS.includes(o.shape as ShapeId) ? o.shape : "round") as ShapeId;
    const rr = radii(shape, o.size, o.seed);
    const k = r / Math.max(...rr);
    const pts = outline(rr).map(([x, z]) => project(x * k, z * k));
    const xs = pts.map((p) => p[0]);
    const lo = Math.min(...xs) * 0.82;
    const hi = Math.max(...xs) * 0.82;
    const under = el("path", { d: `M${lo},0 Q${lo * 0.55},${r * 1.05} 0,${r * 1.5} Q${hi * 0.55},${r * 1.05} ${hi},0 Z`, fill: "#7D7590", stroke: "var(--ink)", "stroke-width": 1.6 });
    const shadow = el("path", { d: path(pts), fill: "#5E4D5C", transform: `translate(0,${r * 0.12})` });
    const top = el("path", { d: path(pts), fill, stroke: "var(--ink)", "stroke-width": 2, "stroke-linejoin": "round" });
    return [under, shadow, top];
  }

  private youAreHere(x: number, y: number) {
    const g = el("g", { transform: `translate(${x},${y})`, class: "you-here" });
    g.append(glyph("hat", 0, 0, 1.6, this.d.me.color));
    g.append(el("text", { x: 0, y: -18, "text-anchor": "middle", class: "label small" }, "you are here"));
    return g;
  }

  private compass(x: number, y: number) {
    const g = el("g", { transform: `translate(${x},${y})`, opacity: 0.55 });
    g.append(el("circle", { r: 34, fill: "none", stroke: "var(--ink)", "stroke-width": 1.2 }));
    g.append(el("path", { d: "M0,-44 L6,-6 L0,0 L-6,-6 Z M0,44 L6,6 L0,0 L-6,6 Z M-44,0 L-6,6 L0,0 L-6,-6 Z M44,0 L6,6 L0,0 L6,-6 Z", fill: "var(--ink)" }));
    g.append(el("text", { y: -50, "text-anchor": "middle", class: "label small" }, "N"));
    return g;
  }

  private defs() {
    const defs = el("defs");
    defs.innerHTML = `
      <radialGradient id="map-halo"><stop offset="0" stop-color="#b89cff" stop-opacity="0.55"/><stop offset="1" stop-color="#b89cff" stop-opacity="0"/></radialGradient>`;
    return defs;
  }

  // ---------- this island's chart ----------

  private drawHere() {
    const svg = this.svg;
    svg.replaceChildren(this.defs());
    const { ground, holes, solids, boxes } = this.d.world.mask.shapes();
    // fit every bit of ground into the chart
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of ground) for (const [x, z] of poly) {
      const [r, d] = project(x, z);
      x0 = Math.min(x0, r); x1 = Math.max(x1, r); y0 = Math.min(y0, d); y1 = Math.max(y1, d);
    }
    const k = Math.min((W - 120) / (x1 - x0), (H - 110) / (y1 - y0));
    this.fit = { k, ox: W / 2 - ((x0 + x1) / 2) * k, oy: H / 2 + 10 - ((y0 + y1) / 2) * k };
    const at = (x: number, z: number): Pt => {
      const [r, d] = project(x, z);
      return [r * this.fit.k + this.fit.ox, d * this.fit.k + this.fit.oy];
    };
    const land = el("g", { class: "land" });
    for (const poly of ground) land.append(el("path", { d: path(poly.map(([x, z]) => at(x, z))), transform: "translate(0,7)", fill: "#5E4D5C" }));
    for (const poly of ground) land.append(el("path", { d: path(poly.map(([x, z]) => at(x, z))), fill: PALETTE.grass, stroke: "var(--ink)", "stroke-width": 2, "stroke-linejoin": "round" }));
    // holes are ponds on a farm island and terrace cliffs in the kingdom; either stays on the ground
    const clip = el("clipPath", { id: "map-ground" });
    for (const poly of ground) clip.append(el("path", { d: path(poly.map(([x, z]) => at(x, z))) }));
    svg.querySelector("defs")!.append(clip);
    const cliffs = this.d.islandId === KINGDOM_ID;
    const holesG = el("g", { "clip-path": "url(#map-ground)" });
    for (const poly of holes) holesG.append(el("path", { d: path(poly.map(([x, z]) => at(x, z))), fill: cliffs ? "#a89a86" : PALETTE["water-light"], stroke: "var(--ink)", "stroke-width": cliffs ? 0.8 : 1.2 }));
    land.append(holesG);
    for (const c of solids) {
      const [x, y] = at(c.x, c.z);
      land.append(el("circle", { cx: x, cy: y, r: Math.max(c.r * k, 1.5), fill: c.r > 1.2 ? "#d9c7a0" : "#4E8F2E", stroke: "var(--ink)", "stroke-width": 0.8, opacity: c.r > 1.2 ? 1 : 0.55 }));
    }
    for (const b of boxes) {
      // the box's own axes back to the world (the inverse of WalkMask.blocked's turn)
      const corners: Pt[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const lx = u * b.hw;
        const lz = v * b.hd;
        return at(b.x + lx * b.c + lz * b.s, b.z - lx * b.s + lz * b.c);
      });
      land.append(el("path", { d: path(corners), fill: "#d9c7a0", stroke: "var(--ink)", "stroke-width": 0.8 }));
    }
    svg.append(land);
    const pins = el("g", { class: "pins" });
    for (const p of this.d.world.places) {
      const [x, y] = at(p.pos.x, p.pos.z);
      const g = el("g", { class: "pin go", "data-place": p.id, "data-tip": `${p.label}\nClick to go there`, transform: `translate(${x},${y})` });
      g.append(el("circle", { r: 15, fill: "#fffaf0", stroke: "var(--ink)", "stroke-width": 1.8 }));
      g.append(glyph(p.icon, 0, 0, 0.85, p.icon === "water" ? PALETTE["water-light"] : "none"));
      g.append(el("text", { y: 31, "text-anchor": "middle", class: "label small" }, p.label));
      pins.append(g);
    }
    svg.append(pins);
    this.peerDots = el("g", { class: "peers" });
    this.you = el("g", { class: "you" });
    this.you.append(el("circle", { r: 13, fill: "none", stroke: this.d.me.color, "stroke-width": 2.5, class: "ping" }));
    this.you.append(glyph("hat", 0, -2, 1.3, this.d.me.color));
    svg.append(this.peerDots, this.you);
    this.update();
  }

  /** Keep the witch (and anyone else here) moving on the open chart. */
  update() {
    if (!this.isOpen || this.view !== "here" || !this.you || !this.peerDots) return;
    const at = (v: Vector3): Pt => {
      const [r, d] = project(v.x, v.z);
      return [r * this.fit.k + this.fit.ox, d * this.fit.k + this.fit.oy];
    };
    const [x, y] = at(this.d.witch.position);
    this.you.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    const others = this.d.social.others().filter((o) => o.at);
    if (this.peerDots.childElementCount !== others.length) this.peerDots.replaceChildren(...others.map((o) => el("circle", { r: 6, fill: o.color, stroke: "var(--ink)", "stroke-width": 1.5, "data-tip": o.name })));
    others.forEach((o, i) => {
      const [px, py] = at(o.at!);
      const c = this.peerDots!.children[i];
      c.setAttribute("cx", px.toFixed(1));
      c.setAttribute("cy", py.toFixed(1));
    });
  }

  // ---------- clicks on the chart ----------

  private svgPoint(e: MouseEvent): Pt {
    const m = this.svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  }

  private hover(e: PointerEvent) {
    const t = (e.target as Element).closest("[data-tip]");
    if (!t) {
      this.tip.hidden = true;
      return;
    }
    const [name, ...rest] = t.getAttribute("data-tip")!.split("\n");
    this.tip.replaceChildren(h("strong", {}, name), ...rest.map((r) => h("span", {}, r)));
    this.tip.hidden = false;
    const box = this.root.querySelector(".map-chart")!.getBoundingClientRect();
    this.tip.style.left = `${e.clientX - box.left + 14}px`;
    this.tip.style.top = `${e.clientY - box.top + 14}px`;
  }

  private onChart(e: MouseEvent) {
    const t = e.target as Element;
    const isle = t.closest(".isle") as SVGGElement | null;
    if (isle) {
      const id = isle.dataset.id!;
      if (!isle.classList.contains("go")) return this.d.hud.toast("The way is closed", isle.dataset.tip!.split("\n")[1]);
      if (id === this.d.islandId) return this.show("here");
      this.close();
      return this.d.travel(id === this.d.me.id ? null : id);
    }
    if (this.view !== "here") return;
    const stuck = this.d.stuck();
    const pin = t.closest(".pin") as SVGGElement | null;
    const place = pin && this.d.world.places.find((p) => p.id === pin.dataset.place);
    if (place) {
      if (stuck) return this.d.hud.toast("Not right now", stuck);
      this.close();
      return this.d.teleport(place.pos.clone());
    }
    // anywhere on the ground: the nearest spot she can stand on
    const [mx, my] = this.svgPoint(e);
    const [x, z] = unproject((mx - this.fit.ox) / this.fit.k, (my - this.fit.oy) / this.fit.k);
    const spot = this.d.world.mask.nearestWalkable(x, z, 2.5);
    if (!spot) return;
    if (stuck) return this.d.hud.toast("Not right now", stuck);
    this.close();
    const to = this.d.witch.position.clone().set(spot[0], 0, spot[1]);
    this.d.teleport(to);
  }

  // ---------- friends and you ----------

  private renderSide() {
    const me = this.d.me;
    const friends = this.friends.filter((f) => f.status === "friend");
    const incoming = this.friends.filter((f) => f.status === "incoming");
    const outgoing = this.friends.filter((f) => f.status === "outgoing");
    const known = new Set(this.friends.map((f) => f.id));
    const strangers = this.d.social.others().filter((o) => !known.has(o.id));
    const dot = (color: string) => h("i", { class: "dot", style: `background:${color}` });
    const btn = (label: string, act: string, id: string, cls = "") => h("button", { type: "button", "data-act": act, "data-id": id, class: cls }, label);

    const sections: HTMLElement[] = [];
    if (incoming.length) {
      sections.push(h("section", {}, h("h3", {}, "Asking to be friends"), h("ul", { class: "people" }, ...incoming.map((f) => h("li", {}, dot(f.color), h("span", {}, h("strong", {}, f.name)), btn("Accept", "accept", f.id, "primary"), btn("Decline", "unfriend", f.id))))));
    }
    const friendRows = friends.map((f) => {
      const visit = f.open ? btn("Visit", "visit", f.id, "primary") : h("em", { class: "closed" }, "portal closed");
      const toggle = h("label", { class: "switch", title: "Let them step through your portal to your island" },
        h("input", { type: "checkbox", "data-act": "portal", "data-id": f.id, ...(f.mine ? { checked: "" } : {}) }), h("span", {}, "Let them visit"));
      return h("li", {}, dot(f.color), h("span", {}, h("strong", {}, f.name), h("em", {}, f.online ? "online" : "away")), visit, btn("×", "unfriend", f.id, "remove"), toggle);
    });
    sections.push(h("section", {}, h("h3", {}, "Friends"),
      friends.length ? h("ul", { class: "people friends" }, ...friendRows) : h("p", { class: "quiet" }, "Islands are private. Become friends, then each of you can open your portal to the other."),
      ...outgoing.map((f) => h("p", { class: "quiet pending" }, `Waiting for ${f.name}… `, btn("Cancel", "unfriend", f.id, "link"))),
      h("form", { class: "add", "data-form": "befriend" }, h("label", { for: "friend-code" }, "Add a friend by their code"), h("div", { class: "row" }, h("input", { id: "friend-code", maxlength: "8", autocomplete: "off", placeholder: "ABC123", spellcheck: "false" }), h("button", { type: "submit", class: "primary" }, "Ask"))),
      h("p", { class: "code" }, "Your friend code: ", h("b", {}, me.code), " ", btn("Copy", "copy", me.code, "link")),
    ));
    if (strangers.length) {
      sections.push(h("section", {}, h("h3", {}, "Witches on this island"), h("ul", { class: "people" }, ...strangers.map((o) => h("li", {}, dot(o.color), h("span", {}, h("strong", {}, o.name)), btn("Add friend", "befriend", o.id, "primary"))))));
    }
    const name = h("input", { id: "me-name", maxlength: "24", value: me.name, autocomplete: "off" });
    sections.push(h("section", {}, h("h3", {}, "You"),
      h("label", { for: "me-name" }, "Name"), name,
      h("div", { class: "row" }, h("span", {}, "Hat"), ...COLORS.map((c) => h("button", { type: "button", class: "swatch", "data-act": "color", "data-id": c, style: `background:${c}`, "aria-label": `Hat colour ${c}`, "aria-pressed": String(c === me.color) }))),
      h("div", { class: "row" }, h("span", {}, "Your island"), ...THEMES.map((t) => h("button", { type: "button", class: "chip", "data-act": "theme", "data-id": t, "aria-pressed": String(t === me.theme) }, THEME_NAMES[t]))),
      h("div", { class: "row end" }, btn("Sign out", "signout", "", "link")),
    ));
    this.side.replaceChildren(...sections);
    name.addEventListener("change", () => {
      const v = name.value.trim().slice(0, 24);
      if (v) this.d.social.updateMe({ name: v });
    });
  }

  private onSide(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!t) return;
    const id = t.dataset.id ?? "";
    const net = this.d.net;
    switch (t.dataset.act) {
      case "accept":
      case "befriend":
        return net.send({ t: "befriend", id });
      case "unfriend": {
        // removing a friend asks twice
        if (t.classList.contains("remove") && !t.dataset.armed) {
          t.dataset.armed = "1";
          t.textContent = "Remove?";
          return;
        }
        return net.send({ t: "unfriend", id });
      }
      case "portal":
        return net.send({ t: "portal", id, open: (t as HTMLInputElement).checked });
      case "visit":
        this.close();
        return this.d.travel(id);
      case "copy":
        void navigator.clipboard?.writeText(id).then(() => this.d.hud.pop("Friend code copied"), () => {});
        return;
      case "color":
        this.d.social.updateMe({ color: id });
        this.renderSide();
        return this.d.hud.toast("New hat colour", "Other witches see it now. Your own hat changes next time you travel.");
      case "theme":
        this.d.social.updateMe({ theme: id as Theme });
        if (this.d.islandId === this.d.me.id) return this.d.travel(null);
        return this.renderSide();
      case "signout":
        return void signOut();
    }
  }

  private onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const input = this.side.querySelector<HTMLInputElement>("#friend-code");
    const code = input?.value.trim() ?? "";
    if (!code) return;
    this.d.net.send({ t: "befriend", code });
    input!.value = "";
  }
}
