---
status: draft
what: ADR 6 --- how NPC and player-controlled visitors run their idle/schedule
  loop and get interrupted into conversations, and how conversation content is
  computed (slot-filling over facts, not an authored tree scaled up). Facts
  filled in from a grilling session; "Why this" and "What would change this"
  are [TK] for Ritesh.
date: 2026-10-13
---

# ADR 6: Behaviour loop and conversation slot-filling

## Context

D32 built NPC behaviour as a pure function of the server clock
(`src/shared/storeday.ts`): the same for every visitor, no reactive state,
and explicitly flagged as "option A of the behaviour decision. B (server
state machines that react to real visitors) and C (both) are not built and
still need Ritesh's choice and an ADR." D40 went further and named "full
per-role reactive state machines" directly, and deliberately left them
unwired pending this decision.

Separately, D36/ADR4 already chose "moves with preconditions over a case"
(option B) for how conversation content is computed, but left the actual
mechanism unspecified, and `docs/customer-journeys.md`'s own analysis (the
seven draft transcripts) says real exchanges ask "a small set of questions...
in the order that fits the answer" — adaptive ordering that today's literal
node-graph `conversation.ts` (greeter + phones only) cannot express without
one node per ordering permutation.

This ADR resolves both: the shape of the idle/interrupt loop every customer
purpose and staff role runs, and the concrete mechanism (not just the
option) for conversation content. Reached by a grilling session, one
decision at a time, 2026-10-13.

## What was decided (Ritesh, 2026-10-13)

| | Decision |
|---|---|
| Behaviour decision (D32's option) | **Option C**: NPCs and staff keep following the `storeday.ts` timetable as their default, but the loop can be interrupted out of the current timetable segment. |
| Resuming after an interrupt | Rejoin the day at the current server time — the existing D1/D34 rule, not a rewind. No separate "mission position" is tracked; see next row. |
| Mission/case progress | No third state-machine layer. A customer's progress is entirely the facts already stored in `player_state` + `conversations` (and, once built, `case_facts` per ADR4). Interrupting and resuming never restores a machine position, because there isn't one beyond stored facts. |
| Loop shape | One generic skeleton shared by every customer purpose and every staff role: customers — idle/browse → seek or be sought → converse → [reserve → fetch → pay → optional setup] → leave; staff — idle at post → [approach or get approached] → converse → [serve] → return to post. |
| Named exceptions to the skeleton | `repair` (Genius Bar: book a slot, wait in a visible queue, may leave and return later, picks up a ticket) and `pickup` (walks straight to a table, no "seek help" step) do not fit the generic skeleton and get their own written shape. |
| What counts as an interrupt | Only idle/schedule-following segments can be interrupted. Once a visitor is `in_conversation` the loop is paused as a whole — already true today. Nothing forces a conversation to end from outside; a staff NPC/player leaving mid-sale (T6) is a voluntary transition via the existing `talk_leave`, not an external interrupt. |
| Interrupt sources | Mostly a customer's own request (asking for help, walking up to a specialist); secondarily a staff NPC/player proactively approaching an idle customer — generalises D40's `tryGreeterApproach` to every role. |
| Player/NPC parity | A human-controlled visitor's `player_state` row is read by exactly the same loop and approach logic as an NPC's. There is no is-human branch anywhere in the loop; the only difference between a human and an NPC is what decides transitions (clicks vs. a script), never the shape or visibility of the state. |
| Conversation mechanism (concretises D36/ADR4's option B) | Not an authored node graph scaled up. A script is a set of named **slots** (budget, current_device, use_case, storage, colour, tradein, careplan, accessories, ...), each owning its own question text (which may reference other already-filled slots — e.g. "don't go back to 128" referencing a stored storage fact) and its own answer handling, plus one **ordering policy** per script that picks the next unfilled slot worth asking given what is already known. The existing `conversation.ts` API (`Turn`, `Choice`, `StepResult`, `Effect`) is unchanged; only `turnFor`'s internals move from node-id dispatch to slot lookup. |

## Options considered

| Question | Options | Cost |
|---|---|---|
| Idle behaviour | A. pure timetable (built) / B. fully reactive, no schedule / **C. timetable + interruptible** | B throws away the free, server-tick-free timetable machinery and needs every idle moment computed reactively; C keeps the timetable as the default and only adds interrupt handling at its boundaries. |
| Where mission progress lives | a third `mission` table tracking a state-machine position / **no third layer — progress is just stored facts** | a third layer duplicates `conversations`/`player_state`/`case_facts` and raises "which one wins" questions on every read. |
| Loop granularity | one state machine per purpose/role (up to 16 variants: 8 purposes, 5 roles with specialist split 4 ways) / **one generic skeleton + named exceptions (repair, pickup)** | per-variant machines duplicate the common idle/converse/leave spine across many near-identical copies; forcing repair/pickup into the generic shape produces more conditionals than writing them separately. |
| Interrupt scope | **idle-only, mid-conversation interrupts out of scope for now** / mid-conversation too (forced preemption) | forced preemption means every conversation step must handle being torn down from outside; no transcript currently demands it — T6's staff disappearance is voluntary, not forced. |
| Conversation content | A. authored graph, scaled up / **B. slot-filling + ordering policy** / C. statechart library | A cannot express the transcripts' "asked in the order that fits the answer" without an explosion of near-duplicate node chains across scripts that share slots (budget, storage, trade-in all appear in T1, T3, T7); C adds a dependency that is awkward for dialogue with facts referencing other facts. |

## Consequences

- `storeday.ts`'s timetable mechanism is unchanged; nothing about the
  schedule itself changes.
- Needs a generalised version of D40's `tryGreeterApproach`/`tryNpcAutoClaim`
  for every staff role, not just greeter/phones, gated the same way (near,
  idle, on duty). D40's own open question about `tryNpcAutoClaim` (wire
  everywhere / only when no human is online for that post / after a grace
  period / leave unwired until genius/stock/technician exist) is **not**
  resolved by this ADR.
- `repair` and `pickup` purposes need their own written loop, not derived
  from the generic skeleton. `repair`'s loop additionally needs genius/
  stock/technician scripts to exist (not yet written, per WORKLOG) before it
  can do anything live.
- `conversation.ts` needs the slot + ordering-policy mechanism added
  alongside, or in place of, today's node-graph one; `greeter`/`phones`
  should be re-expressed in it so only one mechanism is live, not two
  quietly diverging in capability.
- Confirms and concretises `docs/adr/0004-cases-and-moves.md`'s "moves with
  preconditions over a case": a slot is the natural unit a move operates on,
  and `case_facts` (ADR4, not yet built) is the natural home for slot
  answers.

## Open (nothing here has a default picked quietly)

- D40's wiring question for `tryNpcAutoClaim` (above) is untouched by this
  ADR.
- Which mission/role gets a written-out slot script first — ADR4 suggests
  T1 (upgrade) + T4 (Genius Bar) together, "not yet confirmed" — is still
  open; this grilling session did not reach sequencing.
- Whether a human playing staff ever gets free text instead of a menu is
  unaffected: slots still render as a numbered menu per D9/D35.
- The storage model for case facts (current-state tables vs event-sourced,
  ADR4's own open item) is untouched by this ADR.

## Why this

[TK] Ritesh's reasoning, in his own voice.

## What would change this

[TK] Ritesh's reasoning.
