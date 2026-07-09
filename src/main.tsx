// Entry point: install the storage shim first, then mount the app.
import "./storage";
import { createRoot } from "react-dom/client";
import ToyboxApp from "../ToyboxFull";

createRoot(document.getElementById("root")!).render(<ToyboxApp />);
