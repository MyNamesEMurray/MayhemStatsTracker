import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/shared/supabase.ts";

// The project URL and anon key live in src/shared/supabase.ts, which the site,
// the desktop app and the prerender script import. The two review pages are
// plain HTML with an inline script and cannot import it, so they carry copies.
// This is what keeps those copies from drifting: rotate the key in one place
// and this fails until the pages agree.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = ["website/public/review/index.html", "website/public/review/queue/index.html"];

describe("supabase config copies", () => {
  for (const page of PAGES) {
    it(`${page} uses the shared URL and key`, () => {
      const html = readFileSync(ROOT + page, "utf8");
      assert.ok(html.includes(SUPABASE_URL), "URL differs from src/shared/supabase.ts");
      assert.ok(html.includes(SUPABASE_ANON_KEY), "anon key differs from src/shared/supabase.ts");
    });
  }
});
