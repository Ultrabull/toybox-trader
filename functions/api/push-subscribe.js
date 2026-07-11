// Cloudflare Pages Function — store/remove a push subscription (with timezone).
// Route: /api/push-subscribe (POST {space, subscription, tz, op}).
import { neon } from "@neondatabase/serverless";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const DATABASE_URL = env.DATABASE_URL || env.NETLIFY_DATABASE_URL || "";
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const { space, subscription, tz, op } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) return json({ ok: false, error: "bad-space" }, 400);
  const endpoint = subscription?.endpoint;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) return json({ ok: false, error: "bad-subscription" }, 400);

  const key = "toybox:push:" + hash(endpoint);
  try {
    const sql = neon(DATABASE_URL);
    await sql`
      CREATE TABLE IF NOT EXISTS kv (
        space text NOT NULL, k text NOT NULL, v text,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (space, k)
      )`;
    if (op === "unsubscribe") {
      await sql`DELETE FROM kv WHERE space = ${space} AND k = ${key}`;
      return json({ ok: true });
    }
    const value = JSON.stringify({ sub: subscription, tz: typeof tz === "string" ? tz : "" });
    if (value.length > 4000) return json({ ok: false, error: "too-big" }, 400);
    await sql`
      INSERT INTO kv (space, k, v, updated_at) VALUES (${space}, ${key}, ${value}, now())
      ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
