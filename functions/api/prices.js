// Cloudflare Pages Function — reliable live prices. Route: /api/prices (GET).
//   /api/prices                      → current prices + previous close
//   /api/prices?history=BTC&since=MS → intraday candles (order backfill)
// Server-side fetch (no CORS). Stocks: Yahoo→Stooq. Crypto: CoinGecko→Coinbase.

const STOCKS = ["AAPL", "RBLX", "DIS", "NVDA"];
const UA = "Mozilla/5.0 (compatible; ToyboxTrader/1.0)";
const CACHE_MS = 30_000;

let cache = { t: 0, body: null };
const histCache = new Map();
const HIST_CACHE_MS = 60_000;

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
  });

async function yahooOne(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`, {
    headers: { "user-agent": UA },
  });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const d = await r.json();
  const meta = d?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
  if (!(price > 0)) throw new Error("no price");
  return { price, prev };
}

async function fetchStocks() {
  const prices = {};
  const prev = {};
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
  try {
    const missing = STOCKS.filter((s) => !(s in prices));
    const symbols = missing.map((s) => s.toLowerCase() + ".us").join(",");
    const r = await fetch(`https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlc&h&e=csv`);
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
  } catch {}
  const n = Object.keys(prices).length;
  return { prices, prev, source: n === 0 ? "none" : got > 0 ? "yahoo+stooq" : "stooq" };
}

async function fetchCrypto() {
  const prices = {};
  const prev = {};
  const pairs = [["BTC", "bitcoin"], ["ETH", "ethereum"]];
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
    );
    if (r.ok) {
      const d = await r.json();
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
  } catch {}
  try {
    await Promise.all(
      [["BTC", "BTC-USD"], ["ETH", "ETH-USD"]].map(async ([t, pair]) => {
        if (prices[t]) return;
        const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
        if (r.ok) {
          const d = await r.json();
          const p = parseFloat(d?.data?.amount);
          if (p > 0) {
            prices[t] = p;
            prev[t] = p;
          }
        }
      }),
    );
  } catch {}
  return { prices, prev, source: Object.keys(prices).length ? "coinbase" : "none" };
}

async function fetchHistory(ticker, since) {
  const candles = [];
  if (ticker === "BTC" || ticker === "ETH") {
    const id = ticker === "BTC" ? "bitcoin" : "ethereum";
    const days = Math.min(90, Math.max(1, Math.ceil((Date.now() - since) / 86_400_000)));
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
    if (r.ok) {
      const d = await r.json();
      for (const p of d?.prices || []) if (p[0] >= since) candles.push({ t: p[0], lo: p[1], hi: p[1] });
    }
  } else if (STOCKS.includes(ticker)) {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=5d`, {
      headers: { "user-agent": UA },
    });
    if (r.ok) {
      const d = await r.json();
      const res = d?.chart?.result?.[0];
      const ts = res?.timestamp || [];
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

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const histTicker = url.searchParams.get("history");
  if (histTicker) {
    const ticker = histTicker.toUpperCase();
    const since = Number(url.searchParams.get("since")) || Date.now() - 86_400_000;
    const hit = histCache.get(ticker);
    if (hit && Date.now() - hit.t < HIST_CACHE_MS) {
      return json({ candles: hit.body.candles.filter((c) => c.t >= since) });
    }
    try {
      const body = await fetchHistory(ticker, 0);
      if (body.candles.length) histCache.set(ticker, { t: Date.now(), body });
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
  if (Object.keys(body.prices).length) cache = { t: Date.now(), body };
  return json(body);
}
