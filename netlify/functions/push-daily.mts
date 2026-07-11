// Scheduled function: daily push reminder to every subscribed device.
// Runs at 16:00 UTC (after-school-ish; tell me your timezone to adjust).
// Nudges kids to claim their daily bonus and check predictions — the retention
// loop. Expired subscriptions (410/404) are pruned automatically.

import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

export const config = { schedule: "0 16 * * *" };

const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";

export default async () => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@toytrader.netlify.app";
  if (!DATABASE_URL || !pub || !priv) {
    return new Response("not-configured", { status: 200 });
  }
  webpush.setVapidDetails(subject, pub, priv);

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
    pruned = 0;
  await Promise.all(
    rows.map(async (row) => {
      let sub: any;
      try {
        sub = JSON.parse(row.v);
      } catch {
        return;
      }
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription is gone — remove it.
          await sql`DELETE FROM kv WHERE space = ${row.space} AND k = ${row.k}`.catch(() => {});
          pruned++;
        }
      }
    }),
  );

  return new Response(JSON.stringify({ sent, pruned, total: rows.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
