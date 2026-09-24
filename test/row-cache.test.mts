import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPatchRowCache, type CachedRows } from "../src/shared/rowCache.ts";

type Row = { patch: string; id: number };

function fakeFetch(rows: Row[]) {
  const calls: (string[] | undefined)[] = [];
  const fetchRows = async (patches?: string[]) => {
    calls.push(patches);
    return patches ? rows.filter((r) => patches.includes(r.patch)) : rows;
  };
  return { calls, fetchRows };
}

const ROWS: Row[] = [
  { patch: "26.9", id: 1 },
  { patch: "26.8", id: 2 },
  { patch: "26.7", id: 3 },
];

describe("createPatchRowCache", () => {
  it("fetches only the patches it does not already hold", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    const { calls, fetchRows } = fakeFetch(ROWS);
    assert.deepEqual(await cache.load("c:1", ["26.9"], fetchRows), [ROWS[0]]);
    const widened = await cache.load("c:1", ["26.9", "26.8"], fetchRows);
    assert.deepEqual(widened.map((r) => r.id).sort(), [1, 2]);
    assert.deepEqual(calls, [["26.9"], ["26.8"]]);
    await cache.load("c:1", ["26.8", "26.9"], fetchRows);
    assert.equal(calls.length, 2);
  });

  it("remembers a patch with no rows", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    const { calls, fetchRows } = fakeFetch(ROWS);
    assert.deepEqual(await cache.load("c:1", ["25.1"], fetchRows), []);
    await cache.load("c:1", ["25.1"], fetchRows);
    assert.equal(calls.length, 1);
  });

  it("keeps scopes apart", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    const { calls, fetchRows } = fakeFetch(ROWS);
    await cache.load("c:1", ["26.9"], fetchRows);
    await cache.load("c:2", ["26.9"], fetchRows);
    assert.equal(calls.length, 2);
  });

  it("answers a patch subset from an every-patch fetch", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    const { calls, fetchRows } = fakeFetch(ROWS);
    assert.equal((await cache.load("c:1", undefined, fetchRows)).length, 3);
    assert.deepEqual(await cache.load("c:1", ["26.7"], fetchRows), [ROWS[2]]);
    assert.deepEqual(calls, [undefined]);
  });

  it("shares a request that is still in flight", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    const { calls, fetchRows } = fakeFetch(ROWS);
    await Promise.all([
      cache.load("c:1", ["26.9"], fetchRows),
      cache.load("c:1", ["26.9"], fetchRows),
    ]);
    assert.equal(calls.length, 1);
  });

  it("refetches once the entry is older than the ttl", async () => {
    const cache = createPatchRowCache<Row>({ view: "v", ttlMs: -1 });
    const { calls, fetchRows } = fakeFetch(ROWS);
    await cache.load("c:1", ["26.9"], fetchRows);
    await cache.load("c:1", ["26.9"], fetchRows);
    assert.equal(calls.length, 2);
  });

  it("does not cache a failed fetch", async () => {
    const cache = createPatchRowCache<Row>({ view: "v" });
    let fail = true;
    const fetchRows = async () => {
      if (fail) throw new Error("down");
      return [ROWS[0]];
    };
    await assert.rejects(cache.load("c:1", ["26.9"], fetchRows));
    fail = false;
    assert.deepEqual(await cache.load("c:1", ["26.9"], fetchRows), [ROWS[0]]);
  });

  it("serves and fills a persistent store", async () => {
    const saved = new Map<string, CachedRows>();
    const store = { get: (k: string) => saved.get(k) ?? null, set: saved.set.bind(saved) };
    const first = createPatchRowCache<Row>({ view: "v", store });
    const { calls, fetchRows } = fakeFetch(ROWS);
    await first.load("c:1", ["26.9"], fetchRows);
    await new Promise((r) => setImmediate(r));
    const second = createPatchRowCache<Row>({ view: "v", store });
    assert.deepEqual(await second.load("c:1", ["26.9"], fetchRows), [ROWS[0]]);
    assert.equal(calls.length, 1);
  });
});
