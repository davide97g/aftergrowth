import { Vector3 } from "three";
import type { CameraRig } from "../core/camera";
import { House } from "../house/house";
import type { Witch } from "../player/witch";
import type { Hud } from "../ui/hud";
import { fadeThrough } from "../ui/fade";
import type { Mood } from "../world/daycycle";
import type { WalkMask } from "../world/walkmask";
import type { IslandWorld } from "../world/world";
import type { Stage } from "./stage";
import { type Action, Interactions } from "./interact";
import type { Rest } from "./rest";
import type { Save } from "./state";

/** When the witch wakes after sleeping. */
const WAKE_HOUR = 6.5;

/**
 * Going in and out of the cottage: swaps the rendered scene, the walk mask, the camera framing
 * and the set of things to interact with. Sleeping lives here too.
 */
export class Cottage {
  inside = false;
  readonly indoors: Interactions;
  private outsideZoom = 1;
  private roomFocus = new Vector3();

  private constructor(
    private house: House,
    private deps: {
      stage: Stage;
      world: IslandWorld;
      witch: Witch;
      rig: CameraRig;
      clock: { hour: number; speed: number };
      state: Save;
      hud: Hud;
      rest: Rest;
      /** what the door says on someone else's island (null: it's yours) */
      owner: string | null;
      catchUp: (hours: number) => void;
      persist: () => void;
    },
  ) {
    this.indoors = new Interactions(deps.rig.camera);
    this.indoors.add(deps.rest.action);
    this.indoors.add(house.action);
    this.indoors.enabled = false;
  }

  static async create(deps: Cottage["deps"], openGrimoire: () => void) {
    let self: Cottage | null = null;
    const house = await House.create({
      canSleep: () => deps.clock.hour >= 18 || deps.clock.hour < 5,
      sleep: () => {
        self?.sleep();
        return null;
      },
      read: openGrimoire,
      exit: () => self?.leave(),
      sit: deps.rest.sitAt,
      pop: (t) => deps.hud.pop(t),
    });
    self = new Cottage(house, deps);
    return self;
  }

  get mask(): WalkMask {
    return this.inside ? this.house.mask : this.deps.world.mask;
  }

  /** Interaction provider for the door outside. */
  door = (near: Vector3): Action | null => {
    const door = this.deps.world.door;
    if (!door || Math.hypot(door.x - near.x, door.z - near.z) > 1.4) return null;
    if (this.deps.owner) return { pos: door, reach: 1.4, label: `${this.deps.owner}'s cottage · the door is closed`, act: null };
    return { pos: door, reach: 1.4, label: "Go inside", act: () => this.enter(), priority: 1 };
  };

  private enter() {
    const { stage, witch, rig } = this.deps;
    fadeThrough(() => {
      this.inside = true;
      this.outsideZoom = rig.zoomLevel;
      stage.scene.remove(witch.root);
      this.house.scene.add(witch.root);
      witch.position.copy(this.house.entry);
      witch.root.rotation.y = Math.PI + Math.PI / 4;
      stage.post.setScene(this.house.scene);
      rig.snap(1.2, new Vector3());
    });
  }

  private leave() {
    const { stage, witch, rig, world } = this.deps;
    fadeThrough(() => {
      this.inside = false;
      this.house.scene.remove(witch.root);
      stage.scene.add(witch.root);
      witch.position.copy(world.door ?? world.spawn).add(new Vector3(0.6, 0, 0.6));
      witch.root.rotation.y = Math.PI / 4;
      stage.post.setScene(stage.scene);
      rig.snap(this.outsideZoom, witch.position);
    });
  }

  /** Sleep until morning: crops keep growing on the water their soil still holds. */
  private sleep() {
    const { clock, state, hud } = this.deps;
    const hours = clock.hour >= 18 ? 24 - clock.hour + WAKE_HOUR : WAKE_HOUR - clock.hour;
    if (clock.hour >= 18) state.day++;
    fadeThrough(() => {
      this.deps.catchUp(hours);
      clock.hour = WAKE_HOUR;
      this.deps.persist();
      hud.toast(`Good morning · day ${state.day}`, "You slept until half past six.");
    });
  }

  /** Indoors the camera stays on the room and only leans towards the witch. */
  cameraTarget(): Vector3 {
    return this.roomFocus.set(0, 0, 0).lerp(this.deps.witch.position, 0.3);
  }

  update(dt: number, mood: Mood) {
    this.indoors.enabled = this.inside;
    if (this.inside) this.house.update(dt, mood);
  }
}
