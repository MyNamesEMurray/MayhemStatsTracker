import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoWidenTarget,
  pageScope,
  showsWidenHint,
  widenAction,
  type WidenInputs,
} from "../src/shared/autoWiden.ts";

const widenTo = { from: "26.20", to: "26.22" };
const base: WidenInputs = {
  patchParam: null,
  key: "board:2400",
  widenedFor: null,
  appliedParam: null,
  hasNotice: false,
  widenTo,
};

describe("widenAction", () => {
  it("widens a thin page the first time it is seen", () => {
    assert.deepEqual(widenAction(base), { type: "apply", range: "26.20-26.22" });
  });
  it("does nothing when the newest patch is enough", () => {
    assert.deepEqual(widenAction({ ...base, widenTo: null }), { type: "none" });
  });
  it("keeps the notice for the range it wrote itself", () => {
    const i = { ...base, patchParam: "26.20-26.22", appliedParam: "26.20-26.22", hasNotice: true };
    assert.deepEqual(widenAction(i), { type: "none" });
  });
  it("clears the notice when the reader picks a different range", () => {
    const i = { ...base, patchParam: "all", appliedParam: "26.20-26.22", hasNotice: true };
    assert.deepEqual(widenAction(i), { type: "clear" });
  });
  it("clears the notice, and does not widen again, after a reset to the current patch", () => {
    const i = { ...base, widenedFor: "board:2400", appliedParam: "26.20-26.22", hasNotice: true };
    assert.deepEqual(widenAction(i), { type: "clear" });
    assert.deepEqual(widenAction({ ...i, hasNotice: false }), { type: "none" });
  });
});

describe("showsWidenHint", () => {
  it("offers the way back only after a reset on an already widened page", () => {
    assert.equal(showsWidenHint({ ...base, widenedFor: "board:2400" }), true);
  });
  it("stays quiet before the first widening, while a notice is up, or on a range", () => {
    assert.equal(showsWidenHint(base), false);
    assert.equal(showsWidenHint({ ...base, widenedFor: "board:2400", hasNotice: true }), false);
    assert.equal(showsWidenHint({ ...base, widenedFor: "board:2400", patchParam: "all" }), false);
  });
});

describe("pageScope", () => {
  const page = {
    onChampionPage: true,
    wasOnChampion: true,
    selectedChampion: 44,
    lastChampion: 44,
  };
  it("remembers the board's patch on entering a champion page", () => {
    assert.deepEqual(pageScope({ ...page, wasOnChampion: false }), { type: "enter" });
  });
  it("treats a champion that was still loading as the same page", () => {
    assert.deepEqual(pageScope({ ...page, lastChampion: null }), { type: "none" });
  });
  it("resets when moving to another champion or back to the board", () => {
    assert.deepEqual(pageScope({ ...page, selectedChampion: 12 }), { type: "reset" });
    assert.deepEqual(pageScope({ ...page, onChampionPage: false }), { type: "reset" });
  });
});

describe("autoWidenTarget", () => {
  const games = (per: Record<string, number>) => (s: Set<string>) =>
    [...s].reduce((n, p) => n + (per[p] ?? 0), 0);
  const patches = ["26.17", "26.16", "26.15", "26.14"];

  it("needs no widening when the newest patch is enough", () => {
    assert.equal(autoWidenTarget(patches, games({ "26.17": 80 }), 50), null);
  });

  it("reaches back one patch at a time, only as far as needed", () => {
    const w = autoWidenTarget(patches, games({ "26.17": 10, "26.16": 60 }), 50);
    assert.deepEqual(w, { from: "26.16", to: "26.17", onLatest: 10, widened: 70, reached: true });
  });

  it("stops at the reach limit and says it fell short", () => {
    const w = autoWidenTarget(patches, games({ "26.17": 1, "26.16": 1, "26.15": 1 }), 50);
    assert.deepEqual(w, { from: "26.15", to: "26.17", onLatest: 1, widened: 3, reached: false });
  });

  it("has nothing to widen with a single patch", () => {
    assert.equal(autoWidenTarget(["26.17"], games({ "26.17": 1 }), 50), null);
  });
});
