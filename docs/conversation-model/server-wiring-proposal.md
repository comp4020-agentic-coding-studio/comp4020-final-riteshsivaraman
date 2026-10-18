---
status: draft
what: Options for wiring the new talk engine (phone, laptop, service scenes) into the real server, replacing src/shared/conversation.ts -- for Ritesh to choose from before any code is written, per CLAUDE.md's rule for decisions affecting multiple users or expensive to reverse.
date: 2026-10-18
source: Claude's reading of src/shared/conversation.ts, src/server/service.ts, src/server/migrate.ts, src/server/cases.ts, src/client/src/net.ts, and src/shared/talk/core/*.ts as they stand tonight. No code written.
---

# Wiring the talk engine into the real server: options

The talk engine (`src/shared/talk/`, three scenes, 162 specs) is pure: state in, state
out, no DOM, clock or network (`engine-reference.md`). `docs/conversation-model/README.md`'s
"Not done" section already names this gap -- "the event-log rule in CLAUDE.md applies the
moment it is wired" -- and decisions.md says the ADR superseding ADR 6 "waits for Ritesh's
approval of the POC." This document lays out the real options for that wiring, without
picking one, per CLAUDE.md's rule for decisions affecting multiple users or expensive to
reverse (persistence, real-time mechanism are named examples in that rule).

## What currently depends on the old engine (the blast radius)

Three files import `src/shared/conversation.ts` directly: `src/server/service.ts` (`begin`,
`step`, `choicesFor`, `canMove`, and the `ConvState`/`Effect`/`ScriptId` types), and
`src/client/src/net.ts` (only the `PlayerStateName` type). `src/server/migrate.ts`'s
comment references it but doesn't import it. Nothing else does. `src/server/cases.ts` exists
as a built, tested data layer but is **explicitly not wired into `service.ts`'s
claim/handOn/open flow yet** (its own file header says so) -- this matters for axis 5 below.

The existing `conversations` table's `data` column is already a free-form JSON blob
(`ConvData = {conv: ConvState, awaiting, pending?, at?}`), rewritten after every turn via
`saveConv`. This is a precedent already in the schema, not a new idea: a bigger or
differently-shaped JSON blob in the same column is not a structural change.

The old engine already writes one `events` row per turn (`log(ctx, ..., "turn", {conversationId,
from, choice, to})` at `service.ts:514`), separate from the full state persisted in the
`data` column. This is also precedent, not an open question -- see axis 2.

## Axis 1: persistence granularity

- **Option A -- persist the full `Scene` after every `applyStaff`/`applyCustomer` call**,
  same cadence the old engine already uses (`saveConv` runs after every `step`). Fits the
  existing `conversations.data` JSON-blob column with no schema change: store the `Scene`
  object there instead of `ConvState`. Survives a mid-conversation restart, matching the
  existing behaviour and the "no background processes"/Fly-auto-stop reality. Cost: a `Scene`
  carries a full `log: Line[]` of every line said so far, which grows every turn and gets
  rewritten whole each time (no diffing) -- for a long conversation this is more bytes per
  write than the old engine's single `node` string, though still small by SQLite-blob
  standards (the laptop/service specs show scenes with a few dozen turns at most).
- **Option B -- persist only at conversation end.** Simpler (one write, not N), but loses an
  in-progress conversation entirely on a cold restart -- the customer would reconnect to find
  it gone, not resumed. This diverges from the existing engine's behaviour (which does persist
  mid-conversation today) and would need its own justification for why conversations are
  allowed to not survive a restart when presence/stock already do.
- **Option C -- persist the `Scene` but trim `log` before storage** (keep enough to resume the
  turn protocol -- `answers`, `order`, `fixed`, `excluded`, etc. -- drop the full line-by-line
  log, regenerating a "what's happened so far" summary from `answers`/`order` if ever needed).
  Smallest writes, but means the stored row can no longer answer "what exactly was said," which
  crit 10's narration requirement and CLAUDE.md's event-log rule care about -- likely means this
  only works if axis 2 chooses to make the `events` table the source of truth for "what was
  said" and the `Scene` blob purely the resumable-state cache.

