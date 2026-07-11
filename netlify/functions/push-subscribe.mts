// Stores or removes a browser push subscription for a family, in Neon.
// Each device's subscription is one row keyed by a hash of its endpoint, so
// re-subscribing is idempotent and unsubscribing is exact.

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const { space, subscription, tz, op } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) {
    return json({ ok: false, error: "bad-space" }, 400);
  }
  const endpoint = subscription?.endpoint;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) {
    return json({ ok: false, error: "bad-subscription" }, 400);
  }

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
    // Store the subscription together with the device timezone, so the
    // reminder scheduler can fire at the kid's local time.
    const value = JSON.stringify({ sub: subscription, tz: typeof tz === "string" ? tz : "" });
    if (value.length > 4000) return json({ ok: false, error: "too-big" }, 400);
    await sql`
      INSERT INTO kv (space, k, v, updated_at) VALUES (${space}, ${key}, ${value}, now())
      ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};
