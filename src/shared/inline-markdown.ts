// The inline markdown a changelog bullet actually uses, for surfaces that
// draw text rather than render markdown.
//
// The app's update window prints release notes as plain lines, deliberately:
// a markdown dependency for four bullets is not worth it. It handled `**bold**`
// and nothing else, so a link came out as its source - a player upgrading to
// v2.14.9 read "[MayhemStats.com](https://mayhemstats.com/) had it too" with
// the brackets and the URL in the middle of the sentence.
//
// Its own file, with no imports, so the test can load it in plain node.

export interface Segment {
  text: string;
  // Present when this segment is a link. Only ever http(s): the app opens
  // these through the shell, and a changelog is not a reason to hand the
  // shell an arbitrary scheme.
  href?: string;
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Emphasis and code spans carry no meaning once the text is drawn plainly,
// so they lose their punctuation rather than showing it.
function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

export function parseInline(line: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of line.matchAll(LINK)) {
    const before = line.slice(last, m.index);
    if (before) out.push({ text: plain(before) });
    out.push({ text: plain(m[1]), href: m[2] });
    last = m.index + m[0].length;
  }
  const tail = line.slice(last);
  if (tail || out.length === 0) out.push({ text: plain(tail) });
  return out;
}
