#!/usr/bin/env -S pnpm exec tsx
// The bot-stress harness (issue #13, .claude/skills/bot-stress/SKILL.md):
// 20-30 headless scripted clients over the real WebSocket/HTTP protocol
// (built on scripts/sim/'s pattern and spec/*-live.test.ts's socket wrapper,
// generalised into scripts/bots/client.ts and flows.ts), run against a local
// Docker image by default. Scenarios: S1, S2, S4, S11 (SCOPE.md 3d), a staff
// member joining mid-wave, a disconnect and reconnect, a restart with state
// intact, and 3 staff + 25 customers at once.
//
// This run does NOT file bug issues -- per the skill and the orchestrator's
// brief, that is /bot-stress's job when it is actually run before a promote
// or after a freeze. This file only proves the harness itself works and
// reports what it found.
//
// Usage:
//   pnpm bots                                   # local dev server (expects one already running on :8080)
//   pnpm bots --target=docker                   # builds (if needed) and runs the local Docker image
//   pnpm bots --target=http://127.0.0.1:18080    # an already-running server at this URL
//   pnpm bots --target=https://<app>.fly.dev --live-ok   # the live Fly URL -- only on the orchestrator's say-so, at low volume
//   pnpm bots --slow                             # slow-connection run mode: 100-400ms latency injected on every bot send
//   pnpm bots --only=S1,S4                       # run a subset of scenarios
import { execFileSync, spawnSync } from "node:child_process";
import { NO_LATENCY, SLOW_CONNECTION, type LatencyMode } from "./client.ts";
import { printReport, type ScenarioResult } from "./report.ts";
import { runS1 } from "./scenarios/s1-happy-path.ts";
import { runS2 } from "./scenarios/s2-browse-and-leave.ts";
import { runS4 } from "./scenarios/s4-out-of-stock.ts";
import { runS11 } from "./scenarios/s11-stock-race.ts";
import { runStaffJoinsMidWave } from "./scenarios/staff-joins-mid-wave.ts";
import { runDisconnectReconnect } from "./scenarios/disconnect-reconnect.ts";
import { runRestartStateIntact } from "./scenarios/restart-state-intact.ts";
import { runSoak } from "./scenarios/soak-3-staff-25-customers.ts";

interface Args {
  target: string; // "docker" | a base URL
  slow: boolean;
  liveOk: boolean;
  only?: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { target: "docker", slow: false, liveOk: false };
  for (const a of argv) {
    if (a === "--slow") out.slow = true;
    else if (a === "--live-ok") out.liveOk = true;
    else if (a.startsWith("--target=")) out.target = a.slice("--target=".length);
    else if (a.startsWith("--only=")) out.only = a.slice("--only=".length).split(",").map((s) => s.trim());
  }
  return out;
}

const DOCKER_IMAGE = "store-sim-bots:local";
const DOCKER_CONTAINER = "store-sim-bots-run";
const DOCKER_PORT = 18099;

// Builds (if the image isn't already there) and runs the local Docker image
// from the repo's own Dockerfile -- SKILL.md #1: "local Docker image by
// default." Returns the base URL and the container name (for the restart
// scenario), plus a cleanup function.
function startDocker(): { baseUrl: string; containerName: string; stop: () => void } {
  const hasImage = spawnSync("docker", ["image", "inspect", DOCKER_IMAGE], { stdio: "ignore" }).status === 0;
  if (!hasImage) {
    console.log(`[bot-stress] building ${DOCKER_IMAGE} from the repo Dockerfile (first run only)...`);
    execFileSync("docker", ["build", "-t", DOCKER_IMAGE, "."], { stdio: "inherit" });
  }
  spawnSync("docker", ["rm", "-f", DOCKER_CONTAINER], { stdio: "ignore" });
  execFileSync("docker", ["run", "-d", "--name", DOCKER_CONTAINER, "-p", `${DOCKER_PORT}:8080`, DOCKER_IMAGE], { stdio: "ignore" });
  return {
    baseUrl: `http://127.0.0.1:${DOCKER_PORT}`,
    containerName: DOCKER_CONTAINER,
    stop: () => {
      spawnSync("docker", ["rm", "-f", DOCKER_CONTAINER], { stdio: "ignore" });
    },
  };
}

async function waitForServer(baseUrl: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`nothing answered at ${baseUrl} within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const latency: LatencyMode = args.slow ? SLOW_CONNECTION : NO_LATENCY;

  const isLive = args.target.startsWith("https://") && !args.target.includes("127.0.0.1") && !args.target.includes("localhost");
  if (isLive && !args.liveOk) {
    console.error(
      `[bot-stress] refusing to run against what looks like a live URL (${args.target}) without --live-ok.\n` +
        `Per CLAUDE.md/SKILL.md: only run against the live URL on the orchestrator's say-so, at low volume.`,
    );
    process.exit(1);
  }

  let baseUrl: string;
  let containerName: string | undefined;
  let stop = (): void => {};
  if (args.target === "docker") {
    const d = startDocker();
    baseUrl = d.baseUrl;
    containerName = d.containerName;
    stop = d.stop;
    console.log(`[bot-stress] waiting for ${baseUrl} ...`);
    await waitForServer(baseUrl);
  } else {
    baseUrl = args.target;
    await waitForServer(baseUrl, 10000);
  }

  type Scenario = { id: string; run: () => Promise<ScenarioResult> };
  const scenarios: Scenario[] = [
    { id: "S1", run: () => runS1(baseUrl, latency) },
    { id: "S2", run: () => runS2(baseUrl, latency) },
    { id: "S4", run: () => runS4(baseUrl, latency) },
    { id: "S11", run: () => runS11(baseUrl, latency) },
    { id: "midwave", run: () => runStaffJoinsMidWave(baseUrl, latency) },
    { id: "reconnect", run: () => runDisconnectReconnect(baseUrl, latency) },
    { id: "restart", run: () => runRestartStateIntact(baseUrl, latency, containerName) },
    { id: "soak", run: () => runSoak(baseUrl, latency) },
  ];
  const toRun = args.only ? scenarios.filter((s) => args.only!.includes(s.id)) : scenarios;
  if (toRun.length === 0) {
    console.error(`[bot-stress] --only matched nothing (known ids: ${scenarios.map((s) => s.id).join(", ")})`);
    process.exit(1);
  }

  const results: ScenarioResult[] = [];
  try {
    for (const s of toRun) {
      console.log(`[bot-stress] running ${s.id}...`);
      try {
        results.push(await s.run());
      } catch (err) {
        results.push({ scenario: s.id, bots: 0, failures: [`${s.id}: infrastructure error running the scenario: ${(err as Error).stack ?? err}`], rtts: [] });
      }
    }
  } finally {
    stop();
  }

  const passed = printReport(results, { target: args.target === "docker" ? `docker (${baseUrl})` : baseUrl, latencyLabel: args.slow ? "slow (100-400ms injected)" : "none" });
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
