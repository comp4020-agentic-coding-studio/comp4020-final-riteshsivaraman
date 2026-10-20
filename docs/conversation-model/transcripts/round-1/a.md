---
status: draft
what: Sample sales conversation A (no phone in mind, photo/video, low-storage old phone, mid budget, price-aware) for question-bank design. Sheet-only facts.
date: 2026-10-17
source: docs/conversation-model/devices.md
---

# Scenario A transcript

Running state (for the reader, not shown in the UI): 7 models at start. Budget is a ceiling on the price of the chosen storage tier.

S1 | STAFF | friendly | move=ask | qtype=use_case
Hi there, what are you mainly going to use the new phone for? Pick as many as apply.
opts: (multi)
- Photos and video
- Social media and messaging
- Games
- Work and email
- Just calls and the basics
- Not sure

C2 | CUST | friendly | picks=Photos and video; Social media and messaging | throwback=none
Mostly photos and video, and social stuff.

S3 | STAFF | friendly | move=ask | qtype=current_storage_pressure
Got it. How's your current phone for space?
opts:
- Always full
- Gets tight sometimes
- Plenty of room
- Not sure

C4 | CUST | annoyed | picks=Always full | throwback=none
Always full. I'm constantly deleting stuff.

S5 | STAFF | neutral | move=ask | qtype=storage_wanted
How much storage are you after on the new one?
opts:
- 128GB
- 256GB
- 512GB
- 1TB or more
- Not sure

C6 | CUST | unsure | picks=Not sure | throwback=none
Not sure, honestly.

S7 | STAFF | friendly | move=clarify | qtype=storage_floor_confirm
Since you shoot a lot and your current phone is always full, I'd start at 256GB. Most of what we have starts there, and only the iPhone 16 is 128GB. Does 256GB as the minimum work?
opts:
- Yes, 256GB minimum
- I want more than 256GB
- Keep 128GB on the table
- Not sure

C8 | CUST | neutral | picks=Yes, 256GB minimum | throwback=none
Yeah, 256 minimum.

S9 | STAFF | neutral | move=ask | qtype=budget_ceiling
What's the most you'd like to spend?
opts:
- Up to $1,200
- Up to $1,600
- Up to $2,200
- Up to $3,000
- No real limit
- Not sure

C10 | CUST | impatient | picks=Up to $1,600 | throwback=none
Up to $1,600. I don't want to overspend.

S11 | STAFF | enthusiastic | move=offer_demo | qtype=offer_demo
Two phones fit that: the iPhone 17e and the iPhone 17. Want to have a play with either?
opts:
- Demo the iPhone 17e
- Demo the iPhone 17
- Demo both
- No demo, keep narrowing

C12 | CUST | enthusiastic | picks=Demo the iPhone 17 | throwback=none
Let's see the 17.

S13 | STAFF | enthusiastic | move=demo_highlight | qtype=none
Here you go. It's a 6.3" screen with the A19 chip and an aluminium frame. On the back there's a Main and an Ultra Wide camera. The 256GB is $1,549 and it comes in Lavender, Mist Blue, White, Sage and Black. The demo unit might not be the colour we'd get you, and I'd have to check what's in stock.
opts:
- Happy with this one
- Try the iPhone 17e
- I want more camera
- Change an earlier answer
- Not for me

C14 | CUST | unsure | picks=I want more camera | throwback=Do any of them have a zoom lens?
Hmm. Do any of them have a zoom lens?

S15 | STAFF | neutral | move=clarify | qtype=none
The 17 is Main plus Ultra Wide. In what we've got, the Pro line (iPhone 18 Pro and 18 Pro Max) lists a Telephoto, so that's where zoom is. They cost more though.
opts:
- Raise my budget a bit
- Stay with my budget
- Not sure

C16 | CUST | neutral | picks=Raise my budget a bit | throwback=none
Ok, let me raise the budget.

S17 | STAFF | neutral | move=reopen | qtype=budget_ceiling
No worries. What's the new ceiling?
opts:
- Up to $1,200
- Up to $1,600
- Up to $2,200
- Up to $3,000
- No real limit
- Not sure

C18 | CUST | neutral | picks=Up to $2,200 | throwback=none
Up to $2,200.

S19 | STAFF | enthusiastic | move=offer_demo | qtype=offer_demo
That opens up four at 256GB: iPhone 17e, iPhone 17, iPhone Air and iPhone 18 Pro. Want to try any?
opts:
- Demo the iPhone 17e
- Demo the iPhone 17
- Demo the iPhone Air
- Demo the iPhone 18 Pro
- No demo, keep narrowing

