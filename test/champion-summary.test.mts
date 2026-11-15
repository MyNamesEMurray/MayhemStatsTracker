import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregate,
  INDEX_MIN_GAMES,
  isIndexable,
  pickRatePct,
  relative,
  winRateRange,
} from "../website/src/lib/championSummary.ts";

describe("isIndexable", () => {
  it("indexes a champion from twenty games and not before", () => {
    assert.equal(isIndexable(INDEX_MIN_GAMES - 1), false);
    assert.equal(isIndexable(INDEX_MIN_GAMES), true);
  });
});

describe("pickRatePct", () => {
  it("is a share of player slots, the same as the board's Pick rate", () => {
    assert.equal(pickRatePct(1_000, 100_000), 1);
  });
  it("is zero with no games at all", () => {
    assert.equal(pickRatePct(5, 0), 0);
  });
});

describe("winRateRange", () => {
  it("stays inside 0 to 100 for a near-perfect small sample", () => {
    // 19 of 20: a normal-approximation margin would read 85.4-104.6
    const { low, high } = winRateRange(19, 20);
    assert.ok(low > 70 && low < 85, `low ${low}`);
    assert.ok(high <= 100, `high ${high}`);
  });
  it("stays inside 0 to 100 for a winless one", () => {
    const { low, high } = winRateRange(0, 20);
    assert.ok(low >= 0 && high < 20, `${low}-${high}`);
  });
  it("narrows as the sample grows", () => {
    const small = winRateRange(10, 20);
    const large = winRateRange(500, 1000);
    assert.ok(large.high - large.low < small.high - small.low);
  });
});

describe("relative", () => {
  it("calls a small gap in line with the mode", () => {
    assert.equal(relative(103, 100), "in line with the mode average");
  });
  it("says how far above or below", () => {
    assert.equal(relative(118, 100), "18% above the mode average");
    assert.equal(relative(88, 100), "12% below the mode average");
  });
  it("does not divide by a zero base", () => {
    assert.equal(relative(5, 0), "in line with the mode average");
  });
});

describe("aggregate", () => {
  it("sums rows that share a key, taking picks or games", () => {
    const rows = [
      { item_id: 1, picks: 3, wins: 2 },
      { item_id: 1, picks: 2, wins: 1 },
      { item_id: 2, games: 4, wins: 4 },
    ];
    const out = aggregate(rows, "item_id");
    assert.deepEqual(
      out.find((r) => r.key === 1),
      { key: 1, picks: 5, wins: 3 },
    );
    assert.deepEqual(
      out.find((r) => r.key === 2),
      { key: 2, picks: 4, wins: 4 },
    );
  });
});
