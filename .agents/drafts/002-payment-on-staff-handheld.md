# Payment happens on the staff handheld: scan, total, tap

labels: type:feature, area:client, area:server, area:shared, touches:service, size:l, wave:w1
status: draft (scoped with Ritesh 2026-11-07)
depends on: none for 2a. 2b (receipt on the customer's phone) depends on working demo phone screens.
source: Ritesh's brief on mobile POS ("every employee carries a mobile handheld ... scan products, process payments, and issue digital receipts anywhere on the floor", pasted 2026-11-07; original source link still needed before it is cited in the README).

## Behaviour (2a)
Every staff member, real or CPU, always carries a handheld: a phone in a case with a card-reader bump, held at their side. When an order reaches the `paying` stage (src/shared/protocol.ts `OrderView.stage`), everyone in the room sees: (1) the staff member raises the handheld and scans the box label (scan line, short beep); (2) the handheld screen shows item, price and "Tap to pay", and the customer's HUD shows the same total; (3) the customer taps card or phone on the back of the handheld (ripple on the case, NFC chirp, checkmark); the order then completes and the bag is handed over. There is no register, no queue and no counter.

## Behaviour (2b, split out)
After the tap, a digital receipt notification slides in on the customer's own phone screen. Needs the working demo phone screen work; do not start until that issue is merged.

## Acceptance criteria (2a)
1. Every staff avatar shows a handheld at rest, in both viewports and for CPU and real staff.
2. An order in `paying` shows the three beats in order to every viewer in the room (positions and animation derived from server time, no timers).
3. The sale completes only when the customer's tap event arrives at the server; closing the tab before tapping leaves the order unpaid and the stock hold intact until it expires.
4. The total shown on the handheld and the customer HUD is the server's price, not a client value.
5. Each beat (scanned, total shown, tapped, paid) writes an `events` row naming staff and customer.

## Spec line
"An order moves paying -> paid only after a customer tap event for that exact order, the charged amount equals the server price, and each beat writes an events row."

## Advisory / judged
Whether the beats read clearly and feel quick, not fussy; handheld legible at 390x844. Goes to the feel-check.

## Feeds
Staff attention (the staff member is occupied for the beats), stock (a paid order consumes the held unit).

## Out of scope
Refunds, split payments, real payment, receipts by email, a visible register (cut in Tier 3 and by the mobile-POS idea).

## Notes for the builder
Procedural only: build the handheld and case from primitives (`docs/graphics-brief.md`), no Apple marks. Client files: `src/client/src/gfx/*`. Server: order stages in service.ts. May need a migration if a payment sub-stage is persisted: label `touches:migration` then.
