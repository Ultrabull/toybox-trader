// Cloudflare Pages Function — a kid (or parent) reports a bug/problem.
// Route: /api/report-bug (POST). Emails the support address via Resend.
// Body: { category, message, name, age, screen, appVersion, userAgent }
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .slice(0, 4000);

export async function onRequestPost(context) {
  const { request, env } = context;
  const RESEND_API_KEY = env.RESEND_API_KEY || "";
  const EMAIL_FROM = env.EMAIL_FROM || "Toybox Trader <onboarding@resend.dev>";
  const SUPPORT_EMAIL = env.SUPPORT_EMAIL || "toyboxtrader.support@gmail.com";
  if (!RESEND_API_KEY) return json({ ok: false, error: "email-not-configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const category = esc(body?.category || "Something else");
  const message = esc(body?.message || "").trim();
  const name = esc(body?.name || "a Toybox trader");
  const age = esc(body?.age || "");
  const screen = esc(body?.screen || "");
  const appVersion = esc(body?.appVersion || "");
  const userAgent = esc(body?.userAgent || "");
  // Optional reply-to email a grown-up can leave to hear back. Validate loosely.
  const rawEmail = String(body?.contactEmail || "").trim().slice(0, 200);
  const contactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : "";

  const text =
    `New bug/problem report from Toybox Trader\n\n` +
    `What: ${category}\n` +
    `From: ${name}${age ? ` (age ${age})` : ""}\n` +
    (contactEmail ? `Reply to: ${contactEmail}\n` : `Reply to: (none left)\n`) +
    (message ? `\nMessage:\n${message}\n` : `\n(No extra details typed.)\n`) +
    `\n— context —\n` +
    `Screen: ${screen || "?"}\n` +
    `App: ${appVersion || "?"}\n` +
    `Device: ${userAgent || "?"}\n`;

  const send = (payload) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    // 1) Notify support. If a grown-up left an email, set reply_to so replies go to them.
    const supportPayload = {
      from: EMAIL_FROM,
      to: SUPPORT_EMAIL,
      subject: `🐞 Toybox report: ${category}`,
      text,
    };
    if (contactEmail) supportPayload.reply_to = contactEmail;
    const r = await send(supportPayload);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: d?.message || "email-error" });

    // 2) Send a friendly confirmation to the grown-up who reported it (best-effort).
    let confirmed = false;
    if (contactEmail) {
      const confirmText =
        `Hi!\n\nThanks for telling the Toybox Trader team about "${category}". ` +
        `We got your report and we'll take a look.\n\n` +
        (message ? `You wrote:\n"${message}"\n\n` : "") +
        `You don't need to do anything else — we'll email this address if we need more info ` +
        `or when it's fixed.\n\n💚 The Toybox Trader team`;
      try {
        const cr = await send({
          from: EMAIL_FROM,
          to: contactEmail,
          subject: `💚 We got your Toybox report`,
          text: confirmText,
        });
        confirmed = cr.ok;
      } catch { /* confirmation is best-effort; support email already sent */ }
    }
    return json({ ok: true, confirmed });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
