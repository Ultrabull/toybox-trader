// Netlify Function: cloud key/value store backed by Neon Postgres.
//
// The browser cannot talk to Postgres directly (that would expose the DB
// password), so all reads/writes go through this same-origin function. Data is
// partitioned by `space` — the app's "Family Sync Code" — so each household's
// accounts are isolated. Anyone holding a space code can read/write that
// space's data; the code is a long unguessable token, so it acts as a
// capability key (fine for this app: play money + parent-entered names/emails).
//
// The connection string comes from NETLIFY_DATABASE_URL (set automatically by
// the Netlify Neon integration) or DATABASE_URL as a fallback.

import { neon } from "@neondatabase/serverless";

const DATABASE_URL =
  process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";

// Create the table once per warm function instance.
let ready: Promise<void> | null = null;
function connect() {
  const sql = neon(DATABASE_URL);
  if (!ready) {
    ready = sql`
      CREATE TABLE IF NOT EXISTS kv (
        space      text        NOT NULL,
        k          text        NOT NULL,
        v          text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (space, k)
      )
    `
      .then(() => undefined)
      .catch((e) => {
        ready = null; // allow a retry on the next request
        throw e;
      });
  }
  return { sql, ready };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);
  if (!DATABASE_URL) return json({ error: "no-database", cloud: false }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }

  const { op, space, key, value } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) {
    return json({ error: "bad-space" }, 400);
  }

  try {
    const { sql, ready } = connect();
    await ready;

    switch (op) {
      case "get": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        const rows = await sql`
          SELECT v FROM kv WHERE space = ${space} AND k = ${key} LIMIT 1
        `;
        return json({ value: rows.length ? rows[0].v : null });
      }
      case "set": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        if (typeof value !== "string" || value.length > 2_000_000) {
          return json({ error: "bad-value" }, 400);
        }
        await sql`
          INSERT INTO kv (space, k, v, updated_at)
          VALUES (${space}, ${key}, ${value}, now())
          ON CONFLICT (space, k)
          DO UPDATE SET v = EXCLUDED.v, updated_at = now()
        `;
        return json({ ok: true });
      }
      case "delete": {
        if (typeof key !== "string") return json({ error: "bad-key" }, 400);
        await sql`DELETE FROM kv WHERE space = ${space} AND k = ${key}`;
        return json({ ok: true });
      }
      case "dump": {
        const rows = await sql`SELECT k, v FROM kv WHERE space = ${space}`;
        const data: Record<string, string> = {};
        for (const r of rows as Array<{ k: string; v: string }>) data[r.k] = r.v;
        return json({ data });
      }
      default:
        return json({ error: "bad-op" }, 400);
    }
  } catch (e: any) {
    return json({ error: "server", detail: String(e?.message || e) }, 500);
  }
};
