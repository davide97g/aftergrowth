import { Camera, Mesh, MeshBasicMaterial, Object3D, Plane, Raycaster, RingGeometry, Vector2, Vector3 } from "three";
import type { IslandWorld } from "../world/world";
import { insidePoly } from "../world/walkmask";
import {
  type Category,
  type IslandLayout,
  KINDS,
  KIND_IDS,
  type Kind,
  type KindDef,
  type Placed,
  SIZE_MAX,
  SIZE_MIN,
  UNDERSIDES,
  type Underside,
  clampObjects,
  coast,
  footprint,
  newId,
} from "./layout";
import { PRICES, type Quote } from "./costs";
import { SHAPES, SHAPE_IDS, type ShapeId, clampInside, outline, radii } from "./shapes";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "trees", label: "Trees" },
  { id: "nature", label: "Nature" },
  { id: "garden", label: "Garden" },
  { id: "decor", label: "Decor" },
  { id: "home", label: "Buildings" },
];
const UNDERSIDE_NAMES: Record<Underside, string> = { rock: "Rocky spires", roots: "Hanging roots", crystal: "Crystals" };
const ROT_STEP = Math.PI / 12;

function shapeSvg(shape: ShapeId) {
  const pts = outline(radii(shape, 1, 3), 1 / 15).map(([x, z]) => `${(30 + x * 22).toFixed(1)},${(30 + z * 22).toFixed(1)}`).join(" ");
  return `<svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true"><polygon points="${pts}" fill="#a6d94a" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="rotate(45 30 30)"/></svg>`;
}

/**
 * Edit mode for your own island: reshape it, resize it, change what hangs below, and place, move,
 * turn, scale or remove objects. New things and new land cost coins (see costs.ts); "Done" pays,
 * saves and rebuilds.
 */
export class IslandEditor {
  private panel = document.getElementById("editor")!;
  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private selected: Placed | null = null;
  private drag: { offset: Vector3; pointer: number } | null = null;
  private ring: Mesh;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private tab: "island" | "place" = "island";
  private category: Category = "trees";
  readonly focus = new Vector3();
  active = false;
  onDone: (layout: IslandLayout) => void = () => {};
  /** what the edit so far costs, and the coins there are to pay for it */
  quote: () => Quote = () => ({ cost: 0, land: 0, shed: {} });
  coins: () => number = () => 0;
  onDiscard: () => void = () => {};

  constructor(private world: IslandWorld, private camera: Camera, private canvas: HTMLCanvasElement) {
    this.ring = new Mesh(new RingGeometry(0.95, 1.1, 40), new MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    world.overlay(this.ring);
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    addEventListener("pointermove", (e) => this.move(e));
    addEventListener("pointerup", (e) => this.up(e));
    addEventListener("keydown", (e) => this.key(e));
    this.panel.addEventListener("click", (e) => this.click(e));
    this.panel.addEventListener("input", (e) => this.input(e));
  }

  private get layout() {
    return this.world.layout;
  }

  open() {
    this.active = true;
    this.panel.hidden = false;
    document.body.classList.add("editing");
    this.render();
  }

  close() {
    this.active = false;
    this.panel.hidden = true;
    document.body.classList.remove("editing");
    this.select(null);
  }

  // ---------- picking and dragging ----------

  private groundAt(e: PointerEvent): Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = new Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit : null;
  }

  private pick(e: PointerEvent): Placed | null {
    this.groundAt(e);
    const hits = this.ray.intersectObjects([...this.world.objects.values()], true);
    for (const h of hits) {
      let o: Object3D | null = h.object;
      while (o && !o.userData.layoutId) o = o.parent;
      const id = o?.userData.layoutId as string | undefined;
      const p = id ? this.layout.objects.find((x) => x.id === id) : undefined;
      if (p) return p;
    }
    return null;
  }

  private down(e: PointerEvent) {
    if (!this.active || e.button !== 0) return;
    const p = this.pick(e);
    this.select(p);
    if (!p) return;
    const g = this.groundAt(e);
    if (!g) return;
    this.drag = { offset: new Vector3(p.x - g.x, 0, p.z - g.z), pointer: e.pointerId };
    this.canvas.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent) {
    if (!this.active || !this.drag || e.pointerId !== this.drag.pointer || !this.selected) return;
    const g = this.groundAt(e);
    if (!g) return;
    const p = this.selected;
    const margin = p.kind === "pond" || p.kind === "farm" ? 0.62 : 0.86;
    const [x, z] = clampInside(coast(this.layout), g.x + this.drag.offset.x, g.z + this.drag.offset.z, margin);
    // things can't sink into the pond (the pond itself can go anywhere)
    if (p.kind !== "pond" && this.world.pond && insidePoly(x, z, this.world.pond)) return;
    [p.x, p.z] = [x, z];
    this.world.syncObject(p);
    this.placeRing();
  }

