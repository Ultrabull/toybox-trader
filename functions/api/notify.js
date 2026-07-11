// Cloudflare Pages Function — send a Telegram message to a family's chat.
// Route: /api/notify (POST {space, text}). Uses fetch + Neon (edge-safe).
import { neon } from "@neondatabase/serverless";

const CHAT_KEY = "toybox:telegram:chat";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  const DATABASE_URL = env.DATABASE_URL || env.NETLIFY_DATABASE_URL || "";
  const TOKEN = env.TELEGRAM_BOT_TOKEN || "";
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);
  if (!TOKEN) return json({ ok: false, error: "telegram-not-configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const { space, text } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) return json({ ok: false, error: "bad-space" }, 400);
  if (typeof text !== "string" || !text.trim() || text.length > 1000) return json({ ok: false, error: "bad-text" }, 400);

  try {
    const sql = neon(DATABASE_URL);
    const rows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${CHAT_KEY} LIMIT 1`;
    const raw = rows.length ? rows[0].v : null;
    if (!raw) return json({ ok: false, error: "not-connected" });
    let chatId = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" || typeof parsed === "number") chatId = String(parsed);
    } catch {}
    chatId = String(chatId).trim();
    if (!chatId) return json({ ok: false, error: "not-connected" });

    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d?.ok) return json({ ok: false, error: d?.description || "telegram-error" });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
