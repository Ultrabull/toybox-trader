// Scheduled function: hourly reminder sweep.
//
// Runs every hour and sends the daily-bonus reminder only to devices whose
// LOCAL time is TARGET_HOUR (4pm). Each subscription stores its timezone, so a
// kid in Texas gets it at 4pm Central and a cousin in California gets it at 4pm
// Pacific — the right time for everyone, from one scheduler.
//
// Expired subscriptions (404/410) are pruned automatically.

import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

export const config = { schedule: "0 * * * *" }; // top of every hour

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";
const TARGET_HOUR = 16; // 4pm local

// Local hour (0-23) for a timezone right now; null if the tz is unknown/invalid.
function localHour(tz: string): number | null {
  if (!tz) return null;
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date());
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

export default async () => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@toytrader.netlify.app";
  if (!DATABASE_URL || !pub || !priv) return new Response("not-configured", { status: 200 });
  webpush.setVapidDetails(subject, pub, priv);

  const utcHour = new Date().getUTCHours();
  const sql = neon(DATABASE_URL);
  const rows = (await sql`SELECT space, k, v FROM kv WHERE k LIKE 'toybox:push:%'`) as Array<{
    space: string;
    k: string;
    v: string;
  }>;

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
      let rec: any;
      try {
        rec = JSON.parse(row.v);
      } catch {
        return;
      }
      const sub = rec?.sub || rec; // tolerate old rows stored as the raw subscription
      const tz = rec?.tz || "";
      const hour = localHour(tz);
      // If we know the tz, only fire at their local 4pm. If not, fall back to a
      // single UTC 4pm so those devices still get one reminder a day.
      const due = hour === null ? utcHour === TARGET_HOUR : hour === TARGET_HOUR;
      if (!due) {
        skipped++;
        return;
      }
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await sql`DELETE FROM kv WHERE space = ${row.space} AND k = ${row.k}`.catch(() => {});
          pruned++;
        }
      }
    }),
  );

  return new Response(JSON.stringify({ sent, pruned, skipped, total: rows.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
