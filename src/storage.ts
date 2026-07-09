// ─── window.storage shim ───────────────────────────────────────────────
// ToyboxFull.tsx persists progress through `window.storage` (set/get/delete),
// an API the app expects the host to provide. On a static host like Netlify
// there is no such host object, so we back it with the browser's localStorage.
//
// localStorage is scoped to the site's origin, so a kid's saved progress stays
// tied to this exact URL — reinstalling the app or redeploying the site does
// not wipe it, but visiting from a different browser/device starts fresh
// (the app's built-in backup codes cover moving between devices).
//
// This only defines window.storage when the host hasn't already provided one,
// so a future real backend (e.g. Neon) can supply its own implementation.

type StorageRecord = { value: string } | null;

type StorageApi = {
  set: (key: string, value: string, encrypt?: boolean) => Promise<void>;
  get: (key: string, encrypt?: boolean) => Promise<StorageRecord>;
  delete: (key: string, encrypt?: boolean) => Promise<void>;
};

declare global {
  interface Window {
    storage?: StorageApi;
  }
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage full or unavailable — fail quietly, same as the app expects */
      }
    },
    async get(key) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? null : { value };
      } catch {
        return null;
      }
    },
    async delete(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export {};
