# 🚀 Toybox Trader — Webapp Launch Checklist

Everything you need to take the web app live at `toybox-trader.pages.dev` (or a
custom domain). The **product** is built; the remaining work is configuration,
legal, and (optionally) billing. Work top-down.

---

## 1. Environment variables (Cloudflare Pages)

Set these in **Cloudflare dashboard → Pages → your project → Settings →
Environment variables** (Production). Features silently degrade without them.

| Variable | Powers | Needed for launch? | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | Bug reports + confirmation emails | **Yes** | From resend.com. Without it, `/api/report-bug` returns 503. |
| `EMAIL_FROM` | The "from" address on all emails | **Yes** | e.g. `Toybox Trader <support@yourdomain.com>`. Must be a **verified** Resend domain to email real families (see §2). |
| `SUPPORT_EMAIL` | Where bug reports are delivered | Recommended | Defaults to `toyboxtrader.support@gmail.com`. |
| `DATABASE_URL` | Cross-device cloud sync (Neon/Postgres) | Recommended | Without it the app still works per-device (localStorage only). Also accepts `NETLIFY_DATABASE_URL`. |
| `TELEGRAM_BOT_TOKEN` | Parent Telegram nudges | Optional | From @BotFather. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push reminders | Optional | Generate a VAPID keypair. |

**Redeploy** after setting variables so Functions pick them up.

---

## 2. Verify a Resend sending domain (important)

We now send **confirmation emails to parents** who leave an email on a bug
report. Resend's default `onboarding@resend.dev` only sends to **your own**
account (test mode), so real parents won't receive confirmations until you:

1. Add and **verify a domain** in Resend (DNS records).
2. Set `EMAIL_FROM` to an address on that domain (e.g. `support@toyboxtrader.com`).

Until then, support notifications still work (they go to you), and the app
correctly **won't claim** a copy was sent — the success screen only shows
"we sent a copy" when the server confirms it went out.

---

## 3. Analytics (optional, privacy-first)

**Cloudflare Web Analytics** is cookieless, collects no personal data, and is a
good fit for a kids' app. It's **off by default** to keep our "no third-party
analytics" promise true until you consciously opt in.

To enable:
1. Cloudflare dashboard → **Web Analytics** → add this site → copy the **beacon token**.
2. In `index.html`, paste the token into the commented `<script>` block and
   uncomment it.
3. **Update the Privacy Policy.** In `public/privacy.html`, the line that says
   *"We do not show third-party ads, use third-party analytics or trackers…"*
   must be changed to disclose privacy-first, cookieless analytics. Suggested:

   > We use **privacy-first, cookieless analytics** (Cloudflare Web Analytics)
   > to count visits and understand which features are used. It does not use
   > cookies, does not track individuals across sites, and does not collect
   > personal information. We do not show third-party ads, sell or rent personal
   > information, or use data for advertising or profiling.

(Alternatively, Cloudflare Pages can auto-inject the beacon from the dashboard
with no code change — but you must still update the Privacy Policy.)

---

## 4. Legal pages ✅ (done)

- `public/privacy.html` — Privacy Policy (COPPA-aware). Discloses the optional
  bug-report email.
- `public/terms.html` — Terms of Service (play-money/educational, subscriptions,
  chores/pocket-money are family arrangements, liability).
- Linked from the landing footer and cross-linked to each other.

**Before launch:** read both once with your details in mind. If you take
payments or operate a company, consider a lawyer's review — especially the
COPPA and subscription sections.

---

## 5. Support inbox

Make sure `toyboxtrader.support@gmail.com` (or your `SUPPORT_EMAIL`) exists and
someone monitors it — bug reports and parent replies land there.

---

## 6. Billing (only when you're ready to charge)

The app currently runs a **free preview**: tapping *Get Toybox Plus* just flips
the family flag; no money is collected. Pricing shown is **$29.99/yr** or
**$4.99/mo**. To charge for real, wire one of:

- **Stripe Checkout** (web) — best for a web-first launch. Needs a Stripe
  account, two Prices, a checkout Function, and a webhook to flip the premium
  flag on successful payment.
- **App Store / Play IAP** — required if you later ship via Capacitor to the
  native stores.

Ask and this can be built against the two price points above.

---

## 7. Nice-to-have

- **Custom domain** (`toyboxtrader.com`) → Cloudflare Pages → Custom domains.
- **Designed OG share image** — sharing currently shows the app icon.
- **Cross-browser pass** — Safari iOS, Chrome Android, desktop.

---

## Recommended launch path

1. §1 env vars + §2 Resend domain + §5 support inbox → **emails work**.
2. §4 read the legal pages → **compliant**.
3. §3 turn on analytics → **you can measure the launch**.
4. Go live (free preview). Gather families & feedback.
5. §6 wire Stripe once you see traction.
