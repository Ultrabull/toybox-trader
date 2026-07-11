import { apiUrl } from "./api";
// Client-side push notifications.
//
// enablePush(): asks permission, subscribes via the browser's PushManager using
// the server's VAPID public key, and stores the subscription in Neon (scoped to
// the family space) so the server can send reminders to this device.
//
// iOS note: web push only works once the app is INSTALLED to the Home Screen
// (iOS 16.4+). In a normal Safari tab, Notification/PushManager may be missing
// or permission requests are ignored — we surface a clear message for that.

const SPACE_LS_KEY = "toybox:sync:space";

type PushState = "unsupported" | "needs-install" | "default" | "denied" | "granted";

function spaceId(): string {
  try {
    return localStorage.getItem(SPACE_LS_KEY) || "";
  } catch {
    return "";
  }
}

// Detect iOS Safari running in a normal tab (not installed) — push won't work.
function iosNeedsInstall(): boolean {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  const standalone = (window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as any).standalone === true;
  return isIOS && !standalone;
}

export function pushState(): PushState {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return iosNeedsInstall() ? "needs-install" : "unsupported";
  }
  if (iosNeedsInstall()) return "needs-install";
  return Notification.permission as PushState; // "default" | "denied" | "granted"
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  const state = pushState();
  if (state === "unsupported") return { ok: false, error: "This device doesn't support notifications." };
  if (state === "needs-install") {
    return { ok: false, error: "On iPhone/iPad, first tap Share → Add to Home Screen, open the app from there, then turn on reminders." };
  }

  // Fetch the VAPID public key from the server.
  let publicKey = "";
  try {
    const cfg = await fetch(apiUrl("/api/push-config")).then((r) => r.json());
    publicKey = cfg?.publicKey || "";
  } catch {
    /* handled below */
  }
  if (!publicKey) return { ok: false, error: "Reminders aren't set up on the server yet." };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notifications were blocked. You can enable them in your browser settings." };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    // Send the device's timezone so reminders fire at the kid's LOCAL time,
    // wherever they are.
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      /* ignore */
    }
    const res = await fetch(apiUrl("/api/push-subscribe"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ space: spaceId(), subscription: sub, tz, op: "subscribe" }),
    });
    if (!res.ok) throw new Error("save-failed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Couldn't turn on reminders. Please try again." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(apiUrl("/api/push-subscribe"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ space: spaceId(), subscription: sub, op: "unsubscribe" }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    if (pushState() !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}
