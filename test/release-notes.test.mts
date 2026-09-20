import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withoutFooter } from "../src/main/release-footer.ts";

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
