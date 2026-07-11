// Runs a weekly or monthly Telegram report. Invoked by GitHub Actions cron.
//   node scripts/send-reports.mjs weekly|monthly
import { neon } from "@neondatabase/serverless";
import { sendReports } from "./report-lib.mjs";

const period = process.argv[2] === "monthly" ? "monthly" : "weekly";
const days = period === "monthly" ? 30 : 7;

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!url || !token) {
  console.log("not-configured (need DATABASE_URL + TELEGRAM_BOT_TOKEN)");
  process.exit(0);
}

const sql = neon(url);
const res = await sendReports(period, sql, token, days, Date.now());
console.log(`${period} report:`, JSON.stringify(res));
