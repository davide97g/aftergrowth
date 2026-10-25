import { CylinderGeometry, Group, Mesh, Scene, Vector3 } from "three";
import type { Action } from "../game/interact";
import type { Inscription } from "../game/state";
import { toon } from "../render/toon";
import type { Mood } from "../world/daycycle";
import { GlyphDecal } from "./decal";
import type { Seal, SpellId } from "./glyph";
import { SPELL_NAMES } from "./grimoire";
import type { Spells } from "./spells";

export const STONE_RADIUS = 0.8;

/** Game hours between firings. Lights and fires instead stay lit and relight when they go out. */
const EVERY: Record<SpellId, number> = {
  water: 4, growth: 6, wind: 3, light: 0.25, flame: 0.25, rainbow: 6, bloom: 8, fireflies: 0.25, steam: 6,
};
const NIGHT_ONLY = new Set<SpellId>(["light", "fireflies"]);

interface Stone { pos: Vector3; decal: GlyphDecal | null; busyUntil: number }

/**
 * Carving stones: a glyph closed over one is carved into it instead of cast once.
 * The stone then repeats the spell by itself, like the manga's contraptions.
 */
export class Contraptions {
  private stones: Stone[] = [];
  private clock = 0;

  /** `data` holds what is carved in each stone: your save at home, the host's snapshot on a visit. */
  /** `quiet`: the stones belong to someone else; they only put on a show for you. */
  constructor(private scene: Scene, spots: Vector3[], private data: (Inscription | null)[], private spells: Spells, private quiet = false) {
    const slab = new CylinderGeometry(STONE_RADIUS, STONE_RADIUS + 0.06, 0.16, 9);
    const rim = new CylinderGeometry(STONE_RADIUS + 0.12, STONE_RADIUS + 0.16, 0.08, 9);
    spots.forEach((pos, i) => {
      const g = new Group();
      const top = new Mesh(slab, toon("rock"));
      top.position.y = 0.08;
      top.receiveShadow = true;
      const base = new Mesh(rim, toon("rock-dark"));
      base.position.y = 0.04;
      g.add(base, top);
      g.position.copy(pos);
      g.rotation.y = i * 0.7;
      scene.add(g);
      const stone: Stone = { pos, decal: null, busyUntil: 0 };
      this.stones.push(stone);
      const ins = data[i];
      if (ins) this.showGlyph(stone, ins);
    });
  }

  /** Index of the stone under a point, or -1. */
  stoneAt(p: Vector3): number {
    return this.stones.findIndex((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < STONE_RADIUS + 0.2);
  }

  inscribe(i: number, seal: Seal, spell: SpellId, power: number) {
    const strokes = seal.strokes.map((s) => s.map((p) => ({
      x: Math.round(((p.x - seal.center.x) / seal.radius) * 1000) / 1000,
      y: Math.round(((p.y - seal.center.y) / seal.radius) * 1000) / 1000,
    })));
    const ins: Inscription = { spell, power, strokes, cooldown: 0 };
    this.data[i] = ins;
    this.showGlyph(this.stones[i], ins);
  }

  private showGlyph(stone: Stone, ins: Inscription) {
    if (stone.decal) {
      this.scene.remove(stone.decal.mesh);
      stone.decal.dispose();
    }
    const seal: Seal = { center: { x: 0, y: 0 }, radius: 1, strokes: ins.strokes };
    stone.decal = new GlyphDecal(seal, stone.pos, STONE_RADIUS * 0.85, false, Infinity);
    stone.decal.mesh.position.y = 0.17;
    this.scene.add(stone.decal.mesh);
  }

  update(dt: number, hours: number, mood: Mood) {
    this.clock += dt;
    this.stones.forEach((stone, i) => {
      stone.decal?.update(dt);
      const ins = this.data[i];
      if (!ins) return;
      ins.cooldown -= hours;
      if (ins.cooldown > 0 || this.clock < stone.busyUntil) return;
      if (NIGHT_ONLY.has(ins.spell) && mood.glow < 0.4) return;
      const seconds = this.spells.cast(ins.spell, stone.pos.clone(), ins.power, null, this.quiet);
      stone.busyUntil = this.clock + seconds;
      ins.cooldown = EVERY[ins.spell];
      stone.decal?.flash();
    });
  }

  action = (near: Vector3): Action | null => {
    const i = this.stoneAt(near);
    if (i < 0) return null;
    const ins = this.data[i];
    const pos = this.stones[i].pos;
    if (!ins) return { pos, reach: 1.3, label: "Carving stone · close a glyph over it to carve it in", act: null };
    const when = ins.cooldown > 0.05 ? `again in ${Math.ceil(ins.cooldown)}h` : NIGHT_ONLY.has(ins.spell) ? "lights up at night" : "working";
    return { pos, reach: 1.3, label: `${SPELL_NAMES[ins.spell]} stone · ${when}`, act: null };
  };
}
