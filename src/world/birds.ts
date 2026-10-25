import { BufferAttribute, BufferGeometry, ConeGeometry, DoubleSide, Group, Mesh, MeshToonMaterial, Scene, SphereGeometry, Vector3 } from "three";
import { toonRamp } from "../render/toon";
import type { IslandWorld as World } from "./world";

interface Bird { root: Group; wings: Mesh[]; head: Mesh }

/** birds keep this far from a scarecrow */
const SCARE_RADIUS = 4.5;

const wingGeo = (() => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0.07, 0.32, 0.02, -0.02, 0, 0, -0.1]), 3));
  g.computeVertexNormals();
  return g;
})();

function makeBird(body: string, belly: string): Bird {
  const mat = (c: string) => new MeshToonMaterial({ color: c, gradientMap: toonRamp() });
  const root = new Group();
  const torso = new Mesh(new SphereGeometry(0.12, 10, 7), mat(body));
  torso.scale.set(1, 0.85, 1.5);
  const chest = new Mesh(new SphereGeometry(0.1, 8, 6), mat(belly));
  chest.position.set(0, -0.03, 0.06);
  const head = new Mesh(new SphereGeometry(0.085, 10, 7), mat(body));
  head.position.set(0, 0.09, 0.14);
  // beak and eyes ride on the head, so pecking moves them too
  const beak = new Mesh(new ConeGeometry(0.025, 0.07, 5), mat("#f0a040"));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.01, 0.1);
  head.add(beak);
  for (const side of [1, -1]) {
    const eye = new Mesh(new SphereGeometry(0.014, 6, 4), mat("#2a2230"));
    eye.position.set(0.05 * side, 0.02, 0.06);
    head.add(eye);
  }
  const tail = new Mesh(new ConeGeometry(0.06, 0.18, 4), mat(body));
  tail.rotation.x = -Math.PI / 2 - 0.4;
  tail.position.set(0, 0.03, -0.2);
  const wingMat = new MeshToonMaterial({ color: body, gradientMap: toonRamp(), side: DoubleSide });
  const wings = [1, -1].map((s) => {
    const w = new Mesh(wingGeo, wingMat);
    w.scale.x = s;
    w.position.set(0.05 * s, 0.04, 0);
    return w;
  });
  root.add(torso, chest, head, tail, ...wings);
  root.traverse((o) => (o.castShadow = true));
  return { root, wings, head };
}

interface Hopper extends Bird { home: Vector3; state: "peck" | "hop" | "fly"; t: number; from: Vector3; to: Vector3 }
interface Flock { birds: Bird[]; from: Vector3; dir: Vector3; t: number; y: number }

/** Little birds that peck around the farm, and V-shaped flocks that cross the sky. */
export class Birds {
  private hoppers: Hopper[] = [];
  private flock: Flock | null = null;
  private nextFlock = 8;
  private time = 0;

  constructor(private scene: Scene, private world: World) {
    const looks = [["#5a8fd8", "#f3e2c8"], ["#a8744e", "#f3e2c8"], ["#e0705a", "#f6e6d0"], ["#5a8fd8", "#f3e2c8"]];
    looks.forEach(([b, c], i) => {
      const bird = makeBird(b, c);
      const home = this.spot(i);
      bird.root.position.copy(home);
      bird.root.scale.setScalar(0.9);
      scene.add(bird.root);
      this.hoppers.push({ ...bird, home, state: "peck", t: Math.random() * 3, from: home.clone(), to: home.clone() });
    });
  }

