// The check standing between an IPC message and running a downloaded exe.
//
// It used to be a prefix match on the full repository URL. Renaming the
// repository broke it silently in the worst direction: GitHub canonicalises
// to the new name, so every asset URL the releases API returned stopped
// matching and the updater refused all updates with "Unexpected download
// URL". The rule is now about who published the file, not what the
// repository is called this week.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isOurReleaseAsset } from "../src/shared/update-url.ts";

const ASSET = (repo: string) =>
  `https://github.com/MyNamesEMurray/${repo}/releases/download/v2.14.12/MayhemTracker-Setup.exe`;

describe("isOurReleaseAsset", () => {
  test("accepts the repository under its current name", () => {
    assert.equal(isOurReleaseAsset(ASSET("MayhemStatsTracker")), true);
  });

  test("still accepts it under the old name, for releases published before the rename", () => {
    assert.equal(isOurReleaseAsset(ASSET("mayhem-tracker")), true);
  });

  test("would accept it under a future name, which is the point", () => {
    assert.equal(isOurReleaseAsset(ASSET("renamed-again")), true);
  });

  test("owner is matched without case mattering, as GitHub does", () => {
    assert.equal(
      isOurReleaseAsset("https://github.com/mynamesemurray/x/releases/download/v1/a.exe"),
      true,
    );
  });

  test("refuses another account's release", () => {
    assert.equal(
      isOurReleaseAsset("https://github.com/someoneelse/mayhem-tracker/releases/download/v1/a.exe"),
      false,
    );
  });

  test("refuses a host that merely looks like GitHub", () => {
    for (const host of ["github.com.evil.test", "raw.github.com", "notgithub.com", "evil.test"]) {
      assert.equal(
        isOurReleaseAsset(`https://${host}/MyNamesEMurray/x/releases/download/v1/a.exe`),
        false,
        `${host} should be refused`,
      );
    }
  });

  test("refuses plain http", () => {
    assert.equal(
      isOurReleaseAsset("http://github.com/MyNamesEMurray/x/releases/download/v1/a.exe"),
      false,
    );
  });

  test("refuses a path that is not a release download", () => {
    for (const p of [
      "https://github.com/MyNamesEMurray/x/archive/refs/heads/main.zip",
      "https://github.com/MyNamesEMurray/x/raw/main/evil.exe",
      "https://github.com/MyNamesEMurray/x/releases/latest",
      "https://github.com/MyNamesEMurray/x",
    ]) {
      assert.equal(isOurReleaseAsset(p), false, `${p} should be refused`);
    }
  });

  test("refuses something that is not a URL at all", () => {
    for (const bad of ["", "not a url", "javascript:alert(1)", "file:///C:/evil.exe"]) {
      assert.equal(isOurReleaseAsset(bad), false, `${bad} should be refused`);
    }
  });
});
