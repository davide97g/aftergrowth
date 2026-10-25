import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEM_IDS, type ItemId, stallBounds } from "../shared/items.ts";
import { SWING, marketDay, special, swing } from "../shared/prices.ts";
import { fromLegacy, newGame } from "../src/game/state.ts";
import { KINDS, MARKET_SHOPS, coast, marketLayout } from "../src/island/layout.ts";
import { radiusAt } from "../src/island/shapes.ts";
import { CRATE, SCROLLS, SHOPS, buyPrice, offerKey, sellPrice } from "../src/market/shops.ts";

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

test("nothing can be bought and sold back at a profit, on any day, across shops", () => {
  const save = newGame(12, 3);
  const day0 = marketDay(Date.UTC(2026, 9, 25));
  const shops = [CRATE, ...SHOPS];
  for (let day = day0; day < day0 + 120; day++) {
    for (const shop of shops) {
      for (const o of shop.sells) {
        const key = offerKey(o);
        if (!("item" in o) && !("ink" in o)) continue;
        const cost = buyPrice(shop, o, save, day)!;
        for (const other of shops) {
          if (!other.buys.includes(key as ItemId)) continue;
          assert.ok(cost >= sellPrice(other, key as ItemId, day), `${key}: ${shop.id} sells at ${cost}, ${other.id} pays ${sellPrice(other, key as ItemId, day)} on day ${day}`);
        }
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

test("new witches know two sigils and buy the rest as scrolls", () => {
  const save = newGame(12, 3);
  assert.deepEqual(save.sigils, ["growth", "water"]);
  const scriptorium = SHOPS.find((s) => s.id === "scriptorium")!;
  const wind = scriptorium.sells.find((o) => "scroll" in o && o.scroll === "wind")!;
  assert.ok(buyPrice(scriptorium, wind, save, 1)! > 0);
  save.sigils.push("wind");
  assert.equal(buyPrice(scriptorium, wind, save, 1), null, "already known");
  assert.equal(SCROLLS.flame!.needs, "light");
});

test("stall prices are bounded around each item's base price", () => {
  for (const id of ITEM_IDS) {
    const b = stallBounds(id);
    assert.ok(b.min >= 1 && b.min <= b.max, id);
  }
  assert.deepEqual(stallBounds("egg"), { min: 3, max: 27 });
});
