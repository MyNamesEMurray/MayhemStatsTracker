// The release workflow ends every body with a horizontal rule and a line
// pointing at the code signing policy, which the SignPath Foundation asks
// release pages to carry. That is for someone reading GitHub; in the update
// window it would repeat under every version, so the body stops at the rule.
//
// Its own file, with no imports, so the test can load it in plain node.
const FOOTER_RULE = /^\s*---\s*$/;

// Comments in a release body are notes between whoever writes the changelog
// and whoever edits it next. GitHub hides them when it renders markdown; the
// update window renders the body itself and hid only the one marker it knew
// by name, so when the release workflow began filling empty versions from
// commit subjects, its "rewrite this in player language" note went out in
// v2.14.9's update window - to the very readers it was telling the author to
// write for.
const OWN_LINE_COMMENT = /^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n?/gm;
const INLINE_COMMENT = /<!--[\s\S]*?-->/g;

export function withoutFooter(body: string): string {
  const lines = body.split("\n");
  const rule = lines.findIndex((line) => FOOTER_RULE.test(line));
  return rule === -1 ? body : lines.slice(0, rule).join("\n");
}

export function withoutComments(body: string): string {
  return (
    body
      // A comment with a line to itself takes the line with it, so the update
      // window shows no blank bullet where it used to be.
      .replace(OWN_LINE_COMMENT, "")
      // Anything left is mid-sentence; only the comment goes.
      .replace(INLINE_COMMENT, "")
  );
}
