import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { loadGltf, prop } from "../core/assets";
import type { Room } from "../game/cottage";
import type { Action } from "../game/interact";
import { color } from "../core/palette";
import { applyToonTexture, toon, toonRamp } from "../render/toon";
import type { Mood } from "../world/daycycle";
import { screen } from "../island/layout";
import { type Pt, WalkMask } from "../world/walkmask";
import { MusicBox } from "./music";
import { type FamiliarRig, type FamiliarSave, animateRig, buildFamiliar, restPose } from "../world/familiar";

const R = 4.2;
const FACE = Math.PI / 4;

async function furniture(name: string) {
  const g = await loadGltf(`/assets/furniture/${name}.glb`);
  const o = g.scene.clone(true);
  applyToonTexture(o);
  return o;
}

export interface HouseHooks {
  sleep(): string | null;
  canSleep(): boolean;
  read(): void;
  exit(): void;
  sit(seat: Vector3, yaw: number): void;
  pop(text: string): void;
  /** your familiar sleeps on the rug */
  familiar(): FamiliarSave;
  onPet(): void;
}

/** Inside the egg cottage: a cutaway room to rest in. */
export class House implements Room {
  readonly scene = new Scene();
  readonly mask = new WalkMask();
  readonly entry: Vector3;
  readonly entryYaw = Math.PI + Math.PI / 4;
  readonly zoom = 1.2;
  private look = new Vector3();
  private fireLight = new PointLight("#ff9a4a", 2.2, 8, 1.6);
  private lampLight = new PointLight("#ffd28a", 1, 6, 1.8);
  private window = new DirectionalLight("#cfe4ff", 1);
  private hemi = new HemisphereLight("#ffe2c0", "#5a3f4f", 0.9);
  private flames: Mesh[] = [];
  private panes: MeshBasicMaterial[] = [];
  private cat!: Group;
  private pet3d!: FamiliarRig;
  private purr = 0;
  private music = new MusicBox();
  private time = 0;
  private spots: Record<string, { pos: Vector3; yaw?: number }> = {};

  private constructor(private hooks: HouseHooks) {
    this.entry = this.at(0, -2.6);
    this.scene.background = new Color("#2b2233");
  }

  private at(r: number, u: number, y = 0) {
    const [x, z] = screen(r, u);
    return new Vector3(x, y, z);
  }

  static async create(hooks: HouseHooks) {
    const h = new House(hooks);
    await h.build();
    return h;
  }

