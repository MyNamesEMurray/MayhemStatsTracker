import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentTotalsFor,
  fetchChampionStatsFor,
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
  MIN_SAMPLE,
} from "../lib/stats";
import {
  confidence,
  join,
  splitPinned,
  withRanks,
  Z_HIGH,
  type Row,
  type Side,
} from "../lib/compare";
import AugmentIcon from "../../../src/shared/ui/AugmentIcon.tsx";
import FitName from "../../../src/shared/ui/FitName.tsx";
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

const CONFIDENCE_TONE = {
  High: "text-lol-win",
  Medium: "text-lol-gold",
  Low: "text-lol-text/60",
};

function Confidence({ z, note }: { z: number; note: string }) {
  const label = confidence(z);
  const tone = CONFIDENCE_TONE[label];
  return (
    <span
      className={`font-semibold ${tone}`}
      title={`${note}. Win rate change z = ${z.toFixed(2)}. High is about 95% sure it is not luck, Medium about 80%.`}
    >
      {label}
    </span>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
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
  pinned,
  onChange,
}: {
  patches: string[];
  // Ids held at the top of the table; champions or augments, per the view
  pinned: number[];
  from: string;
  to: string;
  view: View;
  queue: number | undefined;
  championData: ChampionData;
  augmentData: AugmentData;
  onChange: (key: "from" | "to" | "view" | "pin", value: string) => void;
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
    Promise.all([fetchChampionStatsFor(pair), fetchAugmentTotalsFor(pair)])
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
      return { rows: join(a, b, 1), totalFrom: games(a), totalTo: games(b) };
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
    return { rows: join(a, b, 1), totalFrom: picks(a), totalTo: picks(b) };
  }, [ready, view, from, to, queue]);

  const togglePin = (id: number) =>
    onChange("pin", (pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id]).join(","));

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
      // A small second line under the value, and whether the value rests on
      // too few games to trust
      sub?: (r: Row, which: "From" | "To") => { text: string; thin: boolean },
    ): BoardColumn<Row, SortKey>[] =>
      (["From", "To"] as const).map((which) => ({
        key: `${base}${which}` as SortKey,
        label: `${label} ${which === "From" ? pf : pt}`,
        width,
        // A card of fifteen figures is a wall; it keeps win rate and games
        area: inCard ? ("stat" as const) : ("none" as const),
        align: "right" as const,
        cellClass: "text-[13px] text-lol-text",
        sortValue: (r: Row) => value(r, which),
        render: (r: Row) => {
          if (!sub) return show(value(r, which));
          const s = sub(r, which);
          return (
            <div className="leading-tight">
              <span className={s.thin ? "text-lol-text/60" : ""}>
                {show(value(r, which))}
                {/* Always drawn, hidden when not needed, so digits line up */}
                <span className={s.thin ? "" : "invisible"}>*</span>
              </span>
              <span className="block text-[10px] leading-[10px] text-lol-text/60 mt-0.5">{s.text}</span>
            </div>
          );
        },
      }));
    const pct = (n: number) => `${n.toFixed(2)}%`;
    return [
      {
        key: null,
        label: "#",
        area: "rank",
        width: "w-10",
        cellClass: "text-xs text-lol-text",
        render: (r) => r.rank ?? "–",
      },
      {
        key: "name",
        label: view === "champions" ? "Champion" : "Augment",
        naturalDir: "asc",
        area: "name",
        width: "w-[200px]",
        sortValue: (r) => name(r.id),
        render: (r) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => togglePin(r.id)}
              aria-pressed={pinned.includes(r.id)}
              title={pinned.includes(r.id) ? "Unpin" : "Pin to the top of the table"}
              className={`shrink-0 p-0.5 rounded transition-colors ${
                pinned.includes(r.id)
                  ? "text-lol-gold"
                  : "text-lol-text/40 hover:text-lol-gold"
              }`}
            >
              <PinIcon filled={pinned.includes(r.id)} />
            </button>
            {view === "champions" ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <ChampionIcon championId={r.id} size={28} />
                <FitName className="text-lol-text-bright">{name(r.id)}</FitName>
              </div>
            ) : (
              <AugmentIcon augmentId={r.id} size={26} showName fit />
            )}
          </div>
        ),
      },
      {
        key: "dWin",
        align: "right",
        label: "Win chg",
        cardLabel: "Win chg",
        area: "score",
        width: "w-[100px]",
        sortValue: (r) => r.winTo - r.winFrom,
        render: (r) => <Delta value={r.winTo - r.winFrom} unit=" pp" />,
      },
      {
        key: "sig",
        align: "right",
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
        (r, w) => {
          const n = w === "From" ? r.gamesFrom : r.gamesTo;
          return {
            text: `${n.toLocaleString()} ${view === "champions" ? "games" : "picks"}`,
            thin: n < MIN_SAMPLE,
          };
        },
      ),
      {
        key: "dPick",
        align: "right",
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
        align: "right",
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
  }, [view, from, to, championData, augmentData, pinned]);

  // Ranks count every row the filters keep, pinned ones included: a pinned row
  // keeps its true place, and the rows below it are not renumbered to hide it
  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = joined.rows.filter((r) => r.gamesFrom >= floor && r.gamesTo >= floor);
    if (q) list = list.filter((r) => name(r.id).toLowerCase().includes(q));
    if (sureOnly) list = list.filter((r) => Math.abs(r.z) >= Z_HIGH);
    return withRanks(sortRows(list, columns, sort));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, search, sureOnly, floor, sort, columns]);

  const { shown, pinnedRows } = splitPinned(ranked, joined.rows, pinned);

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
      onClick={() => {
        onChange("view", v);
        // Champion ids and augment ids are different things
        onChange("pin", "");
      }}
      className={`px-3 py-1.5 max-[700px]:flex-1 text-[13px] font-semibold rounded-md transition-colors ${
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
          Patch Comparison
        </h1>
        <span className="text-xs">
          {formatPatch(from)} to {formatPatch(to)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-lol-border/60 bg-lol-card p-0.5 max-[700px]:w-full">
          {tab("champions", "Champions")}
          {tab("augments", "Augments")}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs max-[700px]:grid max-[700px]:grid-cols-[auto_1fr_auto_1fr] max-[700px]:w-full max-[700px]:[&_select]:!w-full max-[700px]:[&_select]:!max-w-none">
          <span>From</span>
          {patchSelect("from", from)}
          <span>to</span>
          {patchSelect("to", to)}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-[700px]:w-full">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sureOnly}
            onChange={(e) => setSureOnly(e.target.checked)}
            className="checkbox"
          />
          High confidence only
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showThin}
            onChange={(e) => setShowThin(e.target.checked)}
            className="checkbox"
          />
          Show under {MIN_SAMPLE} {view === "champions" ? "games" : "picks"}
        </label>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-[700px]:ml-0 max-[700px]:w-full">
          <SortControl
            options={sortOptions(columns)}
            sort={sort}
            onSort={toggle}
          />
          <div className="w-48 max-[700px]:w-full">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={
                view === "champions" ? "Search champion..." : "Search augment..."
              }
            />
          </div>
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
          {" · "}
          <a href="/about/#patch-comparison" className="text-lol-gold hover:text-lol-gold-light">
            How is this calculated?
          </a>
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
            minWidth={1495}
            pinnedRows={pinnedRows}
            sticky="page"
            fitsFrom="xl"
            topScroll
            empty={
              showThin
                ? "Nothing appears on both patches yet."
                : `Nothing has ${MIN_SAMPLE}+ games on both patches yet.`
            }
          />
        </div>
      )}
    </div>
  );
}
