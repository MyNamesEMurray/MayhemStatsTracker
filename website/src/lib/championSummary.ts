// The numbers behind the prerendered champion pages, kept out of the build
// script so they can be tested. The script writes them into text that search
// engines index, so a wrong figure there is a wrong figure on Google.
import { score, scoreCeiling } from "../../../src/shared/score.ts";

// A champion page is only indexed once the win rate on it carries a readable
// confidence interval. Twenty games is the floor the app uses to stop muting
// win rates (MIN_SAMPLE in src/shared/score.ts).
export const INDEX_MIN_GAMES = 20;

export function isIndexable(games: number): boolean {
  return games >= INDEX_MIN_GAMES;
}

// The same share the board's Pick rate column shows: a champion's player slots
// over every slot, in percent. Not "matches it appears in", which is ten times
// larger and would disagree with the live page.
export function pickRatePct(games: number, totalSlots: number): number {
  return totalSlots > 0 ? (games / totalSlots) * 100 : 0;
}

// The 95% Wilson range for a win rate, in percent and always inside 0-100,
// which the site's Score is built on. A normal-approximation margin reads
// "85.4-104.6%" for 19 wins in 20.
export function winRateRange(wins: number, games: number): { low: number; high: number } {
  return { low: score(wins, games), high: scoreCeiling(wins, games) };
}

// "18% above" / "in line with" / "12% below", for comparing a champion's
// per-game averages against the whole database
export function relative(value: number, base: number): string {
  if (!base) return "in line with the mode average";
  const diff = ((value - base) / base) * 100;
  if (Math.abs(diff) < 8) return "in line with the mode average";
  return `${Math.round(Math.abs(diff))}% ${diff > 0 ? "above" : "below"} the mode average`;
}

interface CountRow {
  picks?: number;
  games?: number;
  wins: number;
  [field: string]: unknown;
}

// Sum rows that share a key (an item id, an augment id) into one entry each
export function aggregate(
  rows: (CountRow & Record<string, number>)[],
  keyField: string,
  extra: string[] = [],
): { key: number; picks: number; wins: number; [field: string]: number }[] {
  const map = new Map<number, { key: number; picks: number; wins: number; [f: string]: number }>();
  for (const r of rows) {
    let e = map.get(r[keyField]);
    if (!e) {
      e = { key: r[keyField], picks: 0, wins: 0 };
      for (const f of extra) e[f] = 0;
      map.set(r[keyField], e);
    }
    e.picks += r.picks ?? r.games ?? 0;
    e.wins += r.wins;
    for (const f of extra) e[f] += (r[f] as number | undefined) ?? 0;
  }
  return Array.from(map.values());
}
