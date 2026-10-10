import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the React client to static/ (gitignored); the Hono server serves it
// from there and also owns /ws and /readme/. In dev, Vite proxies the socket
// to the server on :8080.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
});
