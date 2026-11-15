import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_WIDEN_MIN_GAMES,
  autoWidenTarget,
  showsWidenHint,
  widenAction,
  type WidenTo,
} from "../../shared/autoWiden";
import { parsePatchParam, patchParam, type PatchSelection } from "../../shared/patch";

// A fresh patch has almost nothing in it for the first day or two, and the
// default view is that patch alone. On the community board, when the newest
// patch can't support the view, reach back a patch at a time until it can,
// say so, and leave the widened range in the filter for the reader to
// override. The decisions are the website's, from shared/autoWiden.
export function useAutoWiden({
  enabled,
  scope,
  queue,
  patchOptions,
  patchSelection,
  setPatchSelection,
}: {
  // Community boards only: a personal history is as thin as it is
  enabled: boolean;
  // Which page this is, so a different page widens on its own
  scope: string;
  queue: number | undefined;
  patchOptions: string[];
  patchSelection: PatchSelection;
  setPatchSelection: (s: PatchSelection) => void;
}) {
  const [games, setGames] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    window.api
      .getCommunityPatchGames(queue)
      .then((g) => active && setGames(g))
      .catch(() => active && setGames(null));
    return () => {
      active = false;
    };
  }, [enabled, queue]);

  const widenTo = useMemo(
    () =>
      enabled && games
        ? autoWidenTarget(
            patchOptions,
            (included) => [...included].reduce((n, p) => n + (games[p] ?? 0), 0),
            AUTO_WIDEN_MIN_GAMES,
          )
        : null,
    [enabled, games, patchOptions],
  );

  const param = patchParam(patchSelection, patchOptions);
  const key = `${scope}:${queue ?? "all"}`;
  const widenedFor = useRef<string | null>(null);
  const appliedParam = useRef<string | null>(null);
  const [notice, setNotice] = useState<WidenTo | null>(null);

  const apply = useCallback(
    (range: string) => {
      appliedParam.current = range;
      setPatchSelection(parsePatchParam(range, patchOptions));
    },
    [patchOptions, setPatchSelection],
  );

  useEffect(() => {
    const action = widenAction({
      patchParam: param,
      key,
      widenedFor: widenedFor.current,
      appliedParam: appliedParam.current,
      hasNotice: notice != null,
      widenTo,
    });
    if (action.type === "clear") setNotice(null);
    else if (action.type === "apply" && widenTo) {
      widenedFor.current = key;
      setNotice(widenTo);
      apply(action.range);
    }
  }, [param, widenTo, key, notice, apply]);

  const hint = showsWidenHint({
    patchParam: param,
    key,
    widenedFor: widenedFor.current,
    appliedParam: appliedParam.current,
    hasNotice: notice != null,
    widenTo,
  });

  const applyHint = () => {
    if (!widenTo) return;
    setNotice(widenTo);
    apply(`${widenTo.from}-${widenTo.to}`);
  };

  return { notice, hint: hint ? widenTo : null, applyHint };
}
