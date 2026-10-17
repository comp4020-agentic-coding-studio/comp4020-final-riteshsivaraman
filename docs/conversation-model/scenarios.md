---
status: draft
what: Scenario set (17 customer profiles) for the phone-specialist scene, covering opening types and customer behaviours with minimal overlap; each is both a transcript brief and an NPC hidden-goal persona.
date: 2026-10-17
source: devices.json and decisions.md
---

# Scenario set for the phone-sales scene

17 scenarios (target was about 16). Device facts come only from `devices.json` (7 models). Every hidden goal and every "nothing fits" claim was checked by script (output pasted at the end). Out of scope: payment, billing, trade-in, accessories, care plans, setup. The scene ends on model + storage + colour, or on the customer leaving. Prices are the listed price for the tier.

`price_haggle` note: staff have no pricing authority in this scene, so the exercise is the customer asking and staff giving a canned "that's the listed price". Tones use only: friendly, neutral, impatient, unsure.

## Scenarios


### s01: Knows exactly, wants it fast

```yaml
id: s01
title: "Knows exactly, wants it fast"
who: "Uni student, already researched, wants one specific phone"
opening: "exact_model"
patience: low
decisiveness: high
typical_tones: [impatient, neutral]
hidden_goal: "iPhone 18 Pro, 512GB, Glacier"
hard_constraints: "budget ceiling A$2,500; min storage 512GB; colour Glacier"
soft_signals: "none (already decided)"
knowledge_gaps: "none"
behaviours: "price_haggle (asks if the price can come down; staff can only say it is the listed price)"
expected_outcome: "Picks the model, then 512GB, then Glacier. Short scene."
feasibility_check: "s01 exact 18 Pro 512 Glacier, maxp 2500: rows=1 -> PASS. 18 Pro 512GB is A$2,499."
```

### s02: Wants a colour that does not exist

```yaml
id: s02
title: "Wants a colour that does not exist"
who: "Office worker, wants a 17 in orange"
opening: "exact_model"
patience: med
decisiveness: med
typical_tones: [friendly, unsure]
hidden_goal: "iPhone 17, 256GB, Sage"
hard_constraints: "budget ceiling A$1,600; min storage 256GB; colour must-have: orange (not offered)"
soft_signals: "fun colour, everyday use"
knowledge_gaps: "Which offered colour is closest to orange (Not sure)"
behaviours: "picks_unavailable_colour; reopen_answer (staff reopen colour after the miss; customer changes it from 'orange' to 'something green or soft')"
expected_outcome: "Picks 17, 256GB, asks for orange, learns it is not offered, reopens colour, takes Sage."
feasibility_check: "s02 'Orange' in any colour list: False; fallback 17 Sage 256, maxp 1600: rows=1 -> PASS. 17 256GB is A$1,549."
```

### s03: Wants the Max, price talks him down

```yaml
id: s03
title: "Wants the Max, price talks him down"
who: "Tradie, assumes bigger is better"
opening: "exact_model (names the 18 Pro Max)"
patience: med
decisiveness: low
typical_tones: [impatient, neutral, unsure]
hidden_goal: "iPhone 18 Pro, 256GB, Black"
hard_constraints: "hidden budget ceiling A$2,100 (revealed only when asked or when he sees a price); min storage 256GB; colour Black"
soft_signals: "big screen (assumed), battery"
knowledge_gaps: "Real budget until he sees Max pricing"
behaviours: "asks_direct_demo (asks to try the Max first); throwback_compare ('Is the Pro much smaller?'); changes_mind_late (drops the Max at the storage step when 256GB is A$2,299, over A$2,100)"
expected_outcome: "Demos Max, compares, then at storage/price switches to 18 Pro 256GB Black."
feasibility_check: "s03 final 18 Pro 256 Black maxp 2100: rows=1 -> PASS; initial Max 256 Black exists -> PASS. Max 256GB is A$2,299; Pro 256GB is A$2,099."
```

### s04: Family: a 17, but budget too tight

