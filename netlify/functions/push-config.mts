// Returns the public VAPID key so the browser can subscribe to push.
// The public key is safe to expose; the private key stays in env only.
export default async () =>
  new Response(JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY || "" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
