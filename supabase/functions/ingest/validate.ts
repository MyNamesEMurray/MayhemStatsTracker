// The ingest function's checks, apart from the Deno server so they can be
// tested. validateStructural hard-rejects games no real match could produce,
// plausibilityFlags marks ones that merit a human look, and sanitizeGame keeps
// only the fields the schema allows.

export const MAYHEM_QUEUES = [2400, 2450];
export const MAX_GAMES_PER_REQUEST = 50;
// A token's first ~800 games flow freely (initial history backfill); after
// that it is capped at a humanly-playable daily volume.
export const BURST_LIFETIME = 800;
export const MAX_GAMES_PER_DAY_STEADY = 60;
// Cap on unreviewed quarantined games per token - bounds both digest email
// size and quarantine-flooding abuse.
export const MAX_PENDING_QUARANTINE = 25;
// ARAM Mayhem didn't exist before 2025 - nothing older can be real
export const MIN_GAME_CREATION = 1735689600000;
// Build-order bounds: no real participant buys/sells this much
export const MAX_ITEM_EVENTS_PER_PARTICIPANT = 120;
export const MAX_ITEM_EVENTS_PER_GAME = 800;

// Per-second ceilings for the plausibility check, set from the distribution
// they're meant to sit above rather than from what ARAM looks like. Mayhem's
// augments routinely multiply tanking, sustain and burst several times over,
// and the first limits here were tuned before there was data to tune against:
// they flagged 0.53% of games - one in every two hundred - which is a queue
// nobody works, not an exception report.
//
// Measured over 136k games / 1.37M participants, per second of game time:
//
//                    p99    p99.9   p99.99   ceiling
//   damage taken     112     176      267      400
//   damage dealt      87     128      192      300
//   healing           48      86      148      300
//   gold (over 3000)  17      20       24       45
//
// That's 27 games flagged out of 136k (0.02%). A fabricated game has to stay
// inside the top hundredth of a percent of real values to pass, and the
// structural checks below - 5v5, one winner, multikill hierarchy, spree
// within kills - are what actually make fabrication hard.
export const MAX_DAMAGE_TAKEN_PER_S = 400;
export const MAX_DAMAGE_DEALT_PER_S = 300;
export const MAX_HEAL_PER_S = 300;
export const GOLD_BASE = 3000;
export const MAX_GOLD_PER_S = 45;
// Seconds per kill/death at the ceiling. Kills was one per 15s, and the
// busiest real game measured came within 5% of tripping it.
export const MIN_SECONDS_PER_KILL = 12;
export const MIN_SECONDS_PER_DEATH = 15;
export const MIN_SECONDS_PER_ASSIST = 6;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PLATFORM_RE = /^[A-Z0-9]{2,8}$/;
export const PATCH_RE = /^\d{1,3}\.\d{1,3}$/;

// Uploads may carry client build versions ("16.16"); we store Riot's
// year-based patch names ("26.16"). Client majors stay below 25 until 2035,
// so the shift is idempotent.
export function toYearPatch(patch: string): string {
  const m = patch.match(/^(\d+)\.(.+)$/);
  if (!m) return patch;
  const major = Number(m[1]);
  return major >= 15 && major < 25 ? `${major + 10}.${m[2]}` : patch;
}

export const COUNT_FIELDS = [
  "kills",
  "deaths",
  "assists",
  "doubleKills",
  "tripleKills",
  "quadraKills",
  "pentaKills",
  "largestKillingSpree",
] as const;
export const TOTAL_FIELDS = [
  "totalDamageDealt",
  "totalDamageTaken",
  "goldEarned",
  "totalHeal",
] as const;

