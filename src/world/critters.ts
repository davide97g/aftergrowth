import { Box3, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshToonMaterial, Object3D, Scene, SphereGeometry, Vector3 } from "three";
import type { Season } from "../../shared/seasons";
import { KINDS } from "../island/layout";
import { toonRamp } from "../render/toon";
import { insidePoly } from "./walkmask";
import type { IslandWorld } from "./world";

/** Every creature the field journal knows. */
export type CritterId =
  | "butterfly_pink" | "butterfly_yellow" | "butterfly_blue" | "butterfly_white"
  | "bunny" | "bluebird" | "sparrow" | "robin" | "bee" | "firefly"
  | "frog" | "moth" | "snail" | "ladybird" | "dragonfly" | "owl";

/** One creature seen right now, somewhere on the island. */
export interface Sighting { id: CritterId; pos: Vector3 }

/** What the critters need to know about the moment. */
export interface Outdoors {
  /** 0 day … 1 night */
  night: number;
  rain: number;
  /** how wet the ground is, 0..1 */
  wet: number;
  player: Vector3;
}

const mat = (c: string, side = false) => new MeshToonMaterial({ color: c, gradientMap: toonRamp(), ...(side ? { side: DoubleSide } : {}) });
const ball = (r: number, m: MeshToonMaterial, sx = 1, sy = 1, sz = 1) => {
  const mesh = new Mesh(new SphereGeometry(r, 10, 7), m);
  mesh.scale.set(sx, sy, sz);
  return mesh;
};
const wing = (m: MeshToonMaterial, w: number, l: number) => {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), m);
  mesh.scale.set(w, 0.01, l);
  return mesh;
};

interface Critter {
  id: CritterId;
  obj: Object3D;
  /** where to look for it (on the ground under a flying one, for prompts) */
  update(dt: number, t: number, env: Outdoors): void;
}

/**
 * The quieter creatures, each with its own time and place: a frog on a lily pad at night or in the
 * rain, a moon moth circling a light after dark, snails after rain, a ladybird on a flower in spring
 * and summer, a dragonfly over the pond on warm days, an owl in a treetop at night.
 */
export class Critters {
  private list: Critter[] = [];
  private time = 0;

  constructor(scene: Scene, world: IslandWorld, season: Season | null) {
    const warm = season !== "winter";
    const pond = world.pond;
    const pondCentre = pond ? pond.reduce((a, [x, z]) => a.add(new Vector3(x / pond.length, 0, z / pond.length)), new Vector3()) : null;
    const inPond = (x: number, z: number) => !!pond && insidePoly(x, z, pond);

    // ---------- the pond frog, on its own lily pad ----------
    if (pond && pondCentre && warm) {
      const g = new Group();
      const pad = new Mesh(new CylinderGeometry(0.3, 0.3, 0.02, 12, 1, false, 0.4, Math.PI * 2 - 0.5), mat("#5DA84A"));
      const frog = new Group();
      const skin = mat("#7DB65A");
      const body = ball(0.11, skin, 1.1, 0.75, 1);
      body.position.y = 0.07;
      const throat = ball(0.06, mat("#F4E8C8"), 1, 0.8, 1);
      throat.position.set(0, 0.04, 0.08);
      frog.add(body, throat);
      for (const s of [1, -1]) {
        const eye = ball(0.035, skin);
        eye.position.set(0.05 * s, 0.14, 0.05);
        const pupil = ball(0.018, mat("#2A2230"));
        pupil.position.set(0.05 * s, 0.155, 0.075);
        const leg = ball(0.04, skin, 1, 0.6, 1.6);
        leg.position.set(0.1 * s, 0.03, -0.03);
        frog.add(eye, pupil, leg);
      }
      frog.scale.setScalar(1.5);
      g.add(pad, frog);
      const spot = (() => {
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const x = pondCentre.x + Math.cos(a) * (0.6 + Math.random());
          const z = pondCentre.z + Math.sin(a) * (0.6 + Math.random());
          if (inPond(x, z)) return new Vector3(x, 0.05, z);
        }
        return pondCentre.clone().setY(0.05);
      })();
      g.position.copy(spot);
      g.visible = false;
      scene.add(g);
      let hidden = 0;
      this.list.push({
        id: "frog", obj: g,
        update: (dt, t, env) => {
          const out = env.night > 0.5 || env.rain > 0.4;
          // splash! it dives when you come close, and comes back up a while later
          if (hidden <= 0 && env.player.distanceTo(g.position) < 1.0) hidden = 8;
          hidden = Math.max(0, hidden - dt);
          frog.visible = hidden <= 0;
          g.visible = out;
          throat.scale.setScalar(1 + Math.max(0, Math.sin(t * 2.3)) ** 8 * 0.9);
          frog.rotation.y = Math.atan2(env.player.x - g.position.x, env.player.z - g.position.z) * 0.3 + 0.5;
        },
      });
    }

