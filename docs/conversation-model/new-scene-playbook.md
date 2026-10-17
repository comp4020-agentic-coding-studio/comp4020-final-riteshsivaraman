---
status: draft
what: Recipe for building the next conversation scene on this system, what is phone-specific versus generic today, and the pitfalls already paid for. Compact first version.
date: 2026-10-18
source: the phone-scene build (see how-we-built-it.md). The generalisation section is a proposal, not built.
---

# Playbook: building the next scene

## Recipe (the order that worked)
1. **Define the scene:** the two roles, the goal, the possible outcomes (including "leaves"), what it hands off to, and what is out of scope. Write it into `decisions.md` as Ritesh's words, dated.
2. **Name the pool.** What is the set of candidates the conversation narrows? Phones: model x storage x colour. Service: candidate faults or repair options. Staff fetch: candidate items or locations. Hard constraints shrink it; soft signals only re-rank it.
3. **Source the data** (D37): fetched, dated, `null` for not stated. Nothing a character says may go beyond a field.
4. **Mockup and numbered questions with defaults** to Ritesh before any code.
5. **Scenarios:** one agent designs about 16 customer briefs with computed feasibility (prompt B in `prompts.md`). They become NPC personas and regression tests.
6. **Sample transcripts** (prompt C), one agent per batch, until a round adds almost no new question types.
7. **Bank:** each question has preconditions, options generated from the pool, and effects.
8. **Engine:** reuse the turn protocol, `derive` as a fold, obligations (`forced`, `owed`), NPC loop (see `engine-reference.md`).
9. **Replays** of the transcripts (prompt D), **seeded simulation** with the invariants in `spec/talk-sim.test.ts`, **wording specs** like `spec/talk-lines.test.ts`.
10. **Play it, paste transcripts, fix with a spec each.** Then the **review loop** (`scripts/talk-transcripts.ts` plus prompt E on fresh seeds, spot-check before acting).

## Generic today vs phone-specific
- **Generic:** turn protocol and legality checks, scene as plain data, state as a fold over answers, obligations, mandatory open and close, tone and face, NPC loop shape and seeded RNG, the replay runner, the simulation harness, the trace tool, the review loop.
- **Phone-specific:** `data.ts`, the attributes in `pool.ts`, every question in `bank.ts`, the facts in `lines.ts`, the personas in `npc.ts`, demo/recommend moves (the "present a candidate" idea is generic, the wording is not).
- **Proposed refactor (not built):** a scene definition object (`items`, `constraints`, `signals`, `bank`, `moves`, `outcomes`, `wording`) with the engine generic over it, so `scenes/phone.ts` and `scenes/<next>.ts` share `core/`. Do it while porting the second scene, not before: two examples show what is truly shared.

## Pitfalls already paid for (details: how-we-built-it.md section 7)
- Two correct rules interacting (test pairs of features, not each alone).
- A fact held in two places (derive everything from the answers).
- Wording glued from independent parts (lead-in plus built-in acknowledgement; tone plus label).
- A claim scoped to the wrong set (say what the comparison was).
- An invented fact (check every number and "closest/best/only" against data).
- A rule that fits the examples but not the data (golden tests).
- A phone left by elimination treated as chosen (require acceptance).
- A thrown-back question overwritten by another (obligations are a list).
- Reviewer noise (spot-check; fresh seeds each pass).

## Definition of done for a scene
Specs green; replays of its transcripts pass or are logged in a findings file; 400-run simulation invariants hold; two review passes on fresh seeds with the real findings fixed; Ritesh has played both sides; wording reviewed by him; then the ADR and wiring (event log row per state change).
