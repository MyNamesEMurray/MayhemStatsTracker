import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rowsFor, toYearPatch } from "../supabase/functions/review/rows.ts";

// What approving a quarantined game writes into the stats tables.
const payload = {
  platform: "EUW1",
  gameId: 7000000001,
  queueId: 2400,
  gameVersion: "16.22",
  gameDuration: 1100,
  gameCreation: 1790000000000,
  participants: [
    {
      participantId: 1,
      teamId: 100,
      championId: 44,
      win: true,
      kills: 8,
      deaths: 6,
      assists: 12,
      doubleKills: 2,
      tripleKills: 1,
      quadraKills: 0,
      pentaKills: 0,
      largestKillingSpree: 4,
      totalDamageDealt: 30000,
      totalDamageTaken: 25000,
      goldEarned: 12000,
      totalHeal: 3000,
      items: [3089, null, 3157],
      augments: [{ slot: 1, augmentId: 11 }],
    },
  ],
};

describe("rowsFor", () => {
  const out = rowsFor({ contributor_token: "tok", payload });

  it("keeps the queue and stores the patch under its year-based name", () => {
    assert.equal(out.match.queue_id, 2400);
    assert.equal(out.match.game_version, "26.22");
    assert.equal(out.patch, "26.22");
  });
  it("flattens a participant, with unfilled item slots left empty", () => {
    assert.equal(out.participants.length, 1);
    assert.equal(out.participants[0].champion_id, 44);
    assert.equal(out.participants[0].item0, 3089);
    assert.equal(out.participants[0].item1, null);
    assert.equal(out.participants[0].item6, undefined);
  });
  it("carries each augment with its champion and result", () => {
    assert.deepEqual(out.augments, [
      {
        platform: "EUW1",
        game_id: 7000000001,
        participant_id: 1,
        slot: 1,
        augment_id: 11,
        champion_id: 44,
        win: true,
      },
    ]);
  });
  it("credits the game to the contributor whose payload it was", () => {
    assert.deepEqual(out.contribution, {
      contributor_token: "tok",
      platform: "EUW1",
      game_id: 7000000001,
    });
  });
  it("throws on a payload with no participants, so one bad row fails alone", () => {
    assert.throws(() => rowsFor({ contributor_token: "t", payload: { ...payload, participants: [] } }));
    assert.throws(() => rowsFor({ contributor_token: "t", payload: null }));
  });
});

describe("toYearPatch", () => {
  it("shifts a client build to the year-based name and leaves a year-based one alone", () => {
    assert.equal(toYearPatch("16.16"), "26.16");
    assert.equal(toYearPatch("26.16"), "26.16");
  });
});
