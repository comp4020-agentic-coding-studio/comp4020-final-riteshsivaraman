---
status: draft
what: automated review of 40 simulated conversations (seeds 3000 to 3039)
date: 2026-10-17
source: .talk-runs/review1 read by a reviewing agent; its claims need checking
---

# Review 1: 40 simulated phone-store conversations

Read: all 40 transcripts in `.talk-runs/review1/` (001 to 040) and `docs/conversation-model/devices.json`. Each quote is copied from the transcript as "seed, turn". "t" = turn number. Counts are numbers of seeds (out of 40) where the pattern appears, checked with grep where a phrase was involved.

## Summary

Distinct patterns: 38. Blocker 5, major 14, minor 19.

| Category | Patterns | Blocker | Major | Minor |
|---|---|---|---|---|
| 1. Facts vs devices.json | 5 | 3 | 0 | 2 |
| 2. Logic and consistency | 15 | 2 | 9 | 4 |
| 3. Scope (billing, till) | 1 | 0 | 1 | 0 |
| 4. Repetition | 2 | 0 | 0 | 2 |
| 5. Tone and face | 5 | 0 | 1 | 4 |
| 6. Wording and robotic lines | 7 | 0 | 2 | 5 |
| 7. Menus | 3 | 0 | 1 | 2 |

Most serious:
1. Feature picks do not narrow the pool, so customers end up with phones that fail a feature they asked for (L1, 4 seeds).
2. Staff say false things about the range: no telephoto on the Pro models, and a claim that a phone fits when it is not in the range (F1, F2, F3).
3. Staff ignore the customer's opener or question in 9 to 10 seeds each (L8, L9), and the price/billing talk runs in 13 seeds, out of scope (S1).

---

## 1. Facts vs devices.json

### F1. False statement: no separate telephoto on any phone
- Severity: blocker. Seeds: 1 (3013).
- Quote: 3013 t3: "Let me see... none of these has a separate telephoto lens; they get 2x by cropping the main camera. Which colour would you like?" (customer had asked "Do any of these have a proper telephoto lens?")
- Why wrong: devices.json lists a separate 48MP Fusion Telephoto (100 mm, 4x) on the iPhone 18 Pro and 18 Pro Max. "None of these" is false for the range. The phrase "by cropping" is not in devices.json either (see F5).
- Fix: answer from the full range: "The iPhone 18 Pro and 18 Pro Max have a separate telephoto lens. The others get 2x from the main camera." Check: a telephoto question must return both 18 Pro models.

### F2. "Biggest / lightest / longest / only" scoped to a pool, stated as if it were the range
- Severity: blocker (the claim is false as the customer hears it). Seeds: 8 (3004, 3015, 3021, 3024, 3030, 3031, 3034, 3037).
- Quotes:
  - 3004 t5: "The iPhone 17 has the biggest screen of these at 6.3"." (17 is 6.3"; Air 6.5", 18 Pro Max 6.9", Duo 7.6" inner.)
  - 3037 t5: "Great. The iPhone Duo is the lightest of these at 254g. That leaves the iPhone Duo." (Duo is the heaviest model in devices.json at 254 g; Air is 165 g. Worst case in the set.)
  - 3030 t7: "Only the iPhone 18 Pro has a separate telephoto lens." (18 Pro Max also has one; true only within the 17 vs 18 Pro pair.)
- Why wrong: the pool had already been cut by the customer's choices (one colour, one line), so "of these" meant one or two phones. The customer asked about the whole range, and the answer is presented as a range fact. 3034 t11 has the same problem with the Pro Max as the "lightest of these" after the pool was cut to one phone.
- Fix: superlatives and "only" answer from the full seven-model list, or name the subset ("of the Lavender ones"). If the subset is one phone, say so, or do not offer the superlative. Menu items "Ask which is the lightest / biggest screen / longest battery" should not appear when only one model is left (see M3).

### F3. "It comes in ..." lists filtered by the customer's constraint, stated as the product's storage range
- Severity: blocker. Seeds: 7 (3002, 3016, 3017, 3018, 3019, 3023, 3031).
- Quotes: 3017 t15: "It comes in 512GB, 1TB, 2TB. Which would you like?" (18 Pro Max also comes in 256GB). 3002 t17: "It comes in 512GB, 1TB, 2TB. Which would you like?" (18 Pro also comes in 256GB). 3019 t13: "It comes in 256GB, 512GB. Which would you like?" (Pro Max also comes in 1TB and 2TB).
- Why wrong: devices.json storage tiers are 256 to 2TB for the 18 Pro and Pro Max, and 256 to 1TB for the Air. The lists were cut by the customer's minimum storage or budget, then presented as the product's range.
- Fix: say "You can get it in 512GB, 1TB or 2TB" when a filter applies, or list the full tiers and then the filtered ones. Check: "It comes in" must always list devices.json's full tier list for that model.

