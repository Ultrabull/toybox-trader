// Cloudflare Pages Function — delete ALL of a family's data from Neon.
// Route: /api/delete-account (POST {space}).
import { neon } from "@neondatabase/serverless";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

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
  const { space } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) return json({ ok: false, error: "bad-space" }, 400);

  try {
    const sql = neon(DATABASE_URL);
    await sql`DELETE FROM kv WHERE space = ${space}`;
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
