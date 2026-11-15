// One patch's rows boiled down to the figures the Compare board joins on,
// for a host that holds raw rollup rows (the desktop app's main process).
import type { Side } from "./compare.ts";
import { MAYHEM_QUEUE_IDS } from "./queues.ts";

interface Counts {
  patch: string;
  queue_id: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

// `queue` undefined means every Mayhem queue, the same reading the tier lists
// use. Rows of one id across queues are summed into one side.
export function sidesFor<T extends Counts>(
  rows: T[],
  patch: string,
  queue: number | undefined,
  idOf: (row: T) => number,
  gamesOf: (row: T) => number,
): Side[] {
  const byId = new Map<number, Side>();
  for (const r of rows) {
    if (r.patch !== patch) continue;
    if (queue == null ? !MAYHEM_QUEUE_IDS.includes(r.queue_id) : r.queue_id !== queue) continue;
    const id = idOf(r);
    let s = byId.get(id);
    if (!s)
      byId.set(id, (s = { id, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, damage: 0 }));
    s.games += gamesOf(r);
    s.wins += r.wins;
    s.kills += r.kills;
    s.deaths += r.deaths;
    s.assists += r.assists;
    s.damage += r.damage;
  }
  return [...byId.values()];
}
