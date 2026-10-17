---
status: draft
what: Brainstorm of every kind of conversation that can happen in the store, grouped by who talks to whom, with a short sketch of each and a suggested build order. Ideas for Ritesh to cut and shape; not a plan.
date: 2026-10-18
source: Claude's brainstorm from general retail and service-desk knowledge plus the project's own SCOPE.md (3b staff roles, 3d scenarios S1 to S11) and docs/customer-journeys.md (T1 to T7). Nothing here is sourced; policies, prices and procedures marked [verify] must be sourced (D37) before the store says them.
---

# Every conversation in the store

**Sketch format:** parties, goal, the **pool** (what is being narrowed), key questions, outcomes, hands off to. Two people per conversation (decisions.md). One-way radio tasks between staff are *not* conversations (Ritesh's note) and need their own small protocol.

## A. Customer with staff

1. **Arrival and check-in (greeter).** Goal: route them. Pool: where they can go. Questions: what brings you in, booked or walk-in, which product. Outcomes: to a specialist, the Genius Bar queue, pickup, self-serve, or "just looking". Hands off to almost everything. (S1, S2, S6.)
2. **Buying, per product family** (one scene each, different pool and bank): phone (built), tablet, laptop, desktop and display, watch, audio (earbuds, headphones, speakers), accessories (cases, chargers, cables, trackers), home devices. Variants: gift, first smartphone, upgrade, compare two, "will this work with my...", education or business buyer [verify], bundle. Hands off to checkout.
3. **Checkout and billing.** Pool: ways to finish. Payment, trade-in valuation [verify], care plan offer [verify], gift receipt, invoice, split payment, payment failure (S7), refund at the till. Hands off to manager on a stall.
4. **Setup and transfer.** Moving data, activation, accounts, Wi-Fi, passcode, SIM, pairing accessories. Often follows a sale.
5. **Device service** (the big family; see the matrix below).
6. **Order pickup (S9).** ID, wrong or missing item, "the table, not the line".
7. **Returns and exchanges.** Reason, condition, window [verify], refund method, exchange stock.
8. **Complaint and escalation (manager).** Payment limbo, repeated failed repair, long wait, staff error. Outcomes: apology, small goodwill, "not much we can do" (S7).
9. **Information and wayfinding.** Where is X, can I charge here, is there Wi-Fi, when is the next appointment.
10. **Stock questions.** Is it in the store, reserve, back-order, launch-day pre-order [verify].
11. **Accessibility and special help.** First-time or older users, language, kids and parents (T3), someone helping a relative.
12. **Demos outside a purchase.** Try the camera, compare screens, accessibility features.
13. **Sessions and workshops** (group; breaks the two-person rule; host and attendee): likely out of scope, listed for completeness.
14. **Behaviour issues.** Damage to demo units, abuse: staff de-escalation. Probably ambient only.

### Device service matrix
Rows: device class. Columns: problem class. Each cell is a bank of questions on the same engine; the *pool* is the ranked list of candidate faults and repair options, symptoms are hard filters, usage patterns are soft signals.

| Class | Typical problems to model |
|---|---|
| Phone | cracked or dead screen, battery drain or "service" warning, water damage, won't charge or turn on, speaker or microphone, camera, buttons and ports, connectivity, software or performance, forgotten passcode or locked account |
| Tablet | as phone, plus keyboard/pencil accessories not pairing |
| Laptop and desktop | won't start, slow, battery, keyboard or trackpad, display, ports, liquid, storage failure and data recovery, OS reinstall |
| Watch | screen, strap and clasp, battery, sensors, pairing and activation |
| Earbuds and headphones | one side silent, charging case, battery, pairing, mic |
| Speakers and home devices | setup failures, audio, connectivity |
| Accessories and chargers | cables, chargers, cases: replace or advise |
| Displays | dead pixels, connection, stand |

Service phases (each a scene or a stage of one): **intake** (symptom elicitation), **diagnosis** (tests run, candidate faults narrowing), **outcome** (fixable now, send away, replace, cannot fix; options and quote [verify]), **authorise**, **drop-off handoff** to the technician (a radio task), **status check**, **pickup** (hands to order pickup), **dispute or escalation**. Warranty and plan eligibility [verify] is a hard filter on the outcome options. Data-loss warnings and consent are mandatory lines. (S8, T4.)

## B. Customer with customer
Rare, mostly ambient (D9: NPC-NPC talk is only speech bubbles). Candidates: asking another shopper's opinion, queue chat and complaints about the wait, a stranger helping with a demo, family or couple deciding together, borrowing a charger, taking a photo for someone. A pair arriving together is the one place where "two people" and "one shopping party" differ.

## C. Staff with staff
- **Fetch request (stock runner).** Specialist asks for an item (model, storage, colour); runner reports found, not found, how many. Pool: items and locations. Closest to the phone scene's mechanics.
- **Customer handoff.** "John will be with you in a moment": greeter or specialist to the next person. A one-way radio task, not a back-and-forth.
- **Technician handoff.** Device in with symptoms; status; done. Radio task with a reply.
- **Manager approval.** Exception, refund over a limit, goodwill [verify].
- **Queue management.** Greeter and Genius Bar: who is next.
- **Shift matters.** Break cover, handover, closing routine, cash up.
- **Coaching.** New hire shadowing.
- **Floor upkeep.** Restock and re-dress a table, broken demo unit report, spill or safety call.
- **Ambient banter.** Speech bubbles only.

## D. Cross-cutting
- **The case.** Facts must survive handoffs (ADR 4, `src/server/cases.ts`): what the customer wants, what they decided, their preferences.
- **Handoff graph.** Greeter to specialist to checkout to setup; Genius Bar to technician to pickup; anything to manager.
- **Time and availability:** waits, busy staff, stock and the "let me check" lines.
- **Interruptions:** a customer leaves mid-scene; staff are called away.
- **The event log:** every state change writes a row once wired.

## E. Suggested order for the next sessions (my recommendation, Ritesh decides)
1. **Extract the generic core while porting a second purchase scene** (laptop is the nearest: same pool shape, different attributes). Two real scenes show what is shared.
2. **Device service intake and diagnosis, phone first** (a different pool: faults, not products), then one more class to prove the bank-per-class idea.
3. **Greeter and check-in** (routing; small, and connects the others).
4. **Checkout and billing** (ends the purchase flow).
5. **Staff fetch and handoffs** with the one-way radio-task protocol.
6. Pickup, returns, escalation; ambient scenes last.

## F. Questions for Ritesh
- Which service classes matter for the demo and the showcase?
- Is the radio task protocol one message, one acknowledgement, one completion?
- Do pairs of customers shopping together count as one party?
- Which policies (window, plans, trade-in) are we sourcing, and which are invented parody?
