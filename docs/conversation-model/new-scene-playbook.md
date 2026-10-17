---
status: draft
what: Recipe for building the next conversation scene on this system, what is phone-specific versus generic today, and the pitfalls already paid for. Compact first version.
date: 2026-10-18
source: the phone-scene build (see how-we-built-it.md), updated after porting the laptop scene the same night (Claude, overnight run under Ritesh's standing authorization; see decisions.md). The generalisation section was a proposal; porting laptop tested it and found it did not land as planned -- see below.
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

## Generic today vs phone-specific (updated after porting laptop)

The plan below was to do the scene-definition refactor *while* porting laptop, on the theory
that porting first and extracting what the two scenes actually share would avoid designing a
generic core from imagination. Laptop was ported (`src/shared/talk/scenes/laptop/`); **the
extraction did not happen** -- what's below is what's actually true of the code today, not the
plan that was supposed to produce it.

- **Actually extracted into `core/` and reused by both scenes:** only `core/rng.ts` (the seeded
  generator and its helpers) and `core/types.ts` (`Tone`, `Role`, `Option`, `Answer`, the
  tone-to-expression map). That's it.
- **Still fully duplicated, not shared:** the turn protocol (`scene.ts`'s `staffActs`/
  `applyStaff`/`customerMenu`/`applyCustomer`), `derive()`-as-a-fold and its helpers (`askable`,
  `reopenable`, `gain`, `withoutAnswer`, `rowsIf`, `optionsFor`), the NPC loop shape
  (`npc.ts`'s `customerMove`/`staffMove`/`runConversation`), obligations (`forced`/`owed`). Every
  one of these exists twice, nearly line-for-line, once under `src/shared/talk/` for phones and
  once under `src/shared/talk/scenes/laptop/` for laptops. Porting laptop *by copying* did confirm
  these shapes are identical across two real scenes (the files really do read as the same logic
  with phone nouns swapped for laptop ones) -- that's useful evidence for the next attempt -- but
  confirming an abstraction is possible is not the same as having built it.
- **Genuinely scene-specific, as expected:** `data.ts` (the sourced catalogue and its schema),
  the attributes in `pool.ts`, every question in `bank.ts`, the facts and phrasing in `lines.ts`,
  the personas in `npc.ts`.
- **Still a proposed refactor, not built:** the scene-definition object (`items`, `constraints`,
  `signals`, `bank`, `moves`, `outcomes`, `wording`) with the engine generic over it, so
  `scenes/phone/` and `scenes/laptop/` share a real `core/engine.ts`. Doing this *now*, against
  two real scenes instead of one, is lower-risk than the original plan to do it blind -- but it
  is still a from-scratch extraction pass, not a cleanup of something half-done.

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
