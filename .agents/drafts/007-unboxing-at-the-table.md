# Unboxing: tap the box at the table and the phone becomes yours

labels: type:feature, area:client, area:server, size:m, wave:w2
status: draft (scoped with Ritesh 2026-11-07, D52)
depends on: payment (issue #2) for the order reaching paid. Independent of the demo phone work.

## Behaviour
After the tap on the handheld completes payment, the customer is handed a bag and goes to a table (sits or stands). The boxed phone sits in front of them. Tapping the box lifts the lid, the phone rises out of its tray, the plastic peel slides off, and the phone becomes "yours": carried, and listed in the customer's things. Everyone nearby sees the unboxing happen, in real time. Closing the tab and coming back later still shows the box unopened (state persists).

## Acceptance criteria
1. A paid order produces exactly one unopened box for that customer; it cannot be opened by anyone else.
2. Tapping the box moves it unopened -> opened; the animation is derived from server time and the same for every viewer.
3. After opening, the phone appears in the customer's things and survives a reload and a restart.
4. A customer who leaves before opening finds the box unopened on return (same visit token).
5. Each state change (handed over, opened) writes an `events` row.

## Spec line
"A paid order yields one box owned by that customer; only the owner can open it; opened state persists across reload and restart."

## Advisory / judged
Whether the lid, rise and peel feel satisfying (the 'handed a bag, opening it' beat from SCOPE 0b). Two profiles, both viewports.

## Feeds
Persistence (a purchase is still there tomorrow), demo tables.

## Out of scope
Accessories in the box, trade-in, returning the phone.
