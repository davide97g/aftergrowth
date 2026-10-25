import assert from "node:assert/strict";
import { test } from "node:test";
import { KINDS, type KindDef } from "../src/island/layout.ts";
import { WALK_INSET, outline } from "../src/island/shapes.ts";
import { RAMPS, groundAt, insideObb, plan } from "../src/kingdom/plan.ts";
import { WalkMask } from "../src/world/walkmask.ts";

/** The kingdom's walk mask without the portal islet: the island, its cliffs and everything solid. */
function mask() {
  const p = plan();
  const m = new WalkMask();
  m.addGround(outline(p.coast, WALK_INSET));
  for (const h of p.holes) m.addHole(h);
  for (const b of p.boxes) m.addBox(b.x, b.z, b.hw, b.hd, b.rot);
  for (const c of p.circles) m.addSolid(c.x, c.z, c.r);
  for (const o of p.objects) {
    const solid = (KINDS[o.kind] as KindDef).solid * o.scale;
    if (solid > 0) m.addSolid(o.x, o.z, solid);
  }
  return m;
}

const STEP = 0.3;
const RADIUS = 0.3;
/** the most the ground may change between two neighbouring cells the witch walks between */
const CLIMB = 0.25;

/** Flood the walkable cells from the spawn; counts the steps too steep to take. */
function flood(m: WalkMask, from: [number, number]) {
  const key = (i: number, k: number) => `${i},${k}`;
  const seen = new Set<string>([key(0, 0)]);
  const [ox, oz] = from;
  const q: [number, number][] = [[0, 0]];
  let steep = 0;
  while (q.length) {
    const [i, k] = q.pop()!;
    const h = groundAt(ox + i * STEP, oz + k * STEP);
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nk = k + dk;
      if (seen.has(key(ni, nk))) continue;
      const nx = ox + ni * STEP;
      const nz = oz + nk * STEP;
      if (!m.walkable(nx, nz, RADIUS)) continue;
      if (Math.abs(groundAt(nx, nz) - h) > CLIMB) {
        steep++;
        continue;
      }
      seen.add(key(ni, nk));
      q.push([ni, nk]);
    }
  }
  return { seen, steep, cell: (x: number, z: number) => key(Math.round((x - ox) / STEP), Math.round((z - oz) / STEP)) };
}

test("the kingdom has a city's worth of buildings", () => {
  const p = plan();
  const houses = p.lots.filter((l) => l.kind === "house").length;
  assert.ok(houses >= 60, `only ${houses} houses`);
  for (const k of ["tavern", "arcanum", "belltower", "palace", "gatehouse"]) assert.ok(p.lots.some((l) => l.kind === k), k);
});

test("every place can be walked to from the gate, and nothing walkable is a cliff", () => {
  const p = plan();
  const m = mask();
  assert.ok(m.walkable(p.spawn[0], p.spawn[1], RADIUS), "spawn");
  const { seen, steep, cell } = flood(m, p.spawn);
  assert.equal(steep, 0, "a walkable step that climbs a cliff");
  for (const place of p.places) {
    assert.ok(m.walkable(place.x, place.z, RADIUS), `${place.id} is not walkable`);
    const near = [0, 1, -1].some((a) => [0, 1, -1].some((b) => seen.has(cell(place.x + a * STEP, place.z + b * STEP))));
    assert.ok(near, `${place.id} can't be reached`);
  }
  for (const s of p.spots) assert.ok(m.walkable(s.use[0], s.use[1], RADIUS), `${s.id} can't be stood at`);
});

test("ramps climb from one terrace to the next", () => {
  for (const r of RAMPS) {
    assert.ok(r.ht > r.hb + 1.5, "a real climb");
    assert.ok((r.ht - r.hb) / r.len < 0.6, "not too steep");
    assert.ok(Math.abs(groundAt(r.b[0] - r.axis[0] * 0.3, r.b[1] - r.axis[1] * 0.3) - r.hb) < 0.15, "bottom meets the lower terrace");
    assert.ok(Math.abs(groundAt(r.t[0] + r.axis[0] * 0.3, r.t[1] + r.axis[1] * 0.3) - r.ht) < 0.15, "top meets the upper terrace");
  }
});

test("no prop stands inside a building", () => {
  const p = plan();
  for (const o of p.objects) for (const l of p.lots) assert.ok(!insideObb(l, o.x, o.z), `${o.kind} inside a ${l.kind}`);
});
