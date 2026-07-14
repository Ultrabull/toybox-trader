// Parent Insight — turns a kid's play-money activity into a LEARNING-focused
// weekly summary with a conversation starter for the parent. Template-based
// (no AI), so it's free to run. Shared by the app (in-app card) and the
// weekly report script (Telegram/email).

// The curriculum in order, each with the concept it teaches, a parent-friendly
// conversation question, and which of the 4 Levels it belongs to.
export const CURRICULUM = [
  // Level 1 — Money Basics
  { id: "money_basics", title: "What is Money?", concept: "what money really is", level: 1, q: "What is money actually for?" },
  { id: "needs_wants", title: "Needs vs Wants", concept: "needs vs wants", level: 1, q: "Can you tell me one thing that's a need and one that's a want?" },
  { id: "earning", title: "Where Money Comes From", concept: "how money is earned", level: 1, q: "What's a little job you could do to earn some money?" },
  { id: "saving_basics", title: "The Magic of Saving", concept: "why saving adds up", level: 1, q: "What's something you'd love to save up for?" },
  // Level 2 — First Investor
  { id: "investing", title: "What is Investing?", concept: "what investing is", level: 2, q: "What does it mean to own a tiny piece of a company?" },
  { id: "when_buy", title: "When to Buy?", concept: "buying when things are on sale", level: 2, q: "Why can a price dropping sometimes be a GOOD thing?" },
  { id: "when_sell", title: "When to Sell?", concept: "deciding when to sell", level: 2, q: "How would you decide when to sell something you own?" },
  { id: "crypto", title: "Crypto Explained", concept: "what crypto is", level: 2, q: "What makes crypto different from regular money?" },
  { id: "dca", title: "Dollar-Cost Averaging", concept: "investing a little at a time", level: 2, q: "Why might investing a little each week beat spending it all at once?" },
  { id: "buy_hold", title: "Buy and Hold", concept: "holding for the long run", level: 2, q: "Why do the best investors hold for years instead of days?" },
  // Level 3 — Smart Investor
  { id: "charts", title: "Reading Charts", concept: "reading price charts", level: 3, q: "What can a chart tell you about a stock?" },
  { id: "risk", title: "Risk Management", concept: "managing risk", level: 3, q: "How can you stop one bad bet from hurting too much?" },
  { id: "diversify_deep", title: "Smart Diversification", concept: "diversifying", level: 3, q: "Why is it risky to put all your money into just one thing?" },
  { id: "dividends", title: "Dividends", concept: "dividends", level: 3, q: "Can a company pay you just for owning its stock? How?" },
  { id: "index", title: "Index Investing", concept: "index funds", level: 3, q: "Why do simple index funds beat most expert investors?" },
  // Level 4 — Pro Investor
  { id: "options", title: "Options Trading", concept: "options", level: 4, q: "What's one reason options are riskier than regular stocks?" },
  { id: "psychology", title: "Market Psychology", concept: "controlling emotions", level: 4, q: "How can feelings trick investors into bad choices?" },
  { id: "value_growth", title: "Value vs Growth", concept: "value vs growth", level: 4, q: "What's the difference between a value stock and a growth stock?" },
  { id: "time_in_market", title: "Time IN the Market", concept: "patience beats timing", level: 4, q: "Why does staying invested beat guessing the perfect day?" },
  { id: "exit_strategy", title: "Exit Strategies", concept: "planning your exit", level: 4, q: "Why decide when you'll sell BEFORE you buy?" },
];

export const LEVEL_NAMES = ["", "Money Basics", "First Investor", "Smart Investor", "Pro Investor"];

const byId = Object.fromEntries(CURRICULUM.map((c) => [c.id, c]));

// Build the structured insight. `opts`: { sinceTs, value, name }.
export function buildInsight(state, opts = {}) {
  const sinceTs = opts.sinceTs || 0;
  const done = Array.isArray(state?.doneLesson) ? state.doneLesson : [];
  const dates = state?.lessonDates || {};
  const doneSet = new Set(done);

  const allDone = CURRICULUM.filter((c) => doneSet.has(c.id));
  const learnedThisWeek = allDone.filter((c) => (dates[c.id] || 0) >= sinceTs && sinceTs > 0);

  const levelOfSet = (list) => list.reduce((mx, c) => Math.max(mx, c.level), 0);
  const curLevel = levelOfSet(allDone);
  const prevDone = allDone.filter((c) => !learnedThisWeek.includes(c));
  const leveledUp = curLevel > levelOfSet(prevDone) && curLevel > 0;

  const nextUp = CURRICULUM.find((c) => !doneSet.has(c.id)) || null;

  const trades = Array.isArray(state?.trades)
    ? state.trades.filter((t) => Number(t.id) > sinceTs).length
    : 0;
  const value = typeof opts.value === "number" ? opts.value : (state?.lastValue ?? 0);
  const changePct = value ? Math.round(((value - 1000) / 1000) * 100) : 0;
  const streak = Math.round(Number(state?.streak) || 0);

  const quiet = learnedThisWeek.length === 0;
  // Pick the conversation moment: most-advanced concept learned, else a nudge.
  const featured = learnedThisWeek.length
    ? learnedThisWeek[learnedThisWeek.length - 1]
    : null;
  let question;
  if (featured) question = featured.q;
  else if (nextUp) question = "Want to do one quick money lesson together? Just 2 minutes!";
  else question = "Which money lesson was your favorite, and why?";

  return {
    name: opts.name || state?.name || "Your child",
    quiet,
    learned: learnedThisWeek.map((c) => ({ title: c.title, concept: c.concept })),
    featuredConcept: featured ? featured.concept : null,
    question,
    levelName: LEVEL_NAMES[curLevel] || null,
    leveledUp,
    doneCount: allDone.length,
    totalCount: CURRICULUM.length,
    nextUp: nextUp ? { id: nextUp.id, title: nextUp.title } : null,
    inProgressTitle: nextUp ? nextUp.title : null,
    trades,
    value,
    changePct,
    streak,
  };
}

// Plain-text lines for a Telegram/email report (one kid), given a built insight
// and the kid's display info.
export function insightLines(ins, kid = {}) {
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const L = [];
  L.push(`${kid.avatar || "•"} ${ins.name}`);
  if (ins.learned.length) {
    const concepts = ins.learned.map((l) => l.concept).join(" & ");
    L.push(`🎓 Learned ${concepts} (${ins.learned.length} lesson${ins.learned.length > 1 ? "s" : ""})`);
    if (ins.leveledUp && ins.levelName) L.push(`🏅 Reached Level: ${ins.levelName}!`);
  } else {
    L.push(`😊 Took it easy this week${ins.inProgressTitle ? ` — partway through "${ins.inProgressTitle}"` : ""}.`);
  }
  const streakStr = ins.streak > 0 ? ` · ${ins.streak}-day streak 🔥` : "";
  L.push(`🌱 Money Garden ${money(ins.value)} (${ins.changePct >= 0 ? "+" : ""}${ins.changePct}%) · ${ins.trades} trade${ins.trades === 1 ? "" : "s"}${streakStr}`);
  L.push(`💬 Ask ${ins.name.split(" ")[0]}: "${ins.question}"`);
  if (ins.nextUp && ins.learned.length) L.push(`➡️ Next up: ${ins.nextUp.title}`);
  return L;
}
