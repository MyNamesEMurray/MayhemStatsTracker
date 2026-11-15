// Read-only access to the community stats project. The connection details and
// the paging loop live in src/shared/supabase.ts, which the desktop app reads
// through too.
import { fetchAllRows, patchFilter } from "../../../src/shared/supabase.ts";
import { createPatchRowCache, type RowStore } from "../../../src/shared/rowCache.ts";

const STORE_PREFIX = "community-rows:";

const localStore: RowStore = {
  get(key) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, entry) {
    const value = JSON.stringify(entry);
    try {
      localStorage.setItem(STORE_PREFIX + key, value);
    } catch {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k?.startsWith(STORE_PREFIX)) localStorage.removeItem(k);
        }
        localStorage.setItem(STORE_PREFIX + key, value);
      } catch {}
    }
  },
};

export interface ChampionStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damage_taken: number;
  heal: number;
  gold: number;
  pentas: number;
}

export interface AugmentStatRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  champion_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

// The Augments tab's grain: one row per augment per patch, rolled up across
// champions. The per-champion rows are 341k and growing - two orders of
// magnitude more than this - so they are fetched per champion, on demand.
export interface AugmentTotalRow {
  patch: string;
  queue_id: number;
  augment_id: number;
  picks: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
}

export interface ItemStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
}

// From live build-order tracking: how many participants bought the item and
// how early on average
export interface ItemPurchaseRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  item_id: number;
  picks: number;
  wins: number;
  avg_first_buy_s: number;
}

// Undefined means every patch, which is what "All patches" asks for and what
// nothing else should. The board only ever renders a handful, so pulling the
// rest is bytes nobody reads: 21 patches cost 237 KB gzipped against 12 KB for
// the current one, and that gap widens by about 11 KB with every patch Riot
// ships.
export function fetchChampionStats(patches?: string[]): Promise<ChampionStatRow[]> {
  return fetchAllRows<ChampionStatRow>(
    "champion_stats",
    `select=*&order=patch,queue_id,champion_id${patchFilter(patches)}`,
  );
}

// Throws on failure, so a caller that can show an error (Compare) does.
export function fetchAugmentTotalsStrict(patches?: string[]): Promise<AugmentTotalRow[]> {
  return fetchAllRows<AugmentTotalRow>(
    "augment_totals",
    `select=*&order=patch,queue_id,augment_id${patchFilter(patches)}`,
  );
}

// For the tier lists, which must not go down with the augment rollup: it can be
// one migration behind the client during a deploy, and an empty augment tab is
// a bad half-hour where an unusable champion list is worse. A failure is
// reported rather than hidden, because an empty list and a failed one look the
// same to the caller and only one of them should be retried.
export async function fetchAugmentTotalsReport(
  patches?: string[],
): Promise<{ rows: AugmentTotalRow[]; failed: boolean }> {
  try {
    return { rows: await fetchAugmentTotalsStrict(patches), failed: false };
  } catch (err) {
    console.warn(`augment_totals unavailable: ${err instanceof Error ? err.message : err}`);
    return { rows: [], failed: true };
  }
}

// The Compare tab asks for two patches at a time and flips between them, so it
// keeps what it fetched for a few minutes instead of downloading it again. In
// memory only: the tier lists refetch fresh rollups on every visit, and a saved
// copy hours older than theirs would make the two disagree.
const COMPARE_TTL_MS = 10 * 60 * 1000;
const championStatsCache = createPatchRowCache<ChampionStatRow>({
  view: "champion_stats",
  ttlMs: COMPARE_TTL_MS,
});
const augmentTotalsCache = createPatchRowCache<AugmentTotalRow>({
  view: "augment_totals",
  ttlMs: COMPARE_TTL_MS,
});

export function fetchChampionStatsFor(patches: string[]): Promise<ChampionStatRow[]> {
  return championStatsCache.load("compare", patches, fetchChampionStats);
}

// The strict fetch, so a failure rejects and is not cached. The forgiving one
// would store an empty list for ten minutes and Compare would say there is no
// data until it expired.
export function fetchAugmentTotalsFor(patches: string[]): Promise<AugmentTotalRow[]> {
  return augmentTotalsCache.load("compare", patches, fetchAugmentTotalsStrict);
}

