---
status: draft
what: ADR 9 --- who gets a waiting customer when real staff users and CPU staff are both free. Scaffold by the steward from SCOPE D47, D48, D53, D54; the decisions were Ritesh's, 2026-11-07. Prose beyond the quotes is his to write.
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
orchestrator session, and recorded as `SCOPE.md` D53 and D54:

- **Equal-distance tie-break (D53):** arbitrary / first-free (FIFO, whichever
  real staff member became free first), no skill check.
- **Specialty/duty matching (D54):** not required for v1. Nearest free real
  staff member regardless of duty or specialty, per D48 as written.

A review of issue #1's implementation (PR #27) found D54's literal wording
produced dead offers to staff who structurally cannot open a conversation at
all (no script for their post), burning the 15s window for nothing. D57
(2026-11-07) amends this: D54 is read as a capability filter ("can they open
a conversation at all"), not a skill/specialty match — the decision itself is
unchanged, D54 already meant no skill matching, this just closes the gap
between that intent and a staff member who cannot serve structurally. D57 also
rules on a gap the review found: when the 15s window passes with no other free
real staff user available, the same lone staff user is re-offered the
customer, rather than leaving them stranded until a second staff member joins.

## Consequences

- Dead offers (to a staff member with no conversation script) no longer occur;
  only staff who can actually open a conversation are offered (D57a).
- A lone staff member working alone does not permanently strand a customer
  once the 15s window passes without a claim; the same customer loops back to
  them (D57b).
- A reconnect/takeover path that skips the normal `leave()` cleanup (found in
  PR #27 review) must still release an active claim and withdraw a stale
  offer — this is a correctness requirement of this ADR's claim/offer model,
  not a new decision, and is being fixed in the same PR.

## Citations

- `SCOPE.md` D47, D48, D53, D54, section 5.
- Issue #1, "Real staff users are offered waiting customers before CPUs".
- CLAUDE.md "No background processes" (the 15 s window must be a stored timestamp), "Event log is load-bearing" (offers, claims and takeovers write `events` rows). Both are in issue #1's acceptance criteria 7 and 8.
- Related: ADR 3 (who may see and do what), ADR 4 (cases and moves).

## Addendum, 2026-11-09: when no human is available, or never comes

Drafted by Claude; D58 is Ritesh's, the 30-second rule below is Claude's and he is asked to confirm it.

- **D58 (Ritesh, 2026-11-09, after two hours as the only human staff user with no NPC ever coming to him: "that gap needs to be closed").** An on-duty NPC now claims a waiting customer on its own, but only when no real staff user online could serve that customer's post at all (`noRealStaffFor`). A human free for the same post is never pre-empted, so this ADR's decision stands unchanged while any human covers the post.
- **The grace period (Claude, `SCOPE.md` D62).** Reviewing a live test, a customer waited about two minutes because a real specialist was online but not claiming, so the NPC rule never applied. The decision above (a human first, the offer passes after 15 s) is unchanged, but once a customer has waited **30 seconds** an NPC may take them even if a human is still nominally available (`NPC_AFTER_HUMAN_MS`, a stored wait time, not a timer). Cost: a human who is slow to respond loses the customer to an NPC at 30 s instead of keeping them; Option A's "a CPU gives way, never a human" is softened to "gives way, for 30 seconds". If that is wrong, the constant is the one place to change.
- The NPC now opens its conversation only on arrival, not when it sets off (ADR 11).

