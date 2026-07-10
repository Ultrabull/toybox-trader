// Netlify Function: reliable live prices.
//
// The browser's direct calls to Yahoo/CoinGecko are blocked by CORS and flaky
// public proxies. Running the fetch here (server-side) removes those limits, so
// we can pull real quotes reliably and hand clean JSON to the app.
//
//   stocks:  Yahoo Finance  → Stooq fallback
//   crypto:  CoinGecko      → Coinbase fallback
//
// Results are cached briefly so we stay inside the free-tier rate limits even
// with many kids/devices refreshing every minute.

const STOCKS = ["AAPL", "RBLX", "DIS", "NVDA"];
const UA = "Mozilla/5.0 (compatible; ToyboxTrader/1.0)";
const CACHE_MS = 30_000;

let cache: { t: number; body: unknown } = { t: 0, body: null };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
  });

type Quotes = { prices: Record<string, number>; prev: Record<string, number> };

async function yahooOne(sym: string): Promise<{ price: number; prev: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`;
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const d: any = await r.json();
  const meta = d?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
  if (!(price > 0)) throw new Error("no price");
  return { price, prev };
}

async function fetchStocks(): Promise<Quotes & { source: string }> {
  const prices: Record<string, number> = {};
  const prev: Record<string, number> = {};

  const results = await Promise.allSettled(STOCKS.map(yahooOne));
  let got = 0;
  results.forEach((res, i) => {
    if (res.status === "fulfilled") {
      prices[STOCKS[i]] = res.value.price;
      prev[STOCKS[i]] = res.value.prev;
      got++;
    }
  });
  if (got === STOCKS.length) return { prices, prev, source: "yahoo" };

  // Stooq CSV fallback for whatever Yahoo missed.
  try {
    const missing = STOCKS.filter((s) => !(s in prices));
    const symbols = missing.map((s) => s.toLowerCase() + ".us").join(",");
    const r = await fetch(`https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlc&h&e=csv`, {
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const text = await r.text();
      for (const line of text.trim().split("\n").slice(1)) {
        const cols = line.split(",");
        const t = cols[0]?.split(".")[0]?.toUpperCase();
        const open = parseFloat(cols[3]);
        const close = parseFloat(cols[6]);
        if (t && close > 0) {
          prices[t] = close;
          prev[t] = open > 0 ? open : close;
        }
      }
    }
  } catch {
    /* ignore */
  }
  const n = Object.keys(prices).length;
  return { prices, prev, source: n === 0 ? "none" : got > 0 ? "yahoo+stooq" : "stooq" };
}

async function fetchCrypto(): Promise<Quotes & { source: string }> {
  const prices: Record<string, number> = {};
  const prev: Record<string, number> = {};
  const pairs: [string, string][] = [["BTC", "bitcoin"], ["ETH", "ethereum"]];

  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
      { signal: AbortSignal.timeout(6000) },
    );
    if (r.ok) {
      const d: any = await r.json();
      for (const [t, id] of pairs) {
        const p = d?.[id]?.usd;
        const chg = d?.[id]?.usd_24h_change;
        if (p > 0) {
          prices[t] = p;
          prev[t] = typeof chg === "number" ? p / (1 + chg / 100) : p;
        }
      }
      if (prices.BTC && prices.ETH) return { prices, prev, source: "coingecko" };
    }
  } catch {
    /* ignore */
  }

  // Coinbase fallback for anything still missing.
  try {
    await Promise.all(
      ([["BTC", "BTC-USD"], ["ETH", "ETH-USD"]] as [string, string][]).map(async ([t, pair]) => {
        if (prices[t]) return;
        const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
          signal: AbortSignal.timeout(6000),
        });
        if (r.ok) {
          const d: any = await r.json();
          const p = parseFloat(d?.data?.amount);
          if (p > 0) {
            prices[t] = p;
            prev[t] = p;
          }
        }
      }),
    );
  } catch {
    /* ignore */
  }
  return { prices, prev, source: Object.keys(prices).length ? "coinbase" : "none" };
}

// ── history: intraday candles for the order-backfill check ────────────
// GET /prices?history=TICKER&since=MS → { candles: [{t, lo, hi}] }
// Server-side fetch avoids the CORS/proxy flakiness the client used to hit.
const histCache = new Map<string, { t: number; body: unknown }>();
const HIST_CACHE_MS = 60_000;

async function fetchHistory(ticker: string, since: number): Promise<{ candles: { t: number; lo: number; hi: number }[] }> {
  const candles: { t: number; lo: number; hi: number }[] = [];
  if (ticker === "BTC" || ticker === "ETH") {
    const id = ticker === "BTC" ? "bitcoin" : "ethereum";
    const days = Math.min(90, Math.max(1, Math.ceil((Date.now() - since) / 86_400_000)));
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (r.ok) {
      const d: any = await r.json();
      for (const p of d?.prices || []) {
        if (p[0] >= since) candles.push({ t: p[0], lo: p[1], hi: p[1] });
      }
    }
  } else if (STOCKS.includes(ticker)) {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=5d`,
      { headers: { "user-agent": UA }, signal: AbortSignal.timeout(7000) },
    );
    if (r.ok) {
      const d: any = await r.json();
      const res = d?.chart?.result?.[0];
      const ts: number[] = res?.timestamp || [];
      const q = res?.indicators?.quote?.[0] || {};
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i] * 1000;
        if (t < since) continue;
        const lo = q.low?.[i], hi = q.high?.[i];
        if (lo != null && hi != null) candles.push({ t, lo, hi });
      }
    }
  }
  return { candles };
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const histTicker = url.searchParams.get("history");
  if (histTicker) {
    const ticker = histTicker.toUpperCase();
    const since = Number(url.searchParams.get("since")) || Date.now() - 86_400_000;
    const cacheKey = ticker; // since varies little between calls; ticker-level cache is fine
    const hit = histCache.get(cacheKey);
    if (hit && Date.now() - hit.t < HIST_CACHE_MS) {
      const cached = hit.body as { candles: { t: number }[] };
      return json({ candles: cached.candles.filter((c) => c.t >= since) });
    }
    try {
      const body = await fetchHistory(ticker, 0); // fetch full window, filter per-request
      if (body.candles.length) histCache.set(cacheKey, { t: Date.now(), body });
      return json({ candles: body.candles.filter((c) => c.t >= since) });
    } catch {
      return json({ candles: [] });
    }
  }

  if (cache.body && Date.now() - cache.t < CACHE_MS) return json(cache.body);

  const [stocks, crypto] = await Promise.all([fetchStocks(), fetchCrypto()]);
  const body = {
    prices: { ...stocks.prices, ...crypto.prices },
    prev: { ...stocks.prev, ...crypto.prev },
    sources: { stocks: stocks.source, crypto: crypto.source },
    updatedAt: Date.now(),
  };
  // Only cache a response that actually carried data, so a transient outage
  // doesn't get pinned for 30s.
  if (Object.keys(body.prices).length) cache = { t: Date.now(), body };
  return json(body);
};
