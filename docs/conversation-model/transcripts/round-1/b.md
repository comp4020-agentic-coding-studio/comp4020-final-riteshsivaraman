---
status: working
what: Sample conversation B (customer arrives with a model in mind, impatient, switches model after one demo) to design the question bank.
date: 2026-10-17
source: docs/conversation-model/devices.md only
---

# Scenario B: customer arrives with a model in mind

Outcome: customer opens on 18 Pro Max, stays unsure on fit, gets a demo of the 18 Pro, switches to 18 Pro 512GB Glacier.
Tone shifts: staff apathetic then recovering (S1 to S5); customer impatient then warming (C1 to C10).

## Transcript

S1 | STAFF | apathetic | move=ask | qtype=opening_intent
Hi. What brings you in?
opts:
- I know which phone I want
- I want help choosing
- I'm just looking
- I need something else (repair, accessory, etc.)

C1 | CUST | impatient | picks=I know which phone I want | throwback=none
I know what I want, thanks.

S2 | STAFF | neutral | move=ask | qtype=known_model
Okay, which one?
opts:
- iPhone Duo
- iPhone 18 Pro
- iPhone 18 Pro Max
- iPhone Air
- iPhone 17
- iPhone 17e
- iPhone 16
- Not sure of the name

C2 | CUST | impatient | picks=iPhone 18 Pro Max | throwback=none
The 18 Pro Max.

(Staff reasoning, not a line: model is set, so no budget, screen-size, camera, chip or tier questions. Remaining unknowns are storage, colour, and whether the Pro Max really suits. Fit check goes before storage, because a model change would change the storage and colour lists and the prices.)

S3 | STAFF | neutral | move=ask | qtype=size_fit_check
Good choice. It's the biggest of the Pro range at 6.9". Is that size what you're after?
opts:
- Yes, I want the big screen
- I'd rather something easier to hold
- Not sure

C3 | CUST | impatient | picks=Not sure | throwback=Is the bigger one worth the extra money?
Not sure. Is the bigger one worth the extra money?

S4 | STAFF | apathetic | move=clarify | qtype=none
It's about $200 more than the 18 Pro at each storage tier. Same A20 Pro chip and same camera system, so what you pay for is the 6.9" screen versus 6.3". Exact Pro Max prices I'd need to confirm.

C4 | CUST | impatient | picks=(no menu question pending; picks canned action) Can I try the smaller one? | throwback=none
Can I try the smaller one?

S5 | STAFF | enthusiastic | move=offer_demo | qtype=demo_model_confirm
Sure, that'd be the 18 Pro. Want me to grab it, or would you rather see another model?
opts:
- Yes, the 18 Pro
- A different model (pick from the list)
- No demo, just keep going with the Pro Max

C5 | CUST | neutral | picks=Yes, the 18 Pro | throwback=none
Yes, the 18 Pro.

S6 | STAFF | enthusiastic | move=demo_highlight | qtype=none
Here's the 18 Pro. 6.3" screen, so it's easier in the hand, and it's still the A20 Pro chip. You get the same triple camera as the Pro Max: Main with variable aperture, Ultra Wide and Telephoto. It's an aluminium unibody. I'll check what colour this demo unit is versus what we have.

C6 | CUST | neutral | picks=(canned reaction) That feels about right | throwback=none
That feels about right.

S7 | STAFF | friendly | move=ask | qtype=model_decision_after_demo
So, which way are you leaning?
opts:
- Go with the 18 Pro
- Stay with the 18 Pro Max
- Compare them again
- See another model
- Not sure

C7 | CUST | warming | picks=Go with the 18 Pro | throwback=none
I'll go with the Pro.

(Staff reasoning: model is now fixed. Customer never gave a budget or camera need, and neither matters any more, so neither is asked.)

S8 | STAFF | friendly | move=ask | qtype=storage_pick
Great. What storage do you want?
opts:
- 256GB
- 512GB
- 1TB
- 2TB
- Not sure

C8 | CUST | warming | picks=512GB | throwback=none
512GB.

S9 | STAFF | friendly | move=ask | qtype=colour_pick
And the colour? The 18 Pro comes in these.
opts:
- Burgundy
- Glacier
- Silver
- Black
- Not sure

C9 | CUST | warming | picks=Glacier | throwback=none
Glacier.

S10 | STAFF | friendly | move=close | qtype=confirm_final_choice
iPhone 18 Pro, 512GB, Glacier, $2,499. I'll check we have that one in stock. Is that right?
opts:
- Yes, that's it
- Change the colour
- Change the storage
- Change the model
- Never mind, I don't want a phone

C10 | CUST | enthusiastic | picks=Yes, that's it | throwback=none
Yes, that's the one.

