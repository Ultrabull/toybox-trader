// ─── window.storage: cloud-backed, offline-first ────────────────────────────
//
// ToyboxFull.tsx persists everything (kids registry + each kid's progress)
// through `window.storage` (get/set/delete). This module implements that API
// with two layers:
//
//   • localStorage  — instant reads/writes, and a full offline cache.
//   • Neon (cloud)  — via the /.netlify/functions/kv endpoint, so accounts and
//                     progress sync across devices.
//
// A household is identified by a "Family Sync Code" (`space`), a long
// unguessable token stored in localStorage. All cloud rows are scoped to it.
//
// Flow:
//   1. On startup, reconcile() runs once:
//        - cloud has data  → hydrate localStorage from cloud (cloud wins).
//        - cloud is empty but this device has local data → upload it (migrate).
//        - cloud unreachable/not configured → stay in pure-local (offline) mode.
//   2. Reads come from the (now-reconciled) localStorage cache — fast, sync.
//   3. Writes hit localStorage immediately and are pushed to cloud (debounced).
//
// If Neon isn't configured yet, everything still works exactly like before —
// purely local — so the site never breaks while the DB is being set up.

type StorageRecord = { value: string } | null;

type StorageApi = {
  set: (key: string, value: string, encrypt?: boolean) => Promise<void>;
  get: (key: string, encrypt?: boolean) => Promise<StorageRecord>;
  delete: (key: string, encrypt?: boolean) => Promise<void>;
};

type SyncApi = {
  getCode: () => string;
  status: () => "cloud" | "offline";
  link: (code: string) => Promise<{ ok: boolean; error?: string }>;
};

declare global {
  interface Window {
    storage?: StorageApi;
    toyboxSync?: SyncApi;
  }
}

const API = "/.netlify/functions/kv";
const PREFIX = "toybox:"; // app-owned keys we cache and migrate
const SPACE_LS_KEY = "toybox:sync:space"; // holds the Family Sync Code (not synced)

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
      /* quota / disabled — ignore, same as the app expects */
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

function genSpace(): string {
  try {
    const uuid = crypto?.randomUUID?.();
    if (uuid) return "fam_" + uuid.replace(/-/g, "");
  } catch {
    /* fall through */
  }
  let s = "fam_";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function getSpace(): string {
  let s = ls.get(SPACE_LS_KEY);
  if (!s) {
    s = genSpace();
    ls.set(SPACE_LS_KEY, s);
  }
  return s;
}

// Every app-owned key currently cached in localStorage (excludes the space id).
function localAppKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== SPACE_LS_KEY) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function api(op: string, extra: Record<string, unknown> = {}, space = getSpace()) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, space, ...extra }),
  });
  if (!res.ok) throw new Error("http " + res.status);
  return res.json();
}

// ── debounced cloud writes ───────────────────────────────────────────
// The app auto-saves on nearly every state change; coalesce those into at most
// one cloud write per key every ~800ms so we don't hammer Neon.
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
        /* keep local copy; will resync on next reconcile */
      }
    }, 800),
  );
}

function flushPending() {
  if (!pending.size) return;
  const space = getSpace();
  for (const [key, value] of pending) {
    try {
      // keepalive lets the request finish even as the page is closing.
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

// ── startup reconcile ────────────────────────────────────────────────
export async function reconcile(timeoutMs = 6000): Promise<void> {
  const space = getSpace();
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
      // Cloud is the source of truth — refresh the local cache from it.
      for (const k of keys) ls.set(k, data[k]);
    } else {
      // Cloud is empty. If this device already has accounts, seed the cloud
      // with them (first-time migration for an existing device).
      const local = localAppKeys();
      if (local.length > 0) {
        await Promise.all(
          local.map((k) => api("set", { key: k, value: ls.get(k) ?? "" })),
        );
      }
    }
  } catch {
    cloudOk = false; // not configured / offline → pure local mode
  }
}

// ── window.storage implementation ────────────────────────────────────
const storage: StorageApi = {
  async set(key, value) {
    ls.set(key, value); // instant + offline
    scheduleCloudSet(key, value); // debounced cloud push
  },
  async get(key) {
    const v = ls.get(key); // cache is reconciled at startup
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

// ── sync / link-a-device API (used by the floating Sync widget) ──────
const sync: SyncApi = {
  getCode: () => getSpace(),
  status: () => (cloudOk ? "cloud" : "offline"),
  async link(code) {
    const clean = (code || "").trim();
    if (clean.length < 8) return { ok: false, error: "That code looks too short." };
    if (clean === getSpace()) return { ok: true }; // already this device's code
    try {
      const { data } = await api("dump", {}, clean);
      const keys = Object.keys(data || {});
      if (keys.length === 0) {
        return { ok: false, error: "No accounts found for that code. Double-check it." };
      }
      // Adopt the linked household: replace local app data with the cloud copy.
      for (const k of localAppKeys()) ls.del(k);
      for (const k of keys) ls.set(k, data[k]);
      ls.set(SPACE_LS_KEY, clean);
      return { ok: true };
    } catch {
      return { ok: false, error: "Couldn't reach the sync server. Check your connection." };
    }
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
  window.toyboxSync = sync;
}

export {};
