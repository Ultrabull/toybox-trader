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

Then **re-deploy** (Deployments → Retry deployment) so the functions pick them up.

## 3. Test
Open your `*.pages.dev` URL → tap **☁️ → Sign in** with your family email +
password → your kids load from Neon. Check prices show and a trade works.

## What's NOT migrated yet (Phase 2)
The **scheduled** jobs — weekly/monthly Telegram reports and the daily push
reminders — aren't on Cloudflare yet (Cloudflare Pages doesn't run cron). They'll
move to **GitHub Actions** (scheduled) in the next step. Until then they keep
running on your Netlify site, so you don't lose them.

## Notes
- I can't deploy to your Cloudflare account from here, so **the first deploy is
  the real test.** If a build or function errors, copy the message and send it —
  I'll fix it.
- When you're happy with Cloudflare, you can stop using Netlify (or keep it as a
  backup). If you later add a custom domain, point it at Cloudflare and update
  `LIVE_ORIGIN` in `src/api.ts` (for the native app).
