#!/usr/bin/env node
// One command to see the store locally with hot reload:
//   pnpm dev          then open http://localhost:5173
// Starts the game server (port 8080, restarts when server or shared code
// changes) and the Vite client (port 5173, reloads the page when client or
// shared code changes). Ctrl-C stops both. Uses the local database in .data/.
import { spawn } from "node:child_process";

const run = (name: string, args: string[], env: Record<string, string> = {}) => {
  const child = spawn("pnpm", ["exec", ...args], { stdio: "inherit", env: { ...process.env, ...env } });
  child.on("exit", (code) => {
    console.log(`${name} stopped (${code})`);
    process.exit(code ?? 0);
  });
  return child;
};

const server = run("server", ["tsx", "watch", "src/server/index.ts"], { PORT: "8080" });
const client = run("client", ["vite", "--port", "5173", "--strictPort"]);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.kill();
    client.kill();
  });
}
console.log("\nOpen http://localhost:5173 (the store, hot reload). Add ?shot=1&at=x,z,yaw,pitch for a fixed view.\n");
