// Shared logic for the scheduled weekly / monthly Telegram reports.
//
// For every family that has connected Telegram, we value each kid's portfolio
// (cash + holdings at current prices), summarise the period's activity, compare
// against the previous report's value, and send one digest per family.
//
// Baselines are stored in Neon under `toybox:report:<period>:<kidId>` so each
// run can report the change since the last one.

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

const CHAT_KEY = "toybox:telegram:chat";
const STOCKS = ["AAPL", "RBLX", "DIS", "NVDA"];
const UA = "Mozilla/5.0 (compatible; ToyboxTrader/1.0)";

const money = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function parseMaybeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return (raw as unknown as T) ?? fallback;
  }
}

// Best-effort live prices so we can value holdings. Returns {} on failure, in
// which case valuation falls back to each holding's average cost.
export async function fetchPrices(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.allSettled([
    ...STOCKS.map(async (sym) => {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) },
      );
      if (!r.ok) return;
      const d: any = await r.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p > 0) out[sym] = p;
    }),
    (async () => {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
        { signal: AbortSignal.timeout(6000) },
      );
      if (!r.ok) return;
      const d: any = await r.json();
      if (d?.bitcoin?.usd > 0) out.BTC = d.bitcoin.usd;
      if (d?.ethereum?.usd > 0) out.ETH = d.ethereum.usd;
    })(),
  ]);
  return out;
}

type Holding = { ticker: string; qty: number; avgCost: number };
type Trade = { id?: number; side?: string; pnl?: number | null };
type KidState = {
  cash?: number;
  portfolio?: Holding[];
  trades?: Trade[];
  earnedBadges?: string[];
  xp?: number;
};
type Kid = { id: string; name?: string; avatar?: string };

function valuePortfolio(st: KidState, prices: Record<string, number>): number {
  const holdings = st.portfolio || [];
  let v = st.cash || 0;
  for (const h of holdings) {
    const px = prices[h.ticker] || h.avgCost || 0;
    v += (h.qty || 0) * px;
  }
  return v;
}

async function sendTelegram(token: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    /* best effort — a failed send shouldn't abort the whole run */
  }
}

/**
 * Build and send the report for every Telegram-connected family.
 * @param period  "weekly" | "monthly" (used for the baseline key + heading)
 * @param sql     Neon tagged-template client
 * @param token   Telegram bot token
 * @param days    look-back window for activity counts
 * @param now     current time in ms (injectable for testing)
 */
export async function sendReports(
  period: "weekly" | "monthly",
  sql: Sql,
  token: string,
  days: number,
  now: number = Date.now(),
): Promise<{ families: number; sent: number }> {
  const cutoff = now - days * 86_400_000;
  const families = await sql`SELECT space, v FROM kv WHERE k = ${CHAT_KEY}`;
  if (!families.length) return { families: 0, sent: 0 };

  const prices = await fetchPrices();
  const heading = period === "weekly" ? "📅 Weekly report" : "🗓️ Monthly report";
  let sent = 0;

  for (const fam of families as Array<{ space: string; v: string }>) {
    const space = fam.space;
    const chatId = String(parseMaybeJson<string | number>(fam.v, "")).trim();
    if (!chatId) continue;

    const regRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = 'toybox:kids:registry'`;
    const kids = parseMaybeJson<Kid[]>(regRows[0]?.v, []);
    if (!Array.isArray(kids) || kids.length === 0) continue;

    const lines: string[] = [`${heading} — Toybox Trader`, ""];
    let anyKid = false;

    for (const kid of kids) {
      const stRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${"toybox:kid:" + kid.id + ":state"}`;
      const st = parseMaybeJson<KidState>(stRows[0]?.v, {});
      if (!st || Object.keys(st).length === 0) continue;
      anyKid = true;

      const value = valuePortfolio(st, prices);
      const trades = Array.isArray(st.trades) ? st.trades : [];
      const periodTrades = trades.filter((t) => Number(t.id) > cutoff).length;
      const periodPnl = trades
        .filter((t) => t.side === "SELL" && Number(t.id) > cutoff && typeof t.pnl === "number")
        .reduce((a, t) => a + (t.pnl as number), 0);
      const badges = Array.isArray(st.earnedBadges) ? st.earnedBadges.length : 0;
      const level = Math.floor((st.xp || 0) / 500) + 1;

      // Change since last report (from stored baseline).
      const baseKey = `toybox:report:${period}:${kid.id}`;
      const baseRows = await sql`SELECT v FROM kv WHERE space = ${space} AND k = ${baseKey}`;
      const prior = parseMaybeJson<{ value: number } | null>(baseRows[0]?.v, null);
      let changeStr = "";
      if (prior && typeof prior.value === "number") {
        const diff = value - prior.value;
        const arrow = diff >= 0 ? "▲" : "▼";
        changeStr = ` (${arrow} ${money(Math.abs(diff))} since last ${period === "weekly" ? "week" : "month"})`;
      } else {
        changeStr = " (first report)";
      }

      lines.push(`${kid.avatar || "•"} ${kid.name || "Kid"}`);
      lines.push(`• Portfolio: ${money(value)}${changeStr}`);
      lines.push(`• Trades: ${periodTrades} · Realised P/L: ${periodPnl >= 0 ? "+" : "-"}${money(Math.abs(periodPnl))}`);
      lines.push(`• Badges: ${badges} · Level ${level}`);
      lines.push("");

      // Save this run's value as the next baseline.
      const payload = JSON.stringify({ value, at: now });
      await sql`
        INSERT INTO kv (space, k, v, updated_at) VALUES (${space}, ${baseKey}, ${payload}, now())
        ON CONFLICT (space, k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()
      `;
    }

    if (!anyKid) continue;
    lines.push("Keep learning! 🚀");
    await sendTelegram(token, chatId, lines.join("\n"));
    sent++;
  }

  return { families: families.length, sent };
}
