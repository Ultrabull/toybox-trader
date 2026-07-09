// Entry point: reconcile local <-> cloud storage, mount the app, then add the
// floating sync widget. Importing ./storage installs window.storage as a side
// effect before anything reads it.
import { reconcile } from "./storage";
import { mountSyncUI } from "./sync-ui";
import { createRoot } from "react-dom/client";
import ToyboxApp from "../ToyboxFull";

async function boot() {
  // Pull the latest cloud state (or migrate this device up) before the app
  // reads its saved data. Fails open to local-only mode if cloud is unreachable.
  await reconcile();
  createRoot(document.getElementById("root")!).render(<ToyboxApp />);
  mountSyncUI();
}

boot();
