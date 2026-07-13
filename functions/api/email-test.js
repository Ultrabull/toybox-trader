// Cloudflare Pages Function — send a test email to a family's saved address.
// Route: /api/email-test (POST {space}). Uses Resend.
import { neon } from "@neondatabase/serverless";

const EMAIL_KEY = "toybox:email:notify";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  const DATABASE_URL = env.DATABASE_URL || env.NETLIFY_DATABASE_URL || "";
  const RESEND_API_KEY = env.RESEND_API_KEY || "";
  const EMAIL_FROM = env.EMAIL_FROM || "Toybox Trader <onboarding@resend.dev>";
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);
  if (!RESEND_API_KEY) return json({ ok: false, error: "email-not-configured" }, 503);

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
    const rows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${EMAIL_KEY} LIMIT 1`;
    let to = rows.length ? rows[0].v : "";
    try {
      const p = JSON.parse(to);
      if (typeof p === "string") to = p;
    } catch {}
    to = String(to).trim();
    if (!to) return json({ ok: false, error: "not-connected" });

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject: "🧸 Toybox Trader — email updates are on!",
        text: "You're all set! You'll get weekly and monthly summaries of your kids' trades and progress at this address. 🎉",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: d?.message || "email-error" });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
