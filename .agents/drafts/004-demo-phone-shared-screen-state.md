# Demo phones: shared screen state on the server (4a)

labels: type:feature, area:server, area:shared, touches:migration, size:m, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: none. Blocks 4b and 4c.

## Behaviour
Each demo phone slot has a server-held screen state: asleep, lock, home, or an open app (camera, settings, photos), plus who last touched it and when. Any visitor who inspects a demo phone can wake it, change the screen by tapping, and put it down. Everyone near that slot sees the same screen, within about a second, with no reload (Ritesh: "shared per device"). State persists across restarts; an untouched phone returns to asleep after 5 minutes (a stored timestamp caught up on the next request, no timer).

## Acceptance criteria
1. Wake, open app, back to home and sleep are server messages; invalid transitions (open camera while asleep) are refused with a reason.
2. A second profile near the same slot sees the same screen state within about a second.
3. After a server restart the slot state is still there; after 5 idle minutes it reads asleep.
4. Two visitors tapping at the same time: last write wins, both see the winner, nobody sees a torn state.
5. Every transition writes an `events` row (visitor, slot, from, to).

## Spec line
"Demo screen transitions are server-authoritative: a second client sees the same state, invalid transitions are refused, state survives restart and idles to asleep after 5 minutes."

## Feeds
Demo tables.

## Out of scope
The drawing of the screens (4b), the camera viewfinder (4c), personal data or accounts on the phone.

## Notes
New table => `touches:migration`, single lane. Extends the inspect flow (`startInspect`, `inspect_start`/`inspect_end` events).