### F4. Partial spec figures without the qualifier
- Severity: minor. Seeds: 5 (3000, 3018, 3022, 3033, 3037).
- Quotes: 3000 t3: "The iPhone Duo has the longest video playback of these, up to 44 hours." (44 h is outer display only; inner is 31 h.) 3033 t9: "Great. Here it is: 2 rear camera lines; a 7.6" screen; a titanium frame; from A$3,499." (7.6" is the unfolded inner display; outer is 5.4".)
- Why: the Duo's figures depend on which display is in use. The customer is shopping for a foldable, so the qualifier matters.
- Fix: for the Duo, say "7.6-inch inside, 5.4-inch outside" and "44 hours on the outer display". Also say "from" when the quoted price is the 256GB price.

### F5. Telephoto explanation with an unsupported detail
- Severity: minor. Seeds: 3 (3013 t3, 3018 t11, 3027 t9).
- Quote: 3018 t11: "Most of our phones get their 2x zoom by cropping the main camera, which Apple calls optical-quality 2x. Only some have a separate telephoto lens as well."
- Why: devices.json says the 48MP main camera "also enables 12MP optical-quality 2x Telephoto". It does not say "cropping" and does not quote Apple's wording. The rest (only some have a separate lens) is correct.
- Fix: use devices.json's wording: "The main camera also gives an optical-quality 2x zoom. The 18 Pro and 18 Pro Max also have a separate telephoto lens."

---

## 2. Logic and consistency

### L1. Feature picks do not narrow the pool; customer then picks a phone that lacks the feature
- Severity: blocker. Seeds: 4 (3009, 3010, 3024, 3028).
- Quotes:
  - 3009 t6: "Smoother 120Hz screen, that's all I care about. Can we keep going?" The pool still lists the 17e: "Pool after: 13 options, 5 models (17, 18 Pro, 18 Pro Max, 17e)". The 17e has no ProMotion (devices.json). Customer then picks the 17e (t10, t12).
  - 3010 t8: "Maybe dynamic Island?" Pool after "8 options, 2 models (16, 17e)"; the 17e has no Dynamic Island.
  - 3028 t4 then t6: t4 "Smoother 120Hz screen, please." (pool correctly drops 17e and 16); t6 "Compact. Can we keep going?" Pool after "11 options, 2 models (17e, 16)": the 120Hz pick is lost and both phones come back. t8 customer: "The iPhone 17e." Staff t9: "Here it is: 1 rear camera line; a 6.1" screen; an aluminium frame; from A$1,149." Nobody mentions the refresh rate.
- Why wrong: the pool recomputes from the latest answer only, and a feature pick is not applied as a filter in 3009, 3010 and 3024 (Camera Control: 3024 t8 "Camera Control button, that's all I care about." keeps the 17e, which has no Camera Control). A customer then accepts a phone that fails their own stated want.
- Fix: keep every hard feature pick as a filter; recompute the pool from all answers each turn. Test: after "Smoother 120Hz" the pool contains only 17, Air, 18 Pro, 18 Pro Max (and Duo). After any later answer that set still holds. A customer can only be offered and can only pick a phone that satisfies every feature they named.

### L2. "N phones fit" list is wrong and drops the customer's target
- Severity: blocker. Seeds: 1 (3024).
- Quote: 3024 t19: "That's fine. 2 phones fit: iPhone 17, iPhone 18 Pro Max. Want to try any?" Pool after that line: "9 options, 4 models (16, 17, 18 Pro Max, 17e)".
- Why wrong: the count says 2 and the pool says 4 models. The iPhone 16 is missing, and it is this customer's goal (16, 128GB, Black).
- Fix: build the "fit" list from the same pool the count uses. Check: the number of names listed equals the number of models in the pool line.