Turns: 20 lines (10 staff, 10 customer).

## Question types used

| qtype | text | options | multi? | PRECONDITION | EFFECT | NEEDS DATA |
|---|---|---|---|---|---|---|
| opening_intent | What brings you in? | I know which phone I want / I want help choosing / I'm just looking / I need something else | no | Start of conversation | Sets path: "know which phone" skips narrowing and goes to known_model; "help choosing" starts full narrowing | "Something else" path (repair, accessories) is outside the sheet |
| known_model | Which one? | The 7 models + Not sure of the name | no | Customer said they know what they want; model not yet named | Sets model; eliminates the other 6 models. "Not sure of the name" falls back to narrowing | none |
| size_fit_check | Is that size what you're after? (names the screen size of the chosen model) | Yes, want big screen / Rather something easier to hold / Not sure | no | Model chosen is one with a screen-size alternative in the sheet (e.g. 18 Pro Max 6.9" vs 18 Pro 6.3"); fit not yet confirmed | "Yes" locks the model. "Easier to hold" re-opens model and points at smaller screens (6.3": 18 Pro, 17; 6.1": 17e, 16; 5.4" outer on Duo). "Not sure" allows offer_demo | Weight of all models except Duo, one-hand comfort. Sheet has screen sizes only |
| demo_model_confirm | Want me to grab it, or see another model? | Yes, [suggested model] / A different model / No demo | no | At 4 or fewer candidate models, or the customer asks for a demo | Sets demo target (model only). Demo unit has no specific storage and may be a different colour | Demo unit colour and stock levels |
| model_decision_after_demo | Which way are you leaning? | Go with [demoed model] / Stay with [prior model] / Compare again / See another model / Not sure | no | A demo has just finished | Sets or reopens the model | none |
| storage_pick | What storage do you want? | The storage tiers the chosen model has in the sheet (+ Not sure) | no | Model fixed, storage not yet set. Never asked for 16 (only 128GB, nothing to choose) | Sets storage and price. On 18 Pro: 256GB $2,099 / 512GB $2,499 / 1TB $3,299 / 2TB $4,499. "Not sure" leads to a clarify | How much storage typical usage needs (photos, video, apps), trade-in values |
| colour_pick | And the colour? | Colours the chosen model has in the sheet (+ Not sure) | no | Model fixed, colour not set | Sets colour. 18 Pro: Burgundy, Glacier, Silver, Black | Stock per colour, which colour the demo unit is |
| confirm_final_choice | Model, storage, colour, price. Is that right? | Yes / Change colour / Change storage / Change model / No phone | no | Model, storage and colour all set | Ends conversation with a choice, or reopens a field, or ends with no phone | Stock for the exact config |

## Customer throw-backs used

- "Is the bigger one worth the extra money?" (answered only from the sheet: Pro Max is about $200 higher than the Pro at each tier, same chip and same camera system, screen is 6.9" vs 6.3". Exact Pro Max prices are [TK] in the sheet.)
- Canned actions used at C4 and C6, which probably belong in the throw-back menu too: "Can I try the smaller one?" and "That feels about right."

## Things staff could have asked but didn't

- budget (price ceiling): not asked, since the customer already named a model and storage and colour decide the price anyway
- screen size preference: replaced by size_fit_check, which is tied to the chosen model
- camera needs (telephoto or not): the 18 Pro and Pro Max have identical camera systems, so it would not have narrowed the choice
- chip or tier preference: model already known
- storage usage ("how many photos and videos do you keep?"): would help the "Not sure" storage case but needs a mapping not in the sheet
- trade-in / current phone: trade-in values not in the sheet
- accessories or care plan: prices not in the sheet
- colour preference before the demo: skipped, because colours depend on the final model (Pro and Pro Max share colours, but a switch elsewhere would not)

## Assumptions I made

- Pro Max colours: sheet says "same as 18 Pro", so they would have been the same four. Not needed in the transcript.
- I did not state any exact Pro Max price. S4 gives only "about $200 more at each tier", which is the sheet's wording; exact figures are [TK].
- "Easier to hold" for 6.3" vs 6.9" is the customer's framing and staff's common-sense reading of screen size, not a sheet fact. The sheet has no weight for the Pro or Pro Max.
- S6 "easier in the hand" is mild inference from the screen size difference; if this is too strong, replace with "smaller screen, 6.3"".
- Whether the demo unit is Glacier or any other colour is UNKNOWN. Staff say they'll check.
- Stock for 18 Pro 512GB Glacier is UNKNOWN. Staff say they'll check.
- That customer may decline to answer, or that "Not sure" on size_fit_check should lead to a demo: design assumption, not a sheet fact.
