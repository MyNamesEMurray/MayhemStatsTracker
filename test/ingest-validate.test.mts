import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  plausibilityFlags,
  sanitizeGame,
  validateStructural,
} from "../supabase/functions/ingest/validate.ts";

// The trust boundary for everything an installed app uploads: what is rejected
// outright, what is held for a human, and what is kept.
function participant(id: number, teamId: number, win: boolean) {
  return {
    participantId: id,
    teamId,
    championId: 100 + id,
    win,
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
    items: [3089, 3157, null, null, null, null, 3340],
    augments: [
      { slot: 1, augmentId: 11 },
      { slot: 2, augmentId: 22 },
    ],
  };
}

function game(overrides: Record<string, unknown> = {}): any {
  return {
    platform: "EUW1",
    gameId: 7_000_000_001,
    queueId: 2400,
    gameVersion: "26.22",
    gameDuration: 1100,
    gameCreation: Date.now() - 3_600_000,
    participants: [
      ...[1, 2, 3, 4, 5].map((i) => participant(i, 100, true)),
      ...[6, 7, 8, 9, 10].map((i) => participant(i, 200, false)),
    ],
    ...overrides,
  };
}

describe("validateStructural", () => {
  it("accepts an ordinary game", () => {
    assert.equal(validateStructural(game()), null);
  });
  it("rejects a queue that is not Mayhem", () => {
    assert.equal(validateStructural(game({ queueId: 450 })), "not a Mayhem queue");
  });
  it("rejects anything but ten participants", () => {
    const g = game();
    g.participants.pop();
    assert.equal(validateStructural(g), "must have exactly 10 participants");
  });
  it("rejects teams that are not five against five", () => {
    const g = game();
    g.participants[5].teamId = 100;
    g.participants[5].win = true;
    assert.equal(validateStructural(g), "teams must be 5v5");
  });
  it("rejects a game where both teams won, or neither did", () => {
    const g = game();
    for (const p of g.participants) p.win = true;
    assert.equal(validateStructural(g), "exactly one team must win");
  });
  it("rejects a team whose members disagree about winning", () => {
    const g = game();
    g.participants[1].win = false;
    assert.equal(validateStructural(g), "inconsistent team win");
  });
  it("rejects more triple kills than double kills", () => {
    const g = game();
    g.participants[0].tripleKills = 5;
    assert.equal(validateStructural(g), "multikill hierarchy violated");
  });
  it("rejects six item slots, and a repeated participant id", () => {
    const g = game();
    g.participants[0].items = [1, 2, 3, 4, 5, 6];
    assert.equal(validateStructural(g), "bad items");
    const h = game();
    h.participants[1].participantId = 1;
    assert.equal(validateStructural(h), "bad participantId");
  });
  it("rejects a game from before Mayhem existed", () => {
    assert.equal(validateStructural(game({ gameCreation: 1_600_000_000_000 })), "bad gameCreation");
  });
  it("rejects what is not an object", () => {
    assert.equal(validateStructural(null), "not an object");
    assert.equal(validateStructural("game"), "not an object");
  });
});

describe("plausibilityFlags", () => {
  it("lets an ordinary game through", () => {
    assert.deepEqual(plausibilityFlags(game()), []);
  });
  it("flags a kill count no game that long could reach", () => {
    const g = game();
    g.participants[0].kills = 100;
    g.participants[0].doubleKills = 0;
    g.participants[0].tripleKills = 0;
    g.participants[0].largestKillingSpree = 0;
    const flags = plausibilityFlags(g);
    assert.equal(flags.length, 1);
    assert.match(flags[0], /100 kills in 1100s/);
  });
  it("flags gold above the ceiling for the duration", () => {
    const g = game();
    g.participants[2].goldEarned = 9_000_000;
    assert.match(plausibilityFlags(g)[0], /gold/);
  });
});

describe("sanitizeGame", () => {
  it("keeps only the fields the schema defines, so identity cannot ride along", () => {
    const g = game({ puuid: "abc", summonerName: "someone", extra: { x: 1 } });
    g.participants[0].puuid = "def";
    g.participants[0].riotIdGameName = "someone";
    const clean = sanitizeGame(g);
    const text = JSON.stringify(clean);
    assert.ok(!text.includes("puuid"), "puuid survived");
    assert.ok(!text.includes("someone"), "a name survived");
    assert.equal(clean.participants.length, 10);
    assert.equal(clean.gameId, g.gameId);
    assert.deepEqual(clean.participants[0].augments, [
      { slot: 1, augmentId: 11 },
      { slot: 2, augmentId: 22 },
    ]);
  });
});
