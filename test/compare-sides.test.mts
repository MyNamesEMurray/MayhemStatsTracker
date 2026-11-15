import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sidesFor } from "../src/shared/compareSides.ts";

const row = (patch: string, queue_id: number, id: number, games: number, wins: number) => ({
  patch,
  queue_id,
  id,
  games,
  wins,
  kills: games * 2,
  deaths: games,
  assists: games * 3,
  damage: games * 1000,
});
const rows = [
  row("26.16", 2400, 1, 10, 6),
  row("26.16", 2450, 1, 4, 1),
  row("26.17", 2400, 1, 20, 12),
  row("26.16", 2400, 2, 5, 5),
];
const side = (patch: string, queue?: number) =>
  sidesFor(
    rows,
    patch,
    queue,
    (r) => r.id,
    (r) => r.games,
  );

describe("sidesFor", () => {
  it("keeps one patch and sums an id across the Mayhem queues", () => {
    const s = side("26.16").find((x) => x.id === 1);
    assert.equal(s?.games, 14);
    assert.equal(s?.wins, 7);
    assert.equal(s?.damage, 14000);
  });

  it("reads a single queue when asked", () => {
    assert.equal(side("26.16", 2400).find((x) => x.id === 1)?.games, 10);
  });

  it("returns nothing for a patch with no rows", () => {
    assert.deepEqual(side("26.99"), []);
  });
});
