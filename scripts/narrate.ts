#!/usr/bin/env node
// Reads the app's log on stdin and prints who did what, in sentences:
//   flyctl logs --no-tail | pnpm narrate
// Lines that are not events (the platform's own) are dropped.
import { createInterface } from "node:readline";
import { narrateLine } from "../src/server/narrate.ts";

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const s = narrateLine(line);
  if (s) console.log(s);
});
