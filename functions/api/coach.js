// Cloudflare Pages Function — "Toby", the kid-safe AI money coach (Toybox Plus).
// Route: /api/coach (POST). Calls Claude with a locked-down, child-safe system
// prompt. Only talks about money/saving/investing basics and the child's own
// play-money progress. Never real financial advice, never personal data.
//
// Body: {
//   messages: [{ role:"user"|"assistant", content:"..." }],  // recent turns
//   profile: { name, age },
//   stats:   { cash, coins, xp, streak, lessonsDone, lessonsTotal, holdings:[{ticker,name,qty,value}] }
// }
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

export async function onRequestPost(context) {
  const { request, env } = context;
  const KEY = env.ANTHROPIC_API_KEY || "";
  if (!KEY) return json({ ok: false, error: "coach-not-configured" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const profile = body?.profile || {};
  const name = clip(profile.name || "friend", 40);
  const age = Math.max(5, Math.min(18, parseInt(profile.age, 10) || 10));
  const s = body?.stats || {};
  const holdings = Array.isArray(s.holdings) ? s.holdings.slice(0, 12) : [];
  const holdingsText = holdings.length
    ? holdings.map((h) => `${clip(h.name || h.ticker, 24)} (${clip(h.ticker, 8)}): ${Number(h.qty) || 0} blocks, ~$${Math.round(Number(h.value) || 0)}`).join("; ")
    : "no investments yet";

  // Only the LAST few turns, each length-capped. Roles normalised to user/assistant.
  const raw = Array.isArray(body?.messages) ? body.messages.slice(-10) : [];
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: clip(m.content, 800) }));
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return json({ ok: false, error: "no-question" }, 400);

  const system =
`You are "Toby", a friendly, encouraging fox who is a MONEY COACH for kids inside "Toybox Trader" — a safe game where children learn about money using PRETEND (play) money. You are talking to ${name}, who is ${age} years old.

HOW TO TALK
- Warm, cheerful, and simple. Match your words to a ${age}-year-old. Short answers: 2–4 sentences. One friendly emoji is fine.
- Encourage and praise effort. Make money feel fun and doable.
- You may use ${name}'s progress below to make answers personal.

WHAT YOU TALK ABOUT (ONLY)
- Saving, spending wisely, earning, needs vs wants, and beginner investing ideas (owning a piece of a company, patience, diversifying, dividends).
- ${name}'s play-money portfolio and progress in the game.

HARD RULES (never break)
- This is a GAME with pretend money. NEVER give real financial advice or tell ${name} to buy/sell/move REAL money or real stocks. If asked, gently say it's just for learning.
- Stay strictly on money/saving/investing/the game. If asked about anything else (games unrelated to money, violence, scary or grown-up topics, other people, school problems, health, meeting people, websites/apps, secrets), kindly redirect: "Let's stick to money stuff — what would you like to learn?"
- NEVER ask for or repeat personal info (full name, address, school, phone, passwords, where they live). If ${name} shares any, don't use it and gently say they should keep that private.
- Never claim to be a real person, an AI, or from any company. You are just Toby the fox.
- No links, no outside websites, no promises about real-world money outcomes.
- Keep everything kind, safe, and age-appropriate. If unsure, choose the gentle, safe answer.

${name}'S PROGRESS RIGHT NOW
- Play cash to invest: $${Math.round(Number(s.cash) || 0)} · Coins: ${Math.round(Number(s.coins) || 0)} · XP: ${Math.round(Number(s.xp) || 0)} · Day streak: ${Math.round(Number(s.streak) || 0)}
- Lessons finished: ${Math.round(Number(s.lessonsDone) || 0)} of ${Math.round(Number(s.lessonsTotal) || 0)}
- Investments: ${holdingsText}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 320,
        system,
        messages,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: d?.error?.message || "coach-error" }, 502);
    const reply = (d?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return json({ ok: true, reply: reply || "Hmm, my tail got tangled! Ask me again? 🦊" });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
