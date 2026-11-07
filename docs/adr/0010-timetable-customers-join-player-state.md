---
status: accepted
what: ADR 10 --- whether CPU/timetable customers get a real `player_state` row
  and rule-based decision logic, so they are indistinguishable in the data
  model from real-visitor customers (differing only in input source).
  Decided: Option B, lazy materialization on first interaction (SCOPE D56).
date: 2026-11-07
---

# ADR 10: Do timetable customers join `player_state`?

## Context

SCOPE D55 (commit `eb52f3f`, 2026-11-07) states Ritesh's intent in his own
words: "CPU customers should basically behave like normal real customers
except their decisions are semi-randomly decided by rules (so that they
behave sensibly, not erratically)." D55 also names the gap this ADR has to
resolve: "it is not 'add minimal state so CPUs can be claimed,' it is 'CPU
customers already are customers in the data model; make sure the waiting
list and staff-offer code path does not special-case on human-vs-CPU.'"

This repeats a pattern already settled once for staff. ADR 6 / D41 resolved
"NPCs vs real visitors, one behaviour loop or two" for **staff** as: no
is-human branch, one generic loop, the only difference is what decides a
transition (clicks vs a script). D55 asks whether the same answer holds for
**customers**. It is not automatically the same question, because of a
structural asymmetry already on record:

- Staff NPCs already have exactly this property. ADR 3 says "while an NPC
  serves a visitor it drops its timetable, then walks back and rejoins the
  day at the current time" (D1/D34). A staff NPC that is claimed is pulled
  out of `storeday.ts` and into real interaction; when released, it rejoins
  the timetable at `now`, not at a resumed position. There is already a
  working carve-out for "this individual, for now, is not running the pure
  function."
- Customers do not have this carve-out today. `storeday.ts`'s own header
  comment states the invariant directly: the timetable "is generated once,
  from fixed seeds... and then it is only read... so, like the rest of the
  NPCs, it is a pure function of the server's clock: every visitor sees the
  same store, nothing needs a server tick, and a restart changes nothing."
  Customers are "the rest of the NPCs" in that sentence — nothing in the
  code today pulls a customer out of the timetable the way a claimed staff
  NPC is pulled out.

**The gap today, read from the code, not inferred:**

- `stateOf` (`src/server/service.ts:90-92`) is `SELECT * FROM player_state
  WHERE visitor_id = ?`. It returns `undefined` for any id with no row.
- The only code path that inserts a `player_state` row is `setState` at
  `src/server/service.ts:103-127`, called for the first time at
  `src/server/service.ts:393`: `if (profile.kind === "customer") setState(ctx,
  visitorId, { state: "arriving", ... })` — this fires only when a real
  visitor picks the customer role at the entry screen (`presence.ts`'s
  profile-set path). A CPU/timetable customer produced by `momentOf(id,
  nowMs)` (`src/shared/storeday.ts:911`) never goes through this path, so it
  has zero row in `player_state`, ever.
