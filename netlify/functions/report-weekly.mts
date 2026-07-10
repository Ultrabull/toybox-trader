// Scheduled function: weekly Telegram report.
// Runs every Sunday at 17:00 UTC. (Tell me your timezone if you'd like it
// shifted — Netlify schedules run in UTC.)

import { neon } from "@neondatabase/serverless";
import { sendReports } from "../lib/report";

export const config = { schedule: "0 17 * * 0" };

export default async () => {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!url || !token) return new Response("not-configured", { status: 200 });

  const sql = neon(url);
  const result = await sendReports("weekly", sql, token, 7);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
