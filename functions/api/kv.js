// Cloudflare Pages Function — cloud key/value store backed by Neon Postgres.
// Route: /api/kv  (POST). Mirrors the Netlify kv function; same Neon DB.
import { neon } from "@neondatabase/serverless";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  const DATABASE_URL = env.DATABASE_URL || env.NETLIFY_DATABASE_URL || "";
  if (!DATABASE_URL) return json({ error: "no-database", cloud: false }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }
  const { op, space, key, value } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) {
    return json({ error: "bad-space" }, 400);
  }

  try {
    const sql = neon(DATABASE_URL);
    await sql`
      CREATE TABLE IF NOT EXISTS kv (
        space text NOT NULL, k text NOT NULL, v text,
        updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (space, k)
      )`;
    switch (op) {
      case "get": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        const rows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${key} LIMIT 1`;
        return json({ value: rows.length ? rows[0].v : null });
      }
      case "set": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        if (typeof value !== "string" || value.length > 2_000_000) return json({ error: "bad-value" }, 400);
        await sql`
          INSERT INTO kv (space, k, v, updated_at) VALUES (${space}, ${key}, ${value}, now())
          ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
        return json({ ok: true });
      }
      case "delete": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        await sql`DELETE FROM kv WHERE space = ${space} AND k = ${key}`;
        return json({ ok: true });
      }
      case "dump": {
        const rows = await sql`SELECT k, v FROM kv WHERE space = ${space}`;
        const data = {};
        for (const r of rows) data[r.k] = r.v;
        return json({ data });
      }
      default:
        return json({ error: "bad-op" }, 400);
    }
  } catch (e) {
    return json({ error: "server", detail: String(e?.message || e) }, 500);
  }
}

export const onRequestGet = () => json({ error: "method-not-allowed" }, 405);
