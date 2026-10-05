---
status: draft
what: ADR 1 --- stack choice for Seen. Facts filled in; narrative is [TK] for Ritesh to write.
date: 2026-10-06
---

# ADR 1: Stack

## Context

Seen needs: real-time later (C9: live typing, presence, Yjs multi-editor),
a single small Fly machine (shared-cpu-1x, 256MB, one 1GB volume, the
machine sleeps when idle --- no background processes), persistence that
survives restarts and redeploys, and a fast start since C8's cutoff left
well under 48 hours from concept to deploy.

## Options considered

1. **Hono + Preact SPA (chosen)** --- Node server (Hono) on `@hono/node-server`,
   Preact SPA built with Vite, `better-sqlite3` + Drizzle ORM, Vitest,
   plain `ws` for WebSockets later, a Yjs sync server on the same port in
   v0.2. Reasons [TK --- Ritesh's call on what to say here]: lighter than
   Fastify for this scope, raw WebSocket access without a plugin layer for
   the Yjs sync server coming in C9.
2. **Crit 7's Astro stack (fallback, not used)** --- Astro + @astrojs/node +
   Preact islands + better-sqlite3 + Drizzle + Vitest, the stack from
   `comp4020-crit7-riteshsivaraman`. Known-working Dockerfile/fly.toml and
   LEARNINGS.md full of real gotchas already solved there. Would have needed
   a small Node layer bolted on for WebSockets/Yjs.

## Decision

Hono + Preact SPA, per above.

## Consequences

- DB boot pattern (migrations at boot, WAL, FK-off-during-migrate) reused
  directly from crit 7's `src/lib/db.ts` --- see this repo's
  `src/server/db.ts` and `LEARNINGS.md`.
- No server-side compile step: the server runs via `tsx` directly in
  production (see `Dockerfile`), trading a slightly slower boot for one
  less build stage to get wrong under deadline pressure.
- [TK --- Ritesh: anything else worth saying about why this held up, or
  didn't, once C9's Yjs layer actually gets built]
