---
status: draft
what: ADR 7 --- the store's current stack (React Three Fiber client, Hono + ws server, SQLite on a Fly volume) as it stands today. Facts filled in from package.json, fly.toml, the Dockerfile and git history; the reasoning sections are [TK] for Ritesh.
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

[TK] Ritesh: which alternatives did you actually weigh, and what did each
cost? I have not listed any, because the repo does not record them. The
questions the week 8 lecture suggests asking of a stack are: what "good"
needs (3D in the browser, a shared room), what you can read and debug, what is
well represented in the models' training data, and how a change reaches every
open session.

| Question | Options | Cost |
|---|---|---|
| Client rendering | **React Three Fiber** / [TK] | [TK] |
| Server framework | **Hono** / [TK] | [TK] |
| How a change reaches everyone | **WebSocket (`ws`)** / server-sent events / polling | [TK] |
| Storage | **SQLite on the volume** / [TK] | [TK] |

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
- [TK] Anything you now regret or would not choose again.

## Why this, and not the alternatives

[TK] Ritesh's reasoning, in his own voice.

## What would change this

[TK]
