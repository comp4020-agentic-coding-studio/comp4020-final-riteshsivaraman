import { defineConfig } from "vitest/config";

// The conversation model is pure functions over sourced data, so its specs need
// no running app. `pnpm test:talk` runs just these; `pnpm check` still runs
// them too, through the main config.
export default defineConfig({
  test: { include: ["spec/talk-*.test.ts"] },
});
