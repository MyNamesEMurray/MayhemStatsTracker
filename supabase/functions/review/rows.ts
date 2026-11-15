// How a quarantined game becomes stats rows, apart from the Deno server so it
// can be tested.

// Quarantine payloads stored before the year-based switch may carry client
// build versions ("16.16"); stats tables store Riot's patch names ("26.16").
export function toYearPatch(patch: string): string {
  const m = String(patch).match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
}

// One quarantined game's payload, flattened into the rows the stats tables
// take. Throws on a payload too malformed to insert, so a bad row fails alone
// rather than taking its whole batch with it.
export function rowsFor(row: any) {
  const g = row.payload;
  if (!g || !Array.isArray(g.participants) || g.participants.length === 0) {
    throw new Error("payload has no participants");
  }
  const version = toYearPatch(g.gameVersion);
  const participants: any[] = [];
  const augments: any[] = [];
  for (const p of g.participants) {
    const items = p.items ?? [];
    participants.push({
      platform: g.platform,
      game_id: g.gameId,
      participant_id: p.participantId,
      team_id: p.teamId,
      champion_id: p.championId,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      double_kills: p.doubleKills,
      triple_kills: p.tripleKills,
      quadra_kills: p.quadraKills,
      penta_kills: p.pentaKills,
      largest_killing_spree: p.largestKillingSpree,
      total_damage_dealt: p.totalDamageDealt,
      total_damage_taken: p.totalDamageTaken,
      gold_earned: p.goldEarned,
      total_heal: p.totalHeal,
      item0: items[0],
      item1: items[1],
      item2: items[2],
      item3: items[3],
      item4: items[4],
      item5: items[5],
      item6: items[6],
    });
    for (const a of p.augments ?? []) {
      augments.push({
        platform: g.platform,
        game_id: g.gameId,
        participant_id: p.participantId,
        slot: a.slot,
        augment_id: a.augmentId,
        champion_id: p.championId,
        win: p.win,
      });
    }
  }
  return {
    match: {
      platform: g.platform,
      game_id: g.gameId,
      queue_id: g.queueId,
      game_version: version,
      game_duration: g.gameDuration,
      game_creation: g.gameCreation,
    },
    participants,
    augments,
    contribution: {
      contributor_token: row.contributor_token,
      platform: g.platform,
      game_id: g.gameId,
    },
    patch: version,
  };
}
