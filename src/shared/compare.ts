// The maths and bookkeeping behind the Compare tab, kept out of the component
// so it can be tested on its own.
import { kdaRatio } from "./format.ts";
import { score } from "./score.ts";
import { comparePatches } from "./patch.ts";

export interface Row {
  id: number;
  // Place in the sorted, filtered list, pinned rows included; undefined when
  // the current filters leave the row out
  rank?: number;
  gamesFrom: number;
  gamesTo: number;
  winFrom: number;
  winTo: number;
  pickFrom: number;
  pickTo: number;
  scoreFrom: number;
  scoreTo: number;
  kdaFrom: number;
  kdaTo: number;
  dmgFrom: number;
  dmgTo: number;
  // Two-proportion z of the win rate change. |z| >= 1.96 is the usual 95% bar.
  z: number;
}

export interface Side {
  id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

// Both sides' rows joined on id. Anything under the sample floor on either
// side is dropped: a swing between 3 games and 5 games is noise, not a trend.
export function join(from: Side[], to: Side[], floor: number): Row[] {
  const slotsFrom = from.reduce((n, r) => n + r.games, 0);
  const slotsTo = to.reduce((n, r) => n + r.games, 0);
  const before = new Map(from.map((r) => [r.id, r]));
  const rows: Row[] = [];
  for (const t of to) {
    const f = before.get(t.id);
    if (!f || f.games < floor || t.games < floor) continue;
    const pooled = (f.wins + t.wins) / (f.games + t.games);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / f.games + 1 / t.games));
    rows.push({
      z: se > 0 ? (t.wins / t.games - f.wins / f.games) / se : 0,
      id: t.id,
      gamesFrom: f.games,
      gamesTo: t.games,
      winFrom: (f.wins / f.games) * 100,
      winTo: (t.wins / t.games) * 100,
      pickFrom: slotsFrom > 0 ? (f.games / slotsFrom) * 100 : 0,
      pickTo: slotsTo > 0 ? (t.games / slotsTo) * 100 : 0,
      scoreFrom: score(f.wins, f.games),
      scoreTo: score(t.wins, t.games),
      kdaFrom: kdaRatio(f.kills, f.deaths, f.assists),
      kdaTo: kdaRatio(t.kills, t.deaths, t.assists),
      dmgFrom: f.damage / f.games,
      dmgTo: t.damage / t.games,
    });
  }
  return rows;
}

// About 95% and about 80% sure the win rate change is not luck
export const Z_HIGH = 1.96;
export const Z_MEDIUM = 1.28;

export function confidence(z: number): "High" | "Medium" | "Low" {
  const a = Math.abs(z);
  return a >= Z_HIGH ? "High" : a >= Z_MEDIUM ? "Medium" : "Low";
}

// The ?pin= parameter: ids in the order they were pinned. Anything that is not
// a whole number is dropped, and so is a repeat, since a repeated id would draw
// the same row twice.
// At most MAX_PINS: every pinned row sits in the frozen header, and enough of
// them would make it taller than the screen, leaving the table out of reach.
export const MAX_PINS = 10;

export function parsePins(raw: string | null | undefined): number[] {
  const ids = (raw ?? "")
    .split(",")
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
  return [...new Set(ids)].slice(0, MAX_PINS);
}

// Rank every row the filters kept, pinned ones included, so a pinned row keeps
// its true place and the rows around it are not renumbered to hide it.
export function withRanks(sorted: Row[]): Row[] {
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

// Pinned rows leave the main list. They show whatever the filters say, with a
// rank only if they passed.
export function splitPinned(
  ranked: Row[],
  all: Row[],
  pins: number[],
): { shown: Row[]; pinnedRows: Row[] } {
  const shown = ranked.filter((r) => !pins.includes(r.id));
  const pinnedRows = pins
    .map((id) => ranked.find((r) => r.id === id) ?? all.find((r) => r.id === id))
    .filter((r): r is Row => r != null);
  return { shown, pinnedRows };
}

// The older patch first, whichever order they were handed in
export function normalizePair(a: string, b: string): [string, string] {
  return comparePatches(a, b) > 0 ? [b, a] : [a, b];
}

export interface CompareSides {
  // The pair these rows are for, so a slow response for an earlier pair is
  // never drawn under the current one
  from: string;
  to: string;
  champions: [Side[], Side[]];
  augments: [Side[], Side[]];
}
