---
status: draft
what: ADR 12 --- how a device repair at the Genius Bar is run (an NPC genius, a decision tree, a seat, a ticket the customer collects against) and where its state lives. Drafted by Claude at Ritesh's request, 2026-11-09; the behaviour is Ritesh's spec, the engine and storage choices were Claude's and are marked for him to confirm.
date: 2026-11-09
---

# ADR 12: Genius Bar repair

## Context

Ritesh's spec, 2026-11-09 (his words, from the session): at the Genius Bar, "no real
staff needed for repair, this can be cpu controlled"; the customer starts the
conversation "from across the genius table, and then you just take a seat and the
staff stays behind"; it is "like a decision tree style conversation to narrow down
the issue"; outcomes are "a replacement", "a short fix they'll give you back within
a minute", or "a longer service for which you'll have to come back on another day";
there "has to be an actual resolution or follow up"; for a quick fix "the staff has
to go to the backroom and hand the device to a technician" and bring it back; "when
you come back to collect your device, this is when you choose the option 'came for
collection'", and it can still be "a replacement, even after long service";
seated is the only option, and the stool is "tall enough" that a seated customer is
level with the standing genius.

ADR 6 chose slot-filling over facts and named "repair and pickup" as exceptions to
it; Ritesh asked here for an authored tree, which is that exception. The codebase
also holds an unused, tested `service` scene for the talk engine
(`src/shared/talk/scenes/service/`, a fault table plus symptom/water/outcome rules).

## Options considered

| Option | Cost |
|---|---|
| A. Wire the talk engine's `service` scene to the genius NPCs | Reuses the most. But the talk engine is wired for phones only (`usesTalkEngine`), its conversation data is the phone scene's type, and seating, escorts and checkout are all written against it; a second scene type means touching most of `service.ts`. |
| B. A new `repair` script on the old engine (`shared/conversation.ts`) that borrows the `service` scene's fault table | Small and self-contained: the old engine already runs NPC-staffed conversations, `talk_choose`, endings and `player_state` effects. Costs: an authored tree, and a second seating path (bar stools only) beside the talk engine's table seating. |
| C. Hand-written outcomes with no fault table | Less code, but throws away the table's real/invented labelling. |

For where a repair is remembered:

| Option | Cost |
|---|---|
| X. A new `repairs` table | A migration and a new reader; the cleanest if repairs grow. |
| Y. `player_state.data` only | Wiped when a visit starts, which loses "come back another day". |
| Z. Derive the ticket from the `events` rows the flow already writes (`repair_outcome`, `repair_collected`), with `player_state.data` only for the minute-long errand in flight (ADR 11) | No migration; matches "events are load-bearing" (CLAUDE.md). Costs: one open ticket per customer (the latest), and it relies on the log being kept. |

## Decision

B and Z. Claude chose them, 2026-11-09; Ritesh is asked to confirm.

- **Script.** Seat, then: what is wrong (won't charge, won't turn on, cracked screen,
  battery drains fast), liquid or not, one question specific to the symptom, a
  diagnosis from the fault table, a warning first if the repair can wipe the
  device. Seated is the only first choice; taking it puts the customer on a bar
  stool in front of the genius, who stays behind the bar (the engagement is held at
  their post and `talking` so their mouth moves).
- **Outcomes** from the fault: a quick fix (in-store, no turnaround) runs the errand
  in ADR 11 and is collected with "I'm here to collect my device"; a replacement
  is handed over there and then; anything else is a longer service, ready on a later
  visit ("another day" is read as the next visit, so reloading the page in a demo
  counts). After a long service about one in five come back as a replacement,
  decided by a hash of the customer and the ticket, so the same repair always
  ends the same way.
- **Seating height.** The bar stool seat is 0.82 m, so a seated customer's eye
  (seat + 0.75 m) is level with a standing person's (1.6 m); table stools stay at
  0.7 m, where both people sit.
- **Invented policy**, flagged as such in the fault table's header and not copied
  from any real repairer: the turnaround days, the cost bands, the "one in five".

## Consequences

- Phones only. No laptop or tablet faults, no human genius, and the timetable
  customers who come in for a repair do not use this flow.
- The ticket depends on the `events` rows; pruning them loses an open repair.
- Sitting is an instant snap onto the stool, not a walk to it.
- Covered by specs (every path ends and closes, outcomes, the collection and
  replacement chances, tickets across visits, the errand); not mutation-checked.

## Citations

- `SCOPE.md` D59. Ritesh's messages of 2026-11-09 quoted above.
- `src/shared/conversation.ts` (`repair` script), `src/server/service.ts`
  (`repairTicket`, `ticketReady`, `sitAtBar`, `wantsReplacement`, `repairStatusOf`),
  `src/shared/talk/scenes/service/data.ts` (the fault table).
- Related: ADR 6 (the named repair exception), ADR 11 (the errand), ADR 4 (cases).