## Axis 2: event-log mapping

CLAUDE.md: every state-changing action writes an `events` row first. The engine's internal
`Scene.log` already records every line/move in full detail.

- **Option A -- one `events` row per turn, same shape as the old engine's existing pattern.**
  Each `applyStaff`/`applyCustomer` call writes one row (`type: "talk_turn"` or similar,
  `data: {conversationId, scene: "phone"|"laptop"|"service", move, picks, say}`), duplicating
  what's already in `Scene.log[−1]`. Satisfies the existing cross-system invariant with zero
  new reasoning (same pattern as `"turn"` events today) and makes the events table the thing
  crit 10's `flyctl logs` narration reads, consistent with tonight's crit-10 stdout-logging
  work. Cost: genuine duplication -- the same line exists in both the `events` table and the
  persisted `Scene.log`.
- **Option B -- `Scene.log` becomes the source of truth; `events` gets a coarser row per
  conversation milestone only** (started, ended, and any outcome-reaching move like a
  `run_check` result or a data-loss-gate pass), not one per turn. Fewer, more meaningful rows;
  satisfies crit 10's "who did what" narration at a coarser grain. Risk: if a marker or a
  future debugging session expects every menu pick to be in `events` (matching the existing
  per-turn precedent for the old engine), this is a behavioural regression from what the old
  engine already does, and needs the invariant's wording re-checked against this new, coarser
  meaning of "state-changing action."
- **Option C -- hybrid: milestone rows always, full-turn rows gated behind a verbosity flag**
  (default on in dev, off in prod to save row volume). Adds a flag to reason about; probably
  not worth the complexity unless row volume is shown to actually matter.

## Axis 3: real-time delivery

- **Option A -- reuse `net.ts`'s existing `turn`/`staff_turn` message shapes** (`TurnView`/
  `StaffTurnView` in `protocol.ts`), translating the engine's `customerMenu`/`staffActs` output
  into the same wire shape the old engine already produces. Lowest client-side churn --
  `Talk.tsx` might need only small changes. Cost: `TurnView`'s `choices: {id, label}[]` is
  flatter than the new engine's menu shape (which carries tone, multi-select, throw-backs,
  pool-size hints for staff) -- translating loses some of that richness unless `protocol.ts`'s
  types are extended.
- **Option B -- a new message type pair** (`talk_turn`/`talk_staff_turn` or similar) that
  carries the engine's native shapes more fully (tone, multi-pick, the staff-side pool/ranking
  hint from `engine-reference.md` section 9's POC page). Client UI (a new or heavily-rewritten
  `Talk.tsx`) can show richer UI (tone/expression, pool-narrowing hints) matching what the POC
  page already demonstrates is useful. Cost: both old and new message types coexist during a
  transition, more wire-protocol surface.
