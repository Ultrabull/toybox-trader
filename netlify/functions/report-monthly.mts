// Scheduled function: monthly Telegram report.
// Runs on the 1st of each month at 09:00 UTC.

import { neon } from "@neondatabase/serverless";
import { sendReports } from "../lib/report";

export const config = { schedule: "0 9 1 * *" };

export default async () => {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!url || !token) return new Response("not-configured", { status: 200 });

  const sql = neon(url);
  const result = await sendReports("monthly", sql, token, 30);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
