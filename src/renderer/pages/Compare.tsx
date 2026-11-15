import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getAugmentName,
  getChampionName,
  useAugmentData,
  useChampionData,
} from "../hooks/useChampions";
import { useStatsFilters } from "../hooks/useStatsFilters";
import { usePatchOptions } from "../hooks/usePatchOptions";
import CompareBoard, { type CompareSides, type CompareView } from "../../shared/ui/CompareBoard";
import { normalizePair, parsePins } from "../../shared/compare";

const ABOUT_URL = "https://mayhemstats.com/about/#patch-comparison";

// Community data only: a personal history has nowhere near the games a patch
// to one for a change in win rate to mean anything. State lives in the URL, the
// same parameters the website's Compare tab uses.
export default function Compare() {
  const champData = useChampionData();
  const augmentData = useAugmentData();
  const { queue } = useStatsFilters();
  const patches = usePatchOptions("community");
  const [params, setParams] = useSearchParams();

  const from = params.get("from") ?? patches[1] ?? patches[0] ?? "";
  const to = params.get("to") ?? patches[0] ?? "";
  const view: CompareView = params.get("view") === "augments" ? "augments" : "champions";
  const pinned = useMemo(() => parsePins(params.get("pin")), [params]);

  const setParam = useCallback(
    (key: "from" | "to" | "view" | "pin", value: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const [pair0, pair1] = normalizePair(from, to);
  const [sides, setSides] = useState<CompareSides | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!pair0 || !pair1 || pair0 === pair1) return;
    let active = true;
    setError(null);
    window.api
      .getCommunityCompare(pair0, pair1, queue)
      .then((s) => active && setSides(s))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [pair0, pair1, queue]);

  const championName = useCallback((id: number) => getChampionName(champData, id), [champData]);
  const augmentName = useCallback((id: number) => getAugmentName(augmentData, id), [augmentData]);

  if (patches.length === 0) {
    return <div className="text-lol-text text-center mt-20">Loading...</div>;
  }

  return (
    <div className="w-full">
      <CompareBoard
        patches={patches}
        from={from}
        to={to}
        view={view}
        pinned={pinned}
        sides={sides}
        error={error}
        championName={championName}
        augmentName={augmentName}
        about={
          <button
            type="button"
            onClick={() => window.api.openUrl(ABOUT_URL)}
            className="text-lol-gold hover:text-lol-gold-light cursor-pointer"
          >
            How is this calculated?
          </button>
        }
        onChange={setParam}
      />
    </div>
  );
}
