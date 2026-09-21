# Toybox Trader — Project Handoff

**Last updated:** 2026-09-21
**Repo:** `github.com/Ultrabull/toybox-trader`
**Live site:** https://toyboxtrader.com (also `toybox-trader.pages.dev`)
**Owner contact / auth email:** the Apple private-relay address on the account

This is the single source of truth for how the whole project is built, hosted,
and deployed, and where everything lives in the code. If you're a developer (or
an AI assistant) picking this up cold, read this top to bottom first.

---

## 1. What it is

A **kid-safe stock/crypto trading _simulator_** (ages ~8–17). 100% play money —
no real trades, no real payments, no strangers, no chat, no ads. Kids learn
money and investing through:

- A **20-lesson money course** (with harder "Challenge Round" replays).
- A **practice market** (self-contained simulator — not live market data).
- A **"Money Machine" life sim**: pick a job → get a biweekly paycheck → pay
  tax + bills → invest what's left → build an emergency fund → get promoted up
  a 13-rung career ladder.
- Rewards: coins, XP, streaks, badges, a shop (themes + avatars), a pet, a
  spin wheel, and a **Parent Dashboard** with a weekly learning report.

**Design constraints (do not break these):** kid-safe, COPPA/privacy-conscious,
offline-first, bold/simple kid language, no real-money movement.

---

## 2. Tech stack & how everything is connected

```
   OWNER  ⇄  Claude (AI)  ──git commits──▶  GitHub: Ultrabull/toybox-trader
                                                  │  (push to main)
                                                  ▼
                                  ☁️ CLOUDFLARE PAGES ──serves──▶ toyboxtrader.com
                                  • build: `npm run build` → dist/
                                  • backend: functions/api/*.js (Pages Functions)
                                       │            │              │
                                       ▼            ▼              ▼
                                 🐘 NEON DB    🦊 Anthropic    ✉️ Resend
                                (Postgres,     (Toby AI coach) (bug-report
                                 cloud sync                     email)
                                 only if ON)
```

- **Source of truth:** GitHub. Everything deploys from the `main` branch.
- **Hosting = Cloudflare Pages.** On every push to `main`, Cloudflare runs
  `npm run build` and publishes `dist/`. The `functions/api/*.js` files are
  **Cloudflare Pages Functions** (the live serverless backend).
- **Domain:** bought at **Namecheap**, nameservers pointed to **Cloudflare**,
  attached to the Pages project as a custom domain (both apex + `www`).
- **Database = Neon (Postgres).** Only used for **optional cloud family-sync**
  (a `kv` table). If a family doesn't enable sync, nothing touches Neon and the
  app runs entirely from the browser's `localStorage`.
- **AI = Anthropic** (Toby the coach, `functions/api/coach.js`, Haiku model).
- **Email = Resend** (bug-report emails, `functions/api/report-bug.js`).
- **NOT Netlify.** `netlify.toml` + `netlify/functions/*.mts` are **dead
  leftovers** from an earlier plan and do not serve the live site. (The branch
  name `claude/github-netlify-deploy-3tmjob` is a relic of that too.) Safe to
  delete. To fully disconnect any dormant Netlify site, delete it in the
  Netlify dashboard — repo files alone don't control that.

---

## 3. Repository map

```
ToyboxFull.tsx          ← THE APP. ~4,900-line single-file React component. 95% of everything.
index.html              ← Vite HTML entry (mounts #root, loads Google Fonts)
src/
  main.tsx              ← Entry: reconcile cloud↔local, register service worker, mount app + widgets
  storage.ts            ← window.storage shim → localStorage, offline-first, cloud write-through mirror
  api.ts                ← apiUrl() helper (resolves /api/* base)
  sync-ui.ts            ← ☁️ Family Sync panel + the Toybox Plus paywall (writes toybox:family:premium)
  push-ui.ts / push.ts  ← 🔔 web-push reminders UI + subscription logic
  tasks.ts              ← chores/tasks storage helpers (parent-assigned)
  insight.mjs           ← CURRICULUM (20 lessons w/ concept+level) + buildInsight() weekly report engine
  Landing.tsx           ← Public marketing landing page ("money-smart brain")
functions/api/          ← CLOUDFLARE PAGES FUNCTIONS (live backend, same-origin /api/*)
  coach.js              ← Toby AI coach  (needs ANTHROPIC_API_KEY)
  kv.js                 ← cloud sync get/set  (needs DATABASE_URL → Neon)
  delete-account.js     ← wipe a family's cloud data (Neon)
  report-bug.js         ← email a bug report (needs RESEND_API_KEY, EMAIL_FROM/SUPPORT_EMAIL)
  prices.js             ← live-price proxy (Stooq/Yahoo/CoinGecko) — NO LONGER USED by the app
  push-config.js        ← returns VAPID public key
  push-subscribe.js     ← store a push subscription (Neon)
  notify.js             ← send a push/Telegram notification
  email-test.js         ← diagnostic email sender
  health.js             ← GET /api/health → which env vars are set (booleans), for debugging
public/                 ← static assets served as-is
  sw.js                 ← service worker (PWA offline cache + push handlers)
  terms.html            ← Terms of Service (has [PROVIDER]/[JURISDICTION] placeholders to fill)
  privacy.html          ← Privacy Policy
  manifest + icons      ← PWA install metadata
scripts/                ← Node scripts run by GitHub Actions (Telegram/email digests, push)
  send-reports.mjs, report-lib.mjs, send-push.mjs, ...
.github/workflows/
  android.yml           ← builds the Android APK on push (Node 22 / JDK 21) → GitHub Release "android-latest"
  reports.yml           ← weekly/monthly Telegram+email digest (⚠️ NOT configured — see §6)
  push-reminders.yml    ← push reminders (⚠️ NOT configured)
android/                ← Capacitor Android project (generated; for the phone app)
netlify/, netlify.toml  ← DEAD leftovers — not used. Safe to delete.
Docs: README.md, LAUNCH.md, MONETIZATION.md, CLOUDFLARE.md, CAPACITOR.md,
      ANDROID-PUBLISH.md, HANDOFF-parent-lifesim.md, and THIS file.
```