### L3. Staff confirms a phone the customer never accepted
- Severity: major. Seeds: 1 (3036).
- Quote: 3036 t18: "Not that one, I think. Can we keep going?" then t19: "That's fine. So that's the iPhone 16, 128GB, White, A$1,349. I'll check we have it in stock. Is that right?"
- Why: the customer only rejected the 17e. Staff then treated the 16 as chosen without showing it or asking. The 16 was listed but never offered on its own.
- Fix: after a rejection, offer the remaining phone with "Would you like to look at the iPhone 16?" (or a demo) before any confirm line.

### L4. Customer asks to compare phones that their own earlier answer already excluded
- Severity: major. Seeds: 3 (3019, 3034 strong; 3024 weak).
- Quotes: 3019 t4: "Burgundy, please. How do the iPhone 17e and the iPhone 17 compare?" (Burgundy is only on the 18 Pro and Pro Max per devices.json.) 3034 t8: "256GB or more. How do the iPhone 16 and the iPhone 17 compare?" (iPhone 16 only comes in 128GB.) 3024 t22 (weak): "Not that one, I think. How do the iPhone 17 and the iPhone 18 Pro Max compare?" (17 was rejected one turn earlier).
- Why wrong: the rule is that a customer never asks about a phone its own answer ruled out. Staff then answer with specs for the excluded phone (3034 t9: "The iPhone 16 has a 6.1" screen from A$1,349; ...").
- Fix: when a customer asks to compare, compare only phones still in the pool. If one is excluded, say "That one doesn't come in Burgundy."

### L5. Customer states a budget above their own hard maximum (or buys over it)
- Severity: major. Seeds: 5 (3003, 3018, 3023, 3037, 3039).
- Quotes:
  - 3003 t12: "No more than A$2,700." (goal maxPrice 1700.)
  - 3018 t4: "Maybe around A$4,300?" (goal maxPrice 3300.)
  - 3023 t16: "A$4,500 at the most." (goal maxPrice 3500.)
  - 3037 t10: "A$6,000 at the most." (goal maxPrice 5900.)
  - 3039 t6: "The 512GB." (Air 512GB is A$2,299; goal maxPrice 2000. No budget was ever asked in this conversation.)
- Why wrong: the customer's hard limit is hidden but the customer's own statements exceed it. Seed 3039 shows the other half: staff never asked budget, so the customer walked into a phone over the limit.
- Fix: budget is asked before a phone is confirmed, and the customer's stated budget must not exceed the hidden maximum (the generator should cap "No limit" and "Set my own budget" at or below maxPrice). Check: the confirmed price is <= the stated budget in every conversation.

### L6. Settled questions asked again; answers reopened without any reason
- Severity: major. Seeds: 4 (3023, 3024, 3027, 3029).
- Quotes:
  - 3023 t6 to t7: customer "Black. Can we keep going?" then staff "Sure thing. Is there a colour that catches your eye?" (colour was already answered; customer repeats "Black." at t8).
  - 3024 t6 to t12: customer "Compact. Can we keep going?" then staff t11 "That's fine. What screen size are you after?" then customer t12 "I'm not sure." (the earlier answer is contradicted, and the pool jumps from 11 options back to 73).
  - 3029 t12 to t14: customer "A$2,300 at the most. Can we keep going?" then staff t13 "Great. Standard phone, or are you open to a foldable?" (Reopen: form factor, after the phone was chosen). Customer t14: "I'd be open to a foldable." (earlier t4: "A standard phone."). The pool stays at 1 model (Pro Max), and the customer confirms a standard phone.
  - 3027 t16 to t17: customer "This one will do." then staff "Standard phone, or are you open to a foldable?" (form factor was already "I'm not sure" at t8).
- Why wrong: the staff reopens a settled question after the customer has signalled they want to move on. Answers change, but the pool does not update.
- Fix: never reopen a question the customer has answered unless the customer asks to change it. A reopen must update the pool and say what changed.

### L7. Dead end: customer leaves while a phone still fits, with no staff recovery
- Severity: major. Seeds: 2 (3027, 3028).
- Quotes: 3027 t18: "I'll leave it there, thanks. Can we keep going?" (TOOK: Leave). 3028 t12: "I'll leave it there, thanks. Can we keep going?" (TOOK: Leave).
- Why wrong: in both cases the goal (17e, 256GB, Soft Pink, under A$1,200 or A$1,300) was reachable. In 3027 the staff reopened form factor and never asked storage. In 3028 the customer left at the storage step after picking the 17e. Both lines also contradict the leave ("leave it there ... Can we keep going?"). Staff's sign-off does not ask why.
- Fix: the leave option is offered only after the staff has asked for the storage or colour still open. The generator should not produce "Can we keep going?" in a leave line (see W2).

### L8. Customer's opener ignored (range or known model)
- Severity: major. Seeds: 9 (3009, 3011, 3016, 3018, 3019, 3021, 3022, 3025, 3035).
- Quotes:
  - 3011 t2 to t3: "Hi. I know roughly which range I want. Which of these is the lightest?" then staff: "The iPhone Air is the lightest of these at 165g. Is there a colour that catches your eye?" (the "Ask: model family" entry was on the menu and never picked.)
  - 3016 t2 to t3: "Hi. I've got a phone in mind already." then staff: "What's the most you'd like to spend?"
  - 3018 t2 to t3: "Hi. I think I know which one I want?" then staff: "What's the most you'd like to spend?"
- Contrast that works: 3039 t3, "Sure thing. Which line are you thinking of?" (after "I know roughly which range I want.").
- Fix: when the opener is "known model" or "know the range", the next staff line asks which model or line. Check: the staff's next line in those seeds is "model family" or "known model".

### L9. Customer's question ignored ("What have you got?" / "What do you have?")
- Severity: major. Seeds: 10 (3003, 3004, 3005, 3008, 3010, 3015, 3023, 3028, 3031, 3036).
- Quotes: 3003 t2 to t3: "Hi. Not yet, no. What have you got?" then "That's fine. Standard phone, or are you open to a foldable?" 3015 t2 to t3: "Hi. No, not really. What do you have?" then "That's fine. What screen size are you after?" 3028 t2 to t3: "Hi. Not yet, no. What have you got?" then "Do any of these matter to you?" (no lead-in).
- Why wrong: the customer asked what the store has. Nothing answers it, and "That's fine." reads as agreeing with a question nobody asked.
- Fix: for an open "what have you got" the staff gives a short overview (the seven models, from A$1,149 to A$5,899 as devices.json has them) and then asks one question.

### L10. Premature recommendation
- Severity: major. Seeds: 10 (3002, 3007, 3014, 3017, 3019, 3022, 3023, 3024, 3025, 3026).
- Quotes: 3002 t9: "That's fine. I'd suggest the iPhone Air: 1 rear camera line; a 6.5" screen; a titanium frame; from A$1,899. Does that sound right?" (asked after storage 512GB+ and "not sure" about foldable; no use or budget asked). 3007 t5: "Great. I'd suggest the iPhone 16: 2 rear camera lines; ..." (after "A standard phone." only). 3026 t7: "Sure thing. I'd suggest the iPhone 18 Pro Max: up to 43 hours of video playback; ..." (form factor is asked at t9 after the recommendation). 3024 t17: "That's the listed price, I'm afraid. I'd have to check on any deals, and I can't promise one. I'd suggest the iPhone 18 Pro: 211g; ..." (a price question answered with an upsell to a A$2,099 phone; the customer's hidden maximum is A$1,700).
- Why wrong: a recommendation before the basics (use, budget, form factor) is asked, sometimes a more expensive phone right after a price question.
- Fix: no recommendation until use or budget has been asked and answered. Never recommend a phone above a budget the customer has named. Form factor is asked before any recommendation.

