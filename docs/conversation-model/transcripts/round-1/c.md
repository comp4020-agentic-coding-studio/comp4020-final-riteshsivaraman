---
status: draft
what: Round 1 sample conversation C (requirements conflict with catalogue, ends without purchase). Input for question-bank design.
date: 2026-10-17
source: docs/conversation-model/devices.md only
---

# Scenario C: foldable on a tight budget, pool hits zero, customer leaves

Pool tracking in [brackets] after each customer turn. Full pool = Duo, 18 Pro, 18 Pro Max, Air, 17, 17e, 16.

## Transcript

S1 | STAFF | friendly | move=ask | qtype=form_factor
Hi there! What kind of phone are you picturing?
opts:
- A foldable
- A big-screen phone
- A slim, light phone
- A compact phone
- Just a regular phone
- Not sure yet

S2 | CUST | enthusiastic | picks=A foldable | throwback=none
A foldable, definitely. [pool: Duo]

S3 | STAFF | friendly | move=ask | qtype=budget_ceiling
Great, what's the most you'd like to spend?
opts:
- Up to $1,500
- Up to $2,000
- Up to $2,500
- Up to $3,500
- Over $3,500
- Not sure

S4 | CUST | neutral | picks=Up to $2,000 | throwback=none
Up to two grand. [pool: none, Duo starts at $3,499]

S5 | STAFF | neutral | move=nudge_relax | qtype=relax_requirement
The only foldable we have, the iPhone Duo, starts at $3,499, so nothing foldable fits under $2,000. Which would you be happier to give up?
opts:
- Lift my budget
- Drop the foldable
- Keep both
- Not sure

S6 | CUST | impatient | picks=Keep both | throwback=Can you do a better price?
I want both. Can you do a better price?

S7 | STAFF | neutral | move=nudge_relax | qtype=relax_requirement
I'd have to check on any deals, and I can't promise one. What I can say is the Duo is $3,499 for 256GB, and the next-cheapest phones are well under your $2,000. If I have to pick one to move, which is it?
opts:
- Lift my budget
- Drop the foldable
- Keep both
- Not sure

S8 | CUST | apathetic | picks=Drop the foldable | throwback=none
Fine, drop the foldable. [pool: Air, 17, 17e, 16; at or under $2,000: Air from $1,899, 17 from $1,549, 17e from $1,149, 16 at $1,349. 18 Pro $2,099 and 18 Pro Max out.]

