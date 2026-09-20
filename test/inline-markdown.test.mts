// Drawing a changelog bullet without a markdown renderer.
//
// The update window prints release notes as text. It knew about `**bold**`
// and nothing else, so v2.14.9 reached players reading
// "[MayhemStats.com](https://mayhemstats.com/) had it too" - the syntax in
// the middle of a sentence written for someone who does not write markdown.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseInline } from "../src/shared/inline-markdown.ts";

const text = (line: string) =>
  parseInline(line)
    .map((s) => s.text)
    .join("");
const links = (line: string) => parseInline(line).filter((s) => s.href);

describe("parseInline", () => {
  test("turns a link into its text plus a destination", () => {
    const out = parseInline("[MayhemStats.com](https://mayhemstats.com/) had it too.");
    assert.deepEqual(out, [
      { text: "MayhemStats.com", href: "https://mayhemstats.com/" },
      { text: " had it too." },
    ]);
  });

  test("leaves no markdown syntax in what gets drawn", () => {
    // The actual v2.14.9 sentence
    const line =
      "It only happened in a narrow band. [MayhemStats.com](https://mayhemstats.com/) had it too.";
    const drawn = text(line);
    assert.doesNotMatch(drawn, /[[\]()]/);
    assert.match(drawn, /MayhemStats\.com had it too\./);
  });

  test("drops the punctuation of bold and code spans", () => {
    // The v2.14.11 note opens bold and contains a code span
    assert.equal(
      text("**A thing.** It starts with `<!--` now."),
      "A thing. It starts with <!-- now.",
    );
  });

  test("handles several links in one line", () => {
    const out = links("see [one](https://a.example/) and [two](https://b.example/)");
    assert.deepEqual(
      out.map((s) => [s.text, s.href]),
      [
        ["one", "https://a.example/"],
        ["two", "https://b.example/"],
      ],
    );
  });

  test("a line with no link is a single plain segment", () => {
    assert.deepEqual(parseInline("Just a sentence."), [{ text: "Just a sentence." }]);
  });

  test("an empty line still yields a segment, so rendering keeps the blank", () => {
    assert.deepEqual(parseInline(""), [{ text: "" }]);
  });

  test("only http and https become links", () => {
    // These reach shell.openExternal, so a changelog must not be able to
    // hand it a file:// or javascript: destination
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "mailto:a@b.c"]) {
      const line = `[click](${bad})`;
      assert.equal(links(line).length, 0, `${bad} should not become a link`);
      // and it is left alone rather than half-eaten
      assert.equal(text(line), line);
    }
  });

  test("keeps bold inside a link's text", () => {
    const out = parseInline("[**Bold link**](https://a.example/)");
    assert.deepEqual(out, [{ text: "Bold link", href: "https://a.example/" }]);
  });

  test("leaves a bare URL alone rather than guessing", () => {
    assert.equal(text("see https://a.example/ for more"), "see https://a.example/ for more");
  });
});
