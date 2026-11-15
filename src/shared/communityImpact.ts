// The community page's numbers, read the same way by the site and the app.
import { fetchAllRows } from "./supabase.ts";

export interface CommunityTotals {
  games: number;
  contributors: number;
  total_seconds: number;
  patches: number;
  first_game_ms: number | null;
  last_game_ms: number | null;
}

export interface GamesPerDayRow {
  day: string;
  games: number;
}

// When each patch was first and last seen in a contributed game. Riot
// publishes no patch-date endpoint, so these are observed boundaries: the
// first game someone played on a version, which trails the actual deploy.
export interface PatchSpanRow {
  patch: string;
  first_seen: string;
  last_seen: string;
  games: number;
}

export async function fetchCommunityTotals(): Promise<CommunityTotals> {
  const rows = await fetchAllRows<CommunityTotals>("community_totals");
  return (
    rows[0] ?? {
      games: 0,
      contributors: 0,
      total_seconds: 0,
      patches: 0,
      first_game_ms: null,
      last_game_ms: null,
    }
  );
}

export function fetchGamesPerDay(): Promise<GamesPerDayRow[]> {
  return fetchAllRows<GamesPerDayRow>("community_games_per_day", "select=*&order=day");
}

// Patch markers decorate the games chart; the chart is fine without them, so
// a missing view or any other failure yields no markers rather than taking
// the whole page down with an error.
export async function fetchPatchSpans(): Promise<PatchSpanRow[]> {
  try {
    return await fetchAllRows<PatchSpanRow>("community_patch_spans", "select=*&order=patch");
  } catch {
    return [];
  }
}

// How many distinct champion-vs-champion matchups the database has seen, and
// how many champions have appeared - the denominator (every unordered pair,
// mirror matchups included) is derived from the second.
export interface MatchupCoverage {
  matchups: number;
  champions: number;
}

// What the database gained in the last 30 days. Optional garnish on the
// stat tiles: a missing view yields no deltas rather than an error.
export interface CommunityGrowth {
  new_contributors_30d: number;
  new_games_30d: number;
  new_seconds_30d: number;
}

export async function fetchCommunityGrowth(): Promise<CommunityGrowth | null> {
  try {
    const rows = await fetchAllRows<CommunityGrowth>("community_growth");
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchMedianGamesPerContributor(): Promise<number | null> {
  try {
    const rows = await fetchAllRows<{ median_games_per_contributor: number }>("community_medians");
    return rows[0]?.median_games_per_contributor ?? null;
  } catch {
    return null;
  }
}

export async function fetchMatchupCoverage(): Promise<MatchupCoverage | null> {
  try {
    const rows = await fetchAllRows<MatchupCoverage>("matchup_coverage");
    return rows[0] ?? null;
  } catch {
    // The tile falls back to a dash rather than taking the page down with it
    return null;
  }
}

export interface CommunityImpactData {
  totals: CommunityTotals;
  perDay: GamesPerDayRow[];
  spans: PatchSpanRow[];
  coverage: MatchupCoverage | null;
  growth: CommunityGrowth | null;
  medianPerContributor: number | null;
}

export async function loadCommunityImpact(): Promise<CommunityImpactData> {
  const [totals, perDay, spans, coverage, growth, medianPerContributor] = await Promise.all([
    fetchCommunityTotals(),
    fetchGamesPerDay(),
    fetchPatchSpans(),
    fetchMatchupCoverage(),
    fetchCommunityGrowth(),
    fetchMedianGamesPerContributor(),
  ]);
  return { totals, perDay, spans, coverage, growth, medianPerContributor };
}
