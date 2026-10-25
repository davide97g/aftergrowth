import { type Mark, type P, type Sigil, centroid, classify } from "./recognizer";

export type SpellId = Sigil | "rainbow" | "bloom" | "fireflies" | "steam";

export interface Seal {
  center: P;
  radius: number;
  /** strokes that belong to the glyph (inside the seal, seal included) */
  strokes: P[][];
}

export type Reading =
  | (Seal & { kind: "spell"; spell: SpellId; sigils: Sigil[]; power: number; dir: P | null })
  | (Seal & { kind: "fizzle"; reason: FizzleId });

export type FizzleId = "empty" | "unclear" | "crowded" | "signs-only" | "argue" | "unknown";

const COMBOS: Record<string, SpellId> = {
  "light+water": "rainbow",
  "growth+water": "bloom",
  "light+wind": "fireflies",
  "flame+water": "steam",
};

export function comboKey(a: Sigil, b: Sigil) {
  return [a, b].sort().join("+");
}

/**
 * Read the glyph once its last stroke is a closed circle. Returns null while the seal is still open:
 * like in the manga, nothing happens until the circle closes.
 */
export function readSeal(strokes: P[][]): Reading | null {
  if (!strokes.length) return null;
  const last = classify(strokes[strokes.length - 1]);
  if (last.kind !== "circle") return null;
  const { center, radius } = last;
  const inner = strokes.slice(0, -1).filter((s) => {
    const c = centroid(s);
    return Math.hypot(c.x - center.x, c.y - center.y) < radius * 1.05;
  });
  const seal: Seal = { center, radius, strokes: [...inner, strokes[strokes.length - 1]] };
  const marks: Mark[] = inner.map(classify);
  const sigils = marks.flatMap((m) => (m.kind === "sigil" ? [m.sigil] : []));
  const dots = marks.filter((m) => m.kind === "dot").length;
  const line = marks.find((m): m is Extract<Mark, { kind: "line" }> => m.kind === "line");

  if (!marks.length) return { ...seal, kind: "fizzle", reason: "empty" };
  if (marks.some((m) => m.kind === "unclear" || m.kind === "circle")) return { ...seal, kind: "fizzle", reason: "unclear" };
  if (!sigils.length) return { ...seal, kind: "fizzle", reason: "signs-only" };
  if (sigils.length > 2) return { ...seal, kind: "fizzle", reason: "crowded" };

  let power = 1 + Math.min(dots, 3);
  let spell: SpellId;
  if (sigils.length === 2 && sigils[0] !== sigils[1]) {
    const combo = COMBOS[comboKey(sigils[0], sigils[1])];
    if (!combo) return { ...seal, kind: "fizzle", reason: "argue" };
    spell = combo;
  } else {
    spell = sigils[0];
    if (sigils.length === 2) power = Math.min(power + 1, 4); // the same sigil twice: stronger
  }
  const dir = line ? { x: line.to.x - line.from.x, y: line.to.y - line.from.y } : null;
  return { ...seal, kind: "spell", spell, sigils: [...new Set(sigils)], power, dir };
}
