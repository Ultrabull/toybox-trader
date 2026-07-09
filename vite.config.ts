import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the single-file React app (ToyboxFull.tsx) into a static HTML
// bundle in dist/, which is what Netlify publishes.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
