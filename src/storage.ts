import { apiUrl } from "./api";
// ─── window.storage: cloud-backed, offline-first, with a family login ───────
//
// ToyboxFull.tsx persists everything (kids registry + each kid's progress)
// through `window.storage` (get/set/delete). This module implements that API
// with two layers:
//
//   • localStorage  — instant reads/writes, and a full offline cache.
//   • Neon (cloud)  — via /api/kv, so accounts sync across
//                     devices.
//
// A household is a "family": identified by a cloud `space`. Instead of a random
// per-device code, the space is DERIVED from the parent's email + password
// using PBKDF2 (100k iterations, in-browser). So signing in with the same
// email + password on any device lands in the same space and loads the same
// kids. The password is never stored or sent — only the derived space id is
// kept locally, which keeps the device "signed in" so kids never have to.
//
// Flow:
//   • Not signed in  → pure local mode (app works, no sync).
//   • Create family  → derive space, seed it with this device's local data.
//   • Sign in        → derive space, pull the family's data onto this device.
//   • Every startup  → if signed in, reconcile local <-> cloud (cloud wins).
//
// If the DB isn't configured, or the device is offline, everything still works
// locally — the site never breaks.

type StorageRecord = { value: string } | null;

type StorageApi = {
  set: (key: string, value: string, encrypt?: boolean) => Promise<void>;
  get: (key: string, encrypt?: boolean) => Promise<StorageRecord>;
  delete: (key: string, encrypt?: boolean) => Promise<void>;
};

type Result = { ok: boolean; error?: string };

type SyncApi = {
  state: () => { signedIn: boolean; email: string | null; status: "cloud" | "offline" };
  createFamily: (email: string, password: string) => Promise<Result>;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => void;
  notify: (text: string) => Promise<Result>;
  deleteAccount: () => Promise<Result>;
};

declare global {
  interface Window {
    storage?: StorageApi;
    toyboxSync?: SyncApi;
  }
}

const API = apiUrl("/api/kv");
const PREFIX = "toybox:"; // app-owned keys we cache and sync
const INTERNAL = "toybox:sync:"; // device-local, never synced
const SPACE_LS_KEY = "toybox:sync:space"; // derived family space id (kept signed in)
const EMAIL_LS_KEY = "toybox:sync:email"; // for display only
const FAMILY_META_KEY = "toybox:family"; // marker row proving a family exists

let cloudOk = false;

// ── localStorage helpers ─────────────────────────────────────────────
const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota / disabled — ignore */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

function storedSpace(): string | null {
  return ls.get(SPACE_LS_KEY);
}

// App-owned keys currently cached locally (excludes device-local sync keys).
function localAppKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !k.startsWith(INTERNAL)) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

// ── derive the family space from email + password (PBKDF2) ────────────
async function deriveSpace(email: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const normEmail = email.trim().toLowerCase();
  const salt = enc.encode("toybox-trader:v1:" + normEmail);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    160, // 20 bytes → 40 hex chars
  );
  const hex = [...new Uint8Array(bits)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "fam_" + hex;
}

async function api(op: string, extra: Record<string, unknown> = {}, space = storedSpace() || "") {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, space, ...extra }),
  });
  if (!res.ok) throw new Error("http " + res.status);
  return res.json();
}

// ── debounced cloud writes ───────────────────────────────────────────
const pending = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCloudSet(key: string, value: string) {
  if (!cloudOk) return;
  pending.set(key, value);
  if (timers.has(key)) return;
  timers.set(
    key,
    setTimeout(async () => {
      timers.delete(key);
      const v = pending.get(key);
      pending.delete(key);
      if (v == null) return;
      try {
        await api("set", { key, value: v });
      } catch {
        /* keep local; resync next reconcile */
      }
    }, 800),
  );
}

function flushPending() {
  if (!pending.size || !cloudOk) return;
  const space = storedSpace() || "";
  for (const [key, value] of pending) {
    try {
      fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "set", space, key, value }),
        keepalive: true,
      });
    } catch {
      /* best effort */
    }
  }
  pending.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
  });
}

// ── startup reconcile (only when signed in) ──────────────────────────
export async function reconcile(timeoutMs = 6000): Promise<void> {
  const space = storedSpace();
  if (!space) {
    cloudOk = false; // not signed in → pure local mode
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "dump", space }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error("http " + res.status);
    const { data } = await res.json();
    cloudOk = true;

    const keys = Object.keys(data || {});
    if (keys.length > 0) {
      for (const k of keys) ls.set(k, data[k]); // cloud wins → refresh cache
    } else {
      // Signed in but cloud is empty (e.g. just recovered) — reseed from local.
      const local = localAppKeys();
      if (local.length > 0) {
        await Promise.all(local.map((k) => api("set", { key: k, value: ls.get(k) ?? "" })));
      }
    }
  } catch {
    cloudOk = false; // offline / DB down → keep working locally
  }
}