```yaml
id: s04
title: "Family: a 17, but budget too tight"
who: "Nurse, wants 'a 17 or the cheaper one', price-sensitive"
opening: "model_family (iPhone 17 / 17e)"
patience: med
decisiveness: med
typical_tones: [neutral, impatient]
hidden_goal: "iPhone 17e, 256GB, White (after relaxing budget to A$1,200)"
hard_constraints: "initial budget ceiling A$1,100; min storage 256GB; family 17/17e"
soft_signals: "reliable, colour does not matter"
knowledge_gaps: "Whether Camera Control, Dynamic Island, 120Hz matter (Not sure)"
behaviours: "zero_pool_then_relax (nothing at 256GB under A$1,100; raises to A$1,200); throwback_attribute_query ('Does the 17e have Camera Control?'; buy-page card says No)"
expected_outcome: "Empty pool, nudge, relax, picks 17e 256GB White."
feasibility_check: "s04 zero: 17 family, maxp 1100, ming 256: rows=0 -> PASS (empty); relaxed maxp 1200: rows=3 (17e 256GB Black/White/Soft Pink) -> PASS. 17e 256GB is A$1,149; 17 256GB is A$1,549."
```

### s05: Small hands, wants a Pro

```yaml
id: s05
title: "Small hands, wants a Pro"
who: "Commuter, one-handed use on the train, wants 'a Pro'"
opening: "model_family (Pro line)"
patience: high
decisiveness: med
typical_tones: [neutral, unsure]
hidden_goal: "iPhone 18 Pro, 256GB, Silver"
hard_constraints: "width <= 72mm (one-handed); budget ceiling A$2,200; min storage 256GB; colour Silver"
soft_signals: "zoom/telephoto, camera quality"
knowledge_gaps: "Whether she needs the longest zoom (Not sure)"
behaviours: "throwback_compare ('Is the Max worth the extra?'); rejects_demo (declines a Max demo: too big for her hand)"
expected_outcome: "Wants Pro, steered off Max by size, picks 18 Pro 256GB Silver."
feasibility_check: "s05 maxw 72, maxp 2200, ming 256, Silver: rows=1 -> PASS. Pool without colour: 17, 17e, 18 Pro (18 Pro width 71.9mm; Max 78.0mm). Telephoto soft signal ranks Pro first."
```

### s06: Serious photo and video person, no model in mind

```yaml
id: s06
title: "Serious photo and video person, no model in mind"
who: "Freelance videographer, big budget, wants the best camera"
opening: "no_idea"
patience: med
decisiveness: high
typical_tones: [friendly, neutral, impatient]
hidden_goal: "iPhone 18 Pro Max, 1TB, Burgundy"
hard_constraints: "budget ceiling A$3,600; min storage 1TB; dedicated telephoto lens wanted; colour Burgundy"
soft_signals: "video (4K 120fps, ProRes), battery, photos"
knowledge_gaps: "Which colour is available (Not sure until told)"
behaviours: "multi_select (photos, video, travel); throwback_attribute_query ('Which one has the longest zoom?'); tone_shift (impatient at many questions, warms up as the pool narrows)"
expected_outcome: "Pool shrinks to Pro 1TB and Max 1TB; battery soft signal ranks Max first; picks Max 1TB Burgundy."
feasibility_check: "s06 telephoto maxp 3600 ming 1TB Burgundy: rows=2 -> PASS. Telephoto models at >=1TB and <=A$3,600: Pro 1TB (3,299), Max 1TB (3,499)."
```

### s07: Simple needs, lots of unsure

```yaml
id: s07
title: "Simple needs, lots of unsure"
who: "Retiree buying for herself: calls, photos of grandkids, no tech vocabulary"
opening: "no_idea"
patience: high
decisiveness: low
typical_tones: [unsure, friendly]
hidden_goal: "iPhone 16, 128GB, Teal"
hard_constraints: "budget ceiling A$1,400; 128GB accepted; colour Teal"
soft_signals: "easy to use, nice colour"
knowledge_gaps: "Storage, screen size, chip, camera spec (Not sure to almost all)"
behaviours: "rejects_demo (declines a demo, 'I'll trust you'); price_haggle (asks about a senior discount; staff cannot say)"
expected_outcome: "Many Not sure answers; staff lead on budget and colour; ends 16 128GB Teal."
feasibility_check: "s07 maxp 1400 maxg 128 Teal: rows=1 -> PASS. 16 is the only 128GB model (A$1,349); Teal is only on the 16."
```