C20 | CUST | neutral | picks=Demo the iPhone 18 Pro | throwback=none
Show me the 18 Pro.

S21 | STAFF | enthusiastic | move=demo_highlight | qtype=none
This is the 18 Pro. 6.3" screen, A20 Pro chip, aluminium unibody. The camera is the big one: a triple setup with a Main that has variable aperture, an Ultra Wide and a Telephoto. 256GB is $2,099. It comes in Burgundy, Glacier, Silver and Black. Again, the demo might be a different colour from what we have in stock.
opts:
- Happy with this one
- Show me another
- Too expensive for me
- Change an earlier answer
- Not for me

C22 | CUST | apathetic | picks=Too expensive for me | throwback=Is there a cheaper one with a zoom lens?
Too much, honestly. Is there a cheaper one with a zoom lens?

S23 | STAFF | neutral | move=clarify | qtype=none
Not in what I can see. Only the Pro line lists a Telephoto, and the 18 Pro at 256GB is the cheapest of those at $2,099. The 17 has the Main plus Ultra Wide.
opts:
- Go with the iPhone 17
- Go with the iPhone 18 Pro
- Keep looking
- Not sure

C24 | CUST | friendly | picks=Go with the iPhone 17 | throwback=none
Alright, I'll go with the 17. Two cameras is fine.

S25 | STAFF | friendly | move=ask | qtype=colour_prefs
Good choice. Which colours do you like? Pick as many as you want.
opts: (multi)
- Lavender
- Mist Blue
- White
- Sage
- Black
- Not sure

C26 | CUST | friendly | picks=Mist Blue; Sage | throwback=none
Mist Blue or Sage.

S27 | STAFF | neutral | move=ask | qtype=storage_tier_for_model
The iPhone 17 comes in 256GB at $1,549 or 512GB at $1,949. Which one?
opts:
- 256GB ($1,549)
- 512GB ($1,949)
- Not sure

C28 | CUST | neutral | picks=256GB ($1,549) | throwback=none
256GB. That's enough if I keep it tidy.

S29 | STAFF | friendly | move=ask | qtype=colour_final
Last one: Mist Blue or Sage?
opts:
- Mist Blue
- Sage
- Show me both
- Not sure

C30 | CUST | enthusiastic | picks=Sage | throwback=none
Sage!

S31 | STAFF | friendly | move=recommend | qtype=order_confirm
So that's an iPhone 17, 256GB, Sage, $1,549. I'll just check we have it in stock. Is that what you want?
opts:
- Yes, that one
- Change the colour
- Change the storage
- Change the model
- Leave without a phone

C32 | CUST | enthusiastic | picks=Yes, that one | throwback=none
Yes please.

S33 | STAFF | friendly | move=close | qtype=none
Great, I'll go and check the stock for the Sage 256GB now.

## Question types used

