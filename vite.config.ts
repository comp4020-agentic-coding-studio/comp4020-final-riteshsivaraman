import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

// Builds the Preact SPA to static/ (gitignored); the Hono server serves it
// from there. No SSR --- an email client is app-shell-shaped, and the server
// only needs to answer the API, the static bundle, and /readme/.
export default defineConfig({
  root: "src/client",
  plugins: [preact()],
  build: {
    outDir: "../../static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