### s08: Wants a colour the cheap phones lack

```yaml
id: s08
title: "Wants a colour the cheap phones lack"
who: "Style-driven buyer, must have Teal, tight budget"
opening: "no_idea"
patience: med
decisiveness: med
typical_tones: [impatient, neutral]
hidden_goal: "iPhone 16, 128GB, Teal (after relaxing budget to A$1,400)"
hard_constraints: "colour Teal; initial budget ceiling A$1,200"
soft_signals: "colour is the whole point"
knowledge_gaps: "Storage, model names"
behaviours: "zero_pool_then_relax (Teal under A$1,200 is empty; raises to A$1,400 on the nudge)"
expected_outcome: "Empty pool, nudge, picks 16 Teal."
feasibility_check: "s08 zero Teal maxp 1200: rows=0 -> PASS (empty); relaxed maxp 1400 -> 16 128GB Teal PASS. 16 is A$1,349."
```

### s09: Needs a telephoto, cannot afford one

```yaml
id: s09
title: "Needs a telephoto, cannot afford one"
who: "Hobby birdwatcher, wants a real telephoto lens, firm A$1,800 limit"
opening: "no_idea"
patience: low
decisiveness: high
typical_tones: [impatient, neutral]
hidden_goal: "none: will leave. Dedicated telephoto lens exists only on 18 Pro / Pro Max (cheapest A$2,099); he refuses to relax budget or lens"
hard_constraints: "separate telephoto lens; budget ceiling A$1,800 firm"
soft_signals: "zoom"
knowledge_gaps: "none (knows what he needs)"
behaviours: "zero_pool_then_leave; tone_shift (neutral to impatient after the nudge)"
expected_outcome: "Staff nudge; he declines to relax; leaves."
feasibility_check: "s09 zero telephoto maxp 1800: rows=0 -> PASS (empty). Cheapest telephoto row: (2099, 18 Pro, 256GB). Note most models have a 2x optical-quality crop, so the bank question must say 'separate telephoto lens'."
```

### s10: Gift for a teenager who loves pink

```yaml
id: s10
title: "Gift for a teenager who loves pink"
who: "Parent buying for a 15-year-old; child said 'anything pink'"
opening: "buying_for_someone_else"
patience: med
decisiveness: med
typical_tones: [friendly, unsure]
hidden_goal: "iPhone 17e, 256GB, Soft Pink"
hard_constraints: "budget ceiling A$1,400; pink family colour (Pink / Soft Pink); min storage 256GB (surfaces on reopen)"
soft_signals: "social media, selfies, school-day battery"
knowledge_gaps: "Teen's storage need (initially Not sure)"
behaviours: "reopen_answer (staff reopen storage; she changes Not sure to 'at least 256GB'); multi_select (teen's uses: social, camera, music); throwback_attribute_query ('Does it have a good front camera?')"
expected_outcome: "Pool starts as 16 Pink 128GB and 17e Soft Pink 256GB; reopened storage tips it to 17e."
feasibility_check: "s10 pink colours maxp 1400: rows=2 (16 Pink 128GB 1,349; 17e Soft Pink 256GB 1,149) -> PASS; with min 256GB only 17e Soft Pink remains."
```

### s11: Gift for a partner who hates dead batteries

```yaml
id: s11
title: "Gift for a partner who hates dead batteries"
who: "Husband buying a birthday gift; wife complains about battery and likes Burgundy"
opening: "buying_for_someone_else"
patience: med
decisiveness: med
typical_tones: [friendly, neutral]
hidden_goal: "iPhone 18 Pro Max, 256GB, Burgundy"
hard_constraints: "budget ceiling A$2,700; video playback >= 40 hours; colour Burgundy"
soft_signals: "battery, large screen"
knowledge_gaps: "Her storage use (Not sure), her hand size"
behaviours: "multi_select (her uses); throwback_compare ('Is the Pro much worse on battery?'); price_haggle (asks if 512GB can be had at the 256GB price)"
expected_outcome: "Battery filter leaves Max only within budget; picks 256GB Burgundy."
feasibility_check: "s11 video >=40h maxp 2700 Burgundy: rows=2 (Max 256GB, 512GB) -> PASS. Within A$2,700 only Max 256/512GB reach 40+ hr (Duo outer-screen 44 hr is over budget)."
```

