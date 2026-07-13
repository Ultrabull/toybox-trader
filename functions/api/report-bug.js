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

  const text =
    `New bug/problem report from Toybox Trader\n\n` +
    `What: ${category}\n` +
    `From: ${name}${age ? ` (age ${age})` : ""}\n` +
    (message ? `\nMessage:\n${message}\n` : `\n(No extra details typed.)\n`) +
    `\n— context —\n` +
    `Screen: ${screen || "?"}\n` +
    `App: ${appVersion || "?"}\n` +
    `Device: ${userAgent || "?"}\n`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: SUPPORT_EMAIL,
        subject: `🐞 Toybox report: ${category}`,
        text,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: d?.message || "email-error" });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
