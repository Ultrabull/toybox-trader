// API base resolver.
//
// In the browser (web / installed PWA) the app is served from the same origin
// as the Netlify functions, so relative paths like "/.netlify/functions/kv"
// work. In a Capacitor NATIVE build the app is served from capacitor://localhost
// (iOS) or http://localhost (Android), so those relative paths would 404 —
// native calls must hit the live server by absolute URL.
//
// apiUrl() returns the right prefix for whichever environment we're in.

const LIVE_ORIGIN = "https://toytrader.netlify.app";

export function isNative(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

export function apiUrl(path: string): string {
  return (isNative() ? LIVE_ORIGIN : "") + path;
}