// ── window.storage implementation ────────────────────────────────────
const storage: StorageApi = {
  async set(key, value) {
    ls.set(key, value);
    scheduleCloudSet(key, value);
  },
  async get(key) {
    const v = ls.get(key);
    return v === null ? null : { value: v };
  },
  async delete(key) {
    ls.del(key);
    pending.delete(key);
    if (cloudOk) {
      try {
        await api("delete", { key });
      } catch {
        /* ignore */
      }
    }
  },
};

// ── family login API (used by the sign-in widget) ────────────────────
async function dumpSpace(space: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "dump", space }),
    });
    if (!res.ok) throw new Error("http " + res.status);
    const { data } = await res.json();
    return data || {};
  } catch {
    return null; // cloud unreachable
  }
}

function persistSession(space: string, email: string) {
  ls.set(SPACE_LS_KEY, space);
  ls.set(EMAIL_LS_KEY, email.trim().toLowerCase());
}

const sync: SyncApi = {
  state: () => ({
    signedIn: !!storedSpace(),
    email: ls.get(EMAIL_LS_KEY),
    status: cloudOk ? "cloud" : "offline",
  }),

  async createFamily(email, password) {
    const e = email.trim().toLowerCase();
    if (!e || !/.+@.+\..+/.test(e)) return { ok: false, error: "Enter a valid email." };
    if ((password || "").length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    let space: string;
    try {
      space = await deriveSpace(e, password);
    } catch {
      return { ok: false, error: "Your browser blocked secure sign-in. Try Safari/Chrome over https." };
    }
    const existing = await dumpSpace(space);
    if (existing === null) return { ok: false, error: "Couldn't reach the sync server. Check your connection." };
    if (Object.keys(existing).length > 0) {
      return { ok: false, error: "An account with this email & password already exists — use Sign in instead." };
    }
    // New family: mark it, then seed it with whatever is on this device.
    persistSession(space, e);
    cloudOk = true;
    ls.set(FAMILY_META_KEY, JSON.stringify({ email: e, v: 1 }));
    try {
      const keys = localAppKeys();
      await Promise.all(keys.map((k) => api("set", { key: k, value: ls.get(k) ?? "" }, space)));
    } catch {
      return { ok: false, error: "Couldn't reach the sync server. Check your connection." };
    }
    return { ok: true };
  },

  async signIn(email, password) {
    const e = email.trim().toLowerCase();
    if (!e || !/.+@.+\..+/.test(e)) return { ok: false, error: "Enter a valid email." };
    if (!password) return { ok: false, error: "Enter your password." };
    let space: string;
    try {
      space = await deriveSpace(e, password);
    } catch {
      return { ok: false, error: "Your browser blocked secure sign-in. Try Safari/Chrome over https." };
    }
    const data = await dumpSpace(space);
    if (data === null) return { ok: false, error: "Couldn't reach the sync server. Check your connection." };
    if (Object.keys(data).length === 0) {
      return { ok: false, error: "No family found with that email & password. Check your details, or create a family." };
    }
    // Adopt the family on this device: replace local app data with the cloud copy.
    for (const k of localAppKeys()) ls.del(k);
    for (const k of Object.keys(data)) ls.set(k, data[k]);
    persistSession(space, e);
    cloudOk = true;
    return { ok: true };
  },

  signOut() {
    flushPending();
    ls.del(SPACE_LS_KEY);
    ls.del(EMAIL_LS_KEY);
    cloudOk = false;
  },

  // Best-effort Telegram notification. The server looks up the family's linked
  // chat id and bot token; if either is missing it just returns not-connected.
  async notify(text) {
    const space = storedSpace();
    if (!space) return { ok: false, error: "Sign in to enable alerts." };
    if (!text || !text.trim()) return { ok: false, error: "Nothing to send." };
    try {
      const res = await fetch(apiUrl("/api/notify"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ space, text }),
        keepalive: true,
      });
      const d = await res.json().catch(() => ({}));
      return d?.ok ? { ok: true } : { ok: false, error: d?.error || "Telegram not set up yet." };
    } catch {
      return { ok: false, error: "Couldn't reach the server." };
    }
  },

  // Permanently delete the whole family's data from the cloud, then wipe this
  // device. Proceeds with the local wipe even if the server call fails.
  async deleteAccount() {
    const space = storedSpace();
    if (space) {
      try {
        await fetch(apiUrl("/api/delete-account"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ space }),
        });
      } catch {
        /* still wipe locally */
      }
    }
    try {
      for (const k of localAppKeys()) ls.del(k);
      ls.del(SPACE_LS_KEY);
      ls.del(EMAIL_LS_KEY);
    } catch {
      /* ignore */
    }
    cloudOk = false;
    return { ok: true };
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
  window.toyboxSync = sync;
}

export {};
