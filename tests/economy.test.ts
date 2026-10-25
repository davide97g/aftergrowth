import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILD, LAND_PRICE, PRICES, canPay, quote } from "../src/island/costs.ts";
import { KINDS, defaultHome } from "../src/island/layout.ts";
import { OPEN_PLOTS, clearPrice, newGame } from "../src/game/state.ts";

const wallet = (coins = 100, bag: Record<string, number> = {}) => ({ coins, bag, shed: {}, land: 1 });

test("every placeable kind has a price, essentials and market buildings are free", () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    const price = PRICES[kind as keyof typeof KINDS];
    if (("essential" in def && def.essential) || def.cat === "market") assert.equal(price, 0, kind);
    else assert.ok(price > 0, kind);
  }
});

test("moving and reshaping cost nothing", () => {
  const before = defaultHome(5);
  const after = structuredClone(before);
  after.objects[0].x += 1;
  after.shape = "clover";
  after.size = 0.9;
  assert.equal(quote(before, after, wallet()).cost, 0);
});

test("new things cost their price; removed things go to the shed and come back free", () => {
  const before = defaultHome(5);
  const added = structuredClone(before);
  added.objects.push({ id: "b", kind: "bench", x: 0, z: 0, rot: 0, scale: 1 });
  assert.equal(quote(before, added, wallet()).cost, PRICES.bench);

  const removed = structuredClone(before);
  removed.objects.splice(removed.objects.findIndex((o) => o.kind === "lantern"), 1);
  const q = quote(before, removed, wallet());
  assert.equal(q.cost, 0);
  assert.equal(q.shed.lantern, 1);

  const back = structuredClone(before);
  back.objects.push({ id: "l2", kind: "lantern", x: 1, z: 1, rot: 0, scale: 1 }, { id: "l3", kind: "lantern", x: 2, z: 1, rot: 0, scale: 1 });
  const q2 = quote(before, back, { coins: 100, bag: {}, shed: { lantern: 1 }, land: 1 });
  assert.equal(q2.cost, PRICES.lantern, "one from the shed, one bought");
  assert.equal(q2.shed.lantern, undefined);
});

test("land beyond what was paid for costs per step", () => {
  const before = defaultHome(5);
  const after = { ...structuredClone(before), size: 1.2 };
  const q = quote(before, after, wallet());
  assert.equal(q.cost, 4 * LAND_PRICE);
  assert.equal(q.land, 1.2);
  assert.equal(quote(before, after, { ...wallet(), land: 1.2 }).cost, 0, "already paid for");
});

test("a new game opens some plots, and clearing gets dearer", () => {
  const s = newGame(12, 3);
  assert.equal(s.plots.filter((p) => !p.locked).length, OPEN_PLOTS);
  const first = clearPrice(s);
  s.plots[OPEN_PLOTS].locked = false;
  assert.ok(clearPrice(s) > first);
});

test("built things take materials, and can't be paid for without them", () => {
  const before = defaultHome(5);
  const after = structuredClone(before);
  after.objects.push({ id: "g", kind: "greenhouse", x: 0, z: 0, rot: 0, scale: 1 });
  const q = quote(before, after, wallet(500));
  assert.equal(q.cost, PRICES.greenhouse);
  assert.deepEqual(q.mats, BUILD.greenhouse);
  assert.equal(canPay(q, wallet(500)), false, "no glass");
  assert.equal(canPay(q, wallet(500, { glass: 6, wood: 4 })), true);
  assert.equal(canPay(q, wallet(10, { glass: 6, wood: 4 })), false, "no coins");
});
