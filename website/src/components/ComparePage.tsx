import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentTotals,
  fetchChampionStats,
  type AugmentTotalRow,
  type ChampionStatRow,
} from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import { aggregateAugments, aggregateChampions, formatPatch, MIN_SAMPLE, score } from "../lib/stats";
import AugmentIcon from "../../../src/shared/ui/AugmentIcon.tsx";
import ChampionIcon from "../../../src/shared/ui/ChampionIcon.tsx";
import SearchField from "../../../src/shared/ui/SearchField.tsx";
import { PANEL } from "../../../src/shared/ui/primitives.tsx";
import { useSort } from "../../../src/shared/ui/SortHeader.tsx";
import StatBoard, {
  SortControl,
  sortOptions,
  sortRows,
  type BoardColumn,
} from "../../../src/shared/ui/StatBoard.tsx";

type View = "champions" | "augments";
type SortKey = "name" | "dWin" | "dPick" | "dScore" | "winTo" | "games";

interface Row {
  id: number;
  gamesFrom: number;
  gamesTo: number;
  winFrom: number;
  winTo: number;
  pickFrom: number;
  pickTo: number;
  scoreFrom: number;
  scoreTo: number;
}

interface Side {
  id: number;
  games: number;
  wins: number;
}

// Both sides' rows joined on id. Anything under the sample floor on either
// side is dropped: a swing between 3 games and 5 games is noise, not a trend.
function join(from: Side[], to: Side[]): Row[] {
  const slotsFrom = from.reduce((n, r) => n + r.games, 0);
  const slotsTo = to.reduce((n, r) => n + r.games, 0);
  const before = new Map(from.map((r) => [r.id, r]));
  const rows: Row[] = [];
  for (const t of to) {
    const f = before.get(t.id);
    if (!f || f.games < MIN_SAMPLE || t.games < MIN_SAMPLE) continue;
    rows.push({
      id: t.id,
      gamesFrom: f.games,
      gamesTo: t.games,
      winFrom: (f.wins / f.games) * 100,
      winTo: (t.wins / t.games) * 100,
      pickFrom: slotsFrom > 0 ? (f.games / slotsFrom) * 100 : 0,
      pickTo: slotsTo > 0 ? (t.games / slotsTo) * 100 : 0,
      scoreFrom: score(f.wins, f.games),
      scoreTo: score(t.wins, t.games),
    });
  }
  return rows;
}

function Delta({ value, unit }: { value: number; unit: string }) {
  const rounded = Math.round(value * 10) / 10;
  const tone =
    rounded > 0 ? "text-lol-win" : rounded < 0 ? "text-lol-loss" : "text-lol-text";
  return (
    <span className={`font-semibold ${tone}`}>
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(1)}
      {unit}
    </span>
  );
}

const range = (a: number, b: number) => (
  <span className="text-lol-text">
    {a.toFixed(1)}% <span className="text-lol-text/50">to</span> {b.toFixed(1)}%
  </span>
);

