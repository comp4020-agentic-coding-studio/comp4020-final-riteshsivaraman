---
status: draft
what: ADR 7 --- the store's current stack (React Three Fiber client, Hono + ws server, SQLite on a Fly volume) as it stands today. Facts filled in from package.json, fly.toml, the Dockerfile and git history; the reasoning is Ritesh's.
date: 2026-10-17
---

# ADR 7: The stack

## Context

The final project fixes three requirements (multi-user, real-time, persists),
one small Fly machine and one volume (`fly.toml`, `Dockerfile`), and leaves the
stack open. `PROCESS.md` has to explain the choice, and the week 8 lecture
names the stack as a decision worth a record. This one is written after the
fact, to describe what the store stands on today, not to pick it.

The server core (Hono, SQLite, the migration runner) was first committed on
2026-10-06 in `8bbe52e`, before the store idea. The store's own presence
server and shared model landed in `2379cd6` (2026-10-11). The client choice
was recorded as SCOPE D5 on 2026-10-10.

## What is in use (checked against the repo, 2026-10-17)

| Layer | Choice | Where |
|---|---|---|
| Client | React 19 + React Three Fiber 9 + drei 10, three 0.186, built with Vite 7 | `package.json`, `src/client/` |
| Server | Node 24, Hono 4 on `@hono/node-server`, run with `tsx` (no compile step) | `src/server/index.ts` |
| Real-time | `ws` WebSocket server attached to the HTTP server's `upgrade` event | `src/server/index.ts`, `src/server/presence.ts` |
| Database | SQLite through `better-sqlite3`, a single file on the Fly volume at `/data` | `src/server/db.ts`, `src/server/migrate.ts` |
| Migrations | Run at boot, versioned steps, a foreign-key check after each | `src/server/migrate.ts` |
| Hosting | One Fly machine, `shared-cpu-1x`, 256 MB, region `syd`, auto-stop with `min_machines_running = 0`, 1 GB volume | `fly.toml` |
| Tests | Vitest 5 (jsdom is a dev dependency); `pnpm check` is typecheck + tests | `package.json`, `spec/` |
| Shared model | Plain TypeScript in `src/shared/` read by both client and server | `src/shared/` |
| Runtime AI | Not part of the shipped path. D8 (a free-tier Gemini key with a fallback) is unresolved; the `scripts/sim/` prototype uses OpenRouter | SCOPE D8, section 6 |

The deploy contract (`Dockerfile`, `fly.toml`, the CI workflow) is the
course's and is not part of this decision.

## Options considered

I judged each part against what the store needs (3D in the browser, a shared
room), what I can read and debug, how well the models know it, and how a change
reaches every open session.

| Question | Options | Cost |
|---|---|---|
| Client rendering | **React Three Fiber** / plain three.js / a browser game engine | Plain three.js means managing the scene by hand; an engine adds a large runtime and a build I cannot read. React Three Fiber keeps the scene in React, which I can read and the agent writes well |
| Server framework | **Hono** / Fastify / Express | Fastify needs a plugin layer to reach the raw `upgrade` event that `ws` uses; Hono is small, runs under `tsx` with no compile step and leaves that event alone |
| How a change reaches everyone | **WebSocket (`ws`)** / server-sent events / polling | Server-sent events go one way, so movement would need a second channel; polling fast enough costs a request per update and shows lag |
| Storage | **SQLite on the volume** / Postgres elsewhere / memory only | Postgres is another service the one machine does not have; memory only loses everything on a stop and fails the persistence requirement |

## Consequences

- Facts (checked against the code and config, 2026-10-17):
  - One process holds the websocket connections, so presence lives in that
    process's memory and is lost on every restart. Only the SQLite file on
    `/data` survives a stop or redeploy.
  - The machine stops when nobody is connected, so nothing may rely on
    `setInterval`/`setTimeout`; deadlines are stored columns caught up on the
    next request (CLAUDE.md, "No background processes").
  - A broadcast reaches only subscribers on this machine. Fine for one
    machine; a second machine would need a shared broker.
  - SQLite allows one writer at a time, and `better-sqlite3` writes are
    synchronous, which makes the single-process race cases (the last unit of
    stock, a slot booking) easier to reason about.
  - Migrations run at boot because the volume exists only on the running
    machine, not on Fly's release machine.
  - Foreign keys are on, and the boot-time `foreign_key_check` throws, so one
    bad row can crash-loop the app until fixed by hand (see `LEARNINGS.md`).
- What I would change: `service.ts` has grown past 2,000 lines because every rule sits in one file. I would split it by conversation, stock and presence earlier. I do not regret any of the four choices above.

## Why this, and not the alternatives

The stack fits the machine the brief gives me. One small machine that stops when
idle rules out a background process or a second service, so state lives in one
SQLite file and everything else is rebuilt on start. WebSocket and Hono followed
from needing raw access to the connection, and React Three Fiber followed from
the idea: a first-person store has to be 3D. I can read all of it, which matters
because the agent writes most of it and I have to check it.

## What would change this

A second machine would need a broker for broadcasts and shared presence. A
visitor count too high for one process, or SQLite writes becoming the bottleneck,
would also send me back to this record.

