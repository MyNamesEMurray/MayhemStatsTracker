// Champion page slugs: "Miss Fortune" -> "miss-fortune", "Kai'Sa" -> "kai-sa",
// "Nunu & Willump" -> "nunu-willump". scripts/prerender.mjs imports this.
export function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
