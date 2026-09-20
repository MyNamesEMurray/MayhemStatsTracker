// The release workflow ends every body with a horizontal rule and a line
// pointing at the code signing policy, which the SignPath Foundation asks
// release pages to carry. That is for someone reading GitHub; in the update
// window it would repeat under every version, so the body stops at the rule.
//
// Its own file, with no imports, so the test can load it in plain node.
const FOOTER_RULE = /^\s*---\s*$/;

export function withoutFooter(body: string): string {
  const lines = body.split("\n");
  const rule = lines.findIndex((line) => FOOTER_RULE.test(line));
  return rule === -1 ? body : lines.slice(0, rule).join("\n");
}
