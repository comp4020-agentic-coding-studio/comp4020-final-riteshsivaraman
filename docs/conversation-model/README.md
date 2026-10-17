---
status: working
what: Entry point for the conversation model: what it is, what state it is in, where every part lives, and how to run it. Read this first in a fresh session.
date: 2026-10-18
source: written from the repo as it stands at commit 417f949 and the build session of 2026-10-17, updated after the laptop scene was ported the same night (Claude, overnight run under Ritesh's standing authorization; see decisions.md's 2026-10-18 entry). Claude's account; Ritesh's decisions are quoted and dated in decisions.md.
---

# The conversation model

A menu-only, two-party conversation system for the store, built first for one scene
(**a customer buying a phone from a phone specialist**) and meant to be reused for every
other kind of conversation. It replaces the earlier slot-filling engine
(`scripts/sim/`, the phones script in `src/shared/conversation.ts`, ADR 6).

**The one idea:** a conversation is two people taking turns, every line a pick from a
menu. The menu is built from a **pool** of candidates (for phones: model x storage x
colour) that **hard constraints** shrink and **soft signals** only re-rank; **questions**
carry preconditions and effects on that pool, so what gets said stays consistent and the
gaps in the bank are findable. NPCs choose among the same legal moves with weights and
noise, so nothing is scripted.

## Status (2026-10-18, updated the same night)

