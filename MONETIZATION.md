# Toybox Trader — monetization

## Strategy: "Kid begs → Parent approves → Both feel great"
The kid is the *wanter*, the parent is the *payer*. The free tier makes the kid
fall in love; Plus gives status + more adventures (kid wants it) plus family
accounts + parent reports (parent values it). The kid **asks** the parent via a
Telegram nudge, the parent unlocks behind a parental gate, and the kid gets an
**instant reward** so the "yes" feels amazing.

## Free vs Plus
**Free (forever, no ads):** 1 kid, full trading + live prices, 5 daily trades,
starter lessons (~6), all daily hooks (login bonus, spin, streaks, badges),
predictions, coin shop, pet, backup codes, single device.

**Toybox Plus ($4.99/mo or $29.99/yr — save 50%):** up to 5 kids, cloud sync across
devices, full lesson library, family leaderboard, weekly/monthly parent reports,
push reminders, 10 daily trades + Investment Club, exclusive cosmetics (pet
crown, gold name frame), priority support.

### Paywall trigger moments
Adding a 2nd kid · tapping ☁️ sync · finishing free lessons · opening parent
reports · premium cosmetics in the shop. Surface Plus at a *high* moment (a win,
a new badge, topping the leaderboard).

## What's built now (pre-IAP)
- `toybox:family:premium` — a synced family flag (whole family unlocks at once).
- **Kid side:** a ⭐ upsell banner on Home → Plus modal → "Ask a grown-up"
  button, which sends a **Telegram nudge** to the parent.
- **Parent side:** ☁️ panel → **⭐ Toybox Plus → Unlock** (the signed-in panel is
  already parent-gated by the family password). Today it flips the flag.
- **Reward:** on unlock a device celebrates and grants the kid 500 coins + a
  Golden Crown + gold name frame.

## Pricing psychology (when you launch)
- **7-day free trial** — the biggest lever (loss aversion after the taste).
- **Anchor annual as the deal**: `$4.99/mo` next to `$29.99/yr — save 50%`.
- Frame it as *investing in your kid*, not "premium features".
- A low price ($1) converts easily but likely **underprices** — $4.99/mo
  nets far more at similar conversion. Subscription-only (no lifetime) keeps
  recurring revenue predictable. Test it.

## To turn on real money (next step, needs dev accounts)
1. Add in-app purchases: **RevenueCat** (easiest cross-store) or native
   StoreKit/Play Billing via a Capacitor plugin.
2. On a successful purchase, set `toybox:family:premium` = `"true"` (the flag the
   app already reads) — the whole current flow then "just works".
3. Gate the remaining Plus features (multi-kid, full lessons, reports) off
   `isPremium`. Today only the cosmetics/celebration are wired; the rest is a
   straightforward follow-up.
4. Keep purchases behind the store's parental controls + our parental gate
   (required for kids' apps).

## Also consider: schools / B2B
Educational simulators earn well via **classroom licenses** (see "The Stock
Market Game"). A teacher dashboard + bulk student accounts could be a stronger
revenue line than consumer subscriptions. Worth exploring after launch.
