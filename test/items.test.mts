import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFinishedItem } from "../src/shared/items.ts";

describe("isFinishedItem", () => {
  it("keeps a priced item that builds into nothing", () => {
    assert.equal(isFinishedItem({ id: 3089, priceTotal: 3600, to: [], from: [1026, 1058] }), true);
  });
  it("drops a component that builds into something", () => {
    assert.equal(isFinishedItem({ id: 1038, priceTotal: 1300, to: [3031] }), false);
  });
  it("drops consumables and cheap items", () => {
    assert.equal(
      isFinishedItem({ id: 2003, priceTotal: 50, to: [], categories: ["Consumable"] }),
      false,
    );
    assert.equal(isFinishedItem({ id: 2000, priceTotal: 400, to: [] }), false);
  });
  it("keeps a six-digit mode item whatever it costs", () => {
    assert.equal(isFinishedItem({ id: 443000, priceTotal: 0, to: [] }), true);
  });
  it("keeps tier-2 boots because they are built from the starter pair", () => {
    assert.equal(
      isFinishedItem({
        id: 3158,
        priceTotal: 900,
        to: [3009],
        from: [1001],
        categories: ["Boots"],
      }),
      true,
    );
    assert.equal(
      isFinishedItem({ id: 1001, priceTotal: 300, to: [3158], categories: ["Boots"] }),
      false,
    );
  });
});
