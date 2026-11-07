# Real staff users are offered waiting customers before CPUs

labels: type:bug, area:server, area:client, area:shared, touches:service, size:l, wave:w1
status: draft (scoped with Ritesh 2026-11-07, decisions below)
depends on: none. Blocks: payment animation (needs a real staff user holding a customer), stock hold tag.

## Behaviour
Customers who are not in a conversation sit on an internal waiting list, oldest first (D47). A free real staff user (not in a conversation, on duty) is offered the longest-waiting customer they can help, nearest staff first. The staff user sees a marker over that customer and a HUD ping "Customer waiting at <area>". They claim it by walking up and pressing E. The offer holds for 15 seconds; after that the offer passes to the next nearest free real staff user, and once no real user claims it within the window a CPU staff member may take the customer. A customer claimed by a real user is never taken by a CPU. One staff member per customer; the claim is atomic on the server. A claim is released if the staff user disconnects, leaves duty or starts another conversation.

## Why (what is wrong today)
`tryGreeterApproach` (src/server/service.ts:1725, called from src/server/presence.ts:402) only ever sends the CPU greeter to a customer in the entrance zone. A real staff user is never offered arriving or browsing customers, so as a staff user "when a bot customer walks in, they are not assigned to me" (Ritesh, 2026-11-07).

## Acceptance criteria
1. With one real staff user free and one customer waiting, the staff user receives an offer within one presence tick and sees the marker and ping.
2. Pressing E on the offered customer within 15 s opens the conversation with the staff user, not a CPU.
3. If the staff user does nothing for 15 s, the offer goes to the next nearest free real staff user; if none, a CPU may take the customer.
4. Two real staff users pressing E on the same customer in the same tick: exactly one wins; the other is told the customer is taken.
5. A customer already claimed by a real user is never claimed by a CPU, including by `tryGreeterApproach`.
6. A claim made by a user who then disconnects is released and the customer returns to the waiting list at its original position.
7. Every offer, claim, release and CPU takeover writes an `events` row naming who did it.
8. No timers: the 15 s window is a stored timestamp caught up on the next request that touches it (the machine stops when idle).

## Spec line (the testable promise)
"Given a waiting customer, a free real staff user is offered the customer before any CPU, exactly one staff member ends up with a customer, and a CPU only takes a customer after the 15 s window with no real claim."

## Advisory / judged (goes to the feel-check)
Whether the marker and ping are noticeable without being noisy, and whether 15 s feels right with one human in the room (two profiles, both viewports).

## Feeds
Staff attention.

## Out of scope
Tie-break by longest-free or offer-to-all (decided: nearest first). Skill/role matching beyond "can help" (use existing duty and specialty data). Shifts (separate issue).

## Notes for the builder
Hot spots: service.ts, presence.ts. Likely a small migration for the waiting list / offers table: label `touches:migration` if so, and then it is single lane. Real-user priority is SCOPE D47 and the humans-win rule in SCOPE section 5.
