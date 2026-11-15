// Removes everything a contributor token uploaded. Matches that no other
// token also contributed are deleted entirely (participants and augments
// cascade); matches shared with other contributors stay, since those
// contributors still consent to them.
//
// Recovered from the deployed function (version 1, verify_jwt on), which had
// never been committed here.
import { createClient } from "npm:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const token = body?.token;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return json({ error: "invalid contributor token" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("delete_contributions", { p_token: token });
  if (error) return json({ error: "deletion failed" }, 500);

  return json({ removedMatches: data ?? 0 });
});
