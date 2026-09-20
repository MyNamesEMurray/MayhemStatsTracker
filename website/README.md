# MayhemStats - Community Stats Website

[mayhemstats.com](https://mayhemstats.com/) - public site showing community
augment and champion tier lists, builds, and win rates for ARAM Mayhem, built
from anonymized games contributed by MayhemStats Tracker players who opt in.

It's a static Vite + React app with no backend of its own: data comes from the
community Supabase project's aggregate-only views (`champion_stats`,
`augment_stats`), and champion/augment names and icons come from Data Dragon
and CommunityDragon in the browser. The raw match tables are locked behind row
level security - the views expose counts grouped by patch/queue/champion/
augment and nothing else.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # typechecks, then outputs to dist/
```

## Enabling ads

The AdSense integration ships inert: no ad scripts load and no layout space
is reserved until configured. After AdSense approval:

1. Put your publisher id (`ca-pub-…`) in `src/lib/adsense.ts` as `AD_CLIENT`.
2. Create two responsive display units in the AdSense dashboard and put
   their slot ids in `AD_SLOTS` (top = below the filter bar, bottom = above
   the footer).
3. Replace the placeholder in `public/ads.txt` with the line AdSense shows
   under Account → ads.txt.
4. Turn on consent messaging in AdSense under Privacy & messaging (served
   automatically by the same script - no code changes).

Setting `AD_CLIENT` back to an empty string fully disables ads again.

## Deploy

mayhemstats.com is a Cloudflare Worker that serves these files and nothing
else, built from this repository by Workers Builds. Its settings live in two
places, and both have to agree:

In the Cloudflare dashboard, under the Worker's **Settings -> Build**:

| Field                                | Value                          |
| ------------------------------------ | ------------------------------ |
| Root directory                       | `website`                      |
| Build command                        | `npm run build`                |
| Deploy command                       | `npx wrangler deploy`          |
| Non-production branch deploy command | `npx wrangler versions upload` |

`website` matters twice over. The repository root is the desktop app, whose
`npm run build` runs `electron-vite` and never produces a site; and wrangler
looks for its configuration beside the directory it runs in, which is where
`wrangler.jsonc` sits.

In `wrangler.jsonc`: the Worker's name, the asset directory, and how paths
with no file behind them are answered. The name has to stay exactly the name
of the existing Worker, or a deploy creates a second one and leaves the custom
domain on the first.

The build reads a few modules from `../src/shared` - the scoring and tier
maths, the augment descriptions, the design tokens - so that the site and the
desktop app cannot disagree about them. It still builds _from_ this directory;
it just needs the repository checked out whole, which is what Workers Builds
and GitHub Actions do by default. Hosts that copy only the root directory into
the build need that turned off: on Vercel, keep **Include source files outside
of the Root Directory** enabled.
