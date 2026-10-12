import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // The *-live.test.ts files all hit one real running app, and the NPCs in
    // it (greeter-1 especially, since D40's tryGreeterApproach) are shared,
    // stateful singletons: two test FILES running concurrently can have their
    // customers contend for the same NPC, which looks like flakiness but is
    // really cross-file interference. Serialising files is a small cost here
    // (the whole suite is well under 5s) for a suite that means what it says.
    fileParallelism: false,
  },
});