### s12: Window shopper, gone in three turns

```yaml
id: s12
title: "Window shopper, gone in three turns"
who: "Passer-by killing time before a movie"
opening: "just_browsing"
patience: low
decisiveness: low
typical_tones: [impatient, neutral]
hidden_goal: "none: will leave (no intent to buy today)"
hard_constraints: "none"
soft_signals: "none"
knowledge_gaps: "Not sure to almost everything"
behaviours: "leaves_early; tone_shift (neutral to impatient after the second staff question)"
expected_outcome: "Vague answers, leaves after about three staff turns with the pool still wide."
feasibility_check: "No filter given, so the pool stays at all 7 models (no check needed)."
```

### s13: Curious about the foldable, cannot afford it

```yaml
id: s13
title: "Curious about the foldable, cannot afford it"
who: "Tech enthusiast who only wants to try the Duo"
opening: "just_browsing"
patience: high
decisiveness: high
typical_tones: [friendly, neutral]
hidden_goal: "none: will leave. Wants foldable only; cheapest foldable is A$3,499, above his A$3,000 ceiling"
hard_constraints: "foldable (hard, discovered after the demo); budget ceiling A$3,000"
soft_signals: "novelty, screen size"
knowledge_gaps: "none"
behaviours: "asks_direct_demo (picks the Duo to demo straight away); zero_pool_then_leave (after the demo, constraints leave nothing)"
expected_outcome: "Demos Duo, likes it, learns the price, leaves."
feasibility_check: "s13 zero foldable maxp 3000: rows=0 -> PASS (empty). Cheapest foldable: (3499, 256GB)."
```

### s14: Looking around, falls for a colour

```yaml
id: s14
title: "Looking around, falls for a colour"
who: "Mall browser, no budget plan, drawn to pastel colours"
opening: "just_browsing"
patience: med
decisiveness: med
typical_tones: [impatient, friendly]
hidden_goal: "iPhone 17, 256GB, Lavender"
hard_constraints: "budget ceiling A$1,600; colour Lavender"
soft_signals: "style, colour"
knowledge_gaps: "Spec details (Not sure)"
behaviours: "asks_direct_demo (asks to try the 17 after seeing it); rejects_demo (declines a demo of the 17e); tone_shift (impatient to friendly)"
expected_outcome: "Browses, asks for the lavender one, finalises 256GB."
feasibility_check: "s14 Lavender maxp 1600: rows=1 (17 256GB 1,549) -> PASS. Lavender only on the 17; 512GB is A$1,949, over budget."
```

### s15: Pro family, 1TB, wants gold, upgrades late

```yaml
id: s15
title: "Pro family, 1TB, wants gold, upgrades late"
who: "Video editor with large files, wants the Pro line and 1TB"
opening: "model_family (Pro / Pro Max)"
patience: med
decisiveness: low
typical_tones: [neutral, unsure]
hidden_goal: "iPhone 18 Pro Max, 1TB, Glacier (after raising ceiling from A$3,300 to A$3,500)"
hard_constraints: "min storage 1TB; initial budget ceiling A$3,300; colour: gold (not offered on Pro / Pro Max)"
soft_signals: "telephoto, video"
knowledge_gaps: "Which colour is available"
behaviours: "picks_unavailable_colour (gold); changes_mind_late (after choosing 18 Pro 1TB, raises ceiling by A$200 and swaps to Max 1TB for battery)"
expected_outcome: "Pro 1TB in budget; late switch to Max 1TB Glacier."
feasibility_check: "s15 min 1TB maxp 3300 telephoto: rows=4 (all Pro 1TB) -> PASS; maxp 3500 Glacier: Max 1TB in set -> PASS. 'Gold' on Pro/Max: False (Light Gold exists on Air only). Max 1TB is A$3,499; Pro 1TB is A$3,299."
```