  private up(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    const moved = this.selected;
    this.drag = null;
    if (moved) this.changed(moved.kind === "pond");
  }

  private key(e: KeyboardEvent) {
    if (!this.active || (e.target as HTMLElement).tagName === "INPUT") return;
    const p = this.selected;
    if (e.code === "Escape") return p ? this.select(null) : undefined;
    if (!p) return;
    if (e.code === "KeyQ") this.turn(-1);
    else if (e.code === "KeyE") this.turn(1);
    else if (e.code === "Minus") this.resize(-1);
    else if (e.code === "Equal") this.resize(1);
    else if (e.code === "Delete" || e.code === "Backspace") {
      e.preventDefault();
      this.remove();
    }
  }

  // ---------- object actions ----------

  private select(p: Placed | null) {
    this.selected = p;
    this.placeRing();
    if (this.active) this.renderSelection();
  }

  private placeRing() {
    const p = this.selected;
    this.ring.visible = !!p;
    if (!p) return;
    this.ring.position.set(p.x, 0.06, p.z);
    this.ring.scale.setScalar(Math.max(footprint(p) - 0.3, 0.5));
  }

  private turn(dir: number) {
    const p = this.selected;
    if (!p) return;
    p.rot += dir * ROT_STEP;
    this.world.syncObject(p);
    this.changed(p.kind === "pond" || p.kind === "farm");
  }

  private resize(dir: number) {
    const p = this.selected;
    if (!p) return;
    const def: KindDef = KINDS[p.kind];
    const [lo, hi] = def.essential ? [0.8, 1.4] : [0.5, 2.5];
    p.scale = Math.min(hi, Math.max(lo, Math.round((p.scale + dir * 0.1) * 10) / 10));
    this.world.syncObject(p);
    this.placeRing();
    this.changed(p.kind === "pond");
  }

  private remove() {
    const p = this.selected;
    if (!p || (KINDS[p.kind] as KindDef).essential) return;
    this.layout.objects.splice(this.layout.objects.indexOf(p), 1);
    this.world.removeObject(p.id);
    this.select(null);
    this.changed(false);
    this.render();
  }

  private async add(kind: Kind) {
    const [x, z] = clampInside(coast(this.layout), this.focus.x, this.focus.z, 0.8);
    const p: Placed = { id: newId(kind), kind, x, z, rot: Math.PI / 4, scale: 1 };
    this.layout.objects.push(p);
    await this.world.addObject(p);
    this.select(p);
    this.changed(false);
    this.render();
  }

