// Reading a version's notes out of CHANGELOG.md.
//
// This is the check that would have caught v2.14.5 shipping empty, so it is
// worth being sure it can tell the two cases apart: a release that genuinely
// has nothing to say, and one whose section is simply missing. It also has to
// agree with the release job about what a section is, because the same
// function now answers both.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { extractSection, hasSection } from "../.github/scripts/changelog-section.mts";

const CHANGELOG = `# Changelog

Preamble that is not a version section.

## v2.15.0 - 2026-09-01

- **A thing changed.** With an explanation.
- **Another thing.** Also explained.

## v2.14.9 - 2026-08-30

## v2.14.5 - 2026-08-28

- <!--fixes:v2.14.2--> **A fix.** For something we broke.

## v2.14.4 - 2026-08-28

- **The oldest one here.** So the walk has to stop at the end of the file.
`;

describe("extractSection", () => {
  it("returns the bullets under a version, and nothing from its neighbours", () => {
    const section = extractSection(CHANGELOG, "v2.15.0");
    assert.match(section, /A thing changed/);
    assert.match(section, /Another thing/);
    assert.doesNotMatch(section, /A fix/);
    assert.doesNotMatch(section, /oldest one/);
  });

  it("takes the version with or without its v", () => {
    assert.equal(extractSection(CHANGELOG, "2.15.0"), extractSection(CHANGELOG, "v2.15.0"));
  });

  it("reads the last section in the file, which has no heading after it", () => {
    assert.match(extractSection(CHANGELOG, "v2.14.4"), /oldest one here/);
  });

  it("keeps the fixes marker, which the app strips per reader", () => {
    // The marker decides whether a bullet is shown to someone upgrading from
    // before the bug existed, so it has to survive into the release body
    assert.match(extractSection(CHANGELOG, "v2.14.5"), /<!--fixes:v2\.14\.2-->/);
  });

  it("is empty for a version that is not there at all", () => {
    assert.equal(extractSection(CHANGELOG, "v9.9.9"), "");
  });

  it("is empty for a heading with nothing under it", () => {
    // A heading someone added and never filled in must not publish a body of
    // blank lines, which the update window would then show as an empty release
    assert.equal(extractSection(CHANGELOG, "v2.14.9"), "");
  });

  it("does not let one version answer for a longer one", () => {
    // v2.14.5 must not match a request for v2.14.50, which a plain prefix
    // check would happily do
    assert.equal(extractSection(CHANGELOG, "v2.14.50"), "");
  });

  it("does not read the file's own title as a section", () => {
    assert.equal(extractSection(CHANGELOG, "Changelog"), "");
  });
});

describe("hasSection", () => {
  it("is true only when there is something to publish", () => {
    assert.equal(hasSection(CHANGELOG, "v2.15.0"), true);
    assert.equal(hasSection(CHANGELOG, "v2.14.9"), false);
    assert.equal(hasSection(CHANGELOG, "v9.9.9"), false);
  });
});

describe("the real CHANGELOG.md", () => {
  const real = readFileSync("CHANGELOG.md", "utf8");

  it("has notes for the release that shipped without them", () => {
    assert.ok(hasSection(real, "v2.14.5"));
  });

  it("finds every version it lists", () => {
    // Guards the matcher against the real file's shape rather than the
    // fixture's: every heading in it has to be readable by the thing that
    // publishes it.
    const versions = [...real.matchAll(/^## (v\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
    assert.ok(versions.length > 5, "expected the changelog to list several versions");
    for (const version of versions) {
      assert.ok(hasSection(real, version), `${version} has a heading but reads as empty`);
    }
  });
});

// What gets published, as opposed to what stays in CHANGELOG.md.
//
// The generated-section marker is a note to whoever edits the changelog next.
// The app hides comments in its update window now, but only the app that has
// that fix; anyone upgrading from an older one runs old code and sees the raw
// body. So it is better never published.
describe("editor notes in a published body", () => {
  const MARKER =
    "<!-- Written from commit subjects because this version had no section. " +
    "Rewrite in player language: what changed, and why they would care. -->";

  const withMarker = `# Changelog

## v3.0.0 - 2026-09-20

${MARKER}

- Something that changed.

## v2.9.9 - 2026-09-01

- <!--fixes:v2.9.0--> **A fix.** For something we broke.
`;

  it("leaves the generator's note out of the body", () => {
    const out = extractSection(withMarker, "v3.0.0");
    assert.doesNotMatch(out, /<!--/);
    assert.doesNotMatch(out, /Rewrite in player language/);
    assert.match(out, /- Something that changed\./);
  });

  it("leaves no blank line where the note was", () => {
    assert.equal(extractSection(withMarker, "v3.0.0"), "- Something that changed.");
  });

  it("still publishes the fixes marker, which the app reads", () => {
    // Without it the app cannot tell who the bullet is for
    assert.match(extractSection(withMarker, "v2.9.9"), /<!--fixes:v2\.9\.0-->/);
  });

  it("a section of nothing but a note has nothing to publish", () => {
    const only = `# Changelog\n\n## v3.0.0 - 2026-09-20\n\n${MARKER}\n`;
    assert.equal(extractSection(only, "v3.0.0"), "");
    assert.equal(hasSection(only, "v3.0.0"), false);
  });
});
