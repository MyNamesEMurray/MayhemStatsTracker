import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withoutComments, withoutFooter } from "../src/main/release-footer.ts";

const FOOTER =
  "---\n[Code signing policy](https://mayhemstats.com/download/#code-signing-policy) - free code signing provided by SignPath.io, certificate by SignPath Foundation.";

describe("withoutFooter", () => {
  it("drops the code signing footer the release workflow appends", () => {
    assert.equal(
      withoutFooter("- **Something new.** It is good.\n\n" + FOOTER),
      "- **Something new.** It is good.\n",
    );
  });

  it("leaves nothing of a body that is only the footer", () => {
    assert.equal(withoutFooter("\n" + FOOTER).trim(), "");
  });

  it("keeps a rule-free body as it is", () => {
    assert.equal(withoutFooter("- Fixed a thing."), "- Fixed a thing.");
  });

  it("stops at the first rule, not a dash-led bullet", () => {
    assert.equal(withoutFooter("- one\n-- not a rule\n---\n- gone"), "- one\n-- not a rule");
  });
});

// What the update window shows a player, which is not what GitHub shows a
// reader: the window renders the raw release body itself, so anything
// markdown would have hidden has to be hidden here instead.
describe("withoutComments", () => {
  it("hides the generator's note to the author", () => {
    // v2.14.9 shipped with exactly this visible in the update window. The
    // comment is addressed to whoever rewrites the section, never to a player.
    const body =
      "<!-- Written from commit subjects because this version had no section. " +
      "Rewrite in player language: what changed, and why they would care. -->\n\n" +
      "- Stop champion names drawing over the tier badge at 1400-1499px";
    const out = withoutComments(body);
    assert.doesNotMatch(out, /Rewrite in player language/);
    assert.doesNotMatch(out, /<!--/);
    assert.match(out, /- Stop champion names drawing over the tier badge/);
  });

  it("hides any comment, not only the ones we know by name", () => {
    assert.doesNotMatch(withoutComments("<!-- todo: check this -->\n- Real."), /todo/);
  });

  it("takes the whole line when the comment had one to itself", () => {
    // Otherwise the window draws an empty bullet where the note was
    assert.equal(withoutComments("<!-- a note -->\n- Real."), "- Real.");
  });

  it("keeps the text around a comment that sits mid-sentence", () => {
    assert.equal(withoutComments("- Before <!-- hidden --> after."), "- Before  after.");
  });

  it("hides a comment that runs over several lines", () => {
    const out = withoutComments("<!--\n  a long note\n  over lines\n-->\n- Real.");
    assert.equal(out, "- Real.");
    assert.doesNotMatch(out, /long note/);
  });

  it("leaves a body with no comments exactly as it is", () => {
    const body = "- **A thing.** It happened.\n- **Another.** Also.";
    assert.equal(withoutComments(body), body);
  });

  it("leaves nothing of a body that was only a comment", () => {
    assert.equal(withoutComments("<!-- nothing to say -->").trim(), "");
  });

  it("keeps the fixes marker for the caller to read first", () => {
    // buildReleaseNotes decides per reader whether that bullet is shown at
    // all, so this must not quietly eat the marker before it gets there.
    const line = "- <!--fixes:v2.10.0--> Fixed the thing.";
    assert.match(withoutComments(line), /fixes:v2\.10\.0|Fixed the thing/);
  });
});
