import { Scene, Vector3 } from "three";
import type { Action } from "../game/interact";
import { Witch } from "../player/witch";
import type { IslandWorld } from "../world/world";
import type { ShopPanel } from "./panel";
import { SHOPS, type Shop } from "./shops";

/** how far in front of a shop's footprint its counter is, when the model has no "keeper" marker */
const COUNTER = 2.1;

interface Stand { shop: Shop; keeper: Witch; spot: Vector3; yaw: number; counter: Vector3 }

/** The Lantern Market's shopkeepers: one behind each counter, turning to greet you. */
export class Market {
  private stands: Stand[] = [];

  private constructor(private panel: ShopPanel) {}

  static async create(scene: Scene, world: IslandWorld, panel: ShopPanel) {
    const m = new Market(panel);
    for (const shop of SHOPS) {
      const placed = world.layout.objects.find((o) => o.kind === shop.building);
      const mesh = placed && world.objects.get(placed.id);
      if (!placed || !mesh || !shop.keeper) continue;
      const front = new Vector3(Math.sin(placed.rot), 0, Math.cos(placed.rot));
      mesh.updateMatrixWorld(true);
      const marker = mesh.getObjectByName("keeper");
      const spot = marker ? marker.getWorldPosition(new Vector3()).setY(0) : new Vector3(placed.x, 0, placed.z).addScaledVector(front, COUNTER);
      const keeper = await Witch.load(shop.keeper.color);
      keeper.position.copy(spot);
      keeper.root.rotation.y = placed.rot;
      scene.add(keeper.root);
      m.stands.push({ shop, keeper, spot, yaw: placed.rot, counter: spot.clone().addScaledVector(front, 1.3) });
    }
    return m;
  }

  /** Keepers breathe and blink; the nearest one turns towards you. */
  update(dt: number, player: Vector3) {
    for (const s of this.stands) {
      const near = s.counter.distanceTo(player) < 3.2;
      const yaw = near ? Math.atan2(player.x - s.spot.x, player.z - s.spot.z) : s.yaw;
      s.keeper.follow(dt, { x: s.spot.x, z: s.spot.z, yaw, speed: 0, drawing: false });
    }
  }

  /** Interaction provider: talk to the keeper at the nearest counter. */
  action = (near: Vector3): Action | null => {
    let best: Stand | null = null;
    for (const s of this.stands) if (s.counter.distanceTo(near) < 2 && (!best || s.counter.distanceTo(near) < best.counter.distanceTo(near))) best = s;
    if (!best) return null;
    const s = best;
    return {
      pos: s.counter, reach: 2, label: `${s.shop.keeper!.name} · ${s.shop.name}`, priority: 1,
      act: () => {
        s.keeper.react("gesture");
        this.panel.open(s.shop);
      },
    };
  };
}
