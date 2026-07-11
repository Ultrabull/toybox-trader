// Deletes ALL data for a family (space) from Neon — the kids registry, every
// kid's state, Telegram link, push subscriptions, report baselines, everything
// under that space. Used by the in-app "Delete account" flow (App Store /
// Play Store require in-app account deletion).

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const { space } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) {
    return json({ ok: false, error: "bad-space" }, 400);
  }

  try {
    const sql = neon(DATABASE_URL);
    const deleted = await sql`DELETE FROM kv WHERE space = ${space}`;
    return json({ ok: true, deleted: (deleted as any)?.length ?? true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};
