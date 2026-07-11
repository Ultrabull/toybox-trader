// Sends the daily push reminder to devices whose LOCAL time is 4pm.
// Invoked hourly by GitHub Actions cron. Runs in Node (web-push works here).
import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

const TARGET_HOUR = 16; // 4pm local

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:toyboxtrader.support@gmail.com";
if (!url || !pub || !priv) {
  console.log("not-configured (need DATABASE_URL + VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)");
  process.exit(0);
}
webpush.setVapidDetails(subject, pub, priv);

function localHour(tz) {
  if (!tz) return null;
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date());
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

const sql = neon(url);
const utcHour = new Date().getUTCHours();
const rows = await sql`SELECT space, k, v FROM kv WHERE k LIKE 'toybox:push:%'`;

const payload = JSON.stringify({
  title: "🎁 Toybox Trader",
  body: "Your daily bonus is ready! Claim it and check your predictions to keep your streak alive 🔥",
  url: "/",
  tag: "daily-bonus",
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
    const hour = localHour(rec?.tz || "");
    const due = hour === null ? utcHour === TARGET_HOUR : hour === TARGET_HOUR;
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
console.log(`push reminders: sent=${sent} pruned=${pruned} skipped=${skipped} total=${rows.length}`);
