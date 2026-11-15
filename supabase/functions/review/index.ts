// Quarantine review endpoint.
//
// One way in: the review queue at mayhemstats.com/review/queue/. It
// authenticates with an expiring key - sha256(review_secret:admin:exp) - minted
// by hand and good until the exp it was minted with, and works through the
// backlog 20 games at a time.
//
// There used to be a second: one approve and one deny link per game in the
// digest email, each with a key that never expired. The digest now carries only
// the queue link and nothing was pending when they were removed, so they went.
//
// The review_secret never leaves the server. Every action is idempotent:
// re-running a handled item reports its current status without re-inserting.
import { createClient } from "npm:@supabase/supabase-js@2";
import { rowsFor } from "./rows.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Games per bulk call. Each one is a match row, ten participants and about
// forty augments; twenty at a time keeps a batch to four upserts of a few
// hundred rows and well inside the function's wall clock, while giving the
// page something to draw a progress bar with.
const BULK_MAX = 20;

// An admin link is a bearer credential in a URL. It can't be revoked short of
// rotating review_secret, so refuse one minted to live longer than this.
const MAX_ADMIN_TTL_S = 30 * 24 * 60 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Insert one batch of approved games. Rows are pooled across the batch so a
// run of twenty games costs four upserts rather than eighty round trips.
async function approveRows(supabase: any, rows: any[]) {
  const matches: any[] = [];
  const participants: any[] = [];
  const augments: any[] = [];
  const contributions: any[] = [];
  const ok: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const built = rowsFor(row);
      matches.push(built.match);
      participants.push(...built.participants);
      augments.push(...built.augments);
      contributions.push(built.contribution);
      ok.push(row.id);
    } catch (err) {
      failed.push({ id: row.id, error: (err as Error).message });
    }
  }

  if (matches.length > 0) {
    const m = await supabase
      .from("matches")
      .upsert(matches, { onConflict: "platform,game_id", ignoreDuplicates: true });
    if (m.error)
      return {
        ok: [],
        failed: rows.map((r: any) => ({ id: r.id, error: "storing match failed" })),
      };

    const p = await supabase.from("match_participants").upsert(participants, {
      onConflict: "platform,game_id,participant_id",
      ignoreDuplicates: true,
    });
    if (p.error)
      return {
        ok: [],
        failed: rows.map((r: any) => ({ id: r.id, error: "storing participants failed" })),
      };

    if (augments.length > 0) {
      const a = await supabase.from("match_participant_augments").upsert(augments, {
        onConflict: "platform,game_id,participant_id,slot",
        ignoreDuplicates: true,
      });
      if (a.error)
        return {
          ok: [],
          failed: rows.map((r: any) => ({ id: r.id, error: "storing augments failed" })),
        };
    }

    const c = await supabase.from("contributions").upsert(contributions, {
      onConflict: "contributor_token,platform,game_id",
      ignoreDuplicates: true,
    });
    if (c.error)
      return {
        ok: [],
        failed: rows.map((r: any) => ({ id: r.id, error: "storing contribution failed" })),
      };
  }

  // Only after every row is safely stored - a quarantine row still marked
  // pending can be retried, one marked approved without its data cannot.
  if (ok.length > 0) {
    const upd = await supabase
      .from("quarantine")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .in("id", ok)
      .eq("status", "pending");
    if (upd.error) {
      return {
        ok: [],
        failed: ok.map((id) => ({ id, error: "stored, but marking approved failed" })),
      };
    }
  }

  return { ok, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cfg = await supabase
    .from("admin_config")
    .select("value")
    .eq("key", "review_secret")
    .single();
  if (cfg.error || !cfg.data?.value) return json({ error: "config unavailable" }, 500);
  const secret = cfg.data.value;

  const { action, key } = body ?? {};
  if (typeof key !== "string" || key.length !== 64) return json({ error: "bad key" }, 400);

  // -------------------------------------------------------------------------
  // Queue actions, for the review page
  // -------------------------------------------------------------------------
  if (action === "queue" || action === "bulk") {
    const exp = Number(body?.exp);
    if (!Number.isInteger(exp)) return json({ error: "bad exp" }, 400);
    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return json({ error: "link expired" }, 403);
    if (exp - now > MAX_ADMIN_TTL_S) return json({ error: "link lifetime too long" }, 403);

    const expectedAdmin = await sha256Hex(`${secret}:admin:${exp}`);
    if (!timingSafeEqual(expectedAdmin, key.toLowerCase()))
      return json({ error: "invalid key" }, 403);

    if (action === "queue") {
      const limit = Math.min(Number(body?.limit) || 200, 500);
      const offset = Math.max(Number(body?.offset) || 0, 0);
      const q = await supabase
        .from("quarantine")
        .select(
          "id, platform, game_id, reasons, created_at, patch:payload->>gameVersion, duration:payload->>gameDuration",
          { count: "exact" },
        )
        .eq("status", "pending")
        // Games from one upload share a created_at; without a second key a page
        // boundary inside such a group repeats or skips a row
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (q.error) return json({ error: "query failed" }, 500);
      return json({ pending: q.count ?? q.data.length, items: q.data });
    }

    const ids = body?.ids;
    const decision = body?.decision;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_MAX) {
      return json({ error: `ids must be 1..${BULK_MAX} entries` }, 400);
    }
    if (!ids.every((id: unknown) => typeof id === "string" && UUID_RE.test(id))) {
      return json({ error: "bad id in ids" }, 400);
    }
    if (decision !== "approve" && decision !== "deny") return json({ error: "bad decision" }, 400);

    if (decision === "deny") {
      const upd = await supabase
        .from("quarantine")
        .update({ status: "denied", reviewed_at: new Date().toISOString() })
        .in("id", ids)
        .eq("status", "pending")
        .select("id");
      if (upd.error) return json({ error: "update failed" }, 500);
      return json({ decision: "denied", ok: upd.data.map((r: any) => r.id), failed: [] });
    }

    // Re-read under the pending filter so an item handled since the page
    // loaded is skipped rather than inserted twice
    const rows = await supabase
      .from("quarantine")
      .select("id, contributor_token, payload")
      .in("id", ids)
      .eq("status", "pending");
    if (rows.error) return json({ error: "lookup failed" }, 500);

    const result = await approveRows(supabase, rows.data);
    return json({
      decision: "approved",
      ok: result.ok,
      failed: result.failed,
      skipped: ids.filter((id: string) => !rows.data.some((r: any) => r.id === id)),
    });
  }

  return json({ error: "bad action" }, 400);
});
