---
status: draft
what: Replay of the 11 sample sales transcripts (round 1 and 2) on the new talk engine in src/shared/talk, with every engine-vs-transcript disagreement
date: 2026-10-17
source: spec/talk-replays/*.json run by spec/talk-replay.test.ts (pnpm test:talk), converted from docs/conversation-model/transcripts/round-1/{a,b,c}.md and round-2/{s01,s04,s06,s09,s11,s14,s15,s16}.md. Claude's analysis; check before it goes anywhere formal.
---

# Replay findings: transcripts vs the engine

Engine note: src/shared/talk was edited while this ran (a `recommend` staff move appeared, a dropped constraint now clears its answer, size_fit_check lost an unsafe lead lookup). Everything below is against the engine as of the last green run (all 11 replays plus the smoke replay pass). The two failures in spec/talk-sim.test.ts (repeat questions, sold to unsatisfiable customer) belong to the simulator, not these replays; they were failing or flickering as the engine changed.

Each replay JSON carries `notes` (how a step was mapped), `skipped` (transcript steps with no engine equivalent that were left out) and, for r1b, `blocked`. Expectations that the engine contradicted were removed and are listed here, not hidden.

## Per transcript

| id | result | ends | note |
|---|---|---|---|
| s01 | pass | bought 18-pro 512GB Glacier | clean |
| s04 | pass | bought 17e 256GB White | 1 mapped throw-back |
| s06 | pass | bought 18-pro-max 1TB Burgundy | 1 mapped throw-back |
| s09 | pass | left | 1 dropped throw-back |
| s11 | pass with one skipped step | bought 18-pro-max 256GB Burgundy | size_fit_check skipped; ranking leader not asserted |
| s14 | pass, with altered step | bought 17 256GB Lavender | colour answer + demo request cannot share a reply |
| s15 | pass, with altered steps | bought 18-pro-max 1TB Glacier | confirm-step throw-back dropped; "leaning" step re-modelled |
| s16 | pass, expectations removed | bought air 256GB Light Gold | ranking leader and pool size differ |
| r1a | pass, with skipped steps | bought 17 256GB Sage | current_storage_pressure, colour shortlist skipped |
| r1b | BLOCKED after step 2 | bought 18-pro-max 512GB Glacier (not the transcript's 18 Pro) | size_fit_check and smaller-model demo unreachable |
| r1c | pass, with skipped step | left | camera_setup skipped; rescue replaced by recommend |

## (a) My conversion choices (not engine problems)

- Qid mapping: round-1 storage_wanted + storage_floor_confirm became storage_need then a reopen of storage_need (r1a); form_factor opener in r1c is asked first with no opening_intent; transcript "recommend/close" recaps became {"t":"confirm"}.
- The transcript staff line "answer_throwback + next question" is just the ask (the engine answers the owed throw-back inside it).
- Throw-backs with no exact engine id were mapped to the nearest: s04 Camera Control query -> compare:17e:17; s06 "longest zoom" -> attr:tele; r1a "zoom lens" -> attr:tele; r1c "does the bigger one cost more" -> compare:17:air; compare ids follow engine ranking order (compare:18-pro-max:18-pro in s11, compare:air:18-pro-max in s16).
- "rows" in the transcripts means model x tier, the runner's `rows` means model x tier x colour; I only used `rows` where the pool was one SKU.
- Round-1 reaction "I want more camera" has no engine option; used "unsure" (r1a).
- Tones mapped: annoyed -> impatient, apathetic -> neutral, enthusiastic/warming -> friendly.

## (b) Engine vs transcript disagreements

| # | transcript | step | what the transcript did | what the engine did/said | who is right | suggested engine change |
|---|---|---|---|---|---|---|
| 1 | s11 | S13 | After a lone model (18 Pro Max) was shown, staff ran size_fit_check ("will 6.9 inch suit her hands?"). | size_fit_check needs a smaller model still in the pool; with one model it is not askable. Step skipped in the replay. | Unclear. Engine rule is consistent (nothing to switch to), but the question is a real fit check, and the customer's "no idea, small hands" is useful. | Allow size_fit_check when the lead is 6.5" or bigger even if alone, "smaller" then reopens the model (compare r1b). |
| 2 | r1b | S3-S7 | Customer named the 18 Pro Max, staff size_fit_check, customer asked to try the smaller one, demo of 18 Pro, switched. | Naming a model collapses the pool to it, so size_fit_check is illegal and the 18 Pro is not on the customer's demo/pick menu. Replay blocked after known_model and finished on the Pro Max. | Transcript. Customers do change model after naming one; it is the whole point of the fit check. | A fixed model should not hide siblings from the demo/pick menu; add a "show me something smaller/cheaper" customer action that clears `fixed`. |
| 3 | r1b | C4/C6 | Customer free-text-ish canned actions ("Can I try the smaller one?", "That feels about right"). | Only demo/pick/change/leave/ok exist, and only for models in the pool. | Engine rule (no free text), but needs the sibling-model fix above. | Add a relational action: try_model relative to the fixed one (smaller/cheaper). |
| 4 | s14 | C5/S6 | Customer answered a colour question (Lavender) and asked to try the 17 in the same turn. | A reply is picks OR an action. I used the demo action, so the Lavender answer was dropped (pool stays 3 models) and colour_pick asks again later. | Transcript (natural speech). | Let a reply carry picks plus an optional action, applying the picks first. |
| 5 | s14 | S4/C4 | Staff offered a demo of the 17e only; decline covered only that model. | offer_demo lists up to 4 candidates, and a decline marks all of them declined. | Engine is simpler but loses information. | Decline per model, or offer one model at a time. |
| 6 | s15 | C10/S11 | At the confirm step the customer said "Change the model" and threw back "how does the Max compare?"; staff answered, then reopened the budget in the same turn. | No throw-backs are offered at confirm, nudge or rescue. The compare question cannot be asked there. Replay drops it. | Transcript. A customer reconsidering at confirm naturally compares. | Offer the compare throw-backs on the confirm pending too (pool is one SKU but the siblings still exist). |
| 7 | s15 | S12/C12 | Staff "which way are you leaning" with 2 models, customer picked the Max. | No such staff move; replay uses offer_demo and the customer picks by the standing "pick" action. Now partly covered by the new recommend move. | Engine now has recommend; fine. | Use recommend as the "which way" move; no change. |
| 8 | s15 | C10 | "Change the model" kept the Glacier colour (both models have it). | "Change the model" wipes colour and storage answers, so colour_pick is asked again (step 13). | Transcript (keeping a still-valid answer is less annoying). | On model change keep colour/storage answers that still exist for the new model. |
| 9 | s16 | S1-S4 ranking | After "large screen" staff ranked Duo (7.6"), 18 Pro Max (6.9"), Air (6.5"). | Large screen is a flat +1 per large model, so all tie and the cheapest (Air) leads. Leader expectations at steps 2 and 3 removed. | Transcript. Larger screens should rank higher among large ones. | Score bigScreen by inches over the band, not by band membership. |
| 10 | s16 | S13/C14 | "Happy with this one" on a demo only meant leaning toward the Air; 2 models stayed in the pool (budget reopened afterwards). | "happy" fixes the model immediately, so the pool is 1 model. models=2 expectation removed at step 7. The reopen still works because the budget question stays reopenable. | Engine, arguably (decision recorded), but it removes the Max from the customer's menu while staff still reopens budget. | Keep `fixed` soft until confirm, or have "happy" only push the model to the top of the ranking. |
| 11 | s11 | S3-S5 ranking | Ranking after photos/video/streaming: Duo (44h), 18 Pro Max (43h), 18 Pro (34h) (hours first). | Engine ranks 18 Pro Max, 18 Pro, Duo (it scores lenses and 4K/ProRes as well). Leader expectation removed at steps 2 and 3. | Unclear. The transcript's ranking key was written for that case; the engine rule is the agreed starting rule. | Tune: weight battery hours more when battery is the stated priority, or keep as is and update the transcript. |
| 12 | s04 | C3 | Throw-back was "does the 17e have Camera Control?" (attribute query on a named model and attribute). | Throw-backs are attr:tele / battery / weight / screen / price or compare; there is no per-feature query. Mapped to compare. | Engine limitation; transcript is natural. | Add attr:<feature> throw-backs for the hardware_features list (cameraControl, dynamicIsland, promotion). |
| 13 | s06 | C3 | "Which one has the longest zoom?" | No zoom-length throw-back; mapped to attr:tele. | Engine limitation. | Add attr:zoom (data has maxZoomX). |
| 14 | s09 | C4 | Throw-back "budget_is_firm". | No such id; dropped. The engine's nudge flow covers it, but the firm flag has no effect (customer can still "keep" twice). | Unclear. | Either add a firm flag the NPC uses, or leave to the nudge/keep path. |
| 15 | r1c | C6 | At the nudge the customer threw back "can you do a better price?". | No throw-backs on nudge/rescue/confirm pending states, and the menu has haggle only on normal pending states. Dropped. | Transcript (haggling happens exactly when money blocks the sale). | Offer haggle at nudge. |
| 16 | r1c | S19 | rescue_offer after "not for me" with a non-empty pool (2 models): see Air, see Duo, think. | rescue is legal only when the pool is empty. The new recommend move (Air) plus the customer's leave action stands in; the Duo suggestion (already excluded from the pool) cannot be offered. | Engine rule is sound; the Duo offer is the missing part. | Allow recommend of a model outside the pool, named as a trade-off (the "if it's the fold you miss" line). |
| 17 | r1c | S11 | camera_setup ("how many cameras?"). | No such question; telephoto_need is not askable because the 4 remaining models have no separate telephoto. Step skipped. | Engine. Camera count is a weak proxy; the data supports lens counts but nobody asked in round 2. | None, or add a camera_lines question if photos signals need it. |
| 18 | r1a | S3 | current_storage_pressure ("is your phone always full?") drove the storage floor. | No such question; skipped. storage_need covers the floor directly. | Engine (round-1 only). | Optional: soft question that pre-selects storage_need. |
| 19 | r1a | S25-S29 | colour_prefs shortlist (Mist Blue, Sage) then storage tier, then colour_final. | Once the model is fixed colour_prefs is not askable; only colour_pick. The shortlist step is skipped. | Engine (colour_pick covers it; the shortlist added a turn). | None. |
| 20 | r1a | C14 | Demo reaction "I want more camera" (a feature request). | Reactions are happy/another/expensive/notforme/unsure only; used "unsure" with attr:tele. | Engine. | Optional reaction "wants more of X" feeding a signal. |


## What needs your attention

- Decisions only you can make: #2 and #3 (a named model hiding its siblings; that blocks r1b and is the biggest engine gap), #4 (reply = picks plus action), #9-#11 (ranking rules and whether "happy" fixes the model).
- The replays that carry removed expectations are s11 (top), s14 (models after step 5), s16 (top, models), so a future engine change that fixes these should re-add them: see each JSON's `notes`.