### s16: Asks for a model the store does not carry

```yaml
id: s16
title: "Asks for a model the store does not carry"
who: "Reader who wants 'the 16 Plus', a big non-folding screen"
opening: "exact_model (unstocked: iPhone 16 Plus)"
patience: med
decisiveness: med
typical_tones: [neutral, unsure]
hidden_goal: "iPhone Air, 256GB, Light Gold"
hard_constraints: "width >= 74mm, not foldable; budget ceiling A$2,000; colour Light Gold"
soft_signals: "big screen, light weight"
knowledge_gaps: "Whether Air or Max suits (Not sure)"
behaviours: "throwback_compare ('Air vs Max?'); reopen_answer (staff reopen budget; he drops from A$3,000 to A$2,000); tone_shift (neutral to unsure after learning the model is gone)"
expected_outcome: "Staff say 16 Plus is not stocked; funnels to Air."
feasibility_check: "s16 width>=74 not-foldable maxp 2000 Light Gold: rows=1 -> PASS. Pool at those filters: Air 256GB only (A$1,899). No 'Plus' or '17 Pro' in devices.json."
```

### s17: Errand runner, cannot answer anything

```yaml
id: s17
title: "Errand runner, cannot answer anything"
who: "Assistant sent by their boss to 'get an iPhone', no brief"
opening: "buying_for_someone_else"
patience: low
decisiveness: low
typical_tones: [unsure, impatient]
hidden_goal: "none: will leave (cannot answer any question; goes to ask the boss)"
hard_constraints: "none"
soft_signals: "none"
knowledge_gaps: "Everything (Not sure on all)"
behaviours: "leaves_early; tone_shift (unsure to impatient)"
expected_outcome: "Several Not sure answers then leaves."
feasibility_check: "No filter possible; pool stays at all 7 models (no check needed)."
```

## Coverage matrix

### Scenarios x behaviours

| id | reopen_answer | multi_select | throwback_compare | throwback_attribute_query | asks_direct_demo | rejects_demo | zero_pool_then_relax | zero_pool_then_leave | changes_mind_late | tone_shift | price_haggle | picks_unavailable_colour | leaves_early |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s01 |  |  |  |  |  |  |  |  |  |  | x |  |  |
| s02 | x |  |  |  |  |  |  |  |  |  |  | x |  |
| s03 |  |  | x |  | x |  |  |  | x |  |  |  |  |
| s04 |  |  |  | x |  |  | x |  |  |  |  |  |  |
| s05 |  |  | x |  |  | x |  |  |  |  |  |  |  |
| s06 |  | x |  | x |  |  |  |  |  | x |  |  |  |
| s07 |  |  |  |  |  | x |  |  |  |  | x |  |  |
| s08 |  |  |  |  |  |  | x |  |  |  |  |  |  |
| s09 |  |  |  |  |  |  |  | x |  | x |  |  |  |
| s10 | x | x |  | x |  |  |  |  |  |  |  |  |  |
| s11 |  | x | x |  |  |  |  |  |  |  | x |  |  |
| s12 |  |  |  |  |  |  |  |  |  | x |  |  | x |
| s13 |  |  |  |  | x |  |  | x |  |  |  |  |  |
| s14 |  |  |  |  | x | x |  |  |  | x |  |  |  |
| s15 |  |  |  |  |  |  |  |  | x |  |  | x |  |
| s16 | x |  | x |  |  |  |  |  |  | x |  |  |  |
| s17 |  |  |  |  |  |  |  |  |  | x |  |  | x |
| **count** | 3 | 3 | 4 | 3 | 3 | 3 | 2 | 2 | 2 | 6 | 3 | 2 | 2 |

### Scenarios x opening type

| opening | scenarios | count |
|---|---|---|
| exact_model | s01, s02, s03, s16 | 4 |
| model_family | s04, s05, s15 | 3 |
| no_idea | s06, s07, s08, s09 | 4 |
| buying_for_someone_else | s10, s11, s17 | 3 |
| just_browsing | s12, s13, s14 | 3 |

