import assert from "node:assert/strict";
import test from "node:test";
import { CROP_IDS } from "../shared/items.ts";
import { CROP_SEASONS, SEASONS, SEASON_DAYS, daysToFestival, festivalOn, growthRate, seasonOf } from "../shared/seasons.ts";

test("seasons turn every seven market days, in order", () => {
  const order = Array.from({ length: 8 }, (_, i) => seasonOf(i * SEASON_DAYS));
  assert.deepEqual(order, ["autumn", "winter", "spring", "summer", "autumn", "winter", "spring", "summer"]);
  for (let d = 0; d < SEASON_DAYS; d++) assert.equal(seasonOf(d), "autumn");
});

test("each season's last two days are its festival", () => {
  const days = Array.from({ length: SEASON_DAYS }, (_, d) => festivalOn(d)?.id ?? null);
  assert.deepEqual(days, [null, null, null, null, null, "lanterns", "lanterns"]);
  assert.equal(daysToFestival(0), 5);
  assert.equal(daysToFestival(6), 0);
});

test("every crop has a season, and every season favours some crop", () => {
  for (const c of CROP_IDS) assert.ok(CROP_SEASONS[c].length > 0);
  for (const s of SEASONS) assert.ok(CROP_IDS.some((c) => growthRate(c, s) > 1), s);
  assert.equal(growthRate("melon", "winter"), 0.6);
  assert.equal(growthRate("turnip", "winter"), 1.3);
});
