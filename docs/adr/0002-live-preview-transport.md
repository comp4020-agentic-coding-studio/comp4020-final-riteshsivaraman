---
status: accepted
what: ADR 2 --- transport for live draft preview (recipient watches a draft update live, before send).
date: 2026-10-07
---

# ADR 2: Live-preview transport

## Context

New feature: a recipient (To, Cc, or Bcc) who has the app open sees a draft
addressed to them update character-by-character as the sender types, before
it's sent. This is single-writer/many-readers --- one sender broadcasting,
recipients only ever read, no merge or conflict resolution needed.

ADR 1 already named "plain `ws` for WebSockets later, a Yjs sync server on
the same port in v0.2" as the plan for real-time, citing "C9: live typing,
presence, Yjs multi-editor." That plan was specifically justified by the
public draft board's *multi-editor* problem --- several strangers editing
the same draft concurrently, which genuinely needs CRDT merge semantics.
Live preview is a narrower, simpler problem wearing similar clothes, and
deserves its own decision rather than inheriting ADR 1's by default: the
week 8 lecture names "real-time update mechanism" as one of the handful of
decisions for this project that are expensive to reverse or likely to be
questioned later.

Constraints carried over from ADR 1 unchanged: a single small Fly machine
that stops when idle (no background processes --- CLAUDE.md), and the
existing lazy-catch-up pattern (deadlines stored as columns, swept on the
next request that touches them) rather than server-side timers.

## Options considered

1. **Fast polling** --- reuse the existing pattern (`Board.tsx` already polls
   every 5s). Zero new dependencies or infrastructure, trivially fits "no
   background processes" since it's pure request/response. To read as
   character-by-character it would need a sub-second interval, multiplied
   by every open viewer times every open draft --- real server load for a
   feel that still only approximates live.
2. **WebSocket, per ADR 1's existing plan** (not chosen for this feature) ---
   one real-time mechanism in the codebase instead of two, and it's already
   the named plan for the board's future multi-editor. But
   `@hono/node-server` doesn't give WebSockets for free: it needs manual
   `upgrade` event handling on the underlying Node HTTP server, more
   plumbing than SSE for a need that's only ever one-directional. No
   existing `spec/` harness opens a WebSocket either way, so this is new
   test infrastructure regardless of which transport is chosen.
3. **SSE, one-way push (chosen)** --- the browser's native `EventSource`,
   server pushes over a held-open HTTP response (`hono/streaming`'s
   `streamSSE`). Matches the actual shape of the problem (one writer, many
   readers) with less plumbing than WebSocket. Needs an in-process pub/sub
   (plain `EventEmitter`/`Map`) since this is a single Fly machine/process
   --- no new dependency. An open SSE connection is an active request, so it
   shouldn't trigger Fly's idle auto-stop while someone is actually
   watching; when nobody has a connection open, the machine can still sleep
   normally, same as today.

## Decision

SSE, one-way push from server to recipient. New route serves an
authenticated `EventSource` stream; the existing `saveDraft()` write path
(owner edits and, on the public board, stranger edits) publishes to it after
each save.

## Consequences

- This is a deliberate split from ADR 1, not a reversal of it. WS + Yjs
  remains the plan for the public board's multi-editor merge problem ---
  unchanged, a separate endpoint, built later in v0.2 --- while SSE handles
  this narrower one-way broadcast now. Two real-time mechanisms will exist
  in the codebase once both are built, for two genuinely different
  problems (merge vs. broadcast); that's an accepted cost of fitting each
  problem's actual shape rather than forcing one mechanism to cover both.
- Audience for the live stream is To, Cc, *and* Bcc (confirmed with
  Ritesh) --- consistent with the existing "BCC exposed both ways" precedent
  in `lib/mail.ts` (`recipientsFor` never filters by kind).
- No sender-visible indicator is added. `docs/design-handoff.md` caps the
  UI at exactly two signature "dread" devices (the unread asterisk, the
  ghost-read line); a "someone is watching you type" badge on the sender's
  side would be a third. The watching stays silent on the sender's end; the
  recipient-side live card is a feature surface, not a decorative device,
  so it doesn't count against that cap.
- No schema change, no migration --- the `drafts` row remains the only
  source of truth for a draft's content; the SSE subscriber map is purely
  ephemeral and resets on restart/redeploy, which is fine since nothing
  about the live stream itself needs to survive one.