Every behaviour is hit at least twice: True. Every opening type at least twice: True.

Non-duplication: no two scenarios share both a hidden goal and a behaviour set. Outcome mix: 13 purchases (s01-s08, s10, s11, s14, s15, s16), 4 leaves (s09, s12, s13, s17); the leaves differ by cause: nothing fits and refuses to relax (s09), no intent (s12), price after a demo (s13), cannot answer (s17). Hidden goals are all distinct models/storage/colour combinations except that 18 Pro appears in s01, s03, s05 with different storage or colour, and 18 Pro Max in s06, s11, s15 likewise.

## Question families the bank will need

- known_model: "did you already have a phone in mind?" (gate; yes leads to model pick, no leads to discovery)
- model_family: which line (Pro, 17, Air, foldable) when the customer has only a family in mind
- recipient: who the phone is for (self, gift, errand); gates gift questions
- gift_recipient_profile: age band and what the recipient does with a phone (reuses use_case answers)
- use_case: photos, video, social, games, work, basics (multi-select)
- budget_ceiling: most they want to spend on the chosen storage tier
- storage_need: current-phone space pressure and wanted minimum storage
- storage_tier: final storage pick among tiers the model offers
- colour_preference: colour wanted, with an option when it is not offered
- form_factor: standard slab vs foldable
- screen_size: smallest and largest acceptable size
- one_handed: one-handed use or hand size (maps to width)
- weight_thin: lightness or thinness preference
- camera_priority: how much camera matters, split into photo vs video
- telephoto_need: separate telephoto lens wanted (wording must separate it from the 2x crop on most models)
- battery_priority: how much battery life matters
- hardware_features: ProMotion, Always-On, Dynamic Island, Camera Control, Action button (preference, not hard unless stated)
- demo_offer: staff offer, at 4 or fewer candidates, by model
- demo_followup: choose, demo another, or reopen
- reopen_confirm: "you said X, still right?" for any answered question
- relax_nudge: when the pool is empty, which requirement to loosen (budget, colour, storage, size)
- close_out: confirm model, storage, colour
- Throw-back handlers (customer side): compare_two_models, attribute_query(model, attribute), price_ask (haggle, canned reply), model_not_stocked

## Data gaps (staff answer "I'd have to check")