  private async build() {
    const s = this.scene;
    // floor, walls only on the far side so the camera looks in, and an egg-shaped ceiling behind
    const floor = new Mesh(new CylinderGeometry(R, R, 0.2, 32), toon("wood"));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    const rim = new Mesh(new TorusGeometry(R, 0.08, 6, 48), toon("wood-dark"));
    rim.rotation.x = Math.PI / 2;
    const back = { thetaStart: FACE + Math.PI / 2 + 0.15, thetaLength: Math.PI - 0.3 };
    // walls are seen from inside, so they get their own double-sided copies of the palette materials
    const inside = (token: "cream" | "wood-dark") => new MeshToonMaterial({ color: color(token), gradientMap: toonRamp(), side: DoubleSide });
    const wall = new Mesh(new CylinderGeometry(R, R, 3.2, 40, 1, true, back.thetaStart, back.thetaLength), inside("cream"));
    wall.position.y = 1.6;
    const wainscot = new Mesh(new CylinderGeometry(R - 0.02, R - 0.02, 0.9, 40, 1, true, back.thetaStart, back.thetaLength), inside("wood-dark"));
    wainscot.position.y = 0.45;
    // sphere angles start a quarter turn after cylinder angles
    const dome = new Mesh(new SphereGeometry(R, 32, 12, back.thetaStart + Math.PI / 2, back.thetaLength, 0, Math.PI / 2), wall.material);
    dome.scale.y = 0.55;
    dome.position.y = 3.2;
    s.add(floor, rim, wall, wainscot, dome);
    this.mask.addGround(Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return [Math.cos(a) * (R - 0.35), Math.sin(a) * (R - 0.35)] as Pt;
    }));

    // round windows: they show the sky outside
    for (const [r, u] of [[1.2, 3.85], [-0.4, 3.95]]) {
      const pos = this.at(r, u, 2.0);
      const pane = new MeshBasicMaterial({ color: "#9fd4f5" });
      this.panes.push(pane);
      const w = new Group();
      const glass = new Mesh(new CircleGeometry(0.42, 20), pane);
      const frame = new Mesh(new TorusGeometry(0.44, 0.06, 6, 20), toon("wood"));
      const bar1 = new Mesh(new BoxGeometry(0.86, 0.05, 0.04), toon("wood"));
      const bar2 = new Mesh(new BoxGeometry(0.05, 0.86, 0.04), toon("wood"));
      w.add(glass, frame, bar1, bar2);
      w.position.set(pos.x, 0, pos.z).setLength(R - 0.06).setY(2.0);
      w.lookAt(0, 2.0, 0);
      s.add(w);
    }

    // fireplace
    const fp = new Group();
    const stone = toon("rock");
    const base = new Mesh(new BoxGeometry(1.8, 0.25, 0.9), stone);
    base.position.y = 0.12;
    const left = new Mesh(new BoxGeometry(0.35, 1.3, 0.8), stone);
    left.position.set(-0.72, 0.85, 0);
    const right = left.clone();
    right.position.x = 0.72;
    const mantel = new Mesh(new BoxGeometry(1.9, 0.18, 0.95), toon("wood-dark"));
    mantel.position.y = 1.55;
    const hood = new Mesh(new BoxGeometry(1.2, 1.6, 0.6), stone);
    hood.position.set(0, 2.45, -0.12);
    const hole = new Mesh(new BoxGeometry(1.1, 1.05, 0.1), toon("ink"));
    hole.position.set(0, 0.75, -0.33);
    fp.add(base, left, right, mantel, hood, hole);
    for (const k of [-0.25, 0.25]) {
      const log = new Mesh(new CylinderGeometry(0.08, 0.09, 0.8, 6), toon("bark-dark"));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = k;
      log.position.set(0, 0.33, 0);
      fp.add(log);
    }
    for (const [i, c] of ["#ff8a2a", "#ffb340", "#ffe070"].entries()) {
      const f = new Mesh(new ConeGeometry(0.2 - i * 0.04, 0.6 - i * 0.12, 7), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(2.2 + i * 0.4), transparent: true, opacity: 0.92 }));
      f.position.set((i - 1) * 0.12, 0.62 - i * 0.04, 0);
      fp.add(f);
      this.flames.push(f);
    }
    fp.traverse((o) => (o.castShadow = o.receiveShadow = true));
    const fpPos = this.at(-1.9, 3.15);
    fp.position.copy(fpPos);
    fp.rotation.y = FACE;
    s.add(fp);
    this.fireLight.position.copy(fpPos).setY(0.9).add(new Vector3(0.4, 0, 0.4));
    s.add(this.fireLight);
    this.mask.addSolid(fpPos.x, fpPos.z, 0.95);
    this.spots.fire = { pos: fpPos };

    // furniture
    const put = async (name: string, r: number, u: number, yaw: number, solid = 0, y = 0, scale = 1) => {
      const o = await furniture(name);
      const p = this.at(r, u, y);
      o.position.copy(p);
      o.rotation.y = yaw;
      o.scale.setScalar(scale);
      s.add(o);
      if (solid) this.mask.addSolid(p.x, p.z, solid);
      return o;
    };
    await put("rug_oval_A", -0.2, 0.9, FACE + 0.3, 0, 0.01, 1.3);
    await put("bed_double_A", 2.4, 2.4, FACE, 1.1);
    await put("cabinet_small_decorated", 3.7, 2.7, FACE, 0.35);
    await put("lamp_table", 3.7, 2.7, FACE, 0, 0.62);
    await put("shelf_A_big", 0.5, 3.55, FACE, 0.5);
    await put("armchair_pillows", -1.3, 1.6, FACE + Math.PI * 0.8, 0.55);
    await put("table_small", -2.7, 0.8, FACE, 0.35);
    await put("lamp_standing", -3.1, 2.0, FACE, 0.25);
    await put("table_low", 0.4, 0.6, FACE + 0.2, 0.55);
    await put("book_set", 0.3, 0.6, FACE - 0.4, 0, 0.32);
    await put("pictureframe_standing_A", -1.9, 3.0, FACE, 0, 1.64, 0.8);
    await put("pictureframe_large_A", 2.4, 3.85, FACE, 0, 1.6);
    await put("chair_stool_wood", 1.5, 0.1, FACE, 0.3);
    await put("cactus_small_A", 0.5, 3.55, FACE, 0, 1.25);
    this.spots.bed = { pos: this.at(2.4, 2.4) };
    this.spots.chair = { pos: this.at(-1.3, 1.6), yaw: FACE + Math.PI * 0.8 };
    this.spots.shelf = { pos: this.at(0.5, 3.55) };
    const lampPos = this.at(-3.1, 2.0, 1.7);
    this.lampLight.position.copy(lampPos);
    s.add(this.lampLight);

    // a potted plant and a music box on the little table
    const pot = await prop("pot");
    pot.position.copy(this.at(3.4, 0.6));
    const bush = await prop("bush");
    bush.position.copy(this.at(3.4, 0.6, 0.18));
    s.add(pot, bush);
    const box = new Group();
    const body = new Mesh(new BoxGeometry(0.3, 0.18, 0.22), toon("wood"));
    const lid = new Mesh(new BoxGeometry(0.32, 0.04, 0.24), toon("brass"));
    lid.position.y = 0.11;
    const crank = new Mesh(new CylinderGeometry(0.015, 0.015, 0.14, 5), toon("brass"));
    crank.rotation.z = Math.PI / 2;
    crank.position.set(0.2, 0.02, 0);
    crank.name = "crank";
    box.add(body, lid, crank);
    box.position.copy(this.at(-2.7, 0.8, 0.68));
    box.rotation.y = FACE;
    s.add(box);
    this.spots.music = { pos: this.at(-2.7, 0.8) };

    this.cat = this.makeCat();
    this.cat.position.copy(this.at(-0.9, 0.35));
    this.cat.rotation.y = 1.2;
    s.add(this.cat);
    this.spots.cat = { pos: this.cat.position };

    // a doormat at the open front edge
    const mat = new Mesh(new CylinderGeometry(0.55, 0.55, 0.03, 16), toon("bunny-pink"));
    mat.scale.z = 0.6;
    mat.position.copy(this.at(0, -3.3, 0.02));
    mat.rotation.y = FACE;
    s.add(mat);
    this.spots.door = { pos: this.at(0, -3.3) };

    this.window.position.set(-6, 9, -6);
    this.window.castShadow = true;
    this.window.shadow.mapSize.set(1024, 1024);
    const cam = this.window.shadow.camera;
    cam.left = cam.bottom = -6;
    cam.right = cam.top = 6;
    this.window.shadow.bias = -0.0005;
    s.add(this.window, this.hemi);
    s.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && !m.castShadow) m.receiveShadow = true;
    });
  }

  /** A new familiar takes the old one's place on the rug. */
  refreshPet() {
    const old = this.cat;
    this.cat = this.makeCat();
    this.cat.position.copy(old.position);
    this.cat.rotation.y = old.rotation.y;
    old.removeFromParent();
    this.scene.add(this.cat);
    this.spots.cat = { pos: this.cat.position };
  }

  /** Your familiar, curled up asleep on the rug. */
  private makeCat() {
    const rig = buildFamiliar(this.hooks.familiar().kind);
    animateRig(rig, { ...restPose(), lie: 1, sleepy: 1 }, 0, 0, 0);
    rig.root.scale.setScalar(1.3);
    this.pet3d = rig;
    return rig.root;
  }

  /** The camera stays on the room and only leans towards the witch. */
  focus(witch: Vector3) {
    return this.look.set(0, 0, 0).lerp(witch, 0.3);
  }

  /** Interaction provider for everything inside. */
  action = (near: Vector3): Action | null => {
    const sp = this.spots;
    const d = (p: Vector3) => Math.hypot(p.x - near.x, p.z - near.z);
    const opts: Action[] = [
      { pos: sp.door.pos, reach: 1.3, label: "Step outside", act: () => this.hooks.exit() },
      { pos: sp.cat.pos, reach: 1.2, label: `Pet ${this.hooks.familiar().name}`, act: () => this.pet() },
      { pos: sp.chair.pos, reach: 1.3, label: "Sit by the fire", act: () => this.hooks.sit(sp.chair.pos, sp.chair.yaw!) },
      { pos: sp.shelf.pos, reach: 1.5, label: "Read the grimoire", act: () => this.hooks.read() },
      {
        pos: sp.music.pos, reach: 1.3, label: this.music.playing ? "Close the music box" : "Wind the music box",
        act: () => this.hooks.pop(this.music.toggle() ? "♪ the music box plays" : "The music box rests"),
      },
      this.hooks.canSleep()
        ? { pos: sp.bed.pos, reach: 1.7, label: "Sleep until morning", act: () => { const msg = this.hooks.sleep(); if (msg) this.hooks.pop(msg); } }
        : { pos: sp.bed.pos, reach: 1.7, label: "Bed · you can sleep after 18:00", act: null },
    ];
    let best: Action | null = null;
    for (const o of opts) if (d(o.pos) <= o.reach && (!best || d(o.pos) < d(best.pos))) best = o;
    return best;
  };

  private pet() {
    this.purr = 2.5;
    this.hooks.onPet();
    this.hooks.pop(this.pet3d.kind === "frog" ? "ribbit!" : this.pet3d.kind === "fox" ? "a happy yip" : "prrrr…");
  }

  update(dt: number, mood: Mood) {
    this.time += dt;
    const t = this.time;
    this.flames.forEach((f, i) => {
      f.scale.set(1 + Math.sin(t * 13 + i) * 0.12, 1 + Math.sin(t * 9 + i * 2) * 0.22, 1 + Math.cos(t * 11 + i) * 0.12);
      f.rotation.y += dt * (1 + i);
    });
    this.fireLight.intensity = 2.2 + Math.sin(t * 17) * 0.25 + Math.sin(t * 7.3) * 0.2;
    this.lampLight.intensity = 0.4 + mood.glow * 1.1;
    for (const p of this.panes) p.color.copy(mood.skyBottom).lerp(mood.skyTop, 0.4).multiplyScalar(1.1);
    this.window.color.copy(mood.sun);
    this.window.intensity = mood.sunIntensity * 0.45;
    this.hemi.intensity = 0.6 + (1 - mood.glow) * 0.5;
    // your familiar breathes in its sleep, and lifts its head while purring
    this.purr = Math.max(0, this.purr - dt);
    const awake = Math.min(this.purr, 1);
    animateRig(this.pet3d, { ...restPose(), lie: 1 - awake * 0.6, sleepy: 1 - awake, purr: awake }, t, 0, 0);
    const crank = this.scene.getObjectByName("crank");
    if (crank && this.music.playing) crank.rotation.x += dt * 3;
  }
}

