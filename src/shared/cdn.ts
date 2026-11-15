// Champion, augment and item artwork, from the public CommunityDragon and
// Data Dragon endpoints both surfaces already read. These builders existed in
// src/renderer/lib/constants.ts and website/src/lib/dragon.ts, spelling the
// same URLs two ways.

export const CHAMPION_ICON_URL = (id: number): string =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;

export const PROFILE_ICON_URL = (id: number): string =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;

export const AUGMENT_ICON_BASE = "https://raw.communitydragon.org/latest/game/";

// A CommunityDragon game-data icon path (as it appears in items.json or
// cherry-augments.json) as a raw asset URL on the given branch - "latest",
// "pbe", or a client patch like "16.14".
export const CDRAGON_ASSET_URL = (branch: string, iconPath: string): string =>
  `https://raw.communitydragon.org/${branch}/game/${iconPath
    .replace("/lol-game-data/assets/", "")
    .toLowerCase()}`;

// Augment icons come in two sizes; the large one is what both surfaces draw.
export function augmentIconUrl(iconPath: string): string {
  if (!iconPath) return "";
  return (
    AUGMENT_ICON_BASE +
    iconPath.replace("/lol-game-data/assets/", "").replace("small", "large").toLowerCase()
  );
}

export function itemIconUrl(iconPath: string, branch = "latest"): string {
  if (!iconPath) return "";
  return CDRAGON_ASSET_URL(branch, iconPath);
}

// Some Mayhem item icons carry a texture-variant suffix CommunityDragon does
// not export ("3153_Blade_of_the_Ruined_King.project_jade.png" 404s while
// "3153_Blade_of_the_Ruined_King.png" exists), so the base path is worth
// trying as a fallback. Returns null when there is no variant to strip.
export function stripIconVariant(iconPath: string): string | null {
  const stripped = iconPath.replace(/\.[^./]+(\.\w+)$/, "$1");
  return stripped === iconPath ? null : stripped;
}

// Every URL worth trying for an item's icon, best first: the exact path on the
// patch's own branch, then the same path with any texture variant stripped. The
// app spreads these over a patch's own CommunityDragon branch; the site only
// ever needs "latest". There used to be a third-party mirror after these. It
// answers 404 for every item and sends Cross-Origin-Resource-Policy:
// same-origin, so no browser could load it - one dead request per unknown item.
export function itemIconSources(iconPath?: string, branch = "latest"): string[] {
  const urls: string[] = [];
  if (iconPath) {
    urls.push(CDRAGON_ASSET_URL(branch, iconPath));
    const base = stripIconVariant(iconPath);
    if (base) urls.push(CDRAGON_ASSET_URL(branch, base));
  }
  return urls;
}
