import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentTotals,
  fetchChampionStats,
  type AugmentTotalRow,
  type ChampionStatRow,
} from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import {
  aggregateAugments,
  aggregateChampions,
  comparePatches,
  formatPatch,
  formatWhole,
  kdaRatio,
  MIN_SAMPLE,
  score,
} from "../lib/stats";
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
type SortKey =
  | "name"
  | "sig"
  | "dWin"
  | "dPick"
  | "dScore"
  | "winFrom"
  | "winTo"
  | "pickFrom"
  | "pickTo"
  | "gamesFrom"
  | "gamesTo"
  | "kdaFrom"
  | "kdaTo"
  | "dmgFrom"
  | "dmgTo";

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
  kdaFrom: number;
  kdaTo: number;
  dmgFrom: number;
  dmgTo: number;
  // Two-proportion z of the win rate change. |z| >= 1.96 is the usual 95% bar.
  z: number;
}

interface Side {
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
function join(from: Side[], to: Side[], floor: number): Row[] {
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

const Z_HIGH = 1.96;
const Z_MEDIUM = 1.28;

function Confidence({ z, note }: { z: number; note: string }) {
  const a = Math.abs(z);
  const [label, tone] =
    a >= Z_HIGH
      ? ["High", "text-lol-win"]
      : a >= Z_MEDIUM
        ? ["Medium", "text-lol-gold"]
        : ["Low", "text-lol-text/60"];
  return (
    <span
      className={`font-semibold ${tone}`}
      title={`${note}. Win rate change z = ${z.toFixed(2)}. High is about 95% sure it is not luck, Medium about 80%.`}
    >
      {label}
    </span>
  );
}

function Delta({ value, unit }: { value: number; unit: string }) {
  const rounded = Math.round(value * 100) / 100;
  const tone =
    rounded > 0
      ? "text-lol-win"
      : rounded < 0
        ? "text-lol-loss"
        : "text-lol-text";
  return (
    <span className={`font-semibold whitespace-nowrap ${tone}`}>
      {rounded > 0 ? "+" : ""}
      {rounded.toFixed(2)}
      {unit}
    </span>
  );
}

// How a patch compares to an earlier one: win rate, pick rate and score, per
// champion or per augment. Rows come from the same rollups as the tier lists,
// fetched here for just the two patches so the tab works for any pair, not
// only the ones the tier list already holds.
export default function ComparePage({
  patches,
  from: fromParam,
  to: toParam,
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
  // The older patch is always the baseline on the left, even for a hand-edited
  // link, so a change never reads backwards
  const [from, to] =
    comparePatches(fromParam, toParam) > 0 ? [toParam, fromParam] : [fromParam, toParam];
  const [rows, setRows] = useState<{
    key: string;
    champions: ChampionStatRow[];
    augments: AugmentTotalRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sureOnly, setSureOnly] = useState(false);
  const [showThin, setShowThin] = useState(false);
  const floor = showThin ? 1 : MIN_SAMPLE;
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
    const none = { rows: [] as Row[], totalFrom: 0, totalTo: 0 };
    if (!ready) return none;
    const side = (p: string) => ({ patches: new Set([p]), queue });
    if (view === "champions") {
      const mk = (p: string): Side[] =>
        aggregateChampions(ready.champions, side(p)).map((c) => ({
          id: c.champion_id,
          games: c.games,
          wins: c.wins,
          kills: c.kills,
          deaths: c.deaths,
          assists: c.assists,
          damage: c.damage,
        }));
      const a = mk(from);
      const b = mk(to);
      // Champion rows count player slots; ten of them make a game
      const games = (x: Side[]) => Math.round(x.reduce((n, r) => n + r.games, 0) / 10);
      return { rows: join(a, b, floor), totalFrom: games(a), totalTo: games(b) };
    }
    const mk = (p: string): Side[] =>
      aggregateAugments(ready.augments, side(p)).map((a) => ({
        id: a.augment_id,
        games: a.picks,
        wins: a.wins,
        kills: a.kills,
        deaths: a.deaths,
        assists: a.assists,
        damage: a.damage,
      }));
    const a = mk(from);
    const b = mk(to);
    const picks = (x: Side[]) => x.reduce((n, r) => n + r.games, 0);
    return { rows: join(a, b, floor), totalFrom: picks(a), totalTo: picks(b) };
  }, [ready, view, from, to, queue, floor]);

  const name = (id: number) =>
    view === "champions"
      ? getChampionName(championData, id)
      : getAugmentName(augmentData, id);

  const columns = useMemo<BoardColumn<Row, SortKey>[]>(() => {
    const pf = formatPatch(from);
    const pt = formatPatch(to);
    // One stat becomes two columns, one per patch, so either can be sorted
    const pair = (
      base: string,
      label: string,
      width: string,
      value: (r: Row, which: "From" | "To") => number,
      show: (n: number) => string,
      inCard = false,
    ): BoardColumn<Row, SortKey>[] =>
      (["From", "To"] as const).map((which) => ({
        key: `${base}${which}` as SortKey,
        label: `${label} ${which === "From" ? pf : pt}`,
        width,
        // A card of fifteen figures is a wall; it keeps win rate and games
        area: inCard ? ("stat" as const) : ("none" as const),
        cellClass: "text-[13px] text-lol-text",
        sortValue: (r: Row) => value(r, which),
        render: (r: Row) => show(value(r, which)),
      }));
    const pct = (n: number) => `${n.toFixed(2)}%`;
    return [
      {
        key: null,
        label: "#",
        area: "rank",
        width: "w-10",
        cellClass: "text-xs text-lol-text",
        render: (_r, i) => i + 1,
      },
      {
        key: "name",
        label: view === "champions" ? "Champion" : "Augment",
        naturalDir: "asc",
        area: "name",
        width: "w-[150px]",
        sortValue: (r) => name(r.id),
        render: (r) =>
          view === "champions" ? (
            <div className="flex items-center gap-2.5">
              <ChampionIcon championId={r.id} size={28} />
              <span className="text-[13px] text-lol-text-bright whitespace-nowrap">
                {name(r.id)}
              </span>
            </div>
          ) : (
            <AugmentIcon augmentId={r.id} size={26} showName />
          ),
      },
      {
        key: "dWin",
        label: "Win chg",
        cardLabel: "Win chg",
        area: "score",
        width: "w-[100px]",
        sortValue: (r) => r.winTo - r.winFrom,
        render: (r) => <Delta value={r.winTo - r.winFrom} unit=" pp" />,
      },
      {
        key: "sig",
        label: "Confidence",
        shortLabel: "Conf.",
        cardLabel: "Confidence",
        width: "w-[105px]",
        cellClass: "text-[13px]",
        sortValue: (r) => Math.abs(r.z),
        render: (r) => (
          <Confidence
            z={r.z}
            note={`${r.gamesFrom.toLocaleString()} to ${r.gamesTo.toLocaleString()} ${view === "champions" ? "games" : "picks"}`}
          />
        ),
      },
      ...pair(
        "win",
        "Win",
        "w-[105px]",
        (r, w) => (w === "From" ? r.winFrom : r.winTo),
        pct,
        true,
      ),
      {
        key: "dPick",
        label: "Pick chg",
        cardLabel: "Pick chg",
        area: "none",
        width: "w-[100px]",
        cellClass: "text-[13px]",
        sortValue: (r) => r.pickTo - r.pickFrom,
        render: (r) => <Delta value={r.pickTo - r.pickFrom} unit=" pp" />,
      },
      ...pair(
        "pick",
        "Pick",
        "w-[110px]",
        (r, w) => (w === "From" ? r.pickFrom : r.pickTo),
        pct,
      ),
      {
        key: "dScore",
        label: "Score chg",
        cardLabel: "Score chg",
        area: "none",
        width: "w-[100px]",
        cellClass: "text-[13px]",
        sortValue: (r) => r.scoreTo - r.scoreFrom,
        render: (r) => <Delta value={r.scoreTo - r.scoreFrom} unit="" />,
      },
      ...pair(
        "kda",
        "KDA",
        "w-[105px]",
        (r, w) => (w === "From" ? r.kdaFrom : r.kdaTo),
        (n) => n.toFixed(2),
      ),
      ...pair(
        "dmg",
        "Dmg",
        "w-[105px]",
        (r, w) => (w === "From" ? r.dmgFrom : r.dmgTo),
        formatWhole,
      ),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, from, to, championData, augmentData]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? joined.rows.filter((r) => name(r.id).toLowerCase().includes(q))
      : joined.rows;
    if (sureOnly) list = list.filter((r) => Math.abs(r.z) >= Z_HIGH);
    return sortRows(list, columns, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, search, sureOnly, sort, columns]);

  const patchSelect = (which: "from" | "to", value: string) => (
    <select
      className="select select-sm"
      value={value}
      onChange={(e) => {
        // Picking a patch past the other end swaps them rather than inverting
        const pair: [string, string] =
          which === "from" ? [e.target.value, to] : [from, e.target.value];
        const [a, b] = comparePatches(pair[0], pair[1]) > 0 ? [pair[1], pair[0]] : pair;
        onChange("from", a);
        onChange("to", b);
      }}
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
        <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">
          Patch comparison
        </h1>
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
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sureOnly}
            onChange={(e) => setSureOnly(e.target.checked)}
            className="accent-[var(--color-lol-gold)]"
          />
          High confidence only
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showThin}
            onChange={(e) => setShowThin(e.target.checked)}
            className="accent-[var(--color-lol-gold)]"
          />
          Show under {MIN_SAMPLE} {view === "champions" ? "games" : "picks"}
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-[640px]:ml-0 max-[640px]:w-full">
          <SortControl
            options={sortOptions(columns)}
            sort={sort}
            onSort={toggle}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={
              view === "champions" ? "Search champion..." : "Search augment..."
            }
            width={192}
          />
        </div>
      </div>

      {error && (
        <div className={`${PANEL} p-8 text-center text-sm text-lol-loss`}>
          Couldn't load these patches: {error}
        </div>
      )}
      {!error && from === to && (
        <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
          Pick two different patches to compare. Both dropdowns are on{" "}
          {formatPatch(from)}.
        </div>
      )}
      {!error && from !== to && !ready && (
        <div className="text-center text-lol-text py-20">
          Loading patches...
        </div>
      )}
      {!error && from !== to && ready && (
        <p className="text-xs tabular-nums">
          {formatPatch(from)}: {joined.totalFrom.toLocaleString()} {view === "champions" ? "games" : "picks"}
          {" · "}
          {formatPatch(to)}: {joined.totalTo.toLocaleString()} {view === "champions" ? "games" : "picks"}
        </p>
      )}
      {!error && from !== to && ready && (
        <div className="cmp-board">
          <StatBoard
            columns={columns}
            rows={shown}
            rowKey={(r) => r.id}
            sort={sort}
            onSort={toggle}
            minWidth={1440}
            sticky="page"
            fitsFrom="xl"
            topScroll
            empty={
              showThin
                ? "Nothing appears on both patches yet."
                : `Nothing has ${MIN_SAMPLE}+ games on both patches yet.`
            }
            footnote={
              <>
                Changes are {formatPatch(to)} minus {formatPatch(from)}, in
                percentage points (pp). Confidence tests whether the win rate
                change could just be luck, given how many games each patch has:
                High is about 95% sure it is real, Medium about 80%, Low means a
                thin or noisy sample. With this many rows, a few High ones will
                still be luck.{" "}
                {showThin
                  ? `Rows with fewer than ${MIN_SAMPLE} ${view === "champions" ? "games" : "picks"} on a patch are included and swing on luck.`
                  : `Only ${view === "champions" ? "champions" : "augments"} with at least ${MIN_SAMPLE} ${view === "champions" ? "games" : "picks"} on both patches are shown, since smaller samples swing on luck.`} Score
                change is the shift in the confidence-floored score used by the
                tier lists.
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