### L11. "Do any of these matter to you?" with no list, asked before budget or use
- Severity: major. Seeds: 7 (3009, 3010, 3023, 3024, 3026, 3028, 3036).
- Quotes: 3009 t5: "Do any of these matter to you?" 3036 t11: "OK. Do any of these matter to you?" 3028 t3: "Do any of these matter to you?"
- Why wrong: "these" has no referent in the line; the list is on the menu only. Hardware features are a technical question asked before basics (use, budget).
- Fix: "Are any of these things important: Camera Control, Dynamic Island, a 120Hz screen?" or move hardware features after use case and budget.

### L12. Colour asked first; a single colour answer collapses the search
- Severity: minor. Seeds: 10 (3001, 3004, 3008, 3012, 3019, 3032, 3034, 3035, 3037, 3038).
- Quotes: 3001 t3: "Is there a colour that catches your eye?" (first question after "Just looking"). 3008 t5: "OK. So that's the iPhone 16, 128GB, Pink, A$1,349. I'll check we have it in stock. Is that right?" (after colour only). 3032 t5: "Let me see... the iPhone 17 comes in 256GB, 512GB. Which would you like?" (after "Maybe Sage?", the customer asked for help).
- Why wrong: colour is a cosmetic, late question for most customers, and a single colour pick should not jump to one phone. The customer in 3032 asked for help and got no questions about use or budget.
- Fix: colour comes after model or use case, and a colour pick narrows the pool without triggering a confirm unless one phone is left and the customer has named a model.

