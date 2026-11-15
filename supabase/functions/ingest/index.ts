// Anonymous community match ingest for Mayhem Tracker.
//
// Accepts batches of games from the desktop app's opt-in upload. Payloads
// contain no player identity (no puuids, names, tags, or icons) and none is
// accepted: every field is schema-validated and unknown fields are dropped by
// construction. Games are deduplicated on (platform, game_id) so two players
// from the same lobby can both contribute without double-counting.
//
// Integrity model: structural impossibilities (wrong team counts, multikill
// hierarchy violations, pre-Mayhem dates) are hard-rejected. Games that are
// structurally valid but exceed duration-scaled plausibility ceilings are
// QUARANTINED for manual review instead of rejected: they're stored in the
// quarantine table, excluded from stats, and surfaced in a batched digest
// email (at most one every 6 hours) linking to the review queue. The uploader
// sees them as accepted so legitimate outlier games aren't retried or
// punished. Rate shaping: a first-sync burst allowance followed by a
// humanly-playable steady-state daily cap.
//
// Participants may carry optional itemEvents (build order captured live by
// the app): bounded lists of timestamped item add/remove rows feeding the
// item_purchase_stats view. Duplicate uploads of the same game collide on
// the (platform, game_id, participant_id, seq) key and are ignored.
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  MAX_GAMES_PER_REQUEST,
  BURST_LIFETIME,
  MAX_GAMES_PER_DAY_STEADY,
  MAX_PENDING_QUARANTINE,
  UUID_RE,
  toYearPatch,
  isInt,
  validateStructural,
  plausibilityFlags,
  sanitizeGame,
} from "./validate.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const token = body?.token;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return json({ error: "invalid contributor token" }, 400);
  }
  const games = body?.games;
  if (!Array.isArray(games) || games.length === 0) return json({ error: "no games" }, 400);
  if (games.length > MAX_GAMES_PER_REQUEST) {
    return json({ error: `max ${MAX_GAMES_PER_REQUEST} games per request` }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const accepted: number[] = [];
  const quarantined: number[] = [];
  const rejected: { gameId: number | null; reason: string }[] = [];
  const matchRows: any[] = [];
  const partRows: any[] = [];
  const augRows: any[] = [];
  const itemEventRows: any[] = [];
  const contribRows: any[] = [];
  const quarantineRows: any[] = [];
  const seen = new Set<string>();

  for (const g of games) {
    const reason = validateStructural(g);
    if (reason) {
      rejected.push({ gameId: isInt(g?.gameId, 1, 1e15) ? g.gameId : null, reason });
      continue;
    }
    // Store year-based patch names regardless of the client version the
    // uploader runs
    g.gameVersion = toYearPatch(g.gameVersion);
    const key = `${g.platform}:${g.gameId}`;
    if (seen.has(key)) {
      rejected.push({ gameId: g.gameId, reason: "duplicate in request" });
      continue;
    }
    seen.add(key);

    const flags = plausibilityFlags(g);
    if (flags.length > 0) {
      quarantineRows.push({
        platform: g.platform,
        game_id: g.gameId,
        payload: sanitizeGame(g),
        reasons: flags,
      });
      // Reported as accepted so the uploader marks it done and doesn't retry;
      // it only enters the stats tables if approved in review.
      accepted.push(g.gameId);
      quarantined.push(g.gameId);
      continue;
    }

    matchRows.push({
      platform: g.platform,
      game_id: g.gameId,
      queue_id: g.queueId,
      game_version: g.gameVersion,
      game_duration: g.gameDuration,
      game_creation: g.gameCreation,
    });
    for (const p of g.participants) {
      partRows.push({
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
        item0: p.items[0],
        item1: p.items[1],
        item2: p.items[2],
        item3: p.items[3],
        item4: p.items[4],
        item5: p.items[5],
        item6: p.items[6],
      });
      for (const a of p.augments) {
        augRows.push({
          platform: g.platform,
          game_id: g.gameId,
          participant_id: p.participantId,
          slot: a.slot,
          augment_id: a.augmentId,
          champion_id: p.championId,
          win: p.win,
        });
      }
      if (Array.isArray(p.itemEvents)) {
        p.itemEvents.forEach((e: any, i: number) => {
          itemEventRows.push({
            platform: g.platform,
            game_id: g.gameId,
            participant_id: p.participantId,
            seq: i,
            game_time: e.gameTime,
            action: e.action,
            item_id: e.itemId,
            count: e.count,
          });
        });
      }
    }
    contribRows.push({ platform: g.platform, game_id: g.gameId });
    accepted.push(g.gameId);
  }

  // One transaction for the whole batch.
  //
  // This used to be five sequential upserts with nothing around them, plus
  // three count(*) queries beforehand for the rate limit. A failure after the
  // first upsert left a match with no participants: counted in every total,
  // contributing nothing, and never retried, because the client had already
  // been told it was accepted. ingest_games() commits all five together and
  // maintains the rate-limit counters in the same transaction, so they cannot
  // drift from what was actually written.
  const { data, error } = await supabase.rpc("ingest_games", {
    p_token: token,
    p_payload: {
      matches: matchRows,
      participants: partRows,
      augments: augRows,
      item_events: itemEventRows,
      contributions: contribRows,
      quarantine: quarantineRows,
    },
    p_burst_lifetime: BURST_LIFETIME,
    p_daily_steady: MAX_GAMES_PER_DAY_STEADY,
    p_max_pending_quarantine: MAX_PENDING_QUARANTINE,
  });

  if (error) return json({ error: "storing games failed" }, 500);
  if (data?.rate_limited) return json({ error: data.error }, 429);

  // Games past the quarantine flood cap were not stored, so they must not be
  // reported accepted: the client would mark them done and never send them
  // again. Told to retry later instead, once the queue has been reviewed.
  const deferred: number[] = Array.isArray(data?.deferred) ? data.deferred.map(Number) : [];
  if (deferred.length > 0) {
    const deferredSet = new Set(deferred);
    for (const id of deferred) {
      rejected.push({ gameId: id, reason: "too many games pending review" });
    }
    return json({
      accepted: accepted.filter((id) => !deferredSet.has(id)),
      rejected,
      quarantined: quarantined.filter((id) => !deferredSet.has(id)),
    });
  }

  return json({ accepted, rejected, quarantined });
});
