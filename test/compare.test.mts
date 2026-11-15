import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confidence,
  join,
  parsePins,
  splitPinned,
  withRanks,
  type Side,
} from "../website/src/lib/compare.ts";

const side = (id: number, games: number, wins: number): Side => ({
  id,
  games,
  wins,
  kills: games * 10,
  deaths: games * 5,
  assists: games * 8,
  damage: games * 30000,
});

describe("join", () => {
  it("drops a row under the floor on either patch", () => {
    const rows = join([side(1, 19, 10), side(2, 30, 15)], [side(1, 40, 20), side(2, 30, 15)], 20);
    assert.deepEqual(
      rows.map((r) => r.id),
      [2],
    );
  });
  it("keeps thin rows when the floor is 1, and drops a row missing from one patch", () => {
    const rows = join([side(1, 3, 1)], [side(1, 2, 1), side(9, 50, 25)], 1);
    assert.deepEqual(
      rows.map((r) => r.id),
      [1],
    );
  });
  it("gives a win rate swing with enough games a high confidence z", () => {
    // 14 of 37 (37.8%) to 16 of 21 (76.2%)
    const [row] = join([side(1, 37, 14)], [side(1, 21, 16)], 20);
    assert.ok(row.z > 2.8 && row.z < 3.0, `z was ${row.z}`);
    assert.equal(confidence(row.z), "High");
  });
  it("gives a big swing on tiny samples low confidence", () => {
    // 1 of 4 (25%) to 2 of 4 (50%): twice the win rate, far too few games
    const [row] = join([side(1, 4, 1)], [side(1, 4, 2)], 1);
    assert.equal(confidence(row.z), "Low");
  });
  it("does not divide by zero when every game was a win", () => {
    const [row] = join([side(1, 20, 20)], [side(1, 20, 20)], 20);
    assert.equal(row.z, 0);
  });
  it("computes pick rate against each patch's own total", () => {
    const [row] = join([side(1, 50, 25), side(2, 50, 25)], [side(1, 20, 10), side(2, 80, 40)], 20);
    assert.equal(row.pickFrom, 50);
    assert.equal(row.pickTo, 20);
  });
});

describe("confidence", () => {
  it("cuts at about 95% and 80%", () => {
    assert.equal(confidence(1.96), "High");
    assert.equal(confidence(-2.5), "High");
    assert.equal(confidence(1.5), "Medium");
    assert.equal(confidence(0.5), "Low");
  });
});

describe("parsePins", () => {
  it("keeps order and drops repeats and anything that is not a whole number", () => {
    assert.deepEqual(parsePins("44,412,44,abc,,-3,1.5"), [44, 412]);
  });
  it("reads a missing parameter as no pins", () => {
    assert.deepEqual(parsePins(null), []);
    assert.deepEqual(parsePins(""), []);
  });
});

describe("ranks with pinned rows", () => {
  const rows = join(
    [1, 2, 3, 4].map((id) => side(id, 30, 15)),
    [1, 2, 3, 4].map((id) => side(id, 30, 15 + id)),
    20,
  );
  const ranked = withRanks([...rows].reverse());

  it("numbers every kept row, pinned included", () => {
    assert.deepEqual(
      ranked.map((r) => [r.id, r.rank]),
      [
        [4, 1],
        [3, 2],
        [2, 3],
        [1, 4],
      ],
    );
  });
  it("keeps a pinned row's true rank and does not renumber the rest", () => {
    const { shown, pinnedRows } = splitPinned(ranked, rows, [3]);
    assert.deepEqual(
      shown.map((r) => [r.id, r.rank]),
      [
        [4, 1],
        [2, 3],
        [1, 4],
      ],
    );
    assert.deepEqual(
      pinnedRows.map((r) => [r.id, r.rank]),
      [[3, 2]],
    );
  });
  it("still shows a pinned row the filters left out, without a rank", () => {
    const kept = withRanks(rows.filter((r) => r.id !== 3));
    const { pinnedRows } = splitPinned(kept, rows, [3]);
    assert.equal(pinnedRows[0].id, 3);
    assert.equal(pinnedRows[0].rank, undefined);
  });
});
