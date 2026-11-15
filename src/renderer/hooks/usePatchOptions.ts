import { useEffect, useState } from "react";
import { comparePatches } from "../../shared/patch";
import type { StatsSource } from "../components/SourceSwitch";

// The patches the filter can offer, newest first. The community cache knows
// every patch anyone has contributed; the local database knows only the ones
// this install has played, and on a fresh install or after a break its newest
// is not the game's current patch. "Current patch" resolves to the first entry,
// so the local source offers the community's patches as well - it then reads
// the real current patch and shows an honest empty board for one you have not
// played yet. If the community list cannot be read, the local one stands alone.
export function usePatchOptions(source: StatsSource): string[] {
  const [patches, setPatches] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([
        source === "community"
          ? Promise.resolve<string[]>([])
          : window.api.getMatchFilterOptions().then((o) => o.patches),
        window.api
          .getCommunityMeta()
          .then((m) => m.patches)
          .catch(() => [] as string[]),
      ])
        .then(([local, community]) => {
          const merged = [...new Set([...local, ...community])];
          if (alive) setPatches(merged.sort((a, b) => comparePatches(b, a)));
        })
        .catch(() => {});
    load();
    // A game finishing adds a patch to the local list; the community list is
    // refetched on the same signal because an upload can widen it too
    const unsub = window.api.onGamesUpdated(load);
    return () => {
      alive = false;
      unsub();
    };
  }, [source]);

  return patches;
}
