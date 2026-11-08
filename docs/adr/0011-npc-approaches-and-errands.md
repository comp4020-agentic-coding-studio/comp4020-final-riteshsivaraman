---
status: draft
what: ADR 11 --- how an NPC that goes somewhere on its own (walks over to a customer, or takes a device to the back room) is represented, advanced and kept consistent for everyone, with no timer. Drafted by Claude at Ritesh's request, 2026-11-09; the requirements are Ritesh's, the choice of mechanism was Claude's and is marked for him to confirm or overturn.
date: 2026-11-09
---

# ADR 11: NPC approaches and errands (stored, request-driven)

## Context

Until 2026-11-09, `tryGreeterApproach` and `tryNpcAutoClaim` called `open()` at the
moment an NPC set off. The conversation, and the customer's camera lock, began
while the NPC was still walking across the room. Ritesh, live: "the staff talks
to thin air (where I'm supposed to be)". The same session asked for more:

- the staff member follows the customer to wherever they are now, and "whenever
  two people are talking, they HAVE to be face to face" (Ritesh, 2026-11-09);
- for a quick repair "the staff has to go to the backroom and hand the device to a
  technician, and then after a minute they hand it back" (Ritesh, 2026-11-09).

Both are the same shape: an NPC goes somewhere for a while, everyone sees the
walk, and something happens when it gets there or when time is up. The project
already has one such flow, the payment visit (`intents` table, `intentEngagement`,
`staffArrived`, `settleVisits`), and one hard rule: no background processes
(CLAUDE.md), so every deadline is a stored timestamp caught up on the next
request that touches it. Clients poll `settle` every 500 ms while an offer or
walk involves them, and every `move` runs the same catch-up.

## Options considered

| Option | Cost |
|---|---|
| A. Open the conversation when the NPC sets off (what it did) | The bug: talking to thin air, a camera that pans to an NPC still across the room. Rejected. |
| B. Route these through the `intents` table with new `reason` values | Follows the existing pattern. But `intents` is shaped around a payment (a staff id, a customer id, an order's price, `arrived_at` for a beat); an errand with no customer at the far end, or an approach with no payment, needs new columns and a migration, and every reader of `intents` must learn the new reasons. |
| C. Keep the pending approach or errand on the customer's `player_state.data` JSON (the blob that already holds `offer`, `claim` and `cpu`), and advance it from `catchUpOffers` | No migration. Restart-safe, because it is stored. Costs: `data` becomes a bag of unrelated fields; finding every pending one is a `LIKE` scan of `player_state`, fine at tens of rows and wrong at thousands. |
| D. A server timer per approach or errand | Breaks the no-background-processes rule. Rejected. |
| E. Client-side only (each browser animates the walk) | Two people would disagree about where the NPC is and whether the chat has begun. Rejected. |

## Decision

Option C. Claude chose it, 2026-11-09, without laying the options out for
Ritesh first (CLAUDE.md asks for that on real-time mechanisms); he is asked to
confirm it or choose B.

What it is:

- **Approach** (`OfferData.approach`: NPC, script, since, target `at`, `from`,
  `began`). `beginNpcApproach` broadcasts a `pending`/`waving` `Engagement` and
  stores the approach. `settleApproaches`, run from `catchUpOffers`, opens the
  real conversation only when the NPC has arrived and the customer is within
  0.35 m of where it went. If the customer has moved on it re-aims: a new
  engagement from where the NPC stands to where the customer is now. After a
  minute of that it gives up and releases the NPC. So the chat never opens until
  the two are standing face to face.
- **Errand** (`OfferData.repair`: `queued`, then `trip` and `releaseAt`, then
  `readyAt`). When the Genius Bar conversation is closed after a quick repair the
  genius walks to the technician (an `Engagement` with `at` = the technician), is
  let go after a minute (`released`, so the clients walk it back), and the
  customer is told when it is back. `engagements()` includes live trips, so
  someone joining mid-errand sees the walk; `staffBusy` treats the NPC as busy
  until it is back.
- **Housekeeping on the same cadence:** a finished conversation an NPC is still
  "holding" because the customer never dismissed it is let go after 20 s
  (`releaseStaleHolds`); a customer waiting on a real staff user who never comes
  is taken by an NPC after 30 s (see ADR 9, addendum).
- Walking is a pure function of the engagement and the server clock
  (`engagedMoment`), as before, so every client draws the same thing.

## Consequences

- Nothing advances unless some client is sending requests. With nobody
  connected nothing is on screen to be wrong, and the next request catches up.
- A restart in the middle of an errand resumes it from the stored fields.
- The `LIKE '%"approach":%'` and `'%"repair":%'` scans run every settle; revisit
  (a real table) if the store ever has more than tens of simultaneous customers.
- Specs cover re-aiming, the open-only-when-still rule, the minute give-up, the
  whole quick-repair errand, and that staff routes cross the shop/back wall only
  by the staff door. The approach and errand code has **not** been
  mutation-checked (CLAUDE.md's defect loop); D58's `noRealStaffFor` was.
- Not live-watched in two browsers yet.

## Citations

- Ritesh's messages of 2026-11-09 quoted above; `SCOPE.md` D58, D59, D62.
- `src/server/service.ts`: `openWhenArrived`, `beginNpcApproach`, `settleApproaches`,
  `settleRepairs`, `beginRepairTrip`, `onRepairErrand`, `releaseStaleHolds`.
- `src/shared/engage.ts` (`engagedMoment`, `engagedArrival`, `rejoinMoment`),
  `src/shared/world.ts` (`DIVIDING_WALL`).
- Related: ADR 6 (behaviour loop), ADR 9 (staff assignment priority), ADR 12 (the repair that uses the errand).
