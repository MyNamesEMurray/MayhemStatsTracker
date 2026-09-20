// Is this download URL one of ours?
//
// The updater is handed an asset URL over IPC and then downloads and runs
// the executable at the other end, so it checks the URL first. That check
// used to be a string comparison against the full repository URL, which
// stopped being true the moment the repository was renamed: GitHub
// canonicalises to the new name, the releases API started returning
// .../MayhemStatsTracker/releases/download/..., and the updater refused
// every update with "Unexpected download URL".
//
// What actually matters is not the repository's current name, which can
// change again. It is that the file comes from GitHub, over https, from a
// release of a repository this account owns. That is what is checked.
//
// Its own file, with no imports, so the test can load it in plain node.

const OWNER = "mynamesemurray";

export function isOurReleaseAsset(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // Exactly github.com, so "github.com.evil.test" and any subdomain are out
  if (parsed.hostname.toLowerCase() !== "github.com") return false;

  const parts = parsed.pathname.split("/").filter(Boolean);
  // /<owner>/<repo>/releases/download/<tag>/<file>
  if (parts.length < 6) return false;
  if (parts[0].toLowerCase() !== OWNER) return false;
  return parts[2] === "releases" && parts[3] === "download";
}
