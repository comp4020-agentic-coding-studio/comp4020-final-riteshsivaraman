# Stock holds are visible: "on hold for <name>, 4:30 left"

labels: type:feature, area:client, area:server, size:m, wave:w1
status: draft (scoped with Ritesh 2026-11-07: keep the existing reserve-at-choice rule, add visibility)
depends on: none

## Behaviour
A reserved unit (`reservations` row, held for `HOLD_MS` = 5 minutes, src/server/service.ts:68) is shown to everyone: the shelf slot or table shows a small tag "on hold for <name>" with the time left, and the live count of free units for that colour and storage. When the hold expires or the sale completes the tag disappears and the count updates for everyone within about a second. No change to who can reserve or when.

## Acceptance criteria
1. A customer who picks the last unit makes the tag appear in a second profile within about a second, with no reload.
2. The visible countdown comes from the server's `expires_at`, not a client timer's guess.
3. After expiry (caught up on the next request, no server timer) the unit is buyable by someone else and the tag clears for everyone.
4. A second customer choosing the same last unit is told the truth ("on hold for <name>"), as the existing lost-race path does.
5. Each tag appearance and clearance corresponds to an existing `reserved` / expiry / sale `events` row (no new state, no new event types unless needed).

## Spec line
"The hold shown to every viewer equals the server's reservation (holder, expiry, remaining count); a held last unit cannot be reserved by a second customer."

## Advisory / judged
Whether the tag is noticeable but not cluttering; the frustration of a missing colour reads as intended.

## Feeds
Stock.

## Out of scope
Moving the hold to the scan moment, or a second soft hold (decided: keep reserve-at-choice).
