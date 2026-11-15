// Whether an item belongs in a build list, written once.
//
// This rule was written three times - the site, the desktop app and the
// prerender script - and the copies could only agree by being edited together.
//
// An item is finished when it builds into nothing and costs enough to be a
// real purchase. That keeps the ones that only look like components, since
// Manamune and Archangel's Staff transform into Muramana and Seraph's Embrace,
// modelled as separate items rather than a recipe. Mode-specific prismatics
// (six-digit ids) count whatever they cost. Tier-2 boots do build into tier-3,
// so they are kept by being built *from* the 300g starter pair: price alone
// dropped Ionian Boots of Lucidity, at 900g, off the list.
export interface RawItem {
  id: number;
  to?: unknown;
  from?: unknown;
  categories?: unknown;
  priceTotal?: number;
}

export function isFinishedItem(item: RawItem): boolean {
  const buildsInto = Array.isArray(item.to) ? item.to.length : 0;
  const builtFrom = Array.isArray(item.from) ? item.from.length : 0;
  const categories: unknown[] = Array.isArray(item.categories) ? item.categories : [];
  const price = item.priceTotal ?? 0;
  return (
    (buildsInto === 0 &&
      !categories.includes("Consumable") &&
      (price >= 500 || item.id >= 100000)) ||
    (categories.includes("Boots") && builtFrom > 0)
  );
}