### L13. Budget asked after the phone is already the only option
- Severity: minor. Seeds: 7 (3014, 3019, 3020, 3023, 3029, 3037, 3038).
- Quotes: 3020 t10 to t11: "This could be the one." then "What's the most you'd like to spend?" (pool: 2 options, 1 model, the 17e). 3038 t8 to t9: "This could be the one." then "What's the most you'd like to spend?" (pool: 3 options, 1 model, the Air).
- Why: the answer cannot change the outcome and reads as an afterthought.
- Fix: ask budget before the demo, or drop the question when one model is left and its price is under the budget.

### L14. Garbled "nothing fits" line after a rejection
- Severity: minor. Seeds: 1 (3007).
- Quote: 3007 t13: "Sorry, nothing fits a standard phone, Light Gold. How do you want to go?"
- Why: the Light Gold Air fit until the customer said "It's not really for me, sorry." (t12). The line is ungrammatical and does not say the 18 Pro does not come in Light Gold (devices.json 18 Pro colours: Black, Silver, Glacier, Burgundy).
- Fix: "Nothing else in Light Gold fits what you asked for. The 18 Pro doesn't come in Light Gold. Want to look at something close?"

### L15. Customer's stated storage minimum below the hidden minimum
- Severity: minor (sim consistency). Seeds: 4 (3002, 3017, 3018, 3031).
- Quotes: 3031 t6: "I'd want 512GB or more, I think. Thanks!" (goal minGB 2048). 3018 t8: "Maybe 512GB or more?" (goal minGB 1024). 3017 t4: "I'd want 512GB or more, I think." (goal minGB 2048).
- Why: the customer ends on the 2TB or 1TB phone, so no visible error, but the stated need is looser than the hidden want.
- Fix: in the persona, state the minimum that matches the hard want, or say "1TB or more" when minGB is 1024 or more.

---

## 3. Scope: billing, deals and the till

### S1. Price and deal talk, repeated, with a "room on the price" customer question
- Severity: major. Seeds: 13 (staff line in 13 seeds; customer asks "room on the price" in 13 seeds).
- Quotes: 3019 t9: "That's the listed price, I'm afraid. I'd have to check on any deals, and I can't promise one. Would you like to have a look at it?" 3019 t13 and t15 repeat "That's the listed price, I'm afraid. I'd have to check on any deals, and I can't promise one." (three times in one conversation). 3006 t6: "Yes, please. Is there any room on the price?" (asked again at t10 and answered at t11 with the same line).
- Why wrong: billing, trade-in and payment are out of scope; staff should hand over to the till. "I'd have to check on any deals" also promises something the store has not said.
- Fix: remove "Ask whether there is room on the price" from the customer menu. Staff answers any price question with one fixed line: "Pricing and payment are handled at the till." then the till handover.

---

## 4. Repetition

### R1. Same spec list repeated within one conversation
- Severity: minor. Seeds: 2 (3014, 3019), with a partial repeat in 3030.
- Quotes: 3019 t5: "...I'd suggest the iPhone 18 Pro Max: 3 rear camera lines, including a separate telephoto lens; a 6.9" screen; an aluminium frame; from A$2,299." then t11: "Sure thing. Here it is: 3 rear camera lines, including a separate telephoto lens; a 6.9" screen; an aluminium frame; from A$2,299." 3014 t11 and t15 are the same.
- Fix: the demo gives something new (the battery, the camera) or says "Here it is" with only the phone.

