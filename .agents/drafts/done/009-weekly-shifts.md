# Weekly shifts: a real-clock roster, CPU covers off-shift

labels: type:feature, area:server, area:client, touches:migration, size:l, wave:w3
status: draft (scoped with Ritesh 2026-11-07)
depends on: #1 (staff offers) so on-shift/off-shift decides who is offered customers.

## Behaviour
A roster of 7 days x 3 shifts (morning, afternoon, evening) is stored in SQLite and shown on a board in the back room. A real staff user signs up for shifts. While their shift is running they play their own character. When it is not, a CPU plays that character under their name (the log reads "<name> (cover)"). Unfilled shifts are covered by CPU staff. The server clock decides what is on shift, caught up on the next request (no timers). Coming back the next day shows the board with today highlighted and a short "yesterday: N sales" for each staff user.

## Acceptance criteria
1. A staff user can sign up for and drop a shift from the board; two users cannot hold the same named slot.
2. The on-shift set is a pure function of the stored roster and the server clock, tested with an injectable clock.
3. Off-shift, the character is played by a CPU with the user's name; on-shift, real input wins (D48 priority).
4. The roster survives restart; the board shows today highlighted.
5. Every sign-up, drop and shift change writes an `events` row; "yesterday" counts are computed from `events`.

## Spec line
"Who is on shift is a pure function of the roster and the clock; off-shift characters are CPU-driven under the owner's name; a real user always wins their own on-shift character."

## Advisory / judged
Whether the board is readable and whether the cover swap is noticeable. Two profiles, next-day check by restart plus clock advance.

## Feeds
Staff attention, persistence.

## Out of scope
Pay, swaps between users, notifications, leave.
