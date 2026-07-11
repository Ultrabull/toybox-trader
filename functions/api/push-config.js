// Cloudflare Pages Function — serve the public VAPID key. Route: /api/push-config (GET).
export async function onRequestGet(context) {
  return new Response(JSON.stringify({ publicKey: context.env.VAPID_PUBLIC_KEY || "" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
