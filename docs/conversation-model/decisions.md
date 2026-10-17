---
status: draft
what: Settled design decisions for the new conversation model (phone-specialist POC), from Ritesh's description and answers, 2026-10-17. Not an ADR; the ADR waits until the POC is approved.
date: 2026-10-17
source: Ritesh, this session (description, then answers 1 to 8 to the grilling questions). Claude's wording; check before it goes anywhere formal.
---

# Conversation model: settled so far

## Shape
- A conversation has exactly two parties: customer-customer (rare), customer-staff (most common, most complex), staff-staff (fairly common).
- Each kind has **subtypes** (greeting, phone specialist, billing, repair/genius, backroom, ...), each with its own model, a context set before it starts, and a goal.
- Phone specialist goal: narrow to a specific device (model + storage + colour), or the customer decides they want no device. Choosing a device ends the scene; a new conversation starts with whoever handles payment, or a new shopping goal.
- This POC is one subtype (buy a phone), about 5% of the whole. The point is the **system**, which later subtypes reuse.

## Turn model
- Every turn each side picks from a **menu**. No free text anywhere (it can't be tied to preconditions and effects). Customer throw-backs ("I'd want a Max") are menu items too.
- Staff pick a question from a bank, non-linearly. Asked questions grey out but can be reopened ("you said 1200-1500, still right?"); the customer may change the answer.
- Customer answers a multiple-choice question (often with "Not sure"; some questions allow several answers) and may also throw one back.
- Every line can carry an optional **tone** (friendly, apathetic, annoyed, ...). Tone slightly changes the NPC's behaviour and tendency to leave. The customer can always end the conversation, in any tone.
- Don't ask what you don't have to: start with "did you already have a phone in mind?". A customer can pick a device directly at any time, to demo it or finalise it.
- At 4 devices or fewer, staff can offer demos. Staff highlight the device's features during a demo; afterwards: choose it, demo another, or reopen questions.
- Questions narrow to device + storage + colour (storage moves price). Demos are by model only: the demo unit has no specific storage and may not be the customer's colour ("this demo is red, we have yours in stock").
- If the customer's requirements leave no device, staff nudge them to widen their preferences.

## Question bank
- Each question has **preconditions** and **effects** on a shared fact state and the candidate pool. This is how the bank is kept consistent and how devs find gaps. Staff see the live pool size and how much each question would narrow it.
- Bank is built by a loop of subagents generating sample conversations (3 per round) over real, sourced device data, until a round adds no new question type.

## NPCs
- NPCs loop on quasi-random but sensible choices: pick questions that genuinely narrow, offer demos with higher probability as the pool shrinks, reopen with low probability unless forced (contradiction or empty pool).
- A customer NPC has a hidden goal (target device, must-haves, budget) and never gives conflicting answers.

## POC
- Plain HTML chat-style page. Play as customer or staff against an NPC, or open two tabs as two humans (BroadcastChannel, throwaway). The real app needs real transport later.
- Replaces the current engine (`scripts/sim/`, `src/shared/conversation.ts`'s phones script, ADR 6's slot engine). ADR comes after Ritesh approves the POC.

## Success test
- Coverage: for every reachable pool, at least one askable question still narrows it. Report fact combinations that leave no device.