export function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// Structural validation: shapes and invariants no real game can violate.
// A non-null return is a hard rejection.
export function validateStructural(g: any): string | null {
  if (!g || typeof g !== "object") return "not an object";
  if (typeof g.platform !== "string" || !PLATFORM_RE.test(g.platform)) return "bad platform";
  if (!isInt(g.gameId, 1, 1e15)) return "bad gameId";
  if (!MAYHEM_QUEUES.includes(g.queueId)) return "not a Mayhem queue";
  if (typeof g.gameVersion !== "string" || !PATCH_RE.test(g.gameVersion)) return "bad gameVersion";
  if (!isInt(g.gameDuration, 300, 7200)) return "bad gameDuration";
  if (!isInt(g.gameCreation, MIN_GAME_CREATION, Date.now() + 3_600_000)) return "bad gameCreation";

  const ps = g.participants;
  if (!Array.isArray(ps) || ps.length !== 10) return "must have exactly 10 participants";
  const ids = new Set<number>();
  const teamWin = new Map<number, boolean>();
  const teamCount = new Map<number, number>();
  let totalItemEvents = 0;
  for (const p of ps) {
    if (!p || typeof p !== "object") return "bad participant";
    if (!isInt(p.participantId, 1, 10) || ids.has(p.participantId)) return "bad participantId";
    ids.add(p.participantId);
    if (p.teamId !== 100 && p.teamId !== 200) return "bad teamId";
    if (!isInt(p.championId, 1, 5000)) return "bad championId";
    if (typeof p.win !== "boolean") return "bad win";
    for (const f of COUNT_FIELDS) {
      if (!isInt(p[f], 0, 500)) return `bad ${f}`;
    }
    for (const f of TOTAL_FIELDS) {
      if (!isInt(p[f], 0, 10_000_000)) return `bad ${f}`;
    }
    // Multikill thresholds are cumulative: every triple was also a double, etc.
    if (p.tripleKills > p.doubleKills) return "multikill hierarchy violated";
    if (p.quadraKills > p.tripleKills) return "multikill hierarchy violated";
    if (p.pentaKills > p.quadraKills) return "multikill hierarchy violated";
    if (p.doubleKills > p.kills) return "more multikills than kills";
    if (p.largestKillingSpree > p.kills) return "spree exceeds kills";
    if (!Array.isArray(p.items) || p.items.length !== 7) return "bad items";
    for (const it of p.items) {
      if (it !== null && !isInt(it, 0, 1_000_000)) return "bad item id";
    }
    if (!Array.isArray(p.augments) || p.augments.length > 6) return "bad augments";
    const slots = new Set<number>();
    for (const a of p.augments) {
      if (!a || typeof a !== "object") return "bad augment";
      if (!isInt(a.slot, 1, 6) || slots.has(a.slot)) return "bad augment slot";
      slots.add(a.slot);
      if (!isInt(a.augmentId, 1, 1_000_000)) return "bad augmentId";
    }
    if (p.itemEvents !== undefined) {
      if (!Array.isArray(p.itemEvents) || p.itemEvents.length > MAX_ITEM_EVENTS_PER_PARTICIPANT) {
        return "bad itemEvents";
      }
      totalItemEvents += p.itemEvents.length;
      for (const e of p.itemEvents) {
        if (!e || typeof e !== "object") return "bad item event";
        if (!isInt(e.gameTime, 0, g.gameDuration + 120)) return "bad item event time";
        if (e.action !== "add" && e.action !== "remove") return "bad item event action";
        if (!isInt(e.itemId, 1, 1_000_000)) return "bad item event id";
        if (!isInt(e.count, 1, 10)) return "bad item event count";
      }
    }
    if (teamWin.has(p.teamId) && teamWin.get(p.teamId) !== p.win) return "inconsistent team win";
    teamWin.set(p.teamId, p.win);
    teamCount.set(p.teamId, (teamCount.get(p.teamId) ?? 0) + 1);
  }
  if (totalItemEvents > MAX_ITEM_EVENTS_PER_GAME) return "too many item events";
  if (teamCount.get(100) !== 5 || teamCount.get(200) !== 5) return "teams must be 5v5";
  if (teamWin.get(100) === teamWin.get(200)) return "exactly one team must win";
  return null;
}

// Plausibility checks: duration-scaled ceilings real games essentially never
// exceed - but an extraordinary real game could. Flags quarantine the game
// for manual review instead of rejecting it.
export function plausibilityFlags(g: any): string[] {
  const dur = g.gameDuration;
  const flags: string[] = [];
  for (const p of g.participants) {
    const who = `p${p.participantId} (champ ${p.championId})`;
    if (p.kills > Math.ceil(dur / MIN_SECONDS_PER_KILL)) {
      flags.push(`${who}: ${p.kills} kills in ${dur}s`);
    }
    if (p.deaths > Math.ceil(dur / MIN_SECONDS_PER_DEATH)) {
      flags.push(`${who}: ${p.deaths} deaths in ${dur}s`);
    }
    if (p.assists > Math.ceil(dur / MIN_SECONDS_PER_ASSIST)) {
      flags.push(`${who}: ${p.assists} assists in ${dur}s`);
    }
    if (p.totalDamageDealt > dur * MAX_DAMAGE_DEALT_PER_S) {
      flags.push(`${who}: ${p.totalDamageDealt} damage dealt in ${dur}s`);
    }
    if (p.totalDamageTaken > dur * MAX_DAMAGE_TAKEN_PER_S) {
      flags.push(`${who}: ${p.totalDamageTaken} damage taken in ${dur}s`);
    }
    if (p.totalHeal > dur * MAX_HEAL_PER_S) {
      flags.push(`${who}: ${p.totalHeal} healing in ${dur}s`);
    }
    if (p.goldEarned > GOLD_BASE + dur * MAX_GOLD_PER_S) {
      flags.push(`${who}: ${p.goldEarned} gold in ${dur}s`);
    }
  }
  return flags;
}

// Rebuild the game from known fields only, so the stored quarantine payload
// can't carry anything the schema doesn't define. Item events are dropped
// here - a quarantined game approved later keeps its core stats only.
export function sanitizeGame(g: any) {
  return {
    platform: g.platform,
    gameId: g.gameId,
    queueId: g.queueId,
    gameVersion: g.gameVersion,
    gameDuration: g.gameDuration,
    gameCreation: g.gameCreation,
    participants: g.participants.map((p: any) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      championId: p.championId,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      doubleKills: p.doubleKills,
      tripleKills: p.tripleKills,
      quadraKills: p.quadraKills,
      pentaKills: p.pentaKills,
      largestKillingSpree: p.largestKillingSpree,
      totalDamageDealt: p.totalDamageDealt,
      totalDamageTaken: p.totalDamageTaken,
      goldEarned: p.goldEarned,
      totalHeal: p.totalHeal,
      items: p.items.map((it: any) => (it === null ? null : it)),
      augments: p.augments.map((a: any) => ({ slot: a.slot, augmentId: a.augmentId })),
    })),
  };
}
