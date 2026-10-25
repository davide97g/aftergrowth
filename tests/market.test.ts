import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEM_IDS, type ItemId } from "../shared/items.ts";
import { SWING, marketDay, special, swing } from "../shared/prices.ts";
import { fromLegacy, newGame } from "../src/game/state.ts";
import { KINDS, MARKET_SHOPS, coast, marketLayout } from "../src/island/layout.ts";
import { radiusAt } from "../src/island/shapes.ts";
import { CRATE, SHOPS, buyPrice, offerKey, sellPrice } from "../src/market/shops.ts";

test("prices swing within bounds and are the same for everyone on a day", () => {
  const day = marketDay(Date.UTC(2026, 9, 25, 12));
  assert.equal(day, marketDay(Date.UTC(2026, 9, 25, 23, 59)));
  for (const id of ITEM_IDS) {
    for (let d = day; d < day + 30; d++) {
      const k = swing(id, d);
      assert.ok(k >= 1 - SWING && k <= 1 + SWING, `${id} ${k}`);
      assert.equal(k, swing(id, d));
    }
  }
});

test("nothing can be bought and sold back at a profit, on any day", () => {
  const save = newGame(12, 3);
  const day0 = marketDay(Date.UTC(2026, 9, 25));
  for (const shop of [CRATE, ...SHOPS]) {
    for (let day = day0; day < day0 + 120; day++) {
      for (const o of shop.sells) {
        const key = offerKey(o);
        if (!shop.buys.includes(key as ItemId)) continue;
        assert.ok(buyPrice(shop, o, save, day)! >= sellPrice(shop, key as ItemId, day), `${shop.id} ${key} on day ${day}`);
      }
    }
  }
});

test("a shop's special comes from its own lists", () => {
  for (let d = 0; d < 50; d++) {
    const sp = special("shop", ["a", "b"], ["c"], d)!;
    assert.ok(sp.kind === "sale" ? ["a", "b"].includes(sp.item) : sp.item === "c");
  }
  assert.equal(special("shop", [], [], 1), null);
});

test("old saves move into the bag", () => {
  const bag = fromLegacy({ seeds: { wheat: 2, melon: 0 }, harvest: { corn: 3 }, flowers: { pink: 1 }, goods: { honey: 4 } });
  assert.deepEqual(bag, { "seed:wheat": 2, "crop:corn": 3, "flower:pink": 1, honey: 4 });
});

test("the market has every shop, on the island", () => {
  const l = marketLayout();
  for (const [kind] of MARKET_SHOPS) assert.equal(l.objects.filter((o) => o.kind === kind).length, 1, kind);
  const r = coast(l);
  for (const o of l.objects) assert.ok(Math.hypot(o.x, o.z) < radiusAt(r, o.x, o.z) * 0.9, `${o.kind} near the edge`);
  for (const o of l.objects) assert.ok(o.kind in KINDS);
});