// Everything below is per-champion or per-augment, fetched when a page that
// needs it opens. Filtering server-side keeps a champion page to a couple of
// thousand rows instead of the half-million the full grain would cost.
const augmentStats = createPatchRowCache<AugmentStatRow>({
  view: "augment_stats",
  store: localStore,
});
const itemStats = createPatchRowCache<ItemStatRow>({ view: "item_stats", store: localStore });

export function fetchChampionAugments(
  championId: number,
  patches?: string[],
): Promise<AugmentStatRow[]> {
  return augmentStats.load(`champion:${championId}`, patches, (p) =>
    fetchAllRows<AugmentStatRow>(
      "augment_stats",
      `select=*&champion_id=eq.${championId}&order=patch,queue_id,augment_id${patchFilter(p)}`,
      { count: false },
    ),
  );
}

export function fetchChampionItems(championId: number, patches?: string[]): Promise<ItemStatRow[]> {
  return itemStats.load(`champion:${championId}`, patches, (p) =>
    fetchAllRows<ItemStatRow>(
      "item_stats",
      `select=*&champion_id=eq.${championId}&order=patch,queue_id,item_id${patchFilter(p)}`,
      { count: false },
    ),
  );
}

export function fetchChampionPurchases(championId: number): Promise<ItemPurchaseRow[]> {
  return fetchAllRows<ItemPurchaseRow>(
    "item_purchase_stats",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,item_id`,
  );
}

export interface AugmentPairRow {
  patch: string;
  queue_id: number;
  augment_a: number;
  augment_b: number;
  picks: number;
  wins: number;
}

// Every pairing one augment appears in. The rollup stores each pair once with
// the lower id first, so an augment can be on either side and both have to be
// asked for.
const augmentPairs = createPatchRowCache<AugmentPairRow>({
  view: "augment_pairs",
  store: localStore,
});

export async function fetchAugmentPairs(
  augmentId: number,
  patches?: string[],
): Promise<AugmentPairRow[]> {
  try {
    // Only the patches the page is showing, and kept: opening a row used to
    // download every patch and queue for the augment and drop them all on close.
    // A failure rejects and is not cached; it is caught here, outside the cache.
    return await augmentPairs.load(`augment:${augmentId}`, patches, (p) =>
      fetchAllRows<AugmentPairRow>(
        "augment_pairs",
        `select=*&or=(augment_a.eq.${augmentId},augment_b.eq.${augmentId})` +
          `&order=patch,queue_id,augment_a,augment_b${patchFilter(p)}`,
        { count: false },
      ),
    );
  } catch {
    // The newest rollup of the lot. A deploy that lands before the view does
    // loses a section rather than the row that holds it.
    return [];
  }
}

export interface MatchupStatRow {
  patch: string;
  queue_id: number;
  champion_id: number;
  opponent_id: number;
  games: number;
  wins: number;
}

// Every opponent this champion has faced, per patch. About 170 opponents per
// patch per queue, so one champion is a page or two where the whole rollup is
// half a million rows - the same reason augments are fetched per champion.
export function fetchChampionMatchups(
  championId: number,
  patches?: string[],
): Promise<MatchupStatRow[]> {
  return fetchAllRows<MatchupStatRow>(
    "champion_matchups",
    `select=*&champion_id=eq.${championId}&order=patch,queue_id,opponent_id${patchFilter(patches)}`,
  );
}

// For an expanded augment row: which champions carry it
export function fetchAugmentChampions(
  augmentId: number,
  patches?: string[],
): Promise<AugmentStatRow[]> {
  return augmentStats.load(`augment:${augmentId}`, patches, (p) =>
    fetchAllRows<AugmentStatRow>(
      "augment_stats",
      `select=*&augment_id=eq.${augmentId}&order=patch,queue_id,champion_id${patchFilter(p)}`,
      { count: false },
    ),
  );
}

export * from "../../../src/shared/communityImpact.ts";
