// Cloudflare Pages Function — config health check. Route: /api/health (GET).
// Reports WHICH environment variables are present, as booleans only. It never
// returns the secret values themselves — just whether each one is configured.
// Open https://<your-site>/api/health in a browser to verify your setup.
export async function onRequestGet(context) {
  const { env } = context;
  const has = (v) => Boolean(v && String(v).trim());
  const body = {
    ok: true,
    checkedAt: new Date().toISOString(),
    env: {
      DATABASE_URL: has(env.DATABASE_URL) || has(env.NETLIFY_DATABASE_URL), // cloud sync
      RESEND_API_KEY: has(env.RESEND_API_KEY),                              // emails (bug reports + confirmations)
      EMAIL_FROM: has(env.EMAIL_FROM),                                      // from-address (verify a domain!)
      SUPPORT_EMAIL: has(env.SUPPORT_EMAIL),                                // where reports go
      TELEGRAM_BOT_TOKEN: has(env.TELEGRAM_BOT_TOKEN),                      // parent nudges
      VAPID_PUBLIC_KEY: has(env.VAPID_PUBLIC_KEY),                          // web push
      VAPID_PRIVATE_KEY: has(env.VAPID_PRIVATE_KEY),                        // web push
    },
    notes: {
      EMAIL_FROM_default:
        has(env.EMAIL_FROM)
          ? "custom (good)"
          : "falling back to onboarding@resend.dev — only emails your own Resend account until you verify a domain",
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