| | |
|---|---|
| Phone-purchase scene | Working end to end: engine, NPCs, POC page, two-tab mode |
| Laptop-purchase scene (G3) | Built and tested the same night (overnight run, Ritesh's standing authorization; see decisions.md). Engine, NPCs, sourced data (`laptops.json`), specs, a transcript generator. **Not yet**: an automated reviewer pass on fresh seeds, Ritesh playing either side, wording review -- see conversation-types.md's G3 entry |
| Tests | 140 talk specs across 10 files (`pnpm test:talk`), no running app needed -- 106 phone, 34 laptop |
| Sample conversations (phone) | 11 transcripts replayed as tests (1 blocked, see `replay-findings.md`) |
| Simulation | Phone: 400 seeded NPC-vs-NPC conversations on every test run, none stuck, about 80% sell. Laptop: 400 on every test run (none stuck, ~71% sell), plus an ad hoc 2000-seed spot check (none stuck, ~80% sell) |
| Reviews (phone) | 2 automated review passes (38 then 25 patterns found); all real findings fixed and pinned by specs |
| Reviews (laptop) | None yet by a fresh reviewing agent -- only hand spot-checks of ~250 generated transcripts, which did find and fix one real grammar bug ("a M5 chip" -> "an M5 chip") and the two engine bugs noted in new-scene-playbook.md |
| Not done | ADR, wiring to the real server/DB/event log, removal of the old engine, coverage report, listener facial reactions, billing and every other scene (see "Not done" below). **The core/phone/laptop split is still duplicated code, not a shared engine** -- see new-scene-playbook.md's "Generic today vs phone-specific" for exactly what is and isn't shared |

## Where everything is

Read in this order.

| Path | What it is |
|---|---|
| `docs/conversation-model/README.md` | this file |
| `docs/conversation-model/how-we-built-it.md` | **the whole process**, start to finish: method, timeline with commits, decisions and why, every class of bug found and how, what worked |
| `docs/conversation-model/engine-reference.md` | how the engine works: modules, types, the turn protocol, invariants, extension points |
| `docs/conversation-model/new-scene-playbook.md` | **how to build the next scene**: step-by-step recipe, what is phone-specific and what is generic, pitfalls |
| `docs/conversation-model/conversation-types.md` | **brainstorm of every conversation in the store**, taxonomy, sketches, suggested build order |
| `docs/conversation-model/decisions.md` | Ritesh's settled decisions, dated, in his words where possible |
| `docs/conversation-model/prompts.md` | the prompts used for every subagent (scenario design, transcripts, replay conversion, reviewer), reusable |
| `docs/conversation-model/scenarios.md` | 17 customer briefs (hidden goals, wants, behaviours) with feasibility checks |
| `docs/conversation-model/devices.json` | the sourced phone data (Apple AU, fetched 2026-10-17); `devices-v2-notes.md` explains it and lists what is not stated |
| `docs/conversation-model/devices.md` | the first, smaller fact sheet (kept as history) |
| `docs/conversation-model/laptops.json` | the sourced laptop data (Apple AU, fetched 2026-10-18, preconfigured SKUs only); `laptops-v2-notes.md` explains the schema and what's deliberately out of scope (build-to-order configs, the nano-texture finish) |
| `docs/conversation-model/mockup-v0.html` | the static mockup the design was corrected against (phone scene only; no mockup step was done for laptop) |
| `docs/conversation-model/transcripts/round-1/`, `round-2/` | the sample conversations written to discover the phone question bank (no equivalent hand-written transcripts exist for laptop; its bank was ported, not independently discovered) |
| `docs/conversation-model/replay-findings.md` | where the phone engine and the transcripts disagreed, 20 rows (laptop has no replay suite: it was never given hand-written transcripts to replay) |
| `docs/conversation-model/review/review-1.md`, `review-2.md` | the two automated review reports, phone scene only |
| `src/shared/talk/core/` | the only genuinely shared code: `rng.ts`, `types.ts` (Tone/Role/Option/Answer, tone-to-expression) |
| `src/shared/talk/` | the phone engine: `data`, `pool`, `bank`, `scene`, `lines`, `npc`, plus `rng.ts`/`types.ts` re-exporting `core/` |
| `src/shared/talk/scenes/laptop/` | the laptop engine: `data`, `pool`, `types`, `bank`, `scene`, `lines`, `npc` -- a near-literal duplicate of the phone modules' structure, not a shared abstraction (see new-scene-playbook.md) |
| `spec/talk-*.test.ts` | the specs; `spec/talk-replays/*.json` are the phone transcripts as menu picks |
| `vitest.talk.config.ts` | runs just the talk specs, no app needed |
| `scripts/talk-transcripts.ts`, `scripts/talk-laptop-transcripts.ts` | generate NPC-vs-NPC transcripts for reading, phone and laptop respectively |
| `poc/talk/` | the throwaway HTML page (`pnpm poc`) -- phone scene only; laptop has no page |
| `.talk-runs/` | generated transcripts (gitignored; regenerate any time) |
| `LEARNINGS.md` | entries from this work, each tied to a course lecture lesson |
| `WORKLOG.md` | dated entries under "Conversation model" |

**Old engine, still in the repo until the POC is approved:** `scripts/sim/` (`pnpm sim`),
`src/shared/conversation.ts`, `spec/conversation.test.ts`, ADR 6
(`docs/adr/0006-behaviour-loop-and-conversation-engine.md`), `src/server/cases.ts`.

## Commands

```
pnpm test:talk        # the 106 specs, ~1 second, no app needed
pnpm typecheck        # whole repo
pnpm poc              # the playable page on http://localhost:5180/
node scripts/talk-transcripts.ts --n=40 --seed=1000 --out=.talk-runs/run1
                      # pnpm talk:runs does the same; writes one transcript per conversation
```

The page takes a hash: `#role=staff|customer&vs=npc&seed=7` (against an NPC) or
`#role=customer&vs=tab&room=abc` (second tab, same browser only).

## Not done (and who decides)

- **ADR** superseding ADR 6: waits for Ritesh's approval of the POC (his call, 2026-10-17).
- **Wiring** to the real server, SQLite, the `events` table and the 3D store. The engine is
  pure (state in, state out); the event-log rule in CLAUDE.md applies the moment it is wired.
- **Wording is placeholder** ([TK]): all phrases are in `lines.ts` (`SAID`, the tone tables,
  the staff leads), phone and laptop both; Ritesh rewrites them in his voice.
- **The core/phone/laptop split is still duplicated code, not a shared engine.** Porting
  laptop was meant to extract a real generic core (new-scene-playbook.md's "Proposed refactor");
  only `core/rng.ts` and `core/types.ts` actually got pulled out. The turn protocol, `derive()`
  and its helpers, and the NPC loop shape exist twice, once per scene. Confirmed-but-not-built:
  see new-scene-playbook.md's "Generic today vs phone-specific" for the honest state of this.
- **Laptop has had no automated reviewer pass** (prompt E in `prompts.md`), no hand-written
  sample transcripts or replay suite (its question bank was ported from the phone scene's shape,
  not independently discovered the way the phone bank was), and Ritesh has not played either
  side or reviewed its wording. The two-review-passes-plus-Ritesh-plays-it bar in
  new-scene-playbook.md's "Definition of done for a scene" is not met for laptop yet.
- **Unbuilt:** coverage report over reachable pools (specified in decisions.md, not built);
  mutation checks were done by hand on the important rules, not automated; listener facial
  reactions; an "annoyed" face (graphics' call); the other scenes (see the types document).
- **Decisions waiting for Ritesh:** whether the "check your earlier wishes" move should be
  forced; whether staff should require more than use-or-budget before recommending; a third
  automated review pass (token cost); whether to do the real core extraction now that two
  scenes exist to extract it from, and if so whether to do it before or after a third scene.
- **Known blocked replay:** `r1b` (a customer who names a model and then wants to compare it
  with a smaller one): the engine collapses the pool to a named model. See findings #2 and #3.
  (Phone scene only; laptop has no replay suite to block.)
