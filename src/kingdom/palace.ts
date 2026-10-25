import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PointLight,
  Scene,
  TorusGeometry,
  Vector3,
} from "three";
import { marketDay } from "../../shared/prices";
import { sound } from "../audio/sound";
import type { Token } from "../core/palette";
import type { Room } from "../game/cottage";
import type { Action } from "../game/interact";
import { Witch } from "../player/witch";
import { toon } from "../render/toon";
import type { Mood } from "../world/daycycle";
import { WalkMask } from "../world/walkmask";

/**
 * The hall's own frame: `u` runs from the door up to the throne (world -z, up and to the right on
 * screen), `r` across it (world x). The camera looks in from the door end and the +r side, so
 * those two walls are left out.
 */
const HALF_W = 6.6;
const U0 = -8.2;
const U1 = 10;
const WALL_H = 7.5;
/** the dais: three steps up to the throne, as [half width, from u, top] */
const STEPS: [number, number, number][] = [[4.6, 5.2, 0.25], [4.1, 5.8, 0.5], [3.6, 6.4, 0.75]];
const THRONE_U = 8.5;
const HEART_U = 1.6;
/** the queen's coins for a witch who comes to court, once a market day */
const STIPEND = 15;

const SAYINGS = [
  "The Heart of Aether remembers every glyph ever drawn in this city. Draw kindly.",
  "My grandmother sealed the first portal with a single circle of starlight ink.",
  "A witch who feeds the kingdom's kitchens feeds the kingdom. The steward speaks for me.",
  "The islands drift, but they never drift apart. That is what the portals are for.",
  "Ring the great bell when you are proud of something. The city likes to know.",
  "Even the crystal over my roof began as a seed. Tend yours.",
];

export interface PalaceHooks {
  exit(): void;
  read(): void;
  pop(text: string): void;
  toast(title: string, text: string): void;
  /** the queen's daily stipend */
  stipend(coins: number): void;
  /** touching the Heart: fill the ink bottle; returns false if it was full already */
  fillInk(): boolean;
  /** market day of the last audience and the last touch of the Heart */
  days: { audience?: number; heart?: number };
}

/**
 * Inside the Palace of Aether: a long throne hall seen in cutaway, marble and gold, the Heart of
 * Aether floating over its pedestal, and Queen Seraphine on her throne at the far end.
 */
export class PalaceHall implements Room {
  readonly scene = new Scene();
  readonly mask = new WalkMask();
  readonly entry = this.at(0, U0 + 2.6);
  /** facing up the hall, towards the throne */
  readonly entryYaw = Math.PI;
  readonly zoom = 0.78;
  private look = new Vector3();
  private hall = new Group();
  private flames: Mesh[] = [];
  private fires: PointLight[] = [];
  private heart = new Group();
  private rings: Mesh[] = [];
  private motes: Mesh[] = [];
  private panes: MeshBasicMaterial[] = [];
  private heartLight = new PointLight("#b48cff", 6, 16, 1.4);
  private sun = new DirectionalLight("#fff1d6", 1);
  private hemi = new HemisphereLight("#fff0dc", "#4a3a5a", 0.9);
  private queen!: Witch;
  private guards: { witch: Witch; at: Vector3; yaw: number }[] = [];
  private time = 0;
  private saying = 0;
  private spots: Record<"door" | "queen" | "heart" | "lecternL" | "lecternR" | "guardL" | "guardR", Vector3>;

  private constructor(private hooks: PalaceHooks) {
    this.scene.background = new Color("#1e1830");
    this.scene.add(this.hall, this.hemi, this.sun, this.heartLight);
    this.sun.position.set(-6, 14, -10);
    this.spots = {
      door: this.at(0, U0 + 0.6),
      queen: this.at(0, THRONE_U - 2.2, 0.75),
      heart: this.at(0, HEART_U - 1.2),
      lecternL: this.at(-5.2, -0.5),
      lecternR: this.at(5.2, -0.5),
      guardL: this.at(-1.9, U0 + 1.1),
      guardR: this.at(1.9, U0 + 1.1),
    };
  }

  static async create(hooks: PalaceHooks) {
    const p = new PalaceHall(hooks);
    await p.build();
    return p;
  }

  /** A point in the hall, in world space. */
  private at(r: number, u: number, y = 0) {
    return new Vector3(r, y, -u);
  }

  /** The floor's height: the dais steps up towards the throne. */
  ground = (x: number, z: number) => {
    const r = x;
    const u = -z;
    let y = 0;
    for (const [hw, from, top] of STEPS) if (Math.abs(r) < hw && u > from) y = top;
    return y;
  };

