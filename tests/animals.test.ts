import assert from "node:assert/strict";
import { test } from "node:test";
import { type Herd, TROUGH_MAX, addMeal, meals, morning } from "../src/farm/livestock.ts";

const herd = (): Herd => ({ animals: {}, troughs: {}, day: 1 });
const nowhere = () => false;

test("a fed chicken lays every morning; an unfed one doesn't", () => {
  const h = herd();
  addMeal(h, "t", "wheat", 1);
  const chicken = { id: "c", kind: "chicken" as const, x: 0, z: 0 };
  morning(h, 2, [chicken], [{ id: "t", x: 1, z: 0 }], nowhere);
  assert.equal(h.animals.c.ready, 1);
  assert.equal(h.animals.c.fed, 2);
  assert.equal(meals(h.troughs.t), 0);
  h.animals.c.ready = 0;
  morning(h, 3, [chicken], [{ id: "t", x: 1, z: 0 }], nowhere);
  assert.equal(h.animals.c.ready, 0, "empty trough");
  assert.equal(h.animals.c.fed, 2);
});

test("animals only eat what they like, from a trough in reach", () => {
  const h = herd();
  addMeal(h, "near", "corn", 2);
  addMeal(h, "far", "turnip", 2);
  const sheep = { id: "s", kind: "sheep" as const, x: 0, z: 0 };
  morning(h, 2, [sheep], [{ id: "near", x: 1, z: 0 }, { id: "far", x: 50, z: 0 }], nowhere);
  assert.equal(h.animals.s.fed, 0, "sheep don't eat corn, and the turnips are too far");
});

test("sheep give wool every other day; ducks need the pond", () => {
  const h = herd();
  addMeal(h, "t", "turnip", 3);
  addMeal(h, "t2", "wheat", 3);
  const sheep = { id: "s", kind: "sheep" as const, x: 0, z: 0 };
  const duck = { id: "d", kind: "duck" as const, x: 0, z: 0 };
  const troughs = [{ id: "t", x: 0, z: 1 }, { id: "t2", x: 1, z: 0 }];
  const made: number[] = [];
  for (let day = 2; day <= 5; day++) {
    morning(h, day, [sheep, duck], troughs, nowhere);
    if (h.animals.s.ready) made.push(day);
    h.animals.s.ready = 0;
  }
  assert.deepEqual(made, [2, 4]);
  assert.equal(h.animals.d.ready, 0, "no pond, no duck eggs");
  assert.equal(h.animals.d.fed, 4, "but the duck still eats (3 meals of wheat)");
});

test("a trough holds six meals", () => {
  const h = herd();
  assert.equal(addMeal(h, "t", "wheat", 10), TROUGH_MAX);
  assert.equal(addMeal(h, "t", "corn", 1), 0);
});
