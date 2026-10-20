---
status: draft
what: ADR 4 --- a customer's visit is held by a durable case, and conversations are moves with preconditions over that case. Facts and reasoning filled in.
date: 2026-10-12
---

# ADR 4: Cases and moves

## Context

ADR 3 gave each visitor a state row and one conversation at a time, driven by
an authored script per kind of employee. Playing it end to end (2026-10-12)
showed the gap: the phones script ends with "go to the Genius Bar", which
creates no queue entry and nothing for a genius to see, so the customer is
left with nobody. The seven transcripts in `docs/customer-journeys.md` need
more than a script per lane: an order of questions that adapts, a handoff
that carries what was said, an order or ticket that outlives the visit, and
either side able to start. Per the week 8 lecture this changes what is
stored, so it is a decision, not an edit.

Constraints carried over unchanged: one small Fly machine that stops when idle
(deadlines are columns, never timers), SQLite on a volume, anonymous
visitors, and every state change writes an `events` row first.

## What was decided (Ritesh, 2026-10-12)

| | Decision |
|---|---|
| Model | **Option B**: a durable case per customer goal, and conversations as moves with preconditions over it (not authored graphs per lane). |
| Initiation | **Either party can start a conversation, always** (replaces ADR 3's "a character only talks to a visitor who starts it"). Proximity still applies. |
| Menus | The employee's reply is picked from a menu in the same format as the customer's. |
| Proximity | An employee can only serve a customer they are near. Taking a customer from across the room is not allowed. |
| Storage | Current-state tables plus events, not event-sourced (confirmed in the addendum of 2026-10-13). |
| First slice | The phone purchase scene and the device-service scene (the Genius Bar), both built (WORKLOG, 2026-10-18 and 2026-10-19). |

## Options considered

| Question | Options | Cost |
|---|---|---|
| How "what can be said next" is computed | A. authored graph per lane / **B. moves with preconditions over a case** / C. statechart library | A is cheapest but handoff and fact order explode it; B costs rule design and mutation checks; C adds a dependency and is awkward for dialogue |
| How durable state is stored | **current-state tables + events** / event-sourced | event-sourcing gives replay but needs snapshots and a harder migration story |
| Who drives a case | humans only / **a human or the post's NPC, the same moves** | an NPC policy must be a pure function over legal moves |

## Consequences

Facts (proposed, not yet built):

- Three lifetimes: a **visit** (one entry), a **case** (a goal such as buying a phone, a repair or a pickup; may outlive the visit) and an **exchange** (one stretch between two parties; many per case).
- A case holds: facts the customer has told us (budget, what they own, use, storage, colour, trade-in, who decides) each with who learned it and when; an **owner** (employee or NPC); a status; a basket; and a deadline column where a hold or appointment applies.
- A **handoff** changes the owner and carries a note. A **walk-over** is a move with a physical effect.
- A **move** is a closed vocabulary entry with: who may use it, what must be true (range, owner, stock, status) and what it changes. The server checks it and writes an event.
- The menu each side sees is the list of moves legal for them now.
- **No dead ends**: for every reachable case state someone has a legal move; if no human of that kind is online the NPC for the post drives it using the same moves. This is a spec over the finite state space.
- New tables (a migration 4, not yet written): `cases`, `case_facts`, `basket_lines`, `orders`, and a queue/slots table for the Genius Bar. `conversations` stays as the exchanges that belong to a case.
- The existing `greeter` and `phones` scripts are re-expressed as moves.
- Rules that are server-authoritative (stock, slots, ownership) need mutation checks (CLAUDE.md defect loop).
- A migration needs a backup and a rehearsal on a copy of the Fly volume before deploy.

Settled or still open:

- Prices and storage sizes are copied from the maker's own pages with source and date (D37). Care plan terms and trade-in value rules are not built.
- Trade-in, care plan and set-up are not in the first build.
- A sale in progress is an `orders` row, so it survives a restart of the visit.

## Addendum: option B confirmed and the schema built (2026-10-13)

SCOPE D42: option B is confirmed, against the cheaper alternative of adding
an owner+facts blob directly to `player_state` (rejected — stays 1:1 with
one visitor, can't outlive the visit or later cover two visitors in one
case). Migration 6 adds `cases` (owner, status, a deadline column) and
`case_facts` (one fact per row, who learned it and when); `conversations`
gains a nullable `case_id`. `src/server/cases.ts` is the pure data layer
(`openCase`, `handOffCase`, `setFact`, `factsOf`), covered by
`spec/cases.test.ts`; not yet wired into `service.ts`'s claim/handOn/open
flow, which is the next step, and that step is what will write the handoff's
`events` row. The storage-model row above (current-state tables vs
event-sourced) is resolved by this: current-state tables, matching every
other table in this schema.

Also corrects a claim made earlier in the same session: a staff-to-staff
handoff already existed before this (`handOn` in `service.ts`, tested) —
a single 140-character free-text note, written only from an explicit human
"Hand on" action. It never fired from a conversation script itself (T1's
Mira-walks-Aisha-to-Dan, T7's "Dan sets a note for Priya" are both
in-script handoffs), and a receiving script could not read it
programmatically. `case_facts` is the structured, scriptable version of the
same idea, not a new concept.

Still open, not resolved by this: which mission/role gets a written-out slot
script first; multi-person parties sharing one conversation (T3); staff-to-
staff consultation mid-conversation while the customer waits (T3).

## Why this

Playing the first version end to end showed that a script per lane leaves a
customer with nobody at the end of it. A durable case gives the Genius Bar
something to show, lets a handoff carry what was said, and lets either side
start. Moves with preconditions cost more design than an authored graph, but a
graph explodes once handoffs and the order of questions vary. Checking each move
on the server also keeps the rules in one place for the log and the tests.

## What would change this

A need to replay a visit from its events would push storage towards
event-sourcing. A conversation that needs free text from a person would break
the closed list of moves.