    // ---------- the moon moth, circling a light after dark ----------
    const lights: Vector3[] = [];
    for (const o of world.layout.objects) {
      if (o.kind === "lamp_post") lights.push(new Vector3(o.x, 1.9, o.z));
      if (o.kind === "lantern" || o.kind === "crystal_lamp" || o.kind === "solar_leaf") lights.push(new Vector3(o.x, 0.9, o.z));
    }
    if (world.door) lights.push(world.door.clone().setY(1.5));
    if (lights.length && warm) {
      const moth = new Group();
      const wingMat = mat("#BFE8C4", true);
      const body = ball(0.03, mat("#F4EAD0"), 1, 1, 2.2);
      const wings = [1, -1].map((s) => {
        const w = new Group();
        const fore = wing(wingMat, 0.12, 0.08);
        fore.position.set(0.1 * s, 0, 0.03);
        const spot = ball(0.02, mat("#E8A85A"), 1, 0.2, 1);
        spot.position.set(0.11 * s, 0.006, 0.03);
        w.add(fore, spot);
        moth.add(w);
        return w;
      });
      moth.add(body);
      moth.visible = false;
      scene.add(moth);
      const light = lights[Math.floor(Math.random() * lights.length)];
      const ground = world.ground(light.x, light.z);
      this.list.push({
        id: "moth", obj: moth,
        update: (_dt, t, env) => {
          moth.visible = env.night > 0.6 && env.rain < 0.4;
          if (!moth.visible) return;
          // a lazy figure of eight round the light
          moth.position.set(light.x + Math.sin(t * 1.1) * 0.6, ground + light.y + Math.sin(t * 2.2) * 0.25, light.z + Math.sin(t * 2.2) * 0.35);
          moth.rotation.y = Math.atan2(Math.cos(t * 1.1) * 0.66, Math.cos(t * 2.2) * 0.77);
          const flap = 0.2 + Math.abs(Math.sin(t * 14)) * 0.9;
          wings[0].rotation.z = flap;
          wings[1].rotation.z = -flap;
        },
      });
    }

    // ---------- snails, out after rain ----------
    const flowers = world.flowers;
    if (flowers.length && warm) {
      for (let i = 0; i < 2; i++) {
        const snail = new Group();
        const foot = ball(0.035, mat("#D8C3A0"), 1, 0.6, 3);
        foot.position.y = 0.02;
        const shell = ball(0.06, mat("#B9814F"), 0.8, 1, 1);
        shell.position.set(0, 0.075, -0.02);
        const swirl = ball(0.035, mat("#8C5A34"), 0.85, 1, 1);
        swirl.position.set(0.035, 0.08, -0.02);
        snail.add(foot, shell, swirl);
        for (const s of [1, -1]) {
          const horn = new Mesh(new CylinderGeometry(0.006, 0.006, 0.06, 4), mat("#D8C3A0"));
          horn.position.set(0.012 * s, 0.06, 0.09);
          horn.rotation.x = 0.5;
          snail.add(horn);
        }
        const f = flowers[(i * 7 + 3) % flowers.length];
        const home = new Vector3(f.x + 0.4, 0, f.z + 0.3);
        snail.position.copy(home).setY(world.ground(home.x, home.z));
        snail.visible = false;
        scene.add(snail);
        let heading = Math.random() * Math.PI * 2;
        this.list.push({
          id: "snail", obj: snail,
          update: (dt, t, env) => {
            snail.visible = env.wet > 0.25 && env.night < 0.7;
            if (!snail.visible) return;
            // creeps along, turning back towards home when it strays
            heading += Math.sin(t * 0.3 + i) * dt * 0.4;
            if (snail.position.distanceTo(home) > 1.2) heading = Math.atan2(home.x - snail.position.x, home.z - snail.position.z);
            const x = snail.position.x + Math.sin(heading) * dt * 0.06;
            const z = snail.position.z + Math.cos(heading) * dt * 0.06;
            if (world.mask.walkable(x, z, 0.05)) snail.position.set(x, world.ground(x, z), z);
            else heading += 1;
            snail.rotation.y = heading;
            foot.scale.z = 3 + Math.sin(t * 3) * 0.3;
          },
        });
      }
    }

    // ---------- a ladybird on a flower, spring and summer ----------
    if (flowers.length && (season === "spring" || season === "summer" || season === null)) {
      const bug = new Group();
      const shell = ball(0.03, mat("#D8433E"), 1, 0.7, 1.2);
      const head = ball(0.016, mat("#2A2230"));
      head.position.z = 0.032;
      bug.add(shell, head);
      for (const [x, z] of [[0.013, 0.01], [-0.013, 0.01], [0.012, -0.015], [-0.012, -0.015]]) {
        const dot = ball(0.006, mat("#2A2230"));
        dot.position.set(x, 0.02, z);
        bug.add(dot);
      }
      bug.scale.setScalar(1.6);
      const f = flowers[Math.floor(flowers.length / 2)];
      bug.visible = false;
      scene.add(bug);
      this.list.push({
        id: "ladybird", obj: bug,
        update: (_dt, t, env) => {
          bug.visible = env.night < 0.4 && env.rain < 0.3;
          // a slow walk round the rim of the petals
          bug.position.set(f.x + Math.cos(t * 0.5) * 0.07, f.y + 0.34, f.z + Math.sin(t * 0.5) * 0.07);
          bug.rotation.y = -t * 0.5;
        },
      });
    }

