// Shared logic for the scheduled Telegram reports. Runs in Node (GitHub
// Actions), talking to Neon directly. Ported from the former Netlify function.

const CHAT_KEY = "toybox:telegram:chat";
const STOCKS = ["AAPL", "RBLX", "DIS", "NVDA"];
const UA = "Mozilla/5.0 (compatible; ToyboxTrader/1.0)";

const money = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function parseMaybeJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw ?? fallback;
  }
}

export async function fetchPrices() {
  const out = {};
  await Promise.allSettled([
    ...STOCKS.map(async (sym) => {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`, {
        headers: { "user-agent": UA },
      });
      if (!r.ok) return;
      const d = await r.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p > 0) out[sym] = p;
    }),
    (async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd");
      if (!r.ok) return;
      const d = await r.json();
      if (d?.bitcoin?.usd > 0) out.BTC = d.bitcoin.usd;
      if (d?.ethereum?.usd > 0) out.ETH = d.ethereum.usd;
    })(),
  ]);
  return out;
}

function valuePortfolio(st, prices) {
  let v = st.cash || 0;
  for (const h of st.portfolio || []) v += (h.qty || 0) * (prices[h.ticker] || h.avgCost || 0);
  return v;
}

async function sendTelegram(token, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {}
}

// Send an email via Resend. Returns true on success.
export async function sendEmail(apiKey, from, to, subject, text) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html: "<pre style='font:15px/1.6 system-ui,sans-serif;white-space:pre-wrap'>" +
          text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) +
          "</pre>",
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const EMAIL_KEY = "toybox:email:notify";

export async function sendReports(period, sql, token, days, now = Date.now()) {
  const cutoff = now - days * 86_400_000;
  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "Toybox Trader <onboarding@resend.dev>";

  // Families that have ANY parent channel configured (Telegram and/or email).
  const rows = await sql`SELECT space, k, v FROM kv WHERE k = ${CHAT_KEY} OR k = ${EMAIL_KEY}`;
  const bySpace = new Map();
  for (const r of rows) {
    if (!bySpace.has(r.space)) bySpace.set(r.space, {});
    if (r.k === CHAT_KEY) bySpace.get(r.space).chat = r.v;
    else bySpace.get(r.space).email = r.v;
  }
  if (bySpace.size === 0) return { families: 0, sent: 0 };

  const prices = await fetchPrices();
  const heading = period === "weekly" ? "📅 Weekly report" : "🗓️ Monthly report";
  let sent = 0;

  for (const [space, channels] of bySpace) {
    const regRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = 'toybox:kids:registry'`;
    const kids = parseMaybeJson(regRows[0]?.v, []);
    if (!Array.isArray(kids) || kids.length === 0) continue;

    const lines = [`${heading} — Toybox Trader`, ""];
    let anyKid = false;

    for (const kid of kids) {
      const stRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${"toybox:kid:" + kid.id + ":state"}`;
      const st = parseMaybeJson(stRows[0]?.v, {});
      if (!st || Object.keys(st).length === 0) continue;
      anyKid = true;

      const value = valuePortfolio(st, prices);
      const trades = Array.isArray(st.trades) ? st.trades : [];
      const periodTrades = trades.filter((t) => Number(t.id) > cutoff).length;
      const periodPnl = trades
        .filter((t) => t.side === "SELL" && Number(t.id) > cutoff && typeof t.pnl === "number")
        .reduce((a, t) => a + t.pnl, 0);
      const badges = Array.isArray(st.earnedBadges) ? st.earnedBadges.length : 0;
      const level = Math.floor((st.xp || 0) / 500) + 1;

      const baseKey = `toybox:report:${period}:${kid.id}`;
      const baseRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${baseKey}`;
      const prior = parseMaybeJson(baseRows[0]?.v, null);
      let changeStr;
      if (prior && typeof prior.value === "number") {
        const diff = value - prior.value;
        changeStr = ` (${diff >= 0 ? "▲" : "▼"} ${money(Math.abs(diff))} since last ${period === "weekly" ? "week" : "month"})`;
      } else {
        changeStr = " (first report)";
      }

      lines.push(`${kid.avatar || "•"} ${kid.name || "Kid"}`);
      lines.push(`• Portfolio: ${money(value)}${changeStr}`);
      lines.push(`• Trades: ${periodTrades} · Realized P/L: ${periodPnl >= 0 ? "+" : "-"}${money(Math.abs(periodPnl))}`);
      lines.push(`• Badges: ${badges} · Level ${level}`);
      lines.push("");

      const payload = JSON.stringify({ value, at: now });
      await sql`
        INSERT INTO kv (space, k, v, updated_at) VALUES (${space}, ${baseKey}, ${payload}, now())
        ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`;
    }

    if (!anyKid) continue;
    lines.push("Keep learning! 🚀");
    const body = lines.join("\n");

    const chatId = channels.chat ? String(parseMaybeJson(channels.chat, "")).trim() : "";
    if (token && chatId) await sendTelegram(token, chatId, body);

    const email = channels.email ? String(parseMaybeJson(channels.email, "")).trim() : "";
    if (resendKey && email) await sendEmail(resendKey, emailFrom, email, `${heading} — Toybox Trader`, body);

    if ((token && chatId) || (resendKey && email)) sent++;
  }
  return { families: bySpace.size, sent };
}
