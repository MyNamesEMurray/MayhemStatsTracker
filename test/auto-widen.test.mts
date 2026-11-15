import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pageScope,
  showsWidenHint,
  widenAction,
  type WidenInputs,
} from "../website/src/lib/autoWiden.ts";

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