    // ---------- a dragonfly over the pond on warm days ----------
    if (pond && pondCentre && (season === "spring" || season === "summer" || season === null)) {
      const fly = new Group();
      const body = new Mesh(new CylinderGeometry(0.012, 0.008, 0.26, 5), mat("#3A9AD8"));
      body.rotation.x = Math.PI / 2;
      const head = ball(0.025, mat("#2E8C8C"));
      head.position.z = 0.14;
      fly.add(body, head);
      const wm = new MeshToonMaterial({ color: "#E8F6FF", gradientMap: toonRamp(), transparent: true, opacity: 0.6, side: DoubleSide });
      const wings = [0.05, -0.0].flatMap((z) => [1, -1].map((s) => {
        const w = wing(wm, 0.13, 0.025);
        w.position.set(0.12 * s, 0.01, z);
        fly.add(w);
        return w;
      }));
      fly.visible = false;
      scene.add(fly);
      const to = pondCentre.clone();
      let wait = 0;
      this.list.push({
        id: "dragonfly", obj: fly,
        update: (dt, t, env) => {
          fly.visible = env.night < 0.3 && env.rain < 0.3;
          if (!fly.visible) return;
          // darts from point to point over the water, hovering in between
          wait -= dt;
          if (wait <= 0) {
            wait = 0.8 + Math.random() * 1.6;
            for (let i = 0; i < 10; i++) {
              const x = pondCentre.x + (Math.random() - 0.5) * 4;
              const z = pondCentre.z + (Math.random() - 0.5) * 4;
              if (inPond(x, z)) {
                to.set(x, 0.45 + Math.random() * 0.4, z);
                break;
              }
            }
          }
          const d = to.clone().sub(fly.position);
          if (d.lengthSq() > 1e-4) fly.rotation.y = Math.atan2(d.x, d.z);
          fly.position.addScaledVector(d, 1 - Math.exp(-dt * 6));
          fly.position.y += Math.sin(t * 9) * 0.004;
          wings.forEach((w, i) => (w.rotation.z = Math.sin(t * 60 + i) * 0.4));
        },
      });
      fly.position.copy(pondCentre).setY(0.6);
    }

    // ---------- the owl, in a treetop at night ----------
    const trees = world.layout.objects.filter((o) => KINDS[o.kind]?.cat === "trees");
    if (trees.length) {
      const t0 = trees[Math.floor(trees.length / 3)];
      const treeObj = world.objects.get(t0.id);
      if (treeObj) {
        const box = new Box3().setFromObject(treeObj);
        const owl = new Group();
        const feathers = mat("#B98A5E");
        const body = ball(0.15, feathers, 1, 1.2, 0.9);
        const face = ball(0.11, mat("#F4E6CB"), 1, 0.9, 0.5);
        face.position.set(0, 0.06, 0.09);
        const head = new Group();
        head.add(face);
        for (const s of [1, -1]) {
          const eye = ball(0.03, mat("#2A2230"));
          eye.position.set(0.045 * s, 0.08, 0.13);
          eye.name = "eye";
          const tuft = new Mesh(new ConeGeometry(0.03, 0.08, 4), feathers);
          tuft.position.set(0.08 * s, 0.17, 0.02);
          head.add(eye, tuft);
        }
        const beak = new Mesh(new ConeGeometry(0.018, 0.05, 4), mat("#E8A85A"));
        beak.rotation.x = Math.PI / 2 + 0.6;
        beak.position.set(0, 0.03, 0.15);
        head.add(beak);
        owl.add(body, head);
        owl.position.set((box.min.x + box.max.x) / 2, box.max.y - 0.05, (box.min.z + box.max.z) / 2);
        owl.visible = false;
        owl.traverse((o) => (o.castShadow = true));
        scene.add(owl);
        const eyes = head.children.filter((c) => c.name === "eye");
        this.list.push({
          id: "owl", obj: owl,
          update: (_dt, t, env) => {
            owl.visible = env.night > 0.65 && env.rain < 0.5;
            if (!owl.visible) return;
            // the head turns to follow you; a slow blink
            const look = Math.atan2(env.player.x - owl.position.x, env.player.z - owl.position.z);
            head.rotation.y += (look - head.rotation.y) * 0.05;
            for (const e of eyes) e.scale.y = (t % 5) < 0.2 ? 0.15 : 1;
          },
        });
      }
    }
  }

  update(dt: number, env: Outdoors) {
    this.time += dt;
    for (const c of this.list) c.update(dt, this.time, env);
  }

  /** The critters out and about right now. */
  sightings(): Sighting[] {
    const out: Sighting[] = [];
    for (const c of this.list) {
      if (!c.obj.visible) continue;
      // the frog is out of sight while it hides underwater
      if (c.id === "frog" && !c.obj.children[1].visible) continue;
      out.push({ id: c.id, pos: c.obj.position });
    }
    return out;
  }
}