  focus(witch: Vector3) {
    return this.look.copy(this.at(-0.5, 2.6)).lerp(witch, 0.35).setY(0);
  }

  // ---------- building the hall ----------

  /** A box in the hall's frame: centred at (r, u), standing on `y`. */
  private box(m: Token | Material, r: number, u: number, y: number, w: number, h: number, d: number) {
    const mesh = new Mesh(new BoxGeometry(w, h, d), typeof m === "string" ? toon(m) : m);
    mesh.position.set(r, y + h / 2, -u);
    mesh.receiveShadow = true;
    this.hall.add(mesh);
    return mesh;
  }

  private put(o: Mesh | Group, r: number, u: number, y = 0) {
    o.position.set(r, y, -u);
    this.hall.add(o);
    return o;
  }

  private async build() {
    const glow = (c: string, k = 1) => new MeshBasicMaterial({ color: new Color(c).multiplyScalar(k) });

    // a checkered marble floor
    const tile = 1.3;
    const cols = Math.ceil((HALF_W * 2) / tile);
    const rows = Math.ceil((U1 - U0) / tile);
    const geo = new BoxGeometry(tile, 0.1, tile);
    const light = new InstancedMesh(geo, toon("marble"), cols * rows);
    const dark = new InstancedMesh(geo, toon("stone-dark"), cols * rows);
    let nl = 0;
    let nd = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const m = new Matrix4().makeTranslation(-HALF_W + (i + 0.5) * tile, -0.05, -(U0 + (j + 0.5) * tile));
        if ((i + j) % 2) light.setMatrixAt(nl++, m);
        else dark.setMatrixAt(nd++, m);
      }
    }
    light.count = nl;
    dark.count = nd;
    light.receiveShadow = dark.receiveShadow = true;
    this.hall.add(light, dark);

    // walls: the far wall and both sides, the near side left open for the camera
    this.box("stone", 0, U1 + 0.2, 0, HALF_W * 2 + 0.8, WALL_H, 0.4);
    for (const s of [-1]) {
      this.box("stone", s * (HALF_W + 0.2), (U0 + U1) / 2, 0, 0.4, WALL_H, U1 - U0 + 0.4);
      this.box("gold", s * (HALF_W - 0.02), (U0 + U1) / 2, WALL_H - 0.6, 0.12, 0.22, U1 - U0);
      this.box("stone-dark", s * (HALF_W - 0.02), (U0 + U1) / 2, 0, 0.14, 0.7, U1 - U0);
      // tall arched windows that show the sky outside, with banners between them
      for (const u of [-5.2, -0.6, 4]) {
        const pane = glow("#9fd4f5");
        this.panes.push(pane);
        this.box(pane, s * (HALF_W - 0.03), u, 2.2, 0.06, 3.4, 1.3);
        // a pointed top over each window
        this.box(pane, s * (HALF_W - 0.03), u, 5.25, 0.06, 0.92, 0.92).rotation.x = Math.PI / 4;
        this.box("gold", s * (HALF_W - 0.05), u, 2.1, 0.1, 0.12, 1.5);
        this.box(s < 0 ? "banner-red" : "banner-blue", s * (HALF_W - 0.06), u + 2.3, 2.4, 0.06, 3.6, 0.9);
        this.box("gold", s * (HALF_W - 0.08), u + 2.3, 5.95, 0.08, 0.12, 1.1);
      }
    }
    this.box("gold", 0, U1 - 0.02, WALL_H - 0.6, HALF_W * 2, 0.22, 0.12);
    // the open side: a low marble balustrade so the hall still has an edge
    this.box("marble", HALF_W + 0.1, (U0 + U1) / 2, 0, 0.3, 0.45, U1 - U0);
    this.box("gold", HALF_W + 0.1, (U0 + U1) / 2, 0.45, 0.36, 0.08, U1 - U0);

    // the rose window over the throne, stained in the kingdom's colours
    const rose = new Group();
    const glass = ["#8058a8", "#3e5fb8", "#f2c14e", "#c9434e"];
    for (let k = 0; k < 12; k++) {
      const wedge = new Mesh(new CircleGeometry(2.1, 3, (k / 12) * Math.PI * 2, (Math.PI * 2) / 12 - 0.03), glow(glass[k % 4], 1.15));
      rose.add(wedge);
    }
    const hub = new Mesh(new CircleGeometry(0.6, 16), glow("#ffe9a8", 1.6));
    hub.position.z = 0.01;
    const frame = new Mesh(new TorusGeometry(2.15, 0.14, 6, 32), toon("gold"));
    rose.add(hub, frame);
    this.put(rose, 0, U1 - 0.02, 5.1);
    for (const s of [-1, 1]) {
      this.box("banner-blue", s * 3.6, U1 - 0.05, 1.6, 1.3, 4.6, 0.06);
      this.box("gold", s * 3.6, U1 - 0.08, 6.2, 1.5, 0.14, 0.08);
      this.box("gold", s * 3.6, U1 - 0.08, 3.6, 0.5, 0.5, 0.06).rotation.z = Math.PI / 4;
    }

    // columns down the far side of the hall (the near side is open to the camera)
    for (const s of [-1]) {
      for (const u of [-5.6, -2, 1.6, 5.2]) {
        const col = new Mesh(new CylinderGeometry(0.36, 0.42, WALL_H - 1, 10), toon("marble"));
        col.castShadow = col.receiveShadow = true;
        this.put(col, s * 4.3, u, (WALL_H - 1) / 2 + 0.3);
        this.box("stone-dark", s * 4.3, u, 0, 1.05, 0.3, 1.05);
        this.box("gold", s * 4.3, u, WALL_H - 0.75, 1.05, 0.28, 1.05);
        const p = this.at(s * 4.3, u);
        this.mask.addSolid(p.x, p.z, 0.55);
      }
    }

    // the royal carpet up the middle, and the dais
    this.box("banner-red", 0, (U0 + STEPS[0][1]) / 2, 0, 2.2, 0.04, STEPS[0][1] - U0);
    for (const s of [-1, 1]) this.box("gold", s * 1.15, (U0 + STEPS[0][1]) / 2, 0, 0.12, 0.05, STEPS[0][1] - U0);
    for (const [hw, from, top] of STEPS) this.box("marble", 0, (from + U1) / 2, 0, hw * 2, top, U1 - from);
    this.box("banner-red", 0, (STEPS[2][1] + U1) / 2, 0.75, 2.2, 0.04, U1 - STEPS[2][1]);

    // the throne
    const t = THRONE_U;
    this.box("gold", 0, t, 0.75, 1.5, 0.5, 1.1);
    this.box("roof-plum", 0, t, 1.25, 1.3, 0.14, 0.95);
    this.box("roof-plum", 0, t + 0.5, 0.75, 1.7, 3.3, 0.3);
    this.box("gold", 0, t + 0.52, 4.05, 1.9, 0.2, 0.34);
    const crest = new Mesh(new ConeGeometry(0.55, 1.1, 4), toon("gold"));
    this.put(crest, 0, t + 0.5, 4.8);
    const jewel = new Mesh(new OctahedronGeometry(0.22), glow("#b48cff", 1.8));
    this.put(jewel, 0, t + 0.3, 3.4);
    for (const s of [-1, 1]) this.box("gold", s * 0.82, t, 0.75, 0.22, 0.95, 1.1);
    const tp = this.at(0, t);
    this.mask.addSolid(tp.x, tp.z, 1.1);

    // the Heart of Aether on its pedestal
    this.box("stone-dark", 0, HEART_U, 0, 2.2, 0.3, 2.2);
    const ped = new Mesh(new CylinderGeometry(0.55, 0.75, 1.1, 8), toon("marble"));
    this.put(ped, 0, HEART_U, 0.85);
    const rim = new Mesh(new TorusGeometry(0.6, 0.07, 6, 16), toon("gold"));
    rim.rotation.x = Math.PI / 2;
    this.put(rim, 0, HEART_U, 1.42);
    const core = new Mesh(new OctahedronGeometry(0.75), glow("#b48cff", 1.7));
    core.scale.set(1, 1.7, 1);
    const inner = new Mesh(new OctahedronGeometry(0.42), glow("#ffffff", 2.2));
    inner.scale.set(1, 1.7, 1);
    this.heart.add(core, inner);
    for (const [r, k] of [[1.35, 0], [1.75, 1], [2.2, 2]] as const) {
      const ring = new Mesh(new TorusGeometry(r, 0.035, 4, 48), glow("#ffd66e", 1.6));
      ring.rotation.set(Math.PI / 2 + k * 0.5, k * 0.7, 0);
      this.heart.add(ring);
      this.rings.push(ring);
    }
    this.put(this.heart, 0, HEART_U, 3.3);
    const hp = this.at(0, HEART_U);
    this.heartLight.position.copy(hp).setY(3.3);
    this.mask.addSolid(hp.x, hp.z, 1.15);
    const moteMat = glow("#e6d4ff", 1.8);
    for (let i = 0; i < 16; i++) {
      const m = new Mesh(new IcosahedronGeometry(0.05, 0), moteMat);
      m.userData.a = (i / 16) * Math.PI * 2;
      m.userData.r = 0.9 + (i % 4) * 0.35;
      m.userData.t = i / 16;
      this.motes.push(m);
      this.put(m, 0, HEART_U, 0);
    }

    // braziers along the carpet
    for (const [r, u] of [[-2.4, -4.4], [2.4, -4.4], [-2.4, 3.6], [2.4, 3.6]]) {
      const b = new Group();
      const stand = new Mesh(new CylinderGeometry(0.08, 0.16, 1.0, 6), toon("stone-dark"));
      stand.position.y = 0.5;
      const bowl = new Mesh(new CylinderGeometry(0.42, 0.24, 0.32, 8), toon("gold"));
      bowl.position.y = 1.12;
      b.add(stand, bowl);
      for (const [i, c] of ["#ff8a2a", "#ffb340", "#ffe070"].entries()) {
        const f = new Mesh(new ConeGeometry(0.26 - i * 0.06, 0.7 - i * 0.14, 7), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(2.2 + i * 0.4), transparent: true, opacity: 0.92 }));
        f.position.set((i - 1) * 0.08, 1.55 - i * 0.04, 0);
        b.add(f);
        this.flames.push(f);
      }
      this.put(b, r, u);
      const p = this.at(r, u);
      const fire = new PointLight("#ff9a4a", 2.4, 7, 1.6);
      fire.position.copy(p).setY(1.9);
      this.scene.add(fire);
      this.fires.push(fire);
      this.mask.addSolid(p.x, p.z, 0.4);
    }

    // lecterns with the royal grimoires
    for (const s of [-1, 1]) {
      const l = new Group();
      const post = new Mesh(new CylinderGeometry(0.1, 0.18, 1.0, 6), toon("wood-dark"));
      post.position.y = 0.5;
      const top = new Mesh(new BoxGeometry(0.8, 0.08, 0.6), toon("wood"));
      top.position.y = 1.05;
      top.rotation.x = -0.35;
      const book = new Mesh(new BoxGeometry(0.62, 0.08, 0.46), toon("roof-plum"));
      book.position.y = 1.12;
      book.rotation.x = -0.35;
      l.add(post, top, book);
      l.rotation.y = s * Math.PI / 2;
      this.put(l, s * 5.2, 0.4);
      const p = this.at(s * 5.2, 0.4);
      this.mask.addSolid(p.x, p.z, 0.4);
    }

    // the doorway behind the camera's side: a gold arch on the open edge
    for (const s of [-1, 1]) {
      const pillar = new Mesh(new CylinderGeometry(0.3, 0.34, 4.2, 8), toon("marble"));
      this.put(pillar, s * 1.6, U0 + 0.1, 2.1);
      const p = this.at(s * 1.6, U0 + 0.1);
      this.mask.addSolid(p.x, p.z, 0.4);
    }
    this.box("gold", 0, U0 + 0.1, 4.2, 3.8, 0.3, 0.4);

    // who's here: the queen on her throne, two guards at the door
    this.queen = await Witch.load("#8058a8", "crown");
    this.queen.position.copy(this.at(0, THRONE_U - 0.3, 0.75));
    this.queen.sitting = true;
    // a queen sits a head taller than her subjects
    this.queen.root.scale.setScalar(1.3);
    this.queen.root.rotation.y = 0;
    this.scene.add(this.queen.root);
    for (const s of [-1, 1]) {
      const g = await Witch.load("#3e5fb8", "tall");
      const at = this.at(s * 2.4, U0 + 0.9);
      g.position.copy(at);
      this.scene.add(g.root);
      this.guards.push({ witch: g, at, yaw: 0 });
      this.mask.addSolid(at.x, at.z, 0.35);
    }

    this.mask.addGround([[-HALF_W + 0.35, U0 + 0.2], [HALF_W - 0.35, U0 + 0.2], [HALF_W - 0.35, U1 - 0.4], [-HALF_W + 0.35, U1 - 0.4]].map(([r, u]) => [r, -u] as [number, number]));
    this.hall.traverse((o) => {
      if ((o as Mesh).isMesh && !((o as Mesh).material instanceof MeshBasicMaterial)) o.castShadow = true;
    });
  }

  // ---------- what can be done here ----------

  action = (near: Vector3): Action | null => {
    const sp = this.spots;
    const h = this.hooks;
    const today = marketDay();
    const opts: Action[] = [
      { pos: sp.door, reach: 1.6, label: "Leave the palace", act: () => h.exit() },
      { pos: sp.guardL, reach: 1.1, label: "Greet the royal guard", act: () => h.pop("“The queen receives all witches. Mind the steps.”") },
      { pos: sp.guardR, reach: 1.1, label: "Greet the royal guard", act: () => h.pop("“Touch the Heart if your ink runs dry. Once a day, mind.”") },
      { pos: sp.lecternL, reach: 1.4, label: "Read the royal grimoire", act: () => h.read() },
      { pos: sp.lecternR, reach: 1.4, label: "Read the royal grimoire", act: () => h.read() },
      h.days.heart === today
        ? { pos: sp.heart, reach: 2, label: "The Heart of Aether hums · it rests until tomorrow", act: null }
        : {
          pos: sp.heart, reach: 2, label: "Touch the Heart of Aether",
          act: () => {
            if (!h.fillInk()) return h.pop("Your ink is already full");
            h.days.heart = today;
            sound.chime();
            this.pulse = 1;
            h.toast("The Heart of Aether", "Starlight runs down your arm: your ink bottle is full.");
          },
        },
      h.days.audience === today
        ? { pos: sp.queen, reach: 1.8, label: "Speak with Queen Seraphine", act: () => this.speak() }
        : {
          pos: sp.queen, reach: 1.8, label: "Kneel before Queen Seraphine", priority: 1,
          act: () => {
            h.days.audience = today;
            h.stipend(STIPEND);
            sound.coins();
            h.toast("An audience with the queen", `“Welcome to my court, little witch. Take this for your journey.” (+${STIPEND} coins, once a day)`);
          },
        },
    ];
    let best: Action | null = null;
    const d = (p: Vector3) => Math.hypot(p.x - near.x, p.z - near.z);
    for (const o of opts) if (d(o.pos) <= o.reach && (!best || d(o.pos) < d(best.pos))) best = o;
    return best;
  };

  private pulse = 0;

  private speak() {
    this.hooks.toast("Queen Seraphine", `“${SAYINGS[this.saying++ % SAYINGS.length]}”`);
  }

  update(dt: number, mood: Mood) {
    this.time += dt;
    const t = this.time;
    this.flames.forEach((f, i) => {
      f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 9 + i * 2) * 0.22, 1 + Math.cos(t * 11 + i) * 0.12);
      f.rotation.y += dt * (1 + (i % 3));
    });
    this.fires.forEach((f, i) => (f.intensity = 2.2 + Math.sin(t * 17 + i) * 0.25 + Math.sin(t * 7.3 + i * 2) * 0.2));
    // the Heart bobs, its rings turn, motes drift up around it; a touch makes it flare
    this.pulse = Math.max(0, this.pulse - dt * 0.6);
    this.heart.position.y = 3.3 + Math.sin(t * 0.9) * 0.15;
    this.heart.children[0].rotation.y = t * 0.4;
    this.heart.children[1].rotation.y = -t * 0.7;
    this.heart.scale.setScalar(1 + this.pulse * 0.25);
    this.rings.forEach((r, i) => (r.rotation.z = t * (0.3 + i * 0.12) * (i % 2 ? -1 : 1)));
    this.heartLight.intensity = 5 + Math.sin(t * 1.3) * 0.8 + this.pulse * 10;
    for (const m of this.motes) {
      const k = (m.userData.t + t * 0.12) % 1;
      const a = m.userData.a + t * 0.4;
      m.position.set(Math.cos(a) * m.userData.r, 0.8 + k * 4.2, -HEART_U + Math.sin(a) * m.userData.r);
      m.scale.setScalar(Math.sin(k * Math.PI) * 1.4 + 0.01);
    }
    // the windows show the sky outside; the sun leans in through them
    for (const p of this.panes) p.color.copy(mood.skyBottom).lerp(mood.skyTop, 0.4).multiplyScalar(1.1);
    this.sun.color.copy(mood.sun);
    this.sun.intensity = mood.sunIntensity * 0.5;
    this.hemi.intensity = 0.55 + (1 - mood.glow) * 0.45;
    // the queen and her guards turn to whoever comes near
    const look = (w: Witch, at: Vector3, rest: number) => {
      const me = this.lastNear;
      const close = me && Math.hypot(me.x - at.x, me.z - at.z) < 4;
      w.follow(dt, { x: at.x, z: at.z, yaw: close ? Math.atan2(me.x - at.x, me.z - at.z) : rest, speed: 0, drawing: false });
    };
    look(this.queen, this.queen.position.clone(), 0);
    this.queen.position.y = 0.75;
    for (const g of this.guards) look(g.witch, g.at, g.yaw);
  }

  /** the witch's position this frame, for the court to turn towards */
  private lastNear: Vector3 | null = null;
  watch(witch: Vector3) {
    this.lastNear = witch;
  }
}
