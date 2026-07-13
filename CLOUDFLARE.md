# Hosting on Cloudflare Pages (from your phone)

Cloudflare Pages hosts the app **and** runs the functions (`functions/api/*`) on a
generous free tier. Your database stays on **Neon** (same data — nothing to
migrate). The app uses `/api/*` paths that work on both Netlify and Cloudflare,
so the switch is smooth.

## ⚠️ Before you switch — protect the data
The database (Neon) is safe, but each device's *local* copy is tied to the old
URL. On every device that has real progress, open the app and **☁️ → Create
family / Sign in** so its data is uploaded to Neon. Then you just sign in again
on the new Cloudflare URL and everyone's back. (Backup codes are a second safety
net.)

## 1. Connect the repo to Cloudflare Pages (phone browser)
1. Go to **dash.cloudflare.com** → sign up (free).
2. **Workers & Pages → Create → Pages → Connect to Git.**
3. Authorize GitHub, pick **`Ultrabull/toybox-trader`**, branch **`main`**.
4. Build settings:
   - **Framework preset:** None (or Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. **Save and Deploy.** You'll get a URL like `toybox-trader.pages.dev`.

## 2. Add environment variables
Pages project → **Settings → Environment variables → Production** → add:

| Variable | Value | Needed for |
|---|---|---|
| `DATABASE_URL` | your Neon connection string (copy from the Neon dashboard → Connection Details) | sync (required) |
| `TELEGRAM_BOT_TOKEN` | your bot token | Telegram alerts (optional) |
| `VAPID_PUBLIC_KEY` | (the value I gave you) | push (optional) |
| `VAPID_PRIVATE_KEY` | (the value I gave you) | push (optional) |
| `VAPID_SUBJECT` | `mailto:toyboxtrader.support@gmail.com` | push (optional) |
| `RESEND_API_KEY` | your Resend API key | **email updates** (optional) — powers the ☁️ "Send test" email **and the in-app "🆘 Get Help" bug reports** |
| `EMAIL_FROM` | e.g. `Toybox Trader <onboarding@resend.dev>` | email "from" address |
| `SUPPORT_EMAIL` | e.g. `toyboxtrader.support@gmail.com` | where "🆘 Get Help" reports are sent (optional — defaults to this address) |

Then **re-deploy** (Deployments → Retry deployment) so the functions pick them up.

## 3. Test
Open your `*.pages.dev` URL → tap **☁️ → Sign in** with your family email +
password → your kids load from Neon. Check prices show and a trade works.

## Scheduled jobs now run on GitHub Actions (Phase 2 — done)
The weekly/monthly Telegram reports and the daily push reminders no longer need
Netlify. They run as scheduled **GitHub Actions** (`.github/workflows/reports.yml`
and `push-reminders.yml`), talking to Neon directly.

To turn them on, add these **GitHub repository secrets**
(repo → Settings → Secrets and variables → Actions → New repository secret):

| Secret | For |
|---|---|
| `DATABASE_URL` | your Neon connection string (required for both) |
| `TELEGRAM_BOT_TOKEN` | Telegram reports |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | push reminders |
| `RESEND_API_KEY` / `EMAIL_FROM` | weekly/monthly report **emails** |

### Getting a Resend key (for bug reports today; parent email later)
1. Sign up at **resend.com** (free tier: ~3,000 emails/mo).
2. **API Keys → Create** → copy the key → that's `RESEND_API_KEY`.
3. For testing you can send from `onboarding@resend.dev` **to your own account
   email**.

**What email is used for right now:** only the in-app **🐞 Get Help** bug
reports, which go to a *single* support inbox (`SUPPORT_EMAIL`). Because that's
your own address, it works on the free tier **with no domain**.

**Parent weekly/monthly summaries go over Telegram, not email.** Emailing *many
different* parents requires a **verified sending domain** in Resend (you must
own a domain) — without it Resend only delivers to your own address. The
summary-email code stays dormant in `scripts/report-lib.mjs`; once you verify a
domain and set `EMAIL_FROM` to e.g. `Toybox Trader <updates@yourdomain.com>`,
re-add the "Email updates" field and it turns back on.

Without the secrets, the jobs run but safely do nothing. You can test them any
time from **Actions → (workflow) → Run workflow**.

> Note on Actions minutes: push-reminders runs hourly. That's fine on the free
> tier, but if you want to trim usage you can reduce it to a few fixed hours.

## Notes
- I can't deploy to your Cloudflare account from here, so **the first deploy is
  the real test.** If a build or function errors, copy the message and send it —
  I'll fix it.
- When you're happy with Cloudflare, you can stop using Netlify (or keep it as a
  backup). If you later add a custom domain, point it at Cloudflare and update
  `LIVE_ORIGIN` in `src/api.ts` (for the native app).
