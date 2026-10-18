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

---

# G. Scene sketches (the next candidates, in the engine's terms)

Each sketch answers the questions the playbook asks first: the **pool**, the **hard constraints** (answers
that eliminate), the **soft signals** (answers that only re-rank), the **mandatory lines**, the
**outcomes**, and the **hand-offs**. All questions and policies are proposals for Ritesh to cut; anything about
what a real store allows is `[verify]` and must be sourced before it is said (D37).

## G1. Device service, phone: intake and diagnosis

**Built, v1, 2026-10-18** (`src/shared/talk/scenes/service/`, proposal at
`service-scene-proposal.md`, reviewed by Ritesh before building). Phone-only, 4 of this
sketch's symptoms, the `run_check` staff move, the mandatory data-loss gate (verified
failing-first), outcomes fixed-now/booked/cannot-fix/declines/left. **Deferred to a later
pass:** the "replace the device" cross-scene handoff below (needs conversation-types.md
section I's case object, which doesn't exist yet), G2's other device classes, loaner/
warranty/eligibility policy beyond a `[TK]` placeholder, an automated reviewer pass, and
Ritesh playing it. This was also the scene that tested whether the core extraction
(`core-extraction-proposal.md`) actually generalises beyond two purchase scenes -- see
`engine-reference.md` for what it found needed to stay scene-owned.
- **Parties:** customer, technician or Genius (S8, T4). **Goal:** reach an outcome the customer accepts.
- **Pool:** candidate faults and repair options for that model (for example screen replacement, battery
  service, water-damage assessment, software reset, nothing wrong). Not products: the *ranking* is "most likely
  cause given the symptoms", and the staff-side hint is how much each question separates the causes.
- **Hard constraints:** the model (and its age, for eligibility `[verify]`); a symptom the customer confirms
  ("it won't turn on", "the screen is cracked"); water exposure yes/no; whether it was ever opened or repaired
  elsewhere `[verify]`.
- **Soft signals:** when it started, what happened just before, charging habits, what they use it for
  (it changes how urgent a battery issue is, not what the fault is).
- **Questions (bank sketch):** what is wrong (a menu of symptoms by class); when did it start; has it been
  dropped or wet; does it charge; does it turn on; what have you tried (restart, other charger); is there data
  you cannot lose; do you have a backup; are you signed in to the account (activation lock, `[verify]`).
- **Staff moves beyond questions:** *run a check* (a test result is a fact that enters the state, from data
  not chance: the NPC technician reads it off a fault table), *explain the options*, *give a quote*
  `[verify]`, *offer a loaner* `[verify]`, *warn about data* (mandatory before any repair that can lose it).
- **Customer throw-backs:** how long will it take, how much will it cost, will I lose my data, can you fix it
  today. These are parameterised menu items answered from the outcome table.
- **Mandatory lines:** greeting, data warning before authorising, sign-off with what happens next.
- **Outcomes:** fixed now; repaired in store (booked); sent away (a case with a due date, S8); replace the
  device (hands to a purchase scene with the *preferences carried over*, as the phone scene already does for a
  change of model); cannot fix; customer declines the quote and leaves.
- **Hands off to:** technician (radio task), booking and queue (S2 and the Genius Bar slots), checkout (payment
  for a repair), purchase (replacement), manager (dispute).
- **What is new for the engine:** the pool holds *explanations*, not products, and some facts arrive from the
  world (test results), not from the customer. The turn protocol, the obligations and the NPC shape are unchanged.

## G2. Device service, one bank per class
The same scene, a different bank. Build the phone first; for each further class write only:
(a) the symptom menu for that class, (b) the fault table (symptom combinations to candidate faults and the
outcomes each allows), (c) the class-specific questions (a laptop asks about liquid, storage and whether the
data matters; a watch asks about the strap and pairing; earbuds ask which side), (d) any class-specific
mandatory line. The class decides the *bank*, not the *engine*.

## G3. Purchase of another family (laptop first) -- BUILT 2026-10-18