| qtype | text | options | multi? | PRECONDITION | EFFECT | NEEDS DATA |
|---|---|---|---|---|---|---|
| use_case | What are you mainly going to use the new phone for? | Photos and video / Social media and messaging / Games / Work and email / Just calls and the basics / Not sure | yes | Opening question; nothing known | Sets priority (camera vs other). Eliminates nothing by itself. Camera focus makes camera count (sheet: Duo dual, Pro triple, Air single, 17 dual, 17e single) worth surfacing later. | Which model is "best for games" etc. (chip tier alone is not a stated performance claim); how camera quality maps to use |
| current_storage_pressure | How's your current phone for space? | Always full / Gets tight sometimes / Plenty of room / Not sure | no | Customer has an existing phone; storage need not yet known | Sets storage urgency. Pushes towards 256GB+ (eliminates iPhone 16, the only 128GB model) if "Always full". | none |
| storage_wanted | How much storage are you after? | 128GB / 256GB / 512GB / 1TB or more / Not sure | no | Storage tier not yet fixed | Sets min storage. 256GB+ eliminates iPhone 16. 512GB+ eliminates nothing alone (all but 16 have 512). 1TB+ eliminates 17, 17e (no 1TB tier), leaves Duo, 18 Pro, 18 Pro Max, Air. | none |
| storage_floor_confirm | Staff suggests 256GB minimum; does that work? | Yes, 256GB minimum / I want more than 256GB / Keep 128GB on the table / Not sure | no | Customer answered "Not sure" to storage_wanted but storage pressure is known | Fixes 256GB floor (eliminates iPhone 16) or keeps 16 in. | none |
| budget_ceiling | What's the most you'd like to spend? | Up to $1,200 / Up to $1,600 / Up to $2,200 / Up to $3,000 / No real limit / Not sure | no | Storage floor known (price depends on tier) | Eliminates models whose cheapest qualifying tier exceeds the ceiling. At 256GB floor: $1,600 leaves 17e ($1,149), 17 ($1,549); $2,200 adds Air ($1,899), 18 Pro ($2,099). 18 Pro Max, Duo out. | 18 Pro Max exact prices (missing in sheet; only "starts $200 higher than 18 Pro"). Treated as out at $2,200 by inference ($2,099 + $200 = $2,299), flag. |
| offer_demo | N models fit. Want to try any? | Demo <model> for each remaining model / Demo both (when 2) / No demo, keep narrowing | no | 4 or fewer models left | None on facts. Triggers demo_highlight. | Demo unit colour and stock levels |
| demo_highlight (move, no qtype) plus follow-up menu | Staff reads sheet facts for the model, then asks what the customer thought | Happy with this one / Try another / I want more camera / Too expensive for me / Change an earlier answer / Not for me | no | A demo was chosen | Sets a camera or price signal depending on pick. "Change an earlier answer" routes to reopen. | Anything beyond sheet (battery, feel, camera quality, megapixels except Air) |
| colour_prefs | Which colours do you like? | The colours for the chosen model (17: Lavender / Mist Blue / White / Sage / Black) plus Not sure | yes | Model is fixed (colours are model-specific) | Narrows colour candidates. No model eliminated. | Per-colour stock |
| storage_tier_for_model | The model comes in X at $A or Y at $B. Which? | The model's tiers from the sheet plus Not sure | no | Model fixed; more than one tier fits the budget | Fixes storage tier. | none |
| colour_final | Pick one of the shortlisted colours | Shortlisted colours / Show me both / Not sure | no | More than one colour left after colour_prefs | Fixes colour. | Stock per colour |
| order_confirm | Recap model, storage, colour, price. Is that what you want? | Yes, that one / Change the colour / Change the storage / Change the model / Leave without a phone | no | Model, storage, colour all fixed | Ends the conversation or reopens one attribute. | Stock check result |

Reopen used: budget_ceiling asked again as move=reopen (S17), after the customer's own choice to raise the budget (C16).

## Customer throw-backs used

- "Do any of them have a zoom lens?" (C14)
- "Is there a cheaper one with a zoom lens?" (C22)

## Things staff could have asked but didn't

- Screen size preference (small, 6.1" / medium, 6.3" / large, 6.5" and up): sheet has sizes. Not asked because the customer gave no hint.
- Slim or light preference (Air 5.64mm; Duo 254g, other weights unknown).
- Camera count preference (single / dual / triple) as an explicit question, rather than waiting for the customer to ask about zoom.
- "Foldable?" (only Duo). Could be a quick yes/no filter at the start.
- Colour first, before storage and budget, for customers who care about looks.
- Frame material (aluminium / titanium) preference.
- Whether the customer wants the newest chip (A20 Pro / A19 Pro / A19 / prior gen).
- Trade-in of the old phone (NEEDS DATA, trade-in values not in sheet).
- Battery life priority (NEEDS DATA).
- Accessories, care plan (NEEDS DATA).
- Whether the budget is a hard cap or flexible.

## Assumptions I made

- Budget "ceiling" is interpreted as the price of the storage tier the customer would buy, not including accessories or care plans (not in sheet).
- iPhone 18 Pro Max at 256GB treated as about $2,299 (sheet: "starts $200 higher than 18 Pro at each tier", exact figure missing). Used only to say it is out at $2,200. Flag NEEDS DATA.
- Staff said "only the Pro line lists a Telephoto". The sheet lists Telephoto for 18 Pro and says the Duo has no telephoto (third-party report), and lists no telephoto for the others. Absence of a stated telephoto is treated as "not listed", not as proven absence for 17, 17e and Air.
- Staff did not claim the 17's second camera is "good" or the 18 Pro's camera is "better"; only the sheet's camera lists were read out.
- Demo colour and stock levels are UNKNOWN, so staff only said "might be a different colour" and "I'd have to check".
- Staff said "6.3"" and chip names from the sheet only. I was tempted to say things like "great for video", "long battery", "water resistant" and left them out (not in sheet).
- 17e was not demoed and was never explicitly eliminated by the customer; it dropped out when the customer chose the 17 directly (C24).
- Social media and Games options in use_case are menu wording only; no device fact depends on them.
