import { type Scene, Vector3 } from "three";
import type { CameraRig } from "../core/camera";
import { House } from "../house/house";
import { Witch } from "../player/witch";
import { type Ground, flat } from "../world/ground";
import type { Hud } from "../ui/hud";
import { fadeThrough } from "../ui/fade";
import type { Mood } from "../world/daycycle";
import type { WalkMask } from "../world/walkmask";
import type { IslandWorld } from "../world/world";
import type { Stage } from "./stage";
import { type Action, Interactions } from "./interact";
import type { Rest } from "./rest";
import type { Save } from "./state";

/** A place indoors: its own scene and floor, and what can be done there. */
export interface Room {
  readonly scene: Scene;
  readonly mask: WalkMask;
  /** where the witch stands on coming in, facing `entryYaw` */
  readonly entry: Vector3;
  readonly entryYaw: number;
  /** camera zoom indoors */
  readonly zoom: number;
  action(near: Vector3): Action | null;
  /** where the camera looks, given the witch */
  focus(witch: Vector3): Vector3;
  /** the floor's height (flat when missing) */
  ground?: Ground;
  update(dt: number, mood: Mood): void;
}

/** When the witch wakes after sleeping. */
const WAKE_HOUR = 6.5;

/**
 * Going in and out of rooms (the cottage, the palace hall): swaps the rendered scene, the walk mask,
 * the camera framing and the set of things to interact with. Sleeping lives here too.
 */
export class Cottage {
  readonly indoors: Interactions;
  /** the room she is in, or null outdoors */
  private room: Room | null = null;
  private outsideZoom = 1;
  private outsideGround: Ground = flat;
  /** where she steps back out */
  readonly outside = new Vector3();

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
    this.indoors.add((near) => this.room?.action(near) ?? null);
    this.indoors.enabled = false;
  }

  get inside() {
    return this.room !== null;
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
    return this.room?.mask ?? this.deps.world.mask;
  }

  /** Interaction provider for the door outside. */
  door = (near: Vector3): Action | null => {
    const door = this.deps.world.door;
    if (!door || Math.hypot(door.x - near.x, door.z - near.z) > 1.4) return null;
    if (this.deps.owner) return { pos: door, reach: 1.4, label: `${this.deps.owner}'s cottage · the door is closed`, act: null };
    return { pos: door, reach: 1.4, label: "Go inside", act: () => this.enter(this.house, door.clone().add(new Vector3(0.6, 0, 0.6))), priority: 1 };
  };

  /** Step into a room; leaving puts her back at `out`. */
  enter(room: Room, out: Vector3) {
    const { stage, witch, rig } = this.deps;
    fadeThrough(() => {
      this.room = room;
      this.outside.copy(out);
      this.outsideZoom = rig.zoomLevel;
      this.outsideGround = Witch.ground;
      Witch.ground = room.ground ?? flat;
      stage.scene.remove(witch.root);
      room.scene.add(witch.root);
      witch.position.copy(room.entry);
      witch.root.rotation.y = room.entryYaw;
      stage.post.setScene(room.scene);
      rig.snap(room.zoom, room.focus(room.entry));
    });
  }

  leave() {
    const { stage, witch, rig } = this.deps;
    const room = this.room;
    if (!room) return;
    fadeThrough(() => {
      this.room = null;
      Witch.ground = this.outsideGround;
      room.scene.remove(witch.root);
      stage.scene.add(witch.root);
      witch.position.copy(this.outside);
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

  /** Indoors the camera follows the room's framing. */
  cameraTarget(): Vector3 {
    return this.room?.focus(this.deps.witch.position) ?? this.deps.witch.position;
  }

  update(dt: number, mood: Mood) {
    this.indoors.enabled = this.inside;
    this.room?.update(dt, mood);
  }
}
