import { Camera, OrthographicCamera, Raycaster, Scene, Vector2, Vector3 } from "three";
import { hitGround } from "../world/ground";
import { sound } from "../audio/sound";
import { type CharmSpell, ITEMS } from "../../shared/items";
import { type Save, count, give, take } from "../game/state";
import type { Hud } from "../ui/hud";
import type { Witch } from "../player/witch";
import type { Mood } from "../world/daycycle";
import type { World } from "../world/world";
import type { Life } from "../world/life";
import { Contraptions } from "./contraptions";
import { GlyphDecal } from "./decal";
import { type Reading, type SpellId, readSeal } from "./glyph";
import { FIZZLE_NOTES, Grimoire, SPELL_NAMES } from "./grimoire";
import { InkOverlay } from "./ink";
import type { P, Sigil } from "./recognizer";
import { type SpellHooks, Spells } from "./spells";

const S = Math.SQRT1_2;
const RIGHT = new Vector3(S, 0, -S);
const UP = new Vector3(-S, 0, -S);

/** Ink drops a reading costs: one per sigil, one per strengthening dot (free with a silver nib); a smudge spills one. */
export function inkCost(r: Reading, pen = 0): number {
  if (r.kind === "fizzle") return 1;
  return r.sigils.length + (pen >= 1 ? 0 : r.power - 1);
}

/** Pen, ink and grimoire: turns drawings on the screen into spells on the island. */
export class Magic {
  private overlay = new InkOverlay();
  private grimoire: Grimoire;
  private decals: GlyphDecal[] = [];
  private ray = new Raycaster();
  readonly contraptions: Contraptions;

