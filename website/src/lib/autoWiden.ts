// The decisions behind the "this patch is thin, so showing a wider range"
// notice, as plain functions so they can be tested without a browser.
//
// The notice is driven by two refs and a bit of state, and it has been wrong
// twice: once a guard was reset at the moment a champion page resolved, and
// once a stale notice outlived the range it described. Each case is a line in
// test/auto-widen.test.mts.

export interface WidenInputs {
  // The ?patch= parameter as it stands now
  patchParam: string | null;
  // One key per board or champion page and queue
  key: string;
  // Which key the range was last widened for; null before it ever was
  widenedFor: string | null;
  // The range the widening itself wrote, so it is not mistaken for the
  // reader's own choice on the next render
  appliedParam: string | null;
  // Whether the "showing a wider range" notice is up
  hasNotice: boolean;
  // The range a widening would use, or null when the newest patch is enough
  widenTo: { from: string; to: string } | null;
}

export type WidenAction = { type: "none" } | { type: "clear" } | { type: "apply"; range: string };

export function widenAction(i: WidenInputs): WidenAction {
  if (i.patchParam != null) {
    // Anything other than the range we set is the reader overriding it
    return i.hasNotice && i.patchParam !== i.appliedParam ? { type: "clear" } : { type: "none" };
  }
  // Back on the current patch alone: the notice no longer describes what is on
  // screen. Widening is applied once per page, so it is not redone here.
  if (i.hasNotice && i.widenedFor === i.key) return { type: "clear" };
  if (i.widenedFor === i.key || !i.widenTo) return { type: "none" };
  return { type: "apply", range: `${i.widenTo.from}-${i.widenTo.to}` };
}

// Whether to offer the one-click way back to the wider range: the reader reset
// to the current patch on a page that was already widened once.
export function showsWidenHint(i: WidenInputs): boolean {
  return i.patchParam == null && !i.hasNotice && i.widenTo != null && i.widenedFor === i.key;
}

export interface PageScopeInputs {
  onChampionPage: boolean;
  wasOnChampion: boolean;
  selectedChampion: number | null;
  lastChampion: number | null;
}

export type PageScope =
  // Just arrived on a champion page: remember what the board was showing
  | { type: "enter" }
  // Moved to a different champion, or back to the board: put the board's patch
  // back and let the next page widen from scratch
  | { type: "reset" }
  | { type: "none" };

// A champion page's patch selection is scoped to that page. A champion that is
// still being looked up (null) turning into its id is the same page loading,
// not a move to another champion.
export function pageScope(i: PageScopeInputs): PageScope {
  if (i.onChampionPage && !i.wasOnChampion) return { type: "enter" };
  if (i.onChampionPage && i.lastChampion != null && i.selectedChampion !== i.lastChampion) {
    return { type: "reset" };
  }
  if (!i.onChampionPage && i.wasOnChampion) return { type: "reset" };
  return { type: "none" };
}