### R2. Phone name repeated after "it" should be used
- Severity: minor (needs Ritesh's decision: the rule says "it"; confirm lines name the phone in 37 seeds). Seeds: 37.
- Quotes: 3000 t15: "Sure thing. So that's the iPhone 18 Pro Max, 256GB, Black, A$2,299. I'll check we have it in stock. Is that right?" (named at t9). 3037 t5: "Great. The iPhone Duo is the lightest of these at 254g. That leaves the iPhone Duo." (two names in one line).
- Fix: decide whether confirm lines may name the phone. If not, say "So that's it: 256GB, Black, A$2,299." Never name the phone twice in one line (3034 t11: "The iPhone 18 Pro Max is the lightest of these at 249g. The iPhone 18 Pro Max comes in ...").

---

## 5. Tone and face

### T1. Staff tone "impatient" on the greeting and plain lines
- Severity: major. Seeds: 10 (3004, 3008, 3012, 3013, 3017, 3027, 3028, 3029, 3036, 3037); 13 lines.
- Quotes: 3028 t1: "Hi, welcome in. I'm on the phones table. Did you already have a phone in mind?" (tone impatient, face focused). 3029 t7: "OK. What screen size are you after?" (impatient, focused). 3036 t11: "OK. Do any of these matter to you?" (impatient, focused).
- Why: the staff persona reads as short with the customer on the first line, and a "customer" who just arrived is greeted with impatience. People would notice that as rudeness.
- Fix: staff tones on greeting and on question lines are friendly or neutral. "impatient" is for the customer only.

### T2. "Let me see..." filler with no lookup to do
- Severity: minor. Seeds: 11.
- Quotes: 3028 t5: "Let me see... what screen size are you after?" 3033 t3: "Let me see... which colour would you like?" 3022 t5: "Let me see... i'd suggest the iPhone 18 Pro Max: ..."
- Fix: drop "Let me see..." unless a lookup is needed (stock check, price).

### T3. "That's fine." or "OK." used as a lead-in that does not fit
- Severity: minor. Seeds: 13 for "That's fine."; 11 for "OK.".
- Quotes: 3015 t3: "That's fine. What screen size are you after?" (after "What do you have?"). 3014 t7: "That's fine. Standard phone, or are you open to a foldable?" (after "Not that one, I think. Can we keep going?"). 3036 t19: "That's fine. So that's the iPhone 16..." (after a rejection).
- Fix: a lead-in must answer what was just said. "That's fine" only after an acceptable answer; after a rejection, "Understood."

### T4. Enthusiasm on a tentative or price answer
- Severity: minor. Seeds: 3 (3013, 3018, 3033).
- Quotes: 3033 t7: "Good choice. Would you like to have a look at it?" (after "Maybe the 512GB?"). 3013 t7: "...Good choice. Would you like to have a look at it?" (after the price question). 3018 t9: "Great. What will you mainly use it for?" (after "Maybe 512GB or more?").
- Fix: match the lead-in to the customer's confidence: "Sounds good." for a firm yes only.

### T5. Customer tone does not match the words
- Severity: minor. Seeds: 2 (3001, 3025).
- Quotes: 3001 t2: "Hi. Just looking, thanks." (tone impatient, face focused). 3025 t2: "Hi. I know roughly which range I want." (tone impatient, face focused).
- Fix: greetings from the customer are neutral or friendly unless a prior turn sets impatience.

---

## 6. Wording and robotic lines

### W1. "Here it is:" spec-fragment template
- Severity: major. Seeds: 27 (every demo line).
- Quotes: 3003 t15: "Sure thing. Here it is: 170g; a 6.1" screen; an aluminium frame; from A$1,349. The demo unit might not be the colour we'd get you, and I'd have to check what's in stock. What do you think?" 3031 t15: "Here it is: 211g; a 6.3" screen; an aluminium frame; from A$2,099." 3027 t15: "OK. Here it is: 1 rear camera line; 170g; a 6.1" screen; an aluminium frame."
- Why it reads badly: semicolon fragments, no verbs, the same order every time, and "1 rear camera line" reads like a spec sheet. "The demo unit might not be the colour we'd get you" is repeated in nearly every demo.
- Fix: one short sentence per fact, and vary what leads ("The 17e is 170 grams with a 6.1-inch screen"). Keep the stock line but say it once per conversation.

### W2. "Can we keep going?" tacked onto customer answers
- Severity: major. Seeds: 16 (most of them with a rejection or leave).
- Quotes: 3000 t6: "Black. Can we keep going?" 3001 t12: "I think I'll leave it, thanks. Can we keep going?" 3027 t18: "I'll leave it there, thanks. Can we keep going?"
- Why: it is a stock phrase, it is not a question the customer would ask here, and after a leave it contradicts the leave.
- Fix: drop the phrase, or make it "Let's keep going" only when the customer has not left. Never after "leave".

### W3. Capitalisation and punctuation
- Severity: minor. Seeds: 2.
- Quotes: 3022 t5: "Let me see... i'd suggest the iPhone 18 Pro Max: ..." (lower-case "i'd" starting a sentence). 3018 t2: "Hi. I think I know which one I want?" (question mark on a statement).
- Fix: capitalise sentence starts; a trailing "?" only for a question.

### W4. Stacked lines (answer, facts, and question in one line)
- Severity: minor. Seeds: 3 (3019, 3029, 3030).
- Quotes: 3030 t7: "Sure thing. The iPhone 17 has a 6.3" screen from A$1,549; the iPhone 18 Pro has a 6.3" screen from A$2,099. Only the iPhone 18 Pro has a separate telephoto lens. Video playback is up to 30 hours on the iPhone 17 and 34 on the iPhone 18 Pro. 2 phones fit: iPhone 17, iPhone 18 Pro. Want to try any?"
- Fix: split into two turns or cut the fact list to the one the customer asked about.

### W5. Greeting says "I'm on the phones table"
- Severity: minor. Seeds: 40 (identical greeting in all 40).
- Quote: "Hi, welcome in. I'm on the phones table. What brings you in today?"
- Why: "on the phones table" is unusual wording for a store, and the identical greeting in all 40 makes the set feel scripted.
- Fix: "Hi, welcome in. Can I help you find something?" and vary it.

### W6. Empty customer turn
- Severity: minor. Seeds: 1 (3022 t8).
- Quote: 3022 t8: "Go on." (standing action "TOOK: Carry on"). The customer adds nothing after the staff answer.
- Fix: the carry-on action should not produce a customer line; staff continue on their own.

### W7. Pool label grammar and mismatch (not spoken, but visible to a reviewer)
- Severity: minor. Seeds: 40 (the pool line in every turn).
- Quotes: "Pool after: 1 options, 1 models (17e)" (3014 and others). "Pool after: 73 options, 7 models (17e, 16, 17, Air)" (3000 t1) lists 4 names for 7 models. 3028 t4: "73 options, 7 models (17, Air, 18 Pro, 18 Pro Max)".
- Fix: "1 option, 1 model", and the names list has the same count as the models count.

---

## 7. Menus

### M1. Menu offers a model that devices.json does not have
- Severity: major. Seeds: 3 (3006 t2, 3013 t2, 3033 t2).
- Quote: 3006 t2 menu: "Name the iPhone Duo | ... | Ask about the iPhone 16 Plus | (+4 more)".
- Why: the iPhone 16 Plus is not in devices.json, so the store cannot say anything about it under the rules (staff say facts only from devices.json). The customer should not be able to ask about a phone the store does not sell in this scene.
- Fix: remove "Ask about the iPhone 16 Plus" from the customer menu, or add it to devices.json with a source.

### M2. Unexplained menu labels
- Severity: minor. Seeds: 5 (size fit check in 4; battery priority in 1).
- Quotes: 3015 t5 staff menu: "Ask: size fit check". 3026 t5 staff menu: "Ask: battery priority".
- Why: neither label is clear, and neither was picked in any seed where it appeared.
- Fix: rename to what it does or remove it from the menu.

### M3. Superlative and clutter menu entries
- Severity: minor. Seeds: most seeds for the clutter; 2+ for the superlatives.
- Quotes: 3005 t12 menu: "Colour: Soft Pink | Ask for Burgundy (not in this model) | Ask for Cloud White (not in this model) | Ask for Glacier (not in this model) | Ask for Lavender (not in this model) | Ask for Light Gold (not in this model) | (+11 more)". Also "Ask which is the lightest" offered when one phone is left (3037 t4).
- Why: 15+ "not in this model" entries make the menu hard to read, and superlative questions on one phone are meaningless (see F2).
- Fix: show only colours the model has. Offer superlative questions only when two or more models are in the pool.

---

## Things that looked good

- Every conversation opens with the staff greeting and ends with a staff sign-off that matches the outcome ("Great choice. I'll take you across to the till..." after a sale; "No worries at all. I'm here if you want another look." after a leave).
- Prices and specs stated in the demo and confirm lines match devices.json in every case I checked (for example 3000 t11 and t15, 3016 t9, 3031 t15, 3034 t15), and storage tiers listed for the phone itself match the tiers in devices.json.
- Pool counts are correct in the arithmetic checks I made (3005 t4: 20 options under A$1,900; 3003 t6: 13 black options; 3020 t6: 5 white options; 3010 t6: 8 options under A$1,500), and most colour picks are real colours for the model.