  private scared(p: Vector3) {
    return this.world.uses.scare.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < SCARE_RADIUS);
  }

  private spot(i: number) {
    // near the crops if there are any, else near flowers; never where a scarecrow stands guard
    for (let k = 0; k < 12; k++) {
      const pool = this.world.plots.length && k < 6 ? this.world.plots : this.world.flowers;
      const base = pool[(i * 5 + k * 7) % pool.length];
      const p = new Vector3(base.x + (Math.random() - 0.5) * 2.5, 0, base.z + (Math.random() - 0.5) * 2.5);
      p.y = this.world.ground(p.x, p.z);
      if (!this.scared(p)) return p;
    }
    return new Vector3(0, -50, 0);
  }

  private flap(b: Bird, speed: number, amount: number) {
    const a = Math.sin(this.time * speed) * amount;
    b.wings[0].rotation.z = a;
    b.wings[1].rotation.z = -a;
  }

  update(dt: number, player: Vector3, night: boolean, raining: boolean) {
    this.time += dt;
    for (const h of this.hoppers) this.updateHopper(h, dt, player, night || raining);

    this.nextFlock -= dt;
    if (!this.flock && this.nextFlock <= 0 && !night) this.startFlock();
    const f = this.flock;
    if (f) {
      f.t += dt;
      const head = f.from.clone().addScaledVector(f.dir, f.t * 4.5);
      f.birds.forEach((b, i) => {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        const back = Math.abs(side) * 1.1;
        const perp = new Vector3(-f.dir.z, 0, f.dir.x);
        b.root.position.copy(head).addScaledVector(f.dir, -back).addScaledVector(perp, side * 0.9);
        b.root.position.y = f.y + Math.sin(this.time * 1.3 + i) * 0.15;
        b.root.rotation.y = Math.atan2(f.dir.x, f.dir.z);
        this.flap(b, 9 + i, 0.8);
      });
      if (f.t > 22) {
        for (const b of f.birds) this.scene.remove(b.root);
        this.flock = null;
        this.nextFlock = 35 + Math.random() * 50;
      }
    }
  }

  private startFlock() {
    const a = Math.random() * Math.PI * 2;
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
    const c = this.world.bounds.center;
    const from = c.clone().addScaledVector(dir, -45);
    const birds = Array.from({ length: 5 + Math.floor(Math.random() * 3) }, () => makeBird("#f4f2ee", "#ffffff"));
    for (const b of birds) {
      b.root.scale.setScalar(1.3);
      this.scene.add(b.root);
    }
    this.flock = { birds, from, dir, t: 0, y: 7 + Math.random() * 3 + this.world.ground(0, 0) };
  }

  private updateHopper(h: Hopper, dt: number, player: Vector3, away: boolean) {
    const p = h.root.position;
    h.t -= dt;
    const scared = p.distanceTo(player) < 2.4 || away || (h.state !== "fly" && this.scared(p));
    if (h.state !== "fly" && scared) {
      h.state = "fly";
      h.from.copy(p);
      const out = p.clone().sub(player).setY(0).normalize();
      h.to.copy(p).addScaledVector(out, 14).setY(p.y + 9);
      h.t = 2.2;
      h.root.rotation.y = Math.atan2(out.x, out.z);
    }
    if (h.state === "fly") {
      const k = 1 - Math.max(h.t, 0) / 2.2;
      p.lerpVectors(h.from, h.to, k);
      p.y = h.from.y + (h.to.y - h.from.y) * k * k;
      this.flap(h, 22, 1);
      h.root.visible = h.t > 0;
      if (h.t < -12 && !away) {
        // come back to a new spot once things are calm
        h.home = this.spot(Math.floor(Math.random() * 12));
        if (h.home.distanceTo(player) > 4) {
          p.copy(h.home);
          h.root.visible = true;
          h.state = "peck";
          h.t = 2;
        }
      }
      return;
    }
    this.flap(h, 0, 0);
    if (h.state === "peck") {
      h.head.rotation.x = Math.max(0, Math.sin(this.time * 7 + p.x)) * 0.9 * (Math.sin(this.time * 0.9 + p.z) > 0 ? 1 : 0);
      if (h.t <= 0) {
        h.state = "hop";
        h.from.copy(p);
        const a = Math.random() * Math.PI * 2;
        h.to.set(h.home.x + Math.cos(a) * 1.2, 0, h.home.z + Math.sin(a) * 1.2);
        if (!this.world.mask.walkable(h.to.x, h.to.z, 0.1)) h.to.copy(h.home);
        h.root.rotation.y = Math.atan2(h.to.x - p.x, h.to.z - p.z);
        h.t = 0.9;
      }
    } else {
      const k = 1 - Math.max(h.t, 0) / 0.9;
      p.lerpVectors(h.from, h.to, k);
      p.y = this.world.ground(p.x, p.z) + Math.abs(Math.sin(k * Math.PI * 3)) * 0.12;
      if (h.t <= 0) {
        h.state = "peck";
        h.t = 1.5 + Math.random() * 3;
        p.y = this.world.ground(p.x, p.z);
      }
    }
  }
}
