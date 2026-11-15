import { useEffect, useMemo, useState } from "react";
import {
  fetchAugmentTotalsFor,
  fetchChampionStatsFor,
  type AugmentTotalRow,
  type ChampionStatRow,
} from "../lib/api";
import type { AugmentData, ChampionData } from "../lib/dragon";
import { getAugmentName, getChampionName } from "../lib/dragon";
import { aggregateAugments, aggregateChampions } from "../lib/stats";
import { normalizePair, type Side } from "../../../src/shared/compare.ts";
import CompareBoard, {
  type CompareSides,
  type CompareView,
} from "../../../src/shared/ui/CompareBoard.tsx";

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
  pinned: number[];
  from: string;
  to: string;
  view: CompareView;
  queue: number | undefined;
  championData: ChampionData;
  augmentData: AugmentData;
  onChange: (key: "from" | "to" | "view" | "pin", value: string) => void;
}) {
  const [from, to] = normalizePair(fromParam, toParam);
  const [rows, setRows] = useState<{
    key: string;
    champions: ChampionStatRow[];
    augments: AugmentTotalRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const sides = useMemo<CompareSides | null>(() => {
    if (rows?.key !== key) return null;
    const side = (p: string) => ({ patches: new Set([p]), queue });
    const champions = (p: string): Side[] =>
      aggregateChampions(rows.champions, side(p)).map((c) => ({
        id: c.champion_id,
        games: c.games,
        wins: c.wins,
        kills: c.kills,
        deaths: c.deaths,
        assists: c.assists,
        damage: c.damage,
      }));
    const augments = (p: string): Side[] =>
      aggregateAugments(rows.augments, side(p)).map((a) => ({
        id: a.augment_id,
        games: a.picks,
        wins: a.wins,
        kills: a.kills,
        deaths: a.deaths,
        assists: a.assists,
        damage: a.damage,
      }));
    return {
      from,
      to,
      champions: [champions(from), champions(to)],
      augments: [augments(from), augments(to)],
    };
  }, [rows, key, from, to, queue]);

  return (
    <CompareBoard
      patches={patches}
      from={from}
      to={to}
      view={view}
      pinned={pinned}
      sides={sides}
      error={error}
      championName={(id) => getChampionName(championData, id)}
      augmentName={(id) => getAugmentName(augmentData, id)}
      about={
        <a href="/about/#patch-comparison" className="text-lol-gold hover:text-lol-gold-light">
          How is this calculated?
        </a>
      }
      onChange={onChange}
    />
  );
}