  private constructor(
    private scene: Scene,
    private world: World,
    private witch: Witch,
    private camera: Camera,
    private hud: Hud,
    private state: Save,
    private spells: Spells,
    stones: Save["stones"],
    private canCarve: boolean,
  ) {
    this.grimoire = new Grimoire(() => state.sigils);
    this.contraptions = new Contraptions(scene, world.spots.stones, stones, spells, !canCarve);
    this.overlay.onStroke = (strokes) => this.onStroke(strokes);
    addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "KeyE") this.toggleDrawing();
      else if (e.code === "KeyG") this.grimoire.toggle();
      else if (e.code === "Escape") {
        if (this.overlay.isOpen && !this.overlay.busy) this.stopDrawing();
        else this.grimoire.toggle(false);
      } else if (e.code === "Backspace" && this.overlay.isOpen) {
        e.preventDefault();
        this.overlay.undo();
      }
    });
    document.getElementById("btn-draw")!.addEventListener("click", () => this.toggleDrawing());
    document.getElementById("btn-grimoire")!.addEventListener("click", () => this.grimoire.toggle());
  }

  /** Called after every spell you cast, so other witches can see it. */
  onCast: (spell: string, at: Vector3, power: number) => void = () => {};

  static async create(scene: Scene, world: World, life: Life, witch: Witch, camera: Camera, hud: Hud, state: Save, hooks: SpellHooks, stones: Save["stones"], canCarve: boolean) {
    return new Magic(scene, world, witch, camera, hud, state, await Spells.create(scene, world, life, hooks), stones, canCarve);
  }

  /** Another witch's spell on this island: same effect, no ink, no glyph. */
  remoteCast(spell: string, at: Vector3, power: number) {
    // on your own island a visitor's rain really waters your crops; elsewhere it's only a show
    if (spell === "fizzle") this.spells.fizzle(at);
    else this.spells.cast(spell as SpellId, at, power, null, !this.canCarve);
    sound.spell(spell as SpellId | "fizzle", power);
  }

  /** True while the pen is out: the witch should not walk. */
  get drawing() {
    return this.overlay.isOpen;
  }

  /** false indoors: glyphs belong on the island */
  allowed = true;

  private toggleDrawing() {
    if (!this.allowed && !this.overlay.isOpen) return;
    if (this.overlay.isOpen) {
      if (!this.overlay.busy) this.stopDrawing();
      return;
    }
    if (this.state.ink <= 0) {
      this.hud.toast("The ink bottle is empty", "Pick flowers and brew ink at the cauldron by the cottage.");
      return;
    }
    const p = this.witch.position.clone().setY(this.witch.position.y + 0.6).project(this.camera);
    this.overlay.open(((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight);
    this.witch.drawing = true;
    document.getElementById("btn-draw")!.setAttribute("aria-pressed", "true");
  }

  private stopDrawing() {
    this.overlay.close();
    this.witch.drawing = false;
    document.getElementById("btn-draw")!.setAttribute("aria-pressed", "false");
  }

  private groundAt(p: P): Vector3 | null {
    const ndc = new Vector2((p.x / innerWidth) * 2 - 1, -(p.y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return hitGround(this.ray.ray, (x, z) => this.world.ground(x, z));
  }

  private worldRadius(px: number) {
    const cam = this.camera as OrthographicCamera;
    return (px * (cam.right - cam.left)) / innerWidth;
  }

  private onStroke(strokes: P[][]) {
    const reading = readSeal(strokes);
    if (reading) this.resolve(reading);
  }

  private finish(fizzled: boolean) {
    this.overlay.finish(fizzled ? "fizzle" : "cast");
    sound.seal(fizzled);
    this.witch.react(fizzled ? "fizzle" : "cast");
    setTimeout(() => {
      this.witch.drawing = false;
      document.getElementById("btn-draw")!.setAttribute("aria-pressed", "false");
    }, 900);
  }

  private resolve(read: Reading) {
    // a sigil you haven't studied doesn't hold
    const r: Reading = read.kind === "spell" && read.sigils.some((s) => !this.state.sigils.includes(s)) ? { ...read, kind: "fizzle", reason: "unknown" } : read;
    const at = this.groundAt(r.center);
    const onIsland = !!at && this.world.mask.onGround(at.x, at.z);
    const stone = at ? this.contraptions.stoneAt(at) : -1;
    if (stone >= 0 && !this.canCarve && r.kind === "spell") {
      this.finish(true);
      this.hud.toast("Not your stone", "Only an island's owner can carve its stones. Cast it beside the stone instead.");
      return;
    }
    const carving = stone >= 0 && r.kind === "spell";
    const charm = !carving && r.kind === "spell" && !!at && at.distanceTo(this.world.spots.cauldron) < 1.4 && count(this.state, "charm_blank") > 0;
    // carving and inscribing cost double, or half again with a gold nib
    const cost = Math.ceil(inkCost(r, this.state.pen) * (carving || charm ? (this.state.pen >= 2 ? 1.5 : 2) : 1));

    if (r.kind === "spell" && this.state.ink < cost) {
      this.finish(true);
      this.hud.toast("The pen runs dry", `This glyph needs ${cost} drops of ink, you have ${this.state.ink}.${carving ? " Carving costs extra." : charm ? " Inscribing costs extra." : ""}`);
      return;
    }
    this.state.ink = Math.max(0, this.state.ink - cost);
    const fizzled = r.kind === "fizzle" || !onIsland;
    this.finish(fizzled);

    if (at && onIsland && !carving && !charm) {
      const decal = new GlyphDecal(r, at, this.worldRadius(r.radius), fizzled, fizzled ? 3 : 9);
      this.scene.add(decal.mesh);
      this.decals.push(decal);
    }

    if (!onIsland) {
      this.hud.toast("The ink drips off the island", "A seal has to close over solid ground.");
      return;
    }
    if (r.kind === "fizzle") {
      this.spells.fizzle(at!);
      this.onCast("fizzle", at!, 1);
      const fresh = this.grimoire.learn(`fizzle:${r.reason}`);
      this.hud.toast(fresh ? "Noted in the grimoire" : "The ink fizzles", FIZZLE_NOTES[r.reason]);
      return;
    }
    let fresh = this.grimoire.learn(r.spell);
    for (const s of r.sigils) fresh = this.grimoire.learn(s) || fresh;
    if (carving) {
      this.contraptions.inscribe(stone, r, r.spell, r.power);
      fresh = this.grimoire.learn("contraption") || fresh;
      this.hud.toast(`${SPELL_NAMES[r.spell]} carved into the stone`, `It will work on its own now. ${cost} drops of ink used.`);
      return;
    }
    if (charm) {
      take(this.state, "charm_blank");
      give(this.state, `charm:${r.spell}`);
      this.onInventory();
      this.hud.toast(`${ITEMS[`charm:${r.spell}`].name} inscribed`, `It's in your satchel. Use it anywhere, no ink needed. ${cost} drops used.`);
      return;
    }
    const dir = r.dir ? RIGHT.clone().multiplyScalar(r.dir.x).addScaledVector(UP, -r.dir.y).normalize() : null;
    this.spells.cast(r.spell, at!, r.power, dir);
    sound.spell(r.spell, r.power);
    this.onCast(r.spell, at!, r.power);
    const strength = ["", "", " · strong", " · stronger", " · strongest"][r.power];
    this.hud.toast(`${SPELL_NAMES[r.spell]}${strength}`, fresh ? "A new page in the grimoire." : `${cost} ${cost === 1 ? "drop" : "drops"} of ink`);
  }

  /** A scroll from the Scriptorium: the sigil holds from now on. */
  learnSigil(s: Sigil) {
    if (!this.state.sigils.includes(s)) this.state.sigils.push(s);
    this.grimoire.learn(s);
    this.grimoire.refresh();
  }

  /** Break a charm: its spell happens just in front of the witch, at power 2, without ink or drawing. */
  useCharm(spell: CharmSpell) {
    if (!this.allowed || this.overlay.isOpen) {
      this.hud.toast("Not here", "Charms work outside, with the pen put away.");
      return;
    }
    const at = this.witch.position.clone().add(new Vector3(Math.sin(this.witch.yaw), 0, Math.cos(this.witch.yaw)).multiplyScalar(1.2));
    if (!this.world.mask.onGround(at.x, at.z) || !take(this.state, `charm:${spell}`)) return;
    this.spells.cast(spell, at, 2, null);
    sound.spell(spell, 2);
    this.onCast(spell, at, 2);
    this.witch.react("cast");
    this.onInventory();
    this.hud.toast(ITEMS[`charm:${spell}`].name, `${SPELL_NAMES[spell]}! The charm crumbles to gold dust.`);
  }

  /** after a charm is made or used */
  onInventory: () => void = () => {};

  openGrimoire() {
    this.grimoire.toggle(true);
  }

  set baseWind(v: number) {
    this.spells.baseWind = v;
  }

  resize(w: number, h: number) {
    this.overlay.resize(w, h);
  }

  update(dt: number, hours: number, mood: Mood) {
    this.overlay.update(dt);
    this.spells.update(dt, mood);
    this.contraptions.update(dt, hours, mood);
    this.decals = this.decals.filter((d) => {
      if (d.update(dt)) return true;
      this.scene.remove(d.mesh);
      d.dispose();
      return false;
    });
  }
}
