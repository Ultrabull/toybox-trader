// Sends the WEEKLY "report is ready" push to parents (and any device that
// enabled reminders). Timezone-aware: each device gets it on SUNDAY at ~6pm
// LOCAL time, mirroring the daily-reminder approach. Invoked hourly by the
// same GitHub Actions cron as the daily reminder; it self-gates so it only
// fires in the matching local hour.
import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

const TARGET_DOW = "Sun"; // Sunday
const TARGET_HOUR = 18; // 6pm local

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:toyboxtrader.support@gmail.com";
if (!url || !pub || !priv) {
  console.log("not-configured (need DATABASE_URL + VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)");
  process.exit(0);
}
webpush.setVapidDetails(subject, pub, priv);

// Local weekday + hour for a timezone; null if we can't resolve it.
function localParts(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday")?.value;
    let h = parseInt(parts.find((p) => p.type === "hour")?.value, 10);
    if (h === 24) h = 0;
    return Number.isFinite(h) ? { wd, h } : null;
  } catch {
    return null;
  }
}

const sql = neon(url);
const now = new Date();
const utcDue = now.getUTCDay() === 0 && now.getUTCHours() === TARGET_HOUR; // Sunday 18:00 UTC fallback
const rows = await sql`SELECT space, k, v FROM kv WHERE k LIKE 'toybox:push:%'`;

const payload = JSON.stringify({
  title: "📊 Weekly report is ready!",
  body: "See how your kids did this week — their trades, progress and report-card grade. Tap to open! 🌟",
  url: "/?view=report",
  tag: "weekly-report",
});

let sent = 0,
  pruned = 0,
  skipped = 0;
await Promise.all(
  rows.map(async (row) => {
    let rec;
    try {
      rec = JSON.parse(row.v);
    } catch {
      return;
    }
    const sub = rec?.sub || rec;
    const lp = localParts(rec?.tz || "");
    const due = lp ? lp.wd === TARGET_DOW && lp.h === TARGET_HOUR : utcDue;
    if (!due) {
      skipped++;
      return;
    }
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        await sql`DELETE FROM kv WHERE space = ${row.space} AND k = ${row.k}`.catch(() => {});
        pruned++;
      }
    }
  }),
);
console.log(`weekly report push: sent=${sent} pruned=${pruned} skipped=${skipped} total=${rows.length}`);
