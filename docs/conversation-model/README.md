---
status: working
what: Entry point for the conversation model: what it is, what state it is in, where every part lives, and how to run it. Read this first in a fresh session.
date: 2026-10-18
source: written from the repo as it stands at commit 417f949 and the build session of 2026-10-17. Claude's account; Ritesh's decisions are quoted and dated in decisions.md.
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

## Status (2026-10-18)

| | |
|---|---|
| Phone-purchase scene | Working end to end: engine, NPCs, POC page, two-tab mode |
| Tests | 106 specs in 6 files (`pnpm test:talk`), no running app needed |
| Sample conversations | 11 transcripts replayed as tests (1 blocked, see `replay-findings.md`) |
| Simulation | 400 seeded NPC-vs-NPC conversations on every test run; none stuck, about 80% sell |
| Reviews | 2 automated review passes (38 then 25 patterns found); all real findings fixed and pinned by specs |
| Not done | ADR, wiring to the real server/DB/event log, removal of the old engine, coverage report, listener facial reactions, billing and every other scene (see "Not done" below) |

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
| `docs/conversation-model/mockup-v0.html` | the static mockup the design was corrected against |
| `docs/conversation-model/transcripts/round-1/`, `round-2/` | the sample conversations written to discover the question bank |
| `docs/conversation-model/replay-findings.md` | where the engine and the transcripts disagreed, 20 rows |
| `docs/conversation-model/review/review-1.md`, `review-2.md` | the two automated review reports |
| `src/shared/talk/` | the engine: `data`, `pool`, `bank`, `scene`, `lines`, `npc`, `rng`, `types` |
| `spec/talk-*.test.ts` | the specs; `spec/talk-replays/*.json` are the transcripts as menu picks |
| `vitest.talk.config.ts` | runs just the talk specs, no app needed |
| `scripts/talk-transcripts.ts` | generates NPC-vs-NPC transcripts for reading |
| `poc/talk/` | the throwaway HTML page (`pnpm poc`) |
| `.talk-runs/` | generated transcripts (gitignored; regenerate any time) |
| `LEARNINGS.md` | five entries from this work, each tied to a course lecture lesson |
| `WORKLOG.md` | "In progress: conversation model rebuild" section |

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
  the staff leads); Ritesh rewrites them in his voice.
- **Unbuilt:** coverage report over reachable pools (specified in decisions.md, not built);
  mutation checks were done by hand on the important rules, not automated; listener facial
  reactions; an "annoyed" face (graphics' call); the other scenes (see the types document).
- **Decisions waiting for Ritesh:** whether the "check your earlier wishes" move should be
  forced; whether staff should require more than use-or-budget before recommending; a third
  automated review pass (token cost).
- **Known blocked replay:** `r1b` (a customer who names a model and then wants to compare it
  with a smaller one): the engine collapses the pool to a named model. See findings #2 and #3.