// How a patch compares to an earlier one: win rate, pick rate and score, per
// champion or per augment. Rows come from the same rollups as the tier lists,
// fetched here for just the two patches so the tab works for any pair, not
// only the ones the tier list already holds.
export default function ComparePage({
  patches,
  from,
  to,
  view,
  queue,
  championData,
  augmentData,
  onChange,
}: {
  patches: string[];
  from: string;
  to: string;
  view: View;
  queue: number | undefined;
  championData: ChampionData;
  augmentData: AugmentData;
  onChange: (key: "from" | "to" | "view", value: string) => void;
}) {
  const [rows, setRows] = useState<{
    key: string;
    champions: ChampionStatRow[];
    augments: AugmentTotalRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { sort, toggle } = useSort<SortKey>("dWin");

  const key = `${from}|${to}`;
  useEffect(() => {
    let active = true;
    setError(null);
    const pair = [...new Set([from, to])];
    Promise.all([fetchChampionStats(pair), fetchAugmentTotals(pair)])
      .then(([champions, augments]) => {
        if (active) setRows({ key, champions, augments });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [from, to, key]);

  const ready = rows?.key === key ? rows : null;

  const joined = useMemo(() => {
    if (!ready) return [];
    const side = (p: string) => ({ patches: new Set([p]), queue });
    if (view === "champions") {
      const mk = (p: string): Side[] =>
        aggregateChampions(ready.champions, side(p)).map((c) => ({
          id: c.champion_id,
          games: c.games,
          wins: c.wins,
        }));
      return join(mk(from), mk(to));
    }
    const mk = (p: string): Side[] =>
      aggregateAugments(ready.augments, side(p)).map((a) => ({
        id: a.augment_id,
        games: a.picks,
        wins: a.wins,
      }));
    return join(mk(from), mk(to));
  }, [ready, view, from, to, queue]);

  const name = (id: number) =>
    view === "champions" ? getChampionName(championData, id) : getAugmentName(augmentData, id);

  const columns = useMemo<BoardColumn<Row, SortKey>[]>(
    () => [
      { key: null, label: "#", area: "rank", width: "w-10", cellClass: "text-xs text-lol-text", render: (_r, i) => i + 1 },
      {
        key: "name",
        label: view === "champions" ? "Champion" : "Augment",
        naturalDir: "asc",
        area: "name",
        sortValue: (r) => name(r.id),
        render: (r) =>
          view === "champions" ? (
            <div className="flex items-center gap-2.5">
              <ChampionIcon championId={r.id} size={28} />
              <span className="text-[13px] text-lol-text-bright whitespace-nowrap">{name(r.id)}</span>
            </div>
          ) : (
            <AugmentIcon augmentId={r.id} size={26} showName />
          ),
      },
      {
        key: "dWin",
        label: "Δ Win rate",
        area: "score",
        width: "w-[130px]",
        sortValue: (r) => r.winTo - r.winFrom,
        render: (r) => <Delta value={r.winTo - r.winFrom} unit=" pp" />,
      },
      {
        key: "winTo",
        label: "Win rate",
        width: "w-[170px]",
        cellClass: "text-[13px]",
        sortValue: (r) => r.winTo,
        render: (r) => range(r.winFrom, r.winTo),
      },
      {
        key: "dPick",
        label: "Δ Pick rate",
        width: "w-[130px]",
        cellClass: "text-[13px]",
        sortValue: (r) => r.pickTo - r.pickFrom,
        render: (r) => <Delta value={r.pickTo - r.pickFrom} unit=" pp" />,
      },
      {
        key: "dScore",
        label: "Δ Score",
        width: "w-[120px]",
        cellClass: "text-[13px]",
        sortValue: (r) => r.scoreTo - r.scoreFrom,
        render: (r) => <Delta value={r.scoreTo - r.scoreFrom} unit="" />,
      },
      {
        key: "games",
        label: view === "champions" ? "Games" : "Picks",
        width: "w-[130px]",
        cellClass: "text-[13px] text-lol-text",
        sortValue: (r) => r.gamesTo,
        render: (r) => `${r.gamesFrom.toLocaleString()} to ${r.gamesTo.toLocaleString()}`,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, championData, augmentData],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? joined.filter((r) => name(r.id).toLowerCase().includes(q)) : joined;
    return sortRows(list, columns, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, search, sort, columns]);

  const patchSelect = (which: "from" | "to", value: string) => (
    <select
      className="select select-sm"
      value={value}
      onChange={(e) => onChange(which, e.target.value)}
      aria-label={which === "from" ? "Compare from patch" : "Compare to patch"}
    >
      {patches.map((p) => (
        <option key={p} value={p}>
          {formatPatch(p)}
        </option>
      ))}
    </select>
  );

  const tab = (v: View, label: string) => (
    <button
      onClick={() => onChange("view", v)}
      className={`px-3 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${
        view === v
          ? "bg-lol-gold/20 text-lol-gold-light"
          : "text-lol-text hover:text-lol-gold-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
        <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">Patch comparison</h1>
        <span className="text-xs">
          {formatPatch(from)} to {formatPatch(to)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-lol-border/60 bg-lol-card p-0.5">
          {tab("champions", "Champions")}
          {tab("augments", "Augments")}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span>From</span>
          {patchSelect("from", from)}
          <span>to</span>
          {patchSelect("to", to)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SortControl options={sortOptions(columns)} sort={sort} onSort={toggle} />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={view === "champions" ? "Search champion..." : "Search augment..."}
            width={192}
          />
        </div>
      </div>

      {error && (
        <div className={`${PANEL} p-8 text-center text-sm text-lol-loss`}>
          Couldn't load these patches: {error}
        </div>
      )}
      {!error && !ready && (
        <div className="text-center text-lol-text py-20">Loading patches...</div>
      )}
      {!error && ready && (
        <StatBoard
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          sort={sort}
          onSort={toggle}
          minWidth={900}
          empty={
            from === to
              ? "Pick two different patches to compare."
              : `Nothing has ${MIN_SAMPLE}+ games on both patches yet.`
          }
          footnote={
            <>
              Changes are {formatPatch(to)} minus {formatPatch(from)}, in percentage points (pp).
              Only {view === "champions" ? "champions" : "augments"} with at least {MIN_SAMPLE}{" "}
              {view === "champions" ? "games" : "picks"} on both patches are shown, since smaller
              samples swing on luck. Score change is the shift in the confidence-floored score used
              by the tier lists.
            </>
          }
        />
      )}
    </div>
  );
}