  /** Rebuild what depends on the change, a moment after the last edit. */
  private changed(terrain: boolean) {
    this.world.refresh();
    this.renderBill();
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => void this.rebuild(terrain), 200);
  }

  private async rebuild(terrain: boolean) {
    if (this.busy) {
      this.pending = setTimeout(() => void this.rebuild(terrain), 200);
      return;
    }
    this.busy = true;
    try {
      if (terrain) {
        await this.world.rebuildTerrain();
        this.world.refresh();
      }
      await this.world.rebuildMeadow();
    } finally {
      this.busy = false;
    }
  }

  private async reshape(patch: Partial<Pick<IslandLayout, "shape" | "size" | "underside">>) {
    Object.assign(this.layout, patch);
    clampObjects(this.layout);
    for (const p of this.layout.objects) this.world.syncObject(p);
    this.placeRing();
    this.changed(true);
  }

  // ---------- panel ----------

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    const d = b.dataset;
    if (d.tab) {
      this.tab = d.tab as typeof this.tab;
      this.render();
    } else if (d.cat) {
      this.category = d.cat as Category;
      this.render();
    } else if (d.shape) {
      void this.reshape({ shape: d.shape as ShapeId });
      this.render();
    } else if (d.under) {
      void this.reshape({ underside: d.under as Underside });
      this.render();
    } else if (d.add) void this.add(d.add as Kind);
    else if (d.act === "meadow") {
      this.layout.meadow = Math.floor(Math.random() * 1e5);
      this.changed(false);
    } else if (d.act === "left") this.turn(-1);
    else if (d.act === "right") this.turn(1);
    else if (d.act === "smaller") this.resize(-1);
    else if (d.act === "bigger") this.resize(1);
    else if (d.act === "delete") this.remove();
    else if (d.act === "done" && this.quote().cost <= this.coins()) this.onDone(this.layout);
    else if (d.act === "discard") this.onDiscard();
  }

  private input(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id !== "edit-size") return;
    const size = Number(t.value);
    document.getElementById("edit-size-value")!.textContent = `${size.toFixed(2)}×`;
    void this.reshape({ size });
    this.renderBill();
  }

  private render() {
    const l = this.layout;
    const tabs = `<div class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="island" aria-selected="${this.tab === "island"}">Island</button>
      <button type="button" role="tab" data-tab="place" aria-selected="${this.tab === "place"}">Place</button>
    </div>`;
    let body: string;
    if (this.tab === "island") {
      body = `
        <h3>Shape</h3>
        <div class="shapes">${SHAPE_IDS.map((s) => `<button type="button" data-shape="${s}" aria-pressed="${l.shape === s}">${shapeSvg(s)}<span>${SHAPES[s].label}</span></button>`).join("")}</div>
        <h3><label for="edit-size">Size</label> <span id="edit-size-value">${l.size.toFixed(2)}×</span></h3>
        <input id="edit-size" type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="0.05" value="${l.size}">
        <h3>Underneath</h3>
        <div class="chips">${UNDERSIDES.map((u) => `<button type="button" data-under="${u}" aria-pressed="${l.underside === u}">${UNDERSIDE_NAMES[u]}</button>`).join("")}</div>
        <h3>Meadow</h3>
        <button type="button" class="wide" data-act="meadow">Sow a new meadow</button>`;
    } else {
      const kinds = KIND_IDS.filter((k) => {
        const d: KindDef = KINDS[k];
        return d.cat === this.category && !d.essential;
      });
      const shed = this.quote().shed;
      body = `
        <div class="chips">${CATEGORIES.map((c) => `<button type="button" data-cat="${c.id}" aria-pressed="${this.category === c.id}">${c.label}</button>`).join("")}</div>
        <div class="catalog">${kinds.map((k) => `<button type="button" data-add="${k}">${KINDS[k].label}<small>${shed[k] ? `${shed[k]} in shed` : `${PRICES[k]}c`}</small></button>`).join("")}</div>
        <p class="note">New things appear in the middle of the view. Drag them where you like. Removed things wait in your shed and come back free.</p>`;
    }
    this.panel.innerHTML = `
      <header><h2>Edit island</h2></header>
      ${tabs}
      <div class="body">${body}</div>
      <div id="edit-selection"></div>
      <p class="note">Drag to move · Q/E turn · −/+ size · Del remove · WASD pans the view. Moving and reshaping are free; a bigger island costs coins.</p>
      <div class="foot">
        <p id="edit-bill"></p>
        <div class="end"><button type="button" data-act="discard">Discard</button><button type="button" class="primary" data-act="done">Done</button></div>
      </div>`;
    this.renderSelection();
    this.renderBill();
  }

  /** The running total of the edit, and whether there are coins enough to keep it. */
  private renderBill() {
    const el = document.getElementById("edit-bill");
    if (!el) return;
    const { cost } = this.quote();
    const coins = this.coins();
    el.textContent = cost ? `Costs ${cost}c · you have ${coins}c` : `Free · you have ${coins}c`;
    el.classList.toggle("short", cost > coins);
    (this.panel.querySelector("[data-act=done]") as HTMLButtonElement).disabled = cost > coins;
  }

  private renderSelection() {
    const el = document.getElementById("edit-selection");
    if (!el) return;
    const p = this.selected;
    if (!p) {
      el.innerHTML = `<p class="hint">Click something on the island to select it.</p>`;
      return;
    }
    const def: KindDef = KINDS[p.kind];
    el.innerHTML = `<div class="sel">
      <strong>${def.label}</strong>
      <div class="chips">
        <button type="button" data-act="left" aria-label="Turn left">⟲</button>
        <button type="button" data-act="right" aria-label="Turn right">⟳</button>
        <button type="button" data-act="smaller" aria-label="Smaller">−</button>
        <button type="button" data-act="bigger" aria-label="Bigger">+</button>
        <button type="button" data-act="delete" ${def.essential ? "disabled title=\"This one stays\"" : ""}>Remove</button>
      </div></div>`;
  }
}
