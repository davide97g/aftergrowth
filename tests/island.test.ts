import assert from "node:assert/strict";
import { test } from "node:test";
import { KINDS, clampObjects, coast, commonsLayout, defaultHome, sanitizeLayout } from "../src/island/layout.ts";
import { SHAPE_IDS, radiusAt } from "../src/island/shapes.ts";

test("default home has every essential, inside the coast", () => {
  const l = defaultHome(123456);
  for (const [kind, def] of Object.entries(KINDS)) {
    if ("essential" in def && def.essential) assert.equal(l.objects.filter((o) => o.kind === kind).length, def.count, kind);
  }
  const r = coast(l);
  for (const o of l.objects) assert.ok(Math.hypot(o.x, o.z) < radiusAt(r, o.x, o.z), `${o.kind} outside`);
  assert.ok(l.objects.filter((o) => o.kind.startsWith("tree")).length >= 8, "a ring of trees");
});

test("every shape at every size keeps objects on the island after clamping", () => {
  for (const shape of SHAPE_IDS) {
    for (const size of [0.8, 1.2, 1.6]) {
      const l = defaultHome(7);
      l.shape = shape;
      l.size = size;
      clampObjects(l);
      const r = coast(l);
      for (const o of l.objects) assert.ok(Math.hypot(o.x, o.z) <= radiusAt(r, o.x, o.z) * 0.87, `${shape} ${size} ${o.kind}`);
    }
  }
});

test("sanitize restores missing essentials and drops junk", () => {
  const home = defaultHome(1);
  const broken = { ...home, shape: "triangle", size: 99, objects: [...home.objects.filter((o) => o.kind !== "cottage"), { id: "x", kind: "dragon", x: 0, z: 0, rot: 0, scale: 1 }] };
  const l = sanitizeLayout(broken, home);
  assert.equal(l.shape, "round");
  assert.equal(l.size, 1.6);
  assert.equal(l.objects.filter((o) => o.kind === "cottage").length, 1);
  assert.ok(!l.objects.some((o) => (o.kind as string) === "dragon"));
  assert.equal(sanitizeLayout(null, home), home);
});

test("the commons has no farm", () => {
  assert.ok(!commonsLayout().objects.some((o) => o.kind === "farm"));
});