> Note: `README.md` is **stale** (says Netlify/Neon "not set up yet" and refers
> to `ToyboxFull.jsx`). Trust THIS handoff over the README.

---

## 4. Where things live inside `ToyboxFull.tsx`

It's one big file. Default export is `ToyboxApp`. Key anchors (line numbers
drift as the file changes — search the symbol if the number is off):

| What | ~Line | Symbol |
|---|---|---|
| Themes (8 background palettes) | 9 | `const THEMES` |
| Market assets (stocks/crypto/ETFs) | 114 | `const MARKET` |
| Starting prices for the sim | 166 | `const INIT_PRICES` |
| The 20 lessons (slides + quiz) | 186 | `const LESSONS` |
| Career ladder + bills + tax | 404–430 | `billsFor`, `const JOBS`, `promoNeed` |
| Challenge-round questions | 452 | `const LESSON_CHALLENGE` |
| Shop items (themes/avatars) | 620 | `const SHOP_ITEMS` |
| Badges | 643 | `const BADGES` |
| Root app / routing / cloud reconcile | 916 | `function ToyboxApp` |
| **Kid app (all kid screens)** | 1274 | `function KidDash` |
| Paycheck / budget logic | 1732 | `collectPaycheck` |
| Emergency fund add/empty | 1762 | `addEmergency` |
| Invest-savings + promotion logic | 1778 | `investSavings` |
| Money Machine UI (Earn→Invest→Grow) | 3467 | `moreView==="Invest"` |
| **Parent Dashboard** | 4321 | `function ParentDash` |

Kid navigation: bottom nav `nav` state (`Home / Trade / Learn / Assets / More`);
inside "More", `moreView` selects the sub-screen (Invest = Money Machine, Report,
Shop, Coach, etc.).

---

## 5. The money-life economy (current tuning)

**Career ladder** (13 jobs, low→high). Pay is GROSS; tax comes out first, then
bills (~58% of pay, auto-split into Home/Food/Phone/Other), and what's left is
savings to invest.

| Job | Pay | Tax | ~Bills | ~Keep to invest |
|---|---|---|---|---|
| 🍔 Fast-Food Crew | 120 | 10% | 70 | 38 |
| 🛒 Store Cashier | 165 | 10% | 96 | 52 |
| 🧑‍🍳 Cook | 210 | 10% | 122 | 67 |
| 🚒 Firefighter | 260 | 12% | 151 | 78 |
| 👮 Police Officer | 300 | 12% | 174 | 90 |
| 🧑‍🏫 Teacher | 350 | 12% | 203 | 105 |
| 👩‍⚕️ Nurse | 410 | 15% | 238 | 110 |
| 👷 Engineer | 480 | 15% | 278 | 130 |
| 🧑‍💻 Software Developer | 560 | 18% | 325 | 134 |
| 👩‍⚖️ Lawyer | 700 | 18% | 406 | 168 |
| 🩺 Doctor | 900 | 20% | 522 | 198 |
| 🚀 Astronaut | 1150 | 22% | 667 | 230 |
| 💼 Business Owner (top) | 1500 | 25% | 870 | 255 |

**Rules:**
- **Paydays** are on a real **14-day** clock (`PAY_DAYS`). First one is ready
  immediately; after that a "Next payday in N days" countdown shows.
- **Promotion** = invest from **2 paychecks** (`promoNeed()` returns 2) → ~1
  month per rung. Progression is forced lowest→highest (no job picker).
- **Surprise life events** (~35% of paydays, not the first): a random cost
  (30–70% of savings) — teaches emergency funds.
- **Emergency fund**: parent/kid stashes cash aside; a surprise is paid from it
  first. Capped at ~3 months of bills (`emGoal = curBills*6`). "Move it all
  back to cash" empties it to $0.
- **Money Machine** deducts REAL cash when investing (into VOO/QQQ etc.), and
  the holding is flagged long-term (`longTerm:true`).

