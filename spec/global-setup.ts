import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. With no APP_URL (locally) it
// starts its own throwaway server on a free port with an empty database, so
// the tests never join fake visitors into the game you are playing on.
// It waits up to a minute for the app to answer.
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

export default async function setup(project: TestProject): Promise<() => void> {
  let baseUrl = process.env.APP_URL;
  let stop = (): void => {};

  if (!baseUrl) {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), "store-spec-"));
    const child = spawn("npx", ["tsx", "src/server/index.ts"], {
      env: { ...process.env, PORT: String(port), DATABASE_PATH: join(dir, "store.db") },
      stdio: "ignore",
    });
    baseUrl = `http://127.0.0.1:${port}`;
    stop = () => {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      stop();
      throw new Error(`nothing is answering at ${baseUrl}: set APP_URL to where the app is listening, or check that the server starts`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  project.provide("baseUrl", baseUrl);
  return stop;
}