S9 | STAFF | friendly | move=ask | qtype=screen_size_pref
No worries. How big a screen do you want?
opts:
- Smaller (around 6.1")
- Medium-large (6.3" to 6.5")
- Not sure

S10 | CUST | unsure | picks=Not sure | throwback=none
Not sure, honestly. [pool unchanged: Air, 17, 17e, 16]

S11 | STAFF | friendly | move=ask | qtype=camera_setup
What about the cameras? How many on the back would you like?
opts:
- Two (main + ultra wide)
- One is fine
- Not sure

S12 | CUST | unsure | picks=Not sure | throwback=none
Not sure. [pool unchanged: Air, 17, 17e, 16]

S13 | STAFF | friendly | move=ask | qtype=storage_need
How much storage do you reckon you need?
opts:
- 128GB is enough
- 256GB
- 512GB or more
- Not sure

S14 | CUST | neutral | picks=256GB | throwback=none
256GB. [pool: Air, 17, 17e; 16 only comes in 128GB so it is out]

S15 | STAFF | enthusiastic | move=offer_demo | qtype=offer_demo
That leaves three phones, so you can try one in hand. Which would you like to see?
opts:
- iPhone Air
- iPhone 17
- iPhone 17e
- No demo, thanks

S16 | CUST | neutral | picks=iPhone 17 | throwback=none
Let me try the 17.

S17 | STAFF | enthusiastic | move=demo_highlight | qtype=demo_reaction
Here's the iPhone 17. It has a 6.3" screen, the A19 chip, an aluminium frame and a dual rear camera (Main + Ultra Wide). It comes in Lavender, Mist Blue, White, Sage and Black. I'd have to check which colour this demo unit is. 256GB is $1,549. What do you think?
opts:
- This could be the one
- Show me another
- Not for me

S18 | CUST | annoyed | picks=Not for me | throwback=Does the bigger one cost much more?
Not really for me. Does the bigger one cost much more?

S19 | STAFF | friendly | move=recommend | qtype=rescue_offer
The bigger one of the three is the iPhone Air at 6.5", $1,899 for 256GB, so $350 more than the 17. It has a titanium frame and is 5.64mm thick. If it's the fold you miss, I can also show you the Duo, no pressure. What would you like?
opts:
- See the iPhone Air
- See the iPhone Duo anyway
- I'll think about it

S20 | CUST | annoyed | picks=I'll think about it | throwback=none
I'll think about it. Thanks. [customer leaves]

S21 | STAFF | friendly | move=close | qtype=none
No problem at all. The Duo and the Air are both here whenever you want another look. Have a good one!

## Question types used

| qtype | text | options | multi? | PRECONDITION | EFFECT | NEEDS DATA |
|---|---|---|---|---|---|---|
| form_factor | What kind of phone are you picturing? | Foldable / big-screen / slim, light / compact / regular / Not sure | no | Opening question; nothing known yet | Foldable: keeps Duo only (Tier = foldable). Big-screen: keeps 18 Pro Max (6.9"), Duo (7.6" inner). Slim: Air (5.64mm). Compact: smallest screens 6.1" (17e, 16). Regular/Not sure: no elimination | "Compact" and "slim" cut-offs beyond sheet screen sizes and Air thickness; thickness of others UNKNOWN |
| budget_ceiling | What's the most you'd like to spend? | Up to $1,500 / $2,000 / $2,500 / $3,500 / Over $3,500 / Not sure | no | Pool has more than one model or storage is unset, and price spread is real (sheet prices differ by model) | Sets max price; removes models whose cheapest listed price exceeds it (Duo $3,499, 18 Pro $2,099, 18 Pro Max about $2,299, Air $1,899, 17 $1,549, 17e $1,149, 16 $1,349). Can empty the pool | 18 Pro Max exact prices are missing in the sheet; $2,299 at 256GB is inferred from "starts $200 higher" and must be confirmed |
| relax_requirement | Nothing fits both X and Y. Which would you be happier to give up? | Lift my budget / Drop the [requirement] / Keep both / Not sure | no | Pool is empty after the last answer; the two clashing facts are known | Lift budget: removes budget filter. Drop requirement: removes that filter (here foldable, restoring non-Duo models under budget). Keep both: no change, staff asks again with a firmer tone. Options are generated from the conflicting facts | None. Staff may only quote sheet prices; any discount is UNKNOWN |
| screen_size_pref | How big a screen do you want? | Options generated from the pool's sizes, here Smaller (about 6.1") / Medium-large (6.3" to 6.5") / Not sure | no | At least two different screen sizes remain in the pool and screen size not yet set | Smaller: keeps 17e, 16 (6.1"). Medium-large: keeps 17 (6.3"), Air (6.5"). Not sure: nothing | None |
| camera_setup | How many cameras on the back would you like? | Two (main + ultra wide) / One is fine / Not sure | no | Pool has models with different camera counts per sheet | Two: keeps 17 (and Duo, Pro tiers have more). One is fine: no elimination. Not sure: no elimination | iPhone 16 camera setup is not in the sheet, so it cannot be filtered either way. Main/Ultra Wide quality differences UNKNOWN |
| storage_need | How much storage do you reckon you need? | 128GB is enough / 256GB / 512GB or more / Not sure | no | Pool has models with different storage tiers or the final choice needs a storage | Sets storage. 256GB removes 16 (128GB only). 512GB or more would remove 16 and cap the pool at models with a 512GB tier within budget (17e $1,549, 17 $1,949 over $1,500 etc.) | None |
| offer_demo | That leaves N phones, so you can try one. Which would you like to see? | One option per remaining model (up to 4) / No demo, thanks | no | 4 or fewer models remain | Selecting a model starts a demo of that model; no change to pool | Demo unit colour and stock UNKNOWN: staff says "I'd have to check" |
| demo_reaction | What do you think? (after demo_highlight) | This could be the one / Show me another / Not for me | no | A demo has just been given | This could be the one: pool narrows to that model, move to colour/storage. Show me another: back to offer_demo. Not for me: removes that model from the pool | None |
| rescue_offer | (Customer is cooling) Offer the nearest alternative plus a relaxed-requirement option | See [nearest model] / See [original-wish model] anyway / I'll think about it | no | Customer has rejected a demo or relaxed a hard requirement and the pool is still not converging | See X: starts that demo. I'll think about it: ends the conversation without purchase | None |
| close_goodbye | (Statement, no options) Polite sign-off | none | n/a | Customer has chosen to leave | Ends conversation | None |

## Customer throw-backs used

- Can you do a better price? (S6; staff can only say "I'd have to check", NEEDS DATA)
- Does the bigger one cost much more? (S18; staff answers from the sheet: Air $1,899 vs 17 $1,549 at 256GB, a $350 gap)

## Things staff could have asked but didn't

- colour_preference: set colour from the chosen model's colours (needed for a purchase, never reached here).
- frame_material_pref: titanium vs aluminium (sheet states frame for Duo, 18 Pro, Air, 17).
- pro_features_need: ProMotion / Dynamic Island / Camera Control (the sheet only says 17e lacks them; no data on which others have them).
- use_case: photography, gaming, social media; needs mapping to chip (A20 Pro, A19 Pro, A19) which the sheet lists, but "gaming performance" itself is UNKNOWN.
- trading_in_current_phone: NEEDS DATA (trade-in values not in the sheet).
- current_phone: what they use now (useful for tone, no direct elimination).
- why_foldable: what draws them to a foldable, to propose a substitute (big screen, 6.9" Pro Max, but over budget).
- budget_flexibility: ask early whether the ceiling is firm, to pre-empt the zero-pool.

## Assumptions I made

- iPhone 18 Pro Max price at 256GB is $2,299 (inferred from "starts $200 higher than 18 Pro at each tier"); the sheet gives no exact prices. Not stated as fact in the transcript.
- I treated "bigger one" (S18) as the Air, based on the 6.5" screen vs 6.3" for the 17 and 6.1" for the 17e, all in the sheet.
- I assumed the budget is for the cheapest listed price of a model at the chosen storage (the sheet gives no accessories/care plan prices).
- I did not state anything about iPhone 16's cameras, battery life, water resistance, discounts or stock: all UNKNOWN. Staff say "I'd have to check" for discounts and for the demo unit's colour.
- The Duo's ultra-short phrasing "no telephoto" is labelled "third-party report" in the sheet, so staff did not mention it in this conversation.
- In S19, "titanium frame" for the Air and "5.64mm thick" are from the sheet.
