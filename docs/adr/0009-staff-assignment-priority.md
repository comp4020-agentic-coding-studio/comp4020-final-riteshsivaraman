---
status: draft
what: ADR 9 --- who gets a waiting customer when real staff users and CPU staff are both free. Scaffold by the steward from SCOPE D47 and D48; the decision was Ritesh's, 2026-11-07. Prose beyond the quotes is his to write.
date: 2026-11-07
---

# ADR 9: staff assignment priority (real users before CPUs)

## Context

Quoted from `SCOPE.md` (on `integration`, commit `9afea67`; not yet on `main`).

D47 (Ritesh, 2026-11-07): "The server keeps an internal waiting list of
unattended customers with staff as the resource; a free staff member is
assigned the next waiting customer and walks over. **A real user behind a
screen is always prioritised over a CPU staff member** when assigning."

D48 (Ritesh, 2026-11-07): "a free real staff user is offered the longest-waiting
customer with a marker over them and a HUD ping, nearest user first. They claim
it by walking up and pressing E. The offer holds 15 seconds, then passes to the
next nearest real user, then a CPU may take the customer. One staff member per
customer, atomic claim. Issue #1".

`SCOPE.md` section 5 (Tier 1 item 6 and the "Humans win over CPUs" rule) repeats
the priority: "real users before CPUs (D47)" and "A CPU gives way, never a
human."

Why it is recorded as an ADR: issue #1 carries `needs-adr` because staff
assignment is multi-user and expensive to reverse (CLAUDE.md, "Don't invent").
Today's behaviour, per issue #1: `tryGreeterApproach` (`src/server/service.ts:1725`,
called from `src/server/presence.ts:402`) only sends the CPU greeter to a customer
in the entrance zone.

## Options considered

Only options the record itself names. Costs are not in the record.

| Option | Where named | Cost |
|---|---|---|
| **A. Real user always before CPU, nearest real user first, 15 s offer, then next nearest, then a CPU** | D47, D48 | [TK: costs, Ritesh] |
| B. Tie-break by longest-free | issue #1 "Out of scope", decided against | [TK: costs, Ritesh] |
| C. Offer to all free real users at once | issue #1 "Out of scope", decided against | [TK: costs, Ritesh] |
| D. No priority, CPUs and real users compete equally | the behaviour D47 replaces (inferred from issue #1 "Why") | [TK: costs, Ritesh] |

## Decision

Ritesh, 2026-11-07, in D47 and D48: option A. A real user behind a screen is
always prioritised over a CPU staff member when assigning. Nearest real user
first; the offer holds 15 seconds, then passes to the next nearest real user,
then a CPU may take the customer. One staff member per customer, atomic claim.

[TK: Ritesh to confirm this ADR carries D47/D48 unchanged, and to reword the Context and Decision in his own voice.]

Two gaps D47/D48 left open were ruled on by Ritesh, 2026-11-07, relayed via the
orchestrator session (not yet in `SCOPE.md`'s decision table as its own entry
at time of writing):

- **Equal-distance tie-break:** arbitrary / first-free (FIFO, whichever real
  staff member became free first), no skill check.
- **Specialty/duty matching:** not required for v1. Nearest free real staff
  member regardless of duty or specialty, per D48 as written.

[TK: SCOPE.md does not yet carry these two rulings as a dated decision row (D47/D48 only cover the core priority). If they should be numbered and added there, that is the orchestrator's or Ritesh's call, not this ADR's.]

## Consequences

[TK: Ritesh. Left blank.]

## Citations

- `SCOPE.md` D47, D48, section 5 (on `integration`).
- Issue #1, "Real staff users are offered waiting customers before CPUs".
- CLAUDE.md "No background processes" (the 15 s window must be a stored timestamp), "Event log is load-bearing" (offers, claims and takeovers write `events` rows). Both are in issue #1's acceptance criteria 7 and 8.
- Related: ADR 3 (who may see and do what), ADR 4 (cases and moves).