**Lessons:** 20 lessons, cash rewards total ~$1,850. Levels 1–2 free, 3–4 are
Toybox Plus (gated in `openLesson`). Challenge Rounds re-pay the lesson's cash.

---

## 6. Environment variables / secrets

**Cloudflare Pages** (Settings → Environment variables) — powers the live backend:

| Var | Used by | Status |
|---|---|---|
| `ANTHROPIC_API_KEY` | Toby coach | set |
| `DATABASE_URL` | Neon cloud sync (`kv.js`) | set if sync is used |
| `RESEND_API_KEY` | bug-report email | set |
| `EMAIL_FROM` / `SUPPORT_EMAIL` | bug-report email | set (support = toyboxtrader.support@gmail.com) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | web push | optional |

Check live status anytime: **`GET https://toyboxtrader.com/api/health`** →
returns which vars are set as booleans.

**GitHub repo secrets** (Settings → Secrets → Actions) — power the Actions:

| Secret | Used by | Status |
|---|---|---|
| `DATABASE_URL` | reports digest | ❌ **empty** |
| `TELEGRAM_BOT_TOKEN` | Telegram digest | ❌ **empty** |
| `RESEND_API_KEY` / `EMAIL_FROM` | email digest | ❌ **empty** |
| `ANDROID_KEYSTORE_BASE64` + 3 more | signed Play Store AAB | optional (debug APK works without) |

> **Why no Telegram/email digests arrive:** `reports.yml` runs every Sunday but
> its secrets are empty, so `send-reports.mjs` prints "not-configured" and exits.
> It ALSO only reports on families whose data is in Neon (cloud sync ON) and who
> linked a Telegram chat. The **in-app Parent Report** (Parent Dashboard → Report
> tab) works with zero setup and is the recommended path.

---

## 7. How to deploy (make changes live)

Development branch: **`claude/github-netlify-deploy-3tmjob`**. Deploy = push to
`main` (Cloudflare auto-builds).

```bash
npm ci                 # install deps
npm run build          # local production build (sanity check)
npm run preview        # serve dist/ locally on a port to test

# commit, then:
git push -u origin claude/github-netlify-deploy-3tmjob   # save work on the branch
git push origin claude/github-netlify-deploy-3tmjob:main # ← this deploys to Cloudflare
```

Cloudflare rebuilds in ~1–2 min. **Users must fully reload** (close/reopen the
PWA, or Ctrl/Cmd+Shift+R) to drop the cached bundle — the service worker is
network-first for navigations so a real reload picks up the new JS.

**Storage model to remember:** all kid data lives in the browser's
`localStorage` on the device the kid uses. The Parent Dashboard reads that same
device. Cross-device visibility (and the digests) require **Family Cloud Sync**.

---

## 8. Automations (GitHub Actions)

- **`android.yml`** — ✅ working. On push to app files, builds a debug APK
  (Node 22, JDK 21, Capacitor) and publishes it to the `android-latest` GitHub
  Release. Currently fires on *every* push; can be made manual-only
  (`workflow_dispatch`) since launch is web-first.
- **`reports.yml`** — ⚠️ scheduled but unconfigured (see §6).
- **`push-reminders.yml`** — ⚠️ unconfigured.

---

## 9. Testing approach

No test framework. Verification is done with **headless Playwright (Chromium)**
against `npm run preview`:
- Seed a kid via `window.storage.set('toybox:kid:k1:state', ...)` then reload.
- Kid login goes through a 2FA screen: wait ~1.3s, click `.email-code-box`.
- Effect/celebration overlays can intercept clicks — dismiss the `.reward-ov`
  overlay, or click via `el.click()` in `page.evaluate` to fire React onClick.
- Parent Dashboard is behind a math gate: read the `N × N` question from the
  page text, compute, fill the input, submit.

---

## 10. Known gaps / TODO

- **Terms/Privacy placeholders:** `public/terms.html` has `[PROVIDER]` and
  `[JURISDICTION]` to fill before real launch.
- **Legal (owner action):** form an LLC + get a lawyer review before taking real
  payments; verify Anthropic's terms for a kids-facing AI and market-data
  licensing.
- **Payments:** pricing is $4.99/mo or $29.99/yr, but **Stripe is not wired** —
  the paywall currently just sets `toybox:family:premium` locally. Swap in
  Stripe in `src/sync-ui.ts` when ready.
- **Stale `README.md`** — update or delete.
- **Netlify leftovers** — `netlify.toml` + `netlify/functions/` are dead; delete
  when convenient.
- **Digests** — Telegram/email not configured; use the in-app Report or finish
  the setup in §6.

---

## 11. Quick reference

- **Live:** https://toyboxtrader.com · Pages: `toybox-trader.pages.dev`
- **Health check:** https://toyboxtrader.com/api/health
- **Deploy:** push to `main` → Cloudflare Pages
- **The app:** `ToyboxFull.tsx` (search symbols; it's one file)
- **Support inbox:** toyboxtrader.support@gmail.com
- **Hosting:** Cloudflare · **DB:** Neon · **AI:** Anthropic · **Email:** Resend
- **NOT** on Netlify.
