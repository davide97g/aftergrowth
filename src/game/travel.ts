import { Camera, Scene, Vector3 } from "three";
import { sound } from "../audio/sound";
import { PortalOverlay, portalGroundCircle } from "../fx/portal";
import { type Tweens, easeOutBack, smoothstep } from "../fx/tween";
import type { Witch } from "../player/witch";
import type { Life } from "../world/life";
import type { IslandWorld } from "../world/world";

/**
 * Portal travel. Leaving: walk into the ring, the ground circle spins up, spiral into the vortex,
 * the glyph veil closes, the next island loads. Arriving: the veil opens and the witch steps out.
 */
export class PortalTravel {
  /** true while a departure or arrival plays (the witch can't be steered) */
  active = false;
  private ground = portalGroundCircle();
  private spin = 0;

  constructor(
    scene: Scene,
    private world: IslandWorld,
    private witch: Witch,
    private camera: Camera,
    private veil: PortalOverlay,
    private tweens: Tweens,
    private life: Life,
  ) {
    this.ground.mesh.position.copy(world.portalPos).setY(0.07);
    scene.add(this.ground.mesh);
  }

  private screenOf(v: Vector3) {
    const p = v.clone().project(this.camera);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight] as const;
  }

  update(dt: number) {
    this.spin += dt * 1.6;
  }

  /**
   * Leave for another island (null: home). `beforeLeave` runs just before the page changes.
   * `here`: the vortex opens where she stands (travelling from the map) instead of at the portal.
   */
  async depart(island: string | null, beforeLeave: () => void, here = false) {
    if (this.active) return;
    this.active = true;
    beforeLeave();
    sound.whoosh();
    const w = this.witch;
    const from = w.position.clone();
    const into = here ? from.clone() : this.world.portalPos.clone();
    this.ground.mesh.position.copy(into).setY(into.y + 0.07);
    if (!here) {
      w.root.rotation.y = Math.atan2(into.x - from.x, into.z - from.z);
      await this.tweens.run(750, (k) => {
        w.position.lerpVectors(from, into, smoothstep(k));
        this.ground.set(this.spin, k, 0.6 + k);
      });
    } else await this.tweens.run(500, (k) => this.ground.set(this.spin, k, 0.6 + k));
    w.react("cast");
    await this.tweens.run(1100, (k) => {
      w.root.rotation.y += 0.25 + k * 0.6;
      w.root.scale.setScalar(Math.max(1 - k * k, 0.001));
      w.position.y = into.y + Math.sin(k * Math.PI * 0.5) * 1.4;
      this.world.portal.uniforms.uGlow.value = 1 + k * 2;
      this.ground.set(this.spin, 1, 1.6 + k * 0.6);
      if (Math.random() < 0.5) this.life.footstep(w.position.clone(), true);
    });
    const [x, y] = this.screenOf(into.clone().setY(into.y + 1.45));
    await this.veil.close(x, y, 900);
    location.href = island ? `/?island=${encodeURIComponent(island)}&via=portal` : "/?via=portal";
  }

  /** Step out of the portal to `to` while the veil opens. */
  async arrive(to: Vector3) {
    this.active = true;
    const w = this.witch;
    w.position.copy(to);
    w.root.scale.setScalar(0.001);
    await new Promise(requestAnimationFrame);
    const [x, y] = this.screenOf(this.world.portalPos.clone().setY(1.45));
    this.ground.set(0, 1, 1.6);
    const opened = this.veil.open(x, y, 1200);
    await new Promise((r) => setTimeout(r, 500));
    const portal = this.world.portalPos;
    await this.tweens.run(800, (k) => {
      w.root.scale.setScalar(Math.max(easeOutBack(k), 0.001));
      w.position.lerpVectors(portal, to, k);
      w.position.y = Math.sin(k * Math.PI) * 0.6;
      if (Math.random() < 0.6) this.life.footstep(w.position.clone(), true);
    });
    w.root.rotation.y = Math.PI / 4;
    w.react("cast");
    await opened;
    await this.tweens.run(900, (k) => this.ground.set(this.spin, 1 - k, 1.6 * (1 - k * 0.3)));
    this.active = false;
  }
}
