// Champion and augment names/icons from the same public sources the desktop
// app uses. Cached in localStorage for a day so repeat visits skip the fetch.

import { isFinishedItem as isFinishedRawItem } from "../../../src/shared/items.ts";
import {
  applyDescriptions,
  AUGMENT_DESCRIPTIONS_PATH,
  parseDescriptions,
} from "../../../src/shared/augment-descriptions.ts";

export interface ChampionInfo {
  name: string;
  // Riot's own classes from Data Dragon, primary first. A champion carries one
  // or two of Fighter, Tank, Mage, Assassin, Support, Marksman.
  tags: string[];
}

export interface AugmentInfo {
  name: string;
  desc: string;
  iconPath: string;
  rarity: string;
}

export type ChampionData = Record<number, ChampionInfo>;
export type AugmentData = Record<number, AugmentInfo>;

// Artwork URLs are shared with the desktop app

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (typeof at !== "number" || Date.now() - at > CACHE_TTL) return null;
    return data as T;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage full or unavailable - caching is best-effort
  }
}

// An error page from the CDN is HTML, not JSON, and .json() on it throws a
// parse error that says nothing about the real problem
async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function loadChampionData(): Promise<ChampionData> {
  const cached = readCache<ChampionData>("champion-data-v2");
  if (cached) return cached;

  const versions = (await getJson(
    "https://ddragon.leagueoflegends.com/api/versions.json",
  )) as string[];
  const data = await getJson(
    `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`,
  );

  const out: ChampionData = {};
  for (const champ of Object.values<any>(data.data ?? {})) {
    out[parseInt(champ.key)] = { name: champ.name, tags: champ.tags ?? [] };
  }
  // Names are what every row and URL is built from; a list with none in it is a
  // failed load and is not worth keeping for a day
  if (Object.keys(out).length === 0) throw new Error("champion list was empty");
  writeCache("champion-data-v2", out);
  return out;
}

export async function loadAugmentData(): Promise<AugmentData> {
  const cached = readCache<AugmentData>("augment-data");
  if (cached) return cached;

  // The list and the hover text come from different places and neither needs
  // the other, so they overlap. The text is ours, served from this origin.
  const [data, descriptions] = await Promise.all([
    getJson(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
    )
      // The stats are already in hand: without names the augments read "Augment
      // 123" until the next visit, which beats an error page over a CDN blip
      .catch(() => null),
    fetch(AUGMENT_DESCRIPTIONS_PATH)
      .then((r) => r.json())
      .then((raw) => parseDescriptions(raw)?.descriptions ?? null)
      // A failure leaves the icons hovering with a name and no description,
      // which is what an augment with no text in the string table does anyway
      .catch(() => null),
  ]);

  const out: AugmentData = {};
  if (Array.isArray(data)) {
    for (const aug of data) {
      out[aug.id] = {
        name: aug.name || aug.nameTRA || `Augment ${aug.id}`,
        desc: aug.desc || aug.descriptionTRA || "",
        iconPath: aug.augmentSmallIconPath || aug.iconSmall || aug.iconLarge || "",
        rarity: aug.rarity || "",
      };
    }
  }
  if (descriptions) applyDescriptions(out, descriptions);
  // Kept for a day only when it is a real list: a failed or empty answer would
  // otherwise leave every augment unnamed in this browser until tomorrow
  if (Object.keys(out).length > 0) writeCache("augment-data", out);
  return out;
}

export function getChampionName(data: ChampionData, id: number): string {
  return data[id]?.name || `Champion ${id}`;
}

export function getAugmentName(data: AugmentData, id: number): string {
  return data[id]?.name || `Augment ${id}`;
}

// ---- Items ----

export interface ItemInfo {
  name: string;
  iconPath: string;
  // Builds into nothing and isn't a consumable - a finished purchase, so
  // build paths can skip components and potions
  completed?: boolean;
}

export type ItemData = Record<number, ItemInfo>;

// items.json is a few MB, so it's loaded only when a champion detail view
// needs it, reduced to id → {name, icon}, and cached like the others.
let itemPromise: Promise<ItemData> | null = null;

export function loadItemData(): Promise<ItemData> {
  if (itemPromise) return itemPromise;
  itemPromise = (async () => {
    const cached = readCache<ItemData>("item-data-v4");
    if (cached) return cached;

    const data = await getJson(
      "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json",
    );

    const out: ItemData = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        const completed = isFinishedRawItem(item);
        out[item.id] = {
          name: item.name || `Item ${item.id}`,
          iconPath: item.iconPath || "",
          completed,
        };
      }
    }
    if (Object.keys(out).length > 0) writeCache("item-data-v4", out);
    return out;
  })();
  itemPromise.catch(() => {
    itemPromise = null;
  });
  return itemPromise;
}

export function getItemName(data: ItemData, id: number): string {
  return data[id]?.name || `Item ${id}`;
}

// Whether an item belongs in a build list. Components - Recurve Bow, Giant's
// Belt, Ruby Crystal - carry a win rate because they sat in someone's
// inventory at the final whistle, not because anyone set out to build them,
// and they crowd out the items that were the plan.
//
// The test is `completed`, which asks whether an item builds into anything,
// so it keeps the items that only look like components: Manamune and
// Archangel's Staff *transform* into Muramana and Seraph's Embrace, which the
// item data models as separate items rather than a recipe, leaving both
// halves finished. Tier-2 boots are the one real recipe kept, by price.
//
// An id the item data doesn't know is treated as finished: a missing entry is
// a gap in what we loaded, and hiding real data over it is the worse mistake.
export function isFinishedItem(data: ItemData, id: number): boolean {
  const item = data[id];
  return item ? item.completed === true : true;
}