- **The `run_check` move (service scene) is server/NPC-authored, not customer input.** Under
  either option, this is just a staff-side turn that happens to be deterministic rather than
  human-picked -- no special wire handling needed, since the server already runs staff NPC
  moves server-side today (`npcMove`-equivalent logic for NPC staff already exists for the old
  engine's flow, per `duty.ts`/`scriptFor`). This axis doesn't force a real design decision on
  its own; it falls out of whichever of A/B above is chosen.

## Axis 4: replacing vs. coexisting

- **Option A -- full cutover.** Delete `src/shared/conversation.ts`, `spec/conversation.test.ts`,
  `scripts/sim/`, update `service.ts`'s three functions to call the new engine, update
  `net.ts`'s one type import. Matches decisions.md's original stated plan ("replaces the
  current engine... ADR comes after Ritesh approves the POC"). Clean, but all three scenes
  (phone/laptop/service) would need to be wired in the same change, or the greeter script
  (which the old engine still serves -- see `turnFor`'s `"greeter"` branch) needs its own home
  first, since nothing in the new engine covers greeter/routing yet (that's G4, unbuilt).
- **Option B -- coexist during a transition, routed by script type.** `service.ts` keeps
  `begin`/`step` for `"greeter"` (and anything else not yet ported) and calls the new engine
  only for `"phones"`-equivalent conversations. Lower risk, incremental, but means two parallel
  conversation code paths in the server at once -- two sets of `ConvData`-equivalent shapes in
  the `conversations.data` column, distinguished by a scene-type tag, and two places `events`
  rows get written from. This is the path of least immediate risk but accumulates the kind of
  duplication the core extraction spent tonight removing.
- The actual deciding fact: **the old engine's only live scripts are `"greeter"` and
  `"phones"`.** The new engine has no greeter scene yet. So even option A ("full cutover")
  cannot be a complete replacement tonight without either building a greeter scene first or
  leaving greeter on the old engine regardless -- meaning some version of option B is forced
  for at least the greeter path, whichever is chosen for phones/laptop/service.

## Axis 5: scope for a first real-wiring pass

- **Option A -- phone only.** Lowest risk, most validated (11 replayed transcripts, 2
  automated review passes, the only scene actually played by a human). Matches the sequencing
  already implied by decisions.md ("ADR comes after Ritesh approves the POC" was written
  when only phone existed). Laptop and service stay on no engine at all in the live store until
  separately wired (they're not live today regardless, so this isn't a regression).
- **Option B -- phone and laptop together** (both pure purchase scenes, same shape, same
  "Not done: automated reviewer pass + Ritesh playing it" gap tonight's README already names
  honestly). Doubles the surface wired in one pass without doubling the risk much, since their
  engine code is now genuinely shared (`core/`).
- **Option C -- all three, including service.** The service scene's "sent away, a case with a
  due date" outcome is the one place real wiring would touch `cases.ts` -- which is a real,
  tested data layer, but **explicitly not wired into `service.ts`'s claim/handOn/open flow
  yet** per its own file header. Wiring service's full outcome set in the same pass as the
  engine wiring means building that case-wiring too, which is more than "wire the talk engine"
  -- it's "wire the talk engine AND finish D42's case integration." Likely too much for one
  pass; the service scene's "fixed now"/"cannot fix"/"declines" outcomes don't need `cases.ts`
  and could be wired without it, but "booked"/"sent away" (the ones with a due date) would need
  either a stub (no real case, just a free-text note, same as the existing single-string
  `handOn`) or the real case wiring.

## Axis 6: when the ADR gets written

CLAUDE.md and decisions.md both already say this ADR (superseding ADR 6) "waits for Ritesh's
approval of the POC." Two sub-options once approval happens:
- **Write the ADR first, laying out axes 1-5's chosen answers as the settled design, then
  build.** Matches week 8's lecture discipline exactly (lay out options, write the record,
  then build) and is the more defensible choice for the course's own marking criteria (ADRs
  for decisions affecting multiple users or expensive to reverse, before building).
- **Build a small first slice (option A on axis 5: phone only), then write the ADR describing
  what was actually built**, on the reasoning that a couple of the axes above (especially axis
  3's wire-protocol shape) might clarify once real code is attempted. Risk: this is closer to
  "build first, document after," which CLAUDE.md's own rule argues against for decisions this
  size -- the whole point of laying out options first is to avoid discovering axis 3's cost
  only after choosing it.

## What's most likely to need Ritesh's explicit call before any code

Axis 4 (the greeter gap forces some form of coexistence regardless of what's chosen for
phones) and axis 5 (scope) are coupled and are the two that most change what gets built this
session versus later. Axis 1 and axis 2 are lower-stakes because there's already a working
precedent in this exact codebase (the old engine's own persist-every-turn,
one-events-row-per-turn pattern) that a choice can simply match or deliberately diverge from
-- worth a quick decision, not a long one. Axis 6 is really asking "ADR before or after this
pass," which only matters once axis 4/5's scope is picked.
