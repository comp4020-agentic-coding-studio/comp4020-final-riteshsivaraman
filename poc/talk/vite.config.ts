import { defineConfig } from "vite";

// The throwaway proof-of-concept page for the conversation model. It imports
// the engine straight from src/shared/talk/, so what you play is what the
// specs check. `pnpm poc` serves it on :5180.
export default defineConfig({
  root: "poc/talk",
  server: { port: 5180, strictPort: true },
});