Built the same night as this document's G-section sketches, by Claude under Ritesh's standing
authorization (an overnight run; see decisions.md's 2026-10-18 entry). `src/shared/talk/scenes/laptop/`,
140 talk specs total (34 laptop), 0-stuck simulation at 400 and 2000 seeds. **What's real vs
still needed:** the engine, sourced data (`laptops.json`, preconfigured SKUs only -- build-to-order
memory/storage combinations are out of scope, see `laptops-v2-notes.md`) and specs are built and
green; an automated reviewer pass on fresh seeds, Ritesh playing either side, and his review of the
wording are **not done** (see README.md's status table and new-scene-playbook.md's "Definition of
done for a scene"). The "prove the engine is generic" goal below was only half met: porting laptop
confirmed the turn protocol and NPC loop really are the same shape across two scenes, but no shared
`core/` engine was actually extracted -- see new-scene-playbook.md's "Generic today vs phone-specific".

Original sketch, kept for the record:
- **Pool:** model x memory x storage x colour (and keyboard layout or chip variant if the data has them).
  Same shape as phones, so this is the best second scene to prove the engine is generic.
- **New questions:** what do you use it for (office, creative, study, gaming), portability (screen size,
  weight), how many years it must last, ports you need, whether they have a screen already, whether they
  need to run particular software (hard filter only if the data says it matters).
- **New wrinkle:** configure-to-order axes (memory and storage are chosen, not stocked), so the *price*
  depends on choices and "this exact configuration is in stock" becomes a hard fact late in the scene.
- **Reuses unchanged:** the whole turn protocol, demos, recommend, nudge, reconfirm, carried preferences.

## G4. Greeter and check-in
- **Pool:** destinations (specialist for a family, Genius Bar queue or booking, pickup, self-serve, leave).
- **Questions:** what brings you in; do you have a booking; which product; do you want someone to help now or
  to look around first.
- **Outcomes:** routed (with a *case* started that carries the answers to the next scene), told to wait with a
  rough time `[verify]`, "help yourself".
- **Hands off to:** every other scene. This is where the carried facts begin.
- **Note:** this replaces the two opening questions in the phone scene with a proper greeter scene; the
  phone scene then starts from "you were sent to me for a phone".

## G5. Checkout and billing
- **Pool:** ways to finish: pay now, add trade-in, add a care plan, split, gift receipt, invoice, decline.
- **Hard facts from the previous scene:** the confirmed phone, storage, colour and price (carried).
- **Questions:** trade in an old device; add a care plan `[verify]`; protection items (case, charger); how to pay.
- **Outcomes:** paid and bagged; payment failed (S7: limbo and escalation); customer leaves; sent back to the
  specialist (changed their mind).
- **Mandatory lines:** read-back of what is being paid; receipt and bag; sign-off.

## G6. Staff: fetch request (stock runner)
The simplest staff-staff scene and a good test of the engine with *no customer*.
- **Parties:** specialist asks, runner answers. **Pool:** locations and items matching a request.
- **Moves:** *request* (item, size or storage, colour, how many), *clarify* (which one exactly), *report*
  (found: bringing it; not found: alternatives or none), *acknowledge*.
- **Outcomes:** item brought; none in stock (feeds the customer's "out of stock" branch, S4); substituted.
- **Realism:** the runner's answer is a stock lookup, never a dice roll, so the customer scene and the staff
  scene agree.

## G7. Staff: the one-way radio task (not a conversation)
Ritesh's note: a quick message that assigns a task, not a back-and-forth. Proposed protocol, to settle with him:
`assign(to, task, from, details)` then `acknowledge` then `done(result)`; three message types, no menus of
questions, no turn-taking. Examples: "John will be with you in a moment" (customer handoff), "device in the
back for diagnosis" (technician), "table 3 needs restocking". The task becomes a stored row with a state
(`assigned`, `accepted`, `done`), so the customer scene can read it ("John is on his way"). The
conversation engine is not involved; the event log row per state change is.

## G8. Pickup and returns
- **Pickup (S9):** pool is the customer's open orders (from the case). Questions: name or order number,
  identity check `[verify]`. Outcomes: handed over; not ready (explain, offer a time); wrong item (escalate).
- **Returns:** pool is return outcomes (refund, exchange, store credit `[verify]`). Hard facts: when bought,
  condition, reason. Outcomes branch to purchase (exchange) or checkout (refund).

## G9. Escalation (manager)
- **Pool:** remedies the manager is allowed to offer `[verify]`. Questions: what happened, what would
  make this right. Outcomes: apology, small goodwill, "not much we can do" (the satire beat in S7), referral.
- **Mandatory:** the customer can always leave; the manager always signs off.

## H. Build order, with reasoning
1. **Extract the generic core while porting G3 (laptop).** Same pool shape, so the diff isolates what is
   truly phone-specific.
2. **G1 then G2 (service).** A new kind of pool (explanations) and facts that come from the world; proves
   the engine is not only for products.
3. **G4 (greeter) then G5 (checkout).** Closes the purchase journey end to end and starts the *case* that
   carries facts across scenes.
4. **G6 and G7.** Staff-to-staff, including the radio-task protocol.
5. **G8 and G9, then ambient talk.**

## I. Shared work these scenes force (do once, early)
- A **case** object that survives hand-offs (reuse the idea in ADR 4 and `src/server/cases.ts`).
- A **world facts** source for things that are not the customer's answers: stock, test results, queue state.
- A **scene definition** interface so a new scene is data plus a bank, not a copy of the engine.
- **Handoff messages** (G7) as stored tasks with a state.
- The **event log row** per state change, the moment any scene is wired to the server.
