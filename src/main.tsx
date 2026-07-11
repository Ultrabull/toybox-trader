// Entry point: reconcile local <-> cloud storage, mount the app, then add the
// floating sync + reminders widgets. Importing ./storage installs
// window.storage as a side effect before anything reads it.
import { reconcile } from "./storage";
import { mountSyncUI } from "./sync-ui";
import { mountPushUI } from "./push-ui";
import { createRoot } from "react-dom/client";
import ToyboxApp from "../ToyboxFull";

// Register the service worker (PWA offline + push). Non-blocking.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

async function boot() {
  // Pull the latest cloud state (or migrate this device up) before the app
  // reads its saved data. Fails open to local-only mode if cloud is unreachable.
  await reconcile();
  createRoot(document.getElementById("root")!).render(<ToyboxApp />);
  mountSyncUI();
  mountPushUI();
}

boot();