From devices.json (null = not stated), checked by script (see below):
- iPhone Duo: face_id null (page states Touch ID instead; there is a `touch_id_note`); applecare null.
- iPhone 16: refresh_rate_promotion null and always_on null, so a 120Hz or Always-On filter must not eliminate it (s04-style attribute queries about these on the 16 get "I'd have to check").
- trade_in null for Pro Max, Air, 17, 17e (and applecare null on all 7); these are out of scope for this scene but a throw-back about them should get a canned redirect to the billing person.
- Optical zoom range line is absent for Air and 17e (spec page); only the buy-page "1x, 2x" exists, relevant to s06/s09 telephoto questions.
- Stock levels and which colour is on the demo unit are not in devices.json: needed for the "demo is red, yours is in stock" line and for any "do you have it today" question. Treat as staff-side canned info or add a stock field.
- Models not in devices.json (e.g. 16 Plus, 17 Pro; the compare page lists them as reseller-only): s16 needs a canned "we don't carry that" answer.
- Brightness for 17e outdoors is not stated (doesn't affect any scenario).

## Risks (hard to model under menus-only)

- Colour not offered (s02, s15): the customer's answer must be a menu pick, so the colour menu needs an "other / not listed" option that carries the unmet request into state; otherwise the miss cannot be expressed.
- Family opening (s04, s05, s15): model_family needs the pool to be restrictable by family membership, which devices.json has no field for; it must be derived from model name or added.
- Telephoto wording (s06, s09): most models advertise "optical-quality 2x Telephoto" via a crop; a menu item "telephoto" is ambiguous. Needs two menu items (2x crop vs separate lens) or the filter will mis-eliminate.
- Hidden budget (s03): "reveal budget only when a price is seen" needs a trigger on the first price display; budget normally sits behind a question, so the NPC rule must permit an unprompted throw-back.
- price_haggle (s01, s07, s11): no pricing authority in this scene, and billing is out of scope; the canned reply needs a defined effect (none) so it does not loop.
- Errand runner (s17) and browsers (s12): all Not sure answers narrow nothing; the coverage test "at least one question still narrows" holds, but the NPC leave rule must key on tone and count of non-narrowing turns, not on pool size.
- Late change of mind (s03, s15): needs reopen of an answered question after demo or storage pick, and the system must allow reversing a previously finalised sub-choice (model) before the scene closes.
- Direct demo outside the pool (s13): the Duo demo is requested when the pool is wider than 4 models; demos by direct pick must always be allowed, not gated on the 4-or-fewer rule.
- Gift reopen (s10): the Not sure to 256GB flip is the customer learning something; an NPC with fixed hidden goals must model this as "first answer was Not sure, true answer was held back", which the NPC spec should allow explicitly.
- Prices for tiers: storage is chosen after the model, but budget filters on tier price, so a model can be in the pool at its cheapest tier only (s03, s11). The budget filter must apply per tier, not per model.

## Feasibility run

Script (run with `python3 -I`, reading devices.json; rows are model x storage tier x colour; width uses the closed width for the Duo; telephoto means a rear lens named "Fusion Telephoto"; video hours is the first "Up to N" in battery_video_playback):

```
s01 exact 18 Pro 512 Glacier, maxp 2500: rows=1 models=['iPhone 18 Pro'] -> PASS
s02 'Orange' in any colour list: False
s02 fallback 17 Sage 256, maxp 1600: rows=1 -> PASS
s03 final 18 Pro 256 Black maxp 2100: rows=1 -> PASS
s03 initial Max 256 Black (exists): rows=4 -> PASS
s04 zero: 17 family, maxp 1100, ming 256: rows=0 -> PASS (empty as expected)
s04 relaxed maxp 1200: rows=3 models=['iPhone 17e'] -> PASS
s05 maxw 72, maxp 2200, ming 256, Silver: rows=1 -> PASS
   s05 models under maxw72 maxp2200 ming256: ['iPhone 17', 'iPhone 17e', 'iPhone 18 Pro']
s06 telephoto maxp 3600 ming 1TB Burgundy: rows=2 -> PASS
   s06 telephoto >=1TB <=3600: [('iPhone 18 Pro','1TB',3299), ('iPhone 18 Pro Max','1TB',3499)]
s07 maxp 1400 maxg 128 Teal: rows=1 (iPhone 16) -> PASS
s08 zero: Teal, maxp 1200: rows=0 -> PASS (empty as expected)
s08 relaxed maxp 1400: rows=1 (iPhone 16) -> PASS
s09 zero: telephoto maxp 1800: rows=0 -> PASS (empty as expected)
   s09 cheapest telephoto row: (2099, 'iPhone 18 Pro', '256GB')
s10 Pink/Soft Pink maxp 1400: rows=2 -> PASS
   s10 pool: [('iPhone 16','128GB','Pink',1349), ('iPhone 17e','256GB','Soft Pink',1149)]
   s10 with ming 256: [('iPhone 17e','256GB','Soft Pink',1149)]
s11 video>=40h maxp 2700 Burgundy: rows=2 (Max 256GB, 512GB) -> PASS
s13 zero: foldable maxp 3000: rows=0 -> PASS (empty as expected)
   s13 cheapest foldable: (3499, '256GB')
s14 Lavender maxp 1600: rows=1 (iPhone 17) -> PASS
s15 ming 1TB maxp 3300 telephoto: rows=4 (iPhone 18 Pro) -> PASS
s15 after raise maxp 3500 Max 1TB Glacier -> PASS
Gold on Pro/Max: False   Pro colours: ['Black','Burgundy','Glacier','Silver']
s16 width>=74 non-foldable maxp 2000 Light Gold: rows=1 (iPhone Air) -> PASS
   s16 model names containing 'Plus' or '17 Pro': []
s12, s17: no device filter (nothing to verify)
ALL PASS 20 checks
```

Script source was `chk.py` in the session scratchpad; it is not saved in the project.
