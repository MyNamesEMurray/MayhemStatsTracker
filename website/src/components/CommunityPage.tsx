import { useEffect, useMemo, useState } from "react";
import { buttonClass, LABEL, PANEL, StatTile } from "../../../src/shared/ui/primitives.tsx";
import {
  fetchCommunityGrowth,
  fetchCommunityTotals,
  fetchGamesPerDay,
  fetchMatchupCoverage,
  fetchPatchSpans,
  type CommunityGrowth,
  type CommunityTotals,
  type GamesPerDayRow,
  type MatchupCoverage,
  type PatchSpanRow,
} from "../lib/api";
import { formatPatch } from "../lib/stats";

const CHART_WEEKS = 12;
const BAR_GAP = 6;
// A patch label needs this many columns of clear run before the next boundary,
// or it collides with its neighbour and both become unreadable
const LABEL_MIN_SPAN = 1;

const DAY_MS = 86_400_000;
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact" });
// Monday of the week a YYYY-MM-DD day falls in, as YYYY-MM-DD
function weekStart(day: string): string {
  const t = new Date(day + "T00:00:00Z").getTime();
  const sinceMonday = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

// The impact of the crowdsourced database: every number here exists because
// of the one-time seed at launch, which most of it still comes from, or
// because a player opted in since - the about and privacy pages describe
// both. There is no other source of ARAM Mayhem data.
export default function CommunityPage() {
  const [totals, setTotals] = useState<CommunityTotals | null>(null);
  const [perDay, setPerDay] = useState<GamesPerDayRow[]>([]);
  const [spans, setSpans] = useState<PatchSpanRow[]>([]);
  const [coverage, setCoverage] = useState<MatchupCoverage | null>(null);
  const [growth, setGrowth] = useState<CommunityGrowth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCommunityTotals(),
      fetchGamesPerDay(),
      fetchPatchSpans(),
      fetchMatchupCoverage(),
      fetchCommunityGrowth(),
    ])
      .then(([t, d, p, c, g]) => {
        setTotals(t);
        setPerDay(d);
        setSpans(p);
        setCoverage(c);
        setGrowth(g);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Bar chart over the last 12 weeks (Monday start, gaps filled with zero).
  // community_games_per_day buckets by game_creation, so a game counts in the
  // week it was played - a backlog uploaded today lands in its own weeks. The
  // newest bar is the week so far.
  const chart = useMemo(() => {
    if (!perDay.length) return [];
    const byWeek = new Map<string, number>();
    for (const r of perDay) {
      const w = weekStart(r.day);
      byWeek.set(w, (byWeek.get(w) ?? 0) + r.games);
    }
    const last = new Date(weekStart(perDay[perDay.length - 1].day) + "T00:00:00Z").getTime();
    const weeks: { day: string; end: string; games: number }[] = [];
    for (let i = CHART_WEEKS - 1; i >= 0; i--) {
      const t = last - i * 7 * DAY_MS;
      const key = new Date(t).toISOString().slice(0, 10);
      weeks.push({
        day: key,
        end: new Date(t + 6 * DAY_MS).toISOString().slice(0, 10),
        games: byWeek.get(key) ?? 0,
      });
    }
    return weeks;
  }, [perDay]);
  const maxGames = Math.max(1, ...chart.map((d) => d.games));

  // Which patch a day belongs to, for the bar tooltips
  const patchForDay = useMemo(() => {
    const ordered = [...spans].sort((a, b) => a.first_seen.localeCompare(b.first_seen));
    return (day: string) => {
      let current: string | null = null;
      for (const s of ordered) {
        if (s.first_seen <= day) current = s.patch;
        else break;
      }
      return current ? formatPatch(current) : null;
    };
  }, [spans]);

  // A dashed rule at every patch boundary inside the window. The label is
  // dropped when the next boundary lands too close to fit it.
  const markers = useMemo(() => {
    if (chart.length === 0 || spans.length === 0) return [];
    const columnOf = new Map(chart.map((d, i) => [d.day, i + 1]));
    const found = spans
      .map((s) => ({
        patch: formatPatch(s.patch),
        column: columnOf.get(weekStart(s.first_seen)),
      }))
      // Column 1 is the window opening mid-patch, not a boundary to draw. A
      // patch that starts mid-week gets its rule before that week's bar.
      .filter((m): m is { patch: string; column: number } => m.column != null && m.column > 1)
      .sort((a, b) => a.column - b.column);
    return found.map((m, i) => ({
      ...m,
      showLabel: (found[i + 1]?.column ?? CHART_WEEKS + 1) - m.column >= LABEL_MIN_SPAN,
    }));
  }, [chart, spans]);

  if (error) {
    return (
      <div className={`${PANEL} p-8 text-center text-sm text-lol-text`}>
        Couldn't load community stats: {error}
      </div>
    );
  }

  const hours = totals ? totals.total_seconds / 3600 : 0;
  const formatHours = (h: number) => (h >= 100 ? Math.round(h).toLocaleString() : h.toFixed(1));
  const plus = (n: number | null | undefined, unit = "") =>
    n ? `+${n.toLocaleString()}${unit} / 30d` : undefined;
  const performances = totals ? totals.games * 10 : 0;
  const since = totals?.first_game_ms
    ? new Date(totals.first_game_ms).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
        <h1 className="text-[22px] font-extrabold text-lol-gold-light m-0">Community impact</h1>
        {since && <span className="text-xs">counting since {since}</span>}
      </div>
      <p className="text-[13px] mb-4 max-w-[64ch]">
        Riot's API doesn't expose ARAM Mayhem match data, so every number on this site is
        crowdsourced: players run the tracker, opt in, and pool their games anonymously. This page
        is the running total of what that adds up to.
      </p>

      <div className="grid grid-cols-2 min-[881px]:grid-cols-4 gap-4">
        <StatTile
          label="Contributors"
          value={totals ? totals.contributors.toLocaleString() : "-"}
          delta={plus(growth?.new_contributors_30d)}
        />
        <StatTile
          label="Games analyzed"
          value={totals ? totals.games.toLocaleString() : "-"}
          delta={plus(growth?.new_games_30d)}
        />
        <StatTile
          label="Gameplay analyzed"
          value={totals ? `${formatHours(hours)} h` : "-"}
          delta={plus(growth && Math.round(growth.new_seconds_30d / 3600), " h")}
        />
        <StatTile
          label="Champion matchups"
          value={coverage ? coverage.matchups.toLocaleString() : "-"}
        />
        <StatTile label="Patches tracked" value={totals ? totals.patches : "-"} />
        <StatTile label="Champions seen" value={coverage ? coverage.champions : "-"} />
        <StatTile
          label="Player performances"
          value={totals ? performances.toLocaleString() : "-"}
        />
        <StatTile
          label="Avg game length"
          value={
            totals && totals.games > 0
              ? `${Math.round(totals.total_seconds / totals.games / 60)} min`
              : "-"
          }
        />
      </div>

      <div className={`${PANEL} p-[18px]`}>
        <p className={`${LABEL} mb-3`}>Games played per week - last 12 weeks</p>
        {chart.length === 0 ? (
          <p className="text-sm text-lol-text">No data yet.</p>
        ) : (
          <div>
            {/* One grid column per week, so the marker overlay shares the track
                sizing and each rule lands in the gap before its week's bar */}
            <div className="relative">
              <div
                className="grid items-end h-28 pt-4"
                style={{
                  gridTemplateColumns: `repeat(${CHART_WEEKS}, minmax(0, 1fr))`,
                  gap: BAR_GAP,
                }}
              >
                {chart.map((d) => {
                  const patch = patchForDay(d.end);
                  return (
                    <div
                      key={d.day}
                      className="relative rounded-t-[3px] bg-lol-gold/70 hover:bg-lol-gold transition-colors min-w-0"
                      style={{
                        height: `${Math.max(d.games > 0 ? 6 : 1.5, (d.games / maxGames) * 100)}%`,
                      }}
                      title={`Week of ${d.day}: ${d.games} game${d.games === 1 ? "" : "s"}${patch ? ` · patch ${patch}` : ""}`}
                    >
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 whitespace-nowrap text-[10px] text-lol-text">
                        {COMPACT.format(d.games)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                className="absolute inset-0 grid pointer-events-none"
                style={{
                  gridTemplateColumns: `repeat(${CHART_WEEKS}, minmax(0, 1fr))`,
                  gap: BAR_GAP,
                }}
              >
                {markers.map((m) => (
                  <div
                    key={m.patch}
                    className="relative border-l border-dashed border-lol-gold/45"
                    style={{
                      gridColumn: `${m.column} / span 1`,
                      transform: `translateX(-${BAR_GAP / 2}px)`,
                    }}
                  >
                    {m.showLabel && (
                      <span className="absolute -top-0.5 left-[3px] whitespace-nowrap bg-lol-card px-1 text-[9px] tracking-[.04em] text-lol-gold">
                        {m.patch}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-lol-text/70">
              <span>{chart[0].day}</span>
              <span>{chart[chart.length - 1].day}</span>
            </div>
          </div>
        )}
      </div>

      {/* Copy plus the action it asks for - the panel is full width, so the
          button anchors the empty half instead of leaving dead space */}
      <div
        className={`${PANEL} p-[18px] flex flex-col gap-4 min-[861px]:flex-row min-[861px]:items-center min-[861px]:gap-6`}
      >
        <div className="min-w-0">
          <p className={`${LABEL} mb-2`}>Every game counts</p>
          <p className="text-[13px] text-lol-text leading-relaxed max-w-[80ch]">
            Each contributed game adds all ten players' champions, augments, items, and combat lines
            to the pool - anonymously, with duplicates counted once. The more players opt in, the
            sharper the tier lists get, especially early in a patch. Install the tracker and flip on
            Community Stats in Settings to be part of it, or read{" "}
            <a href="/about/" className="text-lol-gold hover:text-lol-gold-light">
              how the stats work
            </a>
            .
          </p>
        </div>
        <a href="/download/" className={buttonClass("gold", "lg", "shrink-0 min-[861px]:ml-auto")}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 12 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Download MayhemStats Tracker
        </a>
      </div>
    </div>
  );
}
