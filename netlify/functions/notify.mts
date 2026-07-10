// Netlify Function: send a Telegram message to a family's linked chat.
//
// The app POSTs { space, text }. We look up that family's Telegram chat id
// (stored in Neon under the key `toybox:telegram:chat`) and send the message
// with the bot token from the TELEGRAM_BOT_TOKEN environment variable.
//
// The bot token lives only on the server — it is never exposed to the browser.

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_KEY = "toybox:telegram:chat";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);
  if (!DATABASE_URL) return json({ ok: false, error: "no-database" }, 503);
  if (!TOKEN) return json({ ok: false, error: "telegram-not-configured" }, 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const { space, text } = body || {};
  if (typeof space !== "string" || space.length < 8 || space.length > 256) {
    return json({ ok: false, error: "bad-space" }, 400);
  }
  if (typeof text !== "string" || !text.trim() || text.length > 1000) {
    return json({ ok: false, error: "bad-text" }, 400);
  }

  try {
    const sql = neon(DATABASE_URL);
    const rows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${CHAT_KEY} LIMIT 1`;
    const raw = rows.length ? (rows[0] as { v: string }).v : null;
    if (!raw) return json({ ok: false, error: "not-connected" });

    // window.storage may store the id as a raw string or a JSON string.
    let chatId = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" || typeof parsed === "number") chatId = String(parsed);
    } catch {
      /* raw string — use as-is */
    }
    chatId = String(chatId).trim();
    if (!chatId) return json({ ok: false, error: "not-connected" });

    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!d?.ok) return json({ ok: false, error: d?.description || "telegram-error" });
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};
