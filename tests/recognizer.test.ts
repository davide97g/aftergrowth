import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGIL_SHAPES, classify, type P, type Sigil } from "../src/magic/recognizer.ts";

// a hand-drawn version of a shape: rescaled, rotated a little, wobbly, densely sampled
function scribble(shape: P[], seed: number, scale = 60, rot = 0.25): P[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  const out: P[] = [];
  const a = rot * rnd() * 2;
  for (let i = 0; i < shape.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const x = shape[i].x + (shape[i + 1].x - shape[i].x) * t;
      const y = shape[i].y + (shape[i + 1].y - shape[i].y) * t;
      out.push({
        x: 400 + (x * Math.cos(a) - y * Math.sin(a)) * scale + rnd() * 3,
        y: 300 + (x * Math.sin(a) + y * Math.cos(a)) * scale + rnd() * 3,
      });
    }
  }
  out.push({ x: 400 + shape.at(-1)!.x * scale, y: 300 + shape.at(-1)!.y * scale });
  return out;
}

test("each sigil is recognised from wobbly drawings", () => {
  const misses: string[] = [];
  for (const [name, shape] of Object.entries(SIGIL_SHAPES) as [Sigil, P[]][]) {
    for (let seed = 1; seed <= 20; seed++) {
      const m = classify(scribble(shape, seed * 7919, 40 + seed * 3));
      if (m.kind !== "sigil" || m.sigil !== name) misses.push(`${name}#${seed}->${m.kind === "sigil" ? m.sigil : m.kind}`);
    }
  }
  assert.ok(misses.length <= 4, `misses: ${misses.join(", ")}`);
});

test("circles, dots and lines are marks, not sigils", () => {
  const circle = Array.from({ length: 90 }, (_, i) => ({ x: 400 + Math.cos((i / 88) * Math.PI * 2) * 120, y: 300 + Math.sin((i / 88) * Math.PI * 2) * 115 }));
  assert.equal(classify(circle).kind, "circle");
  assert.equal(classify([{ x: 10, y: 10 }, { x: 13, y: 12 }]).kind, "dot");
  assert.equal(classify(Array.from({ length: 20 }, (_, i) => ({ x: 100 + i * 6, y: 100 + i * 2 }))).kind, "line");
});

test("a small triangle is not taken for the seal", () => {
  const m = classify(scribble(SIGIL_SHAPES.flame, 3, 60, 0));
  assert.notEqual(m.kind, "circle");
});