- `tryNpcAutoClaim` (`src/server/service.ts:1699-1712`) and
  `tryGreeterApproach` (`src/server/service.ts:1725-1748`) both open with
  `const st = stateOf(ctx.db, customerId); if (!st || ...) return [];` —
  an empty `player_state` row is indistinguishable from "not eligible" and
  the function returns early. `tryGreeterApproach` is wired (called from
  `presence.ts:402` on every `move` message from a customer); `tryNpcAutoClaim`
  is written, unit-tested, and explicitly not wired (its own comment at
  `service.ts:1681-1691` says why: with only greeter/phones built, wiring it
  would let an idle NPC beat a human to every `specialist:phones` customer,
  which is the project's human-staff showcase — a tradeoff D40 already
  flagged as Ritesh's call, not resolved by this ADR).
- Net effect: a timetable customer can never be offered to or claimed by a
  real staff user, by either mechanism, because the `SELECT` that gates both
  functions returns nothing for them. This is a missing row, not an
  if-branch guarding real vs. CPU — there is no human/CPU branch to delete;
  the branch is "has a row" vs. "has no row," and timetable customers simply
  never get one.

Issue #1 (staff-offer priority, real users before CPUs, D47/D48) only
drives real-visitor customers for exactly this reason, by Ritesh's own call
recorded on the issue: "CPU/timetable customers have no `player_state` and
can't be claimed with E today... out of scope there." Issue #20 exists to
close that gap and is explicitly reframed by D55 (see its text above) away
from "bolt on minimal state" toward "make timetable customers first-class."

**Does ADR 6 / D41 already answer this?** Only partly. D41 resolved the
*loop shape* question (one generic skeleton, no is-human branch in the loop
or approach logic) and explicitly left `storeday.ts`'s mechanism itself
untouched ("Consequences: `storeday.ts`'s timetable mechanism is unchanged;
nothing about the schedule itself changes"). D41's parity claim ("A
human-controlled visitor's `player_state` row is read by exactly the same
loop... as an NPC's") was written and proven for **staff** NPCs, which
already have `player_state`-like server tracking through conversations and
duty state. It was not proven for **customer** NPCs, which today have no
`player_state` row at all and are driven purely by `momentOf`. D41 states
the destination (no is-human branch) without saying how a pure-timetable
customer gets a row to be read from in the first place. That is exactly
this ADR's open question.

**The real tension (not yet resolved by any existing ADR):** `storeday.ts`'s
pure-function-of-time property is load-bearing for the no-background-process
rule (CLAUDE.md: "The presence loop only exists while someone is connected";
"a deadline... is a stored column caught up on the next request that touches
it, never a timer"). A `momentOf(id, nowMs)` customer needs no row to exist,
no catch-up logic, and survives a Fly machine stop/restart with zero
persisted state, because it is recomputed fresh from the clock every time.
Once a customer has a real, mutable `player_state` row — `state`, `want`,
`needs`, `with_id`, arbitrary `data` — staff can claim it, converse with it,
and change it, and now that customer is no longer a pure function of time:
its position, mood and intent can diverge from what `momentOf` alone would
compute for that id at that moment. ADR 3/D1/D34 already solved exactly this
divergence for staff ("drops its timetable... rejoins the day at the current
time"); this ADR has to decide whether the same carve-out, or some other
mechanism, applies to customer NPCs, and when it has to fire (at creation?
only on claim? never, because a customer never "resumes" a schedule the way
a returning staff member does?).

## Options considered

### Option A — every timetable customer gets a `player_state` row upfront

A migration-time or store-day-start step creates a `player_state` row for
every CPU customer `storeday.ts` will produce (or inserts one lazily the
first time that id is seen in a request, but *before* any claim/approach
check runs — distinguishing this from Option B's "only on interaction").
Moment-to-moment decisions (what to ask for, when to leave, how to answer a
slot-filling question) come from a **rule engine** that reads `storeday.ts`'s
schedule as *intent* (what this customer's "purpose" segment says they
should be doing) but drives the actual state transitions through the same
`setState`/`stateOf`/conversation machinery a human uses.

**Cost / complexity:**
- Needs a rule engine written from scratch: something has to decide, for
  every CPU customer on every tick or request that touches them, whether to
  walk to a table, wait, ask for help, answer a slot, abandon, or leave —
  i.e. essentially reimplement what a human's clicks currently drive,
  but by rule. This is new, nontrivial logic, not a reuse of
  `storeday.ts`'s existing path-interpolation.
- Every CPU customer existing all at once means one `player_state` row per
  concurrent customer `storeday.ts` would ever render, all the time,
  whether or not anyone is nearby. Compare to today's zero rows for CPU
  customers.
- `stateOf`/`setState`'s `ON CONFLICT ... DO UPDATE` pattern (service.ts:103
  -127) would need to run constantly for CPU customers driven by rule
  decisions, which is itself a form of continuous computation the
  no-background-process rule was written to avoid for *timers*; this would
  not be a timer (it still rides real requests, per CLAUDE.md's own
  carve-out: "CPU players and staff are a pure function of server time plus
  persisted state... a deadline... is a stored column caught up on the next
  request that touches it"), but it is a much bigger "next request" surface
  than today's near-zero CPU customer state.
- Breaks `storeday.ts`'s stated purity for every CPU customer, all the time,
  not just claimed ones: once a row exists and can be written, "every
  visitor sees the same store" stops being true by construction — the whole
  point of Option A is that a CPU customer's actual state can now diverge
  from `momentOf`'s pure computation, for any customer, at any time, because
  the rule engine is making decisions that `momentOf` doesn't know about.
- Persistence/restart: because rows are real and durable, a restart has to
  reconcile "what the rule engine had decided" against "what `storeday.ts`
  would say now" — this is a new reconciliation problem `storeday.ts` never
  had (today: restart changes nothing, by its own design comment).
- Preserves/breaks the event-log invariant the same as any new
  state-changing code: every rule-driven transition must still write its
  `events` row — this is enforceable but is a new category of event source
  (rule-driven, not human-driven) the event-log reviewer would need to
  check.
- For #1/#20: fully closes #20, since every timetable customer already has
  a row the moment #1's offer/claim mechanism looks for one. No special
  case needed anywhere.

### Option B — lazily materialize a row only on first claim/approach/interaction

`player_state` is created for a timetable customer only the moment something
actually needs it: a staff member's offer/claim check, a greeter approach, or
the customer itself initiating a conversation. Until then, `storeday.ts`
alone renders the customer exactly as today, with zero persisted state.
Once materialized, the row is driven the same way as Option A from then on
(rule-based decisions reading the schedule as intent).

**Cost / complexity:**
- Much smaller rule engine, at least at first: it only needs to run for
  customers who have actually been promoted to "has a row," not every
  customer rendered by `storeday.ts`. This could start as a thin layer (e.g.
  "fill the current need from the storeday purpose, answer slots with a
  fixed policy") rather than a full simulation of the loop skeleton for
  every customer at once.
- Needs a precise "promotion" trigger and a precise answer to what happens
  if that customer is *never* promoted (today's common case: a timetable
  customer nobody interacts with should keep costing nothing, same as now).
- Needs an explicit rule for what the newly-created row's initial `state`/
  `want`/`needs` should be, derived from `momentOf`'s purpose/segment at the
  promotion instant — effectively the same "drops the timetable, now has a
  position in real interaction" carve-out ADR 3 already wrote for staff,
  applied to customers for the first time. Unlike staff, a customer has no
  obvious "rejoin the day at current time" moment, because a sold or
  abandoned customer typically leaves rather than resuming browsing — this
  needs its own decision, not a copy of staff's rule.
- `storeday.ts`'s purity is preserved for every customer who is never
  claimed/approached (the majority, most of the time) — this is the main
  advantage over Option A: the pure-function property only ever breaks for
  the subset of customers who are actually interacted with, which is closer
  to today's reality (most CPU customers are ambient, not interacted with).
- Persistence/restart: a promoted-but-not-yet-resolved row is exactly like
  a real-visitor's `player_state` row today — it already has to survive a
  restart (it does, being a normal SQLite row) — so this reuses an existing,
  already-solved problem rather than inventing a new one (unlike Option A's
  "reconcile everyone" problem, Option B only needs to reconcile the
  currently-promoted set, same scale as real visitors today).
- For #1/#20: closes #20's acceptance criteria (1)-(2) the moment "appears
  on the waiting list" is itself read as one of the promotion triggers —
  i.e. the promotion has to happen when a customer enters `waiting_for_help`,
  not only on claim, or #1's offer mechanism (which scans the waiting list
  before any claim happens) would still see nothing for CPU customers.
  This needs to be stated precisely in the issue: "promoted to a row no
  later than the moment they'd appear on the waiting list."

### Option C — something else the architecture suggests: per-NPC mutable overlay, timetable stays the single source of truth for everyone not overlaid

A table of "active overlays" (keyed by customer id) holds only the delta
from what `momentOf` would otherwise say — e.g. `with_id`, `state`, and the
slot-filling facts needed for the current conversation — while `storeday.ts`
keeps being consulted for position/path/purpose for every customer,
overlaid customer or not, with the overlay's fields taking precedence where
present. This is structurally close to Option B but frames the mechanism
differently: instead of "give the customer `player_state`, the real
visitor's own table," it is "add a new, smaller, purpose-built table that
staff-claim logic reads, which is layered on top of (not instead of) the
pure timetable."

**Cost / complexity:**
- Most faithful to "`storeday.ts`'s purity is load-bearing" — the pure
  function is still the thing computing where everyone, overlaid or not, is
  standing and walking; only conversation/claim-relevant facts move into
  mutable state. This directly addresses the brief's concern that giving
  customers "real stateful `player_state` rows that staff can claim/alter"
  partially breaks `storeday.ts`'s purity "for claimed customers" — Option
  C tries to keep that breakage to the smallest possible surface (facts,
  not position/movement).
- But: this reintroduces exactly the "third layer" problem ADR 6/D41
  explicitly rejected for mission progress ("no third mission-progress
  layer... progress is just the facts already in `player_state`/
  `conversations`/`case_facts`"). A new, customer-NPC-only overlay table is
  a second home for the same kind of fact `player_state` already holds for
  real visitors, raising the "which one wins, and does staff-offer code
  have to check both" question D41 called out as the real cost of a third
  layer.
- Also does not fully satisfy D55's own framing: D55 explicitly says the
  goal is for a CPU customer to have "the same `player_state`... and the
  same conversation mechanism as a real-visitor customer" — not an adjacent,
  CPU-only table. Option C keeps a human/CPU branch at the data-model level
  (two different tables depending on who's driving the customer), which is
  the exact shape D41's "no is-human branch" principle argues against.
  Listed here mainly to show why A/B (same table, same schema, same code
  path) more directly satisfy D55's stated intent than a parallel structure
  would — not because it is architecturally impossible.
- Interaction with persistence/restart: similar profile to Option B
  (only overlaid customers persist anything), but now there are two tables
  to reconcile at restart and for the event-log invariant instead of one.

## What all three options share

- None of them resolve `tryNpcAutoClaim`'s own open wiring question (D40):
  whether an idle on-duty NPC should ever claim a waiting customer at all,
  and under what condition. That is a separate decision from "does the
  customer have a row to be claimed from."
- All three need an explicit answer to a question none of D32/D34/D41/D47/
  D48/D55 states outright: when a CPU customer that has been given a
  `player_state` row (by any mechanism) is *released* — served, sold,
  abandoned, or simply left alone after a claim ends — does it "rejoin the
  day at current time" the way a staff NPC does (ADR 3/D1/D34), or does it
  simply leave the store (the more natural reading of a served/abandoned
  customer, but still needs stating, because `storeday.ts` would otherwise
  keep generating a second, ghost version of that same id walking its
  original schedule segment unless something clamps it). This id collision
  — one customer id, two sources of truth about where it is — is the heart
  of the pure-function-vs-stateful tension the brief asked to surface, and
  none of A/B/C make it go away on their own; each needs its own explicit
  rule for it.
- All three need the rule engine itself specified at some point (what makes
  a CPU customer's answers "sensible, not erratic," per D55's own wording)
  — that is genuinely new design work, not a side effect of picking a
  storage shape, and is out of scope for this ADR's own decision (storage/
  data-model placement), but is a real, non-trivial cost attached to every
  option above and should be sized before committing engineering time.
- All three are "expensive to reverse" in CLAUDE.md's sense: once staff-offer
  code depends on CPU customers having `player_state` rows (wherever they
  live), un-shipping that is a real migration, not a revert of a small PR.

## Consequences for #1 / #20

- #1 is unaffected either way: it already scopes itself to real-visitor
  customers only, by Ritesh's recorded call.
- #20 changes shape under every option except "do nothing": its acceptance
  criteria as currently written ("give them whatever minimal state is
  needed... same as #1's mechanism") read as Option B's lazy-materialize
  shape already, but do not currently specify the promotion trigger timing
  (on claim vs. on entering the waiting list) or the release/rejoin rule
  above. Whichever option Ritesh picks, #20 should be rewritten to state
  both explicitly before a builder starts.

## Decision

Option B, Ritesh, 2026-11-07, relayed via the orchestrator session: lazily
materialize a `player_state` row for a timetable customer only the first
time they're interacted with — entering the waiting list, or a staff
offer/approach/claim — not upfront for every customer `storeday.ts` would
ever render. Recorded as SCOPE D56.

On release (served, sold to, or abandoned), the promoted customer simply
leaves the store. It does not rejoin `storeday.ts`'s schedule the way a
released staff NPC rejoins duty (ADR 3/D1/D34's carve-out) — a served or
abandoned customer does not naturally "resume browsing" the way staff
resume duty, so there is no id-collision risk to resolve: once promoted and
released, that id is done, not handed back to `momentOf`.

## Consequences

- `storeday.ts`'s pure-function-of-time property is preserved for the
  ambient majority of CPU customers, who are never interacted with and so
  never get a row — restart changes nothing for them, same as today.
- The promotion trigger must fire no later than the moment a customer would
  appear on the waiting list, not only on claim — otherwise issue #1's
  offer-scan (which runs before any claim happens) still sees nothing for
  CPU customers. This is the one piece of precise timing a builder must get
  right; stated explicitly on issue #20.
- The "rejoin vs. leave" id-collision question this ADR raised is resolved
  by "leave": once a CPU customer is promoted and later released, nothing
  hands that id back to `storeday.ts` to keep walking its original schedule
  segment. No reconciliation code is needed for that case.
- The rule engine itself (what makes a CPU customer's answers "sensible, not
  erratic," per D55) is real, non-trivial design and build work, independent
  of this storage decision, and is not scoped by this ADR. It is issue #20's
  (and any follow-up issue's) job to size and build.
- `tryNpcAutoClaim`'s own open wiring question (D40: should an idle on-duty
  NPC ever claim a waiting customer, and under what condition) is unrelated
  to this decision and remains open.
- Every promotion, interaction and eventual departure of a promoted CPU
  customer writes its own `events` row, same as a real visitor (CLAUDE.md's
  event-log invariant; no new exemption is created by this ADR).
