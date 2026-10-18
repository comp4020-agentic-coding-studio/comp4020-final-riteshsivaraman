---
status: working
what: Entry point for the conversation model: what it is, what state it is in, where every part lives, and how to run it. Read this first in a fresh session.
date: 2026-10-18
source: written from the repo as it stands at commit 417f949 and the build session of 2026-10-17, updated after the laptop scene was ported overnight (Claude, under Ritesh's standing authorization; decisions.md's 2026-10-18 entries), updated again after the real core extraction (3 steps, core-extraction-proposal.md) and the device-service scene (service-scene-proposal.md), both reviewed and approved by Ritesh before building. Claude's account; Ritesh's decisions are quoted and dated in decisions.md.
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
| Phone-purchase scene | Working end to end: engine, NPCs, POC page, two-tab mode. **Wired into the real server** (2026-10-19, Ritesh: phone-only, coexist -- `server-wiring-proposal.md`): an NPC-staffed "phones" conversation runs this engine for real, with its `Scene` persisted in `conversations.data` and one `events` row per turn, verified live against two WebSocket clients and the real SQLite file |
| Laptop-purchase scene (G3) | Built and tested overnight (Ritesh's standing authorization; see decisions.md). Engine, NPCs, sourced data (`laptops.json`), specs, a transcript generator. **Not yet**: an automated reviewer pass on fresh seeds, Ritesh playing either side, wording review -- see conversation-types.md's G3 entry |
| **Core extraction** | **Done, in 3 checked-in steps** (`core-extraction-proposal.md`, reviewed by Ritesh before each step): `core/engine.ts` now holds the one real implementation of `derive`/`askable`/`gain`/the turn protocol/`validatePicks`/`hintText`, `core/npc.ts` holds `staffMove`/`runConversation`/`randomStaff`. Phone and laptop are thin wrappers over this; all 140 of their specs pass unchanged. What's still correctly scene-owned, not a gap: `pool.ts`, the bank's question content, `lines.ts`, and `confirm`/`reconfirm`/`keepPreferences`/`compatible`/`consistent`/`customerMove`/`randomPersona` (see engine-reference.md) |
| **Device-service scene (G1), v1** | Built on top of the extracted core -- the real test of whether it generalizes beyond two purchase scenes (`service-scene-proposal.md`, reviewed by Ritesh before building). It does **not** reuse `core/npc.ts`'s `staffMove` or any of `core/types.ts`'s `Pending`/`StaffAct`/`CustomerAction`/`Ended` -- those turned out to be purchase-family vocabulary, not pool-shape-generic (see engine-reference.md). It does reuse `core/engine.ts`'s fold wholesale. Phone-only, 4 symptoms, one deterministic `run_check` staff move, one mandatory data-loss gate verified failing-first |
| Tests | 162 talk specs across 14 files (`pnpm test:talk`), no running app needed -- 106 phone, 34 laptop, 22 service |
| Sample conversations (phone) | 11 transcripts replayed as tests (1 blocked, see `replay-findings.md`) |
| Simulation | Phone: 400 seeded NPC-vs-NPC conversations on every test run, none stuck, about 80% sell. Laptop: 400 on every test run (none stuck, ~71% sell), plus an ad hoc 2000-seed spot check. Service: 500 on every test run (none stuck), plus the data-loss gate checked against every seed's engine state directly, with its own mutation-check proving that test would catch the gate broken |
| Reviews (phone) | 2 automated review passes (38 then 25 patterns found); all real findings fixed and pinned by specs |
| Reviews (laptop, service) | None yet by a fresh reviewing agent -- laptop has ~250 hand-spot-checked transcripts (found one grammar bug and two engine bugs); service has a 20-seed spot check (found one engine bug, `symptom` needed to be "route" not "hard" -- see engine-reference.md) |
| Not done | ADR, wiring to the real server/DB/event log, removal of the old engine, listener facial reactions, billing, and the remaining scenes (see "Not done" below) |

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
| `src/shared/talk/core/` | the real shared engine: `rng.ts`, `types.ts` (Tone/Role/Option/Answer, tone-to-expression, and the purchase-family `Pending`/`StaffAct`/`CustomerAction`/`Ended`), `engine.ts` (the question-bank fold and turn-protocol pieces, generic over any `EngineDeps`), `npc.ts` (`staffMove`/`runConversation`/`randomStaff`, generic for any scene whose `StaffAct` matches the purchase shape) |
| `src/shared/talk/` | the phone scene: `data`, `pool`, `bank`, `scene`, `lines`, `npc` -- all now thin wrappers over `core/`, re-exported under the original paths so every import keeps working |
| `src/shared/talk/scenes/laptop/` | the laptop scene: `data`, `pool`, `types`, `bank`, `scene`, `lines`, `npc` -- same thin-wrapper-over-`core/` shape as phone |
| `src/shared/talk/scenes/service/` | the device-service scene (G1): `data` (the fault table, real-vs-invented split marked), `pool`, `types` (its own `Pending`/`StaffAct`/`Outcome` -- not the purchase ones), `bank`, `scene` (the data-loss gate), `lines`, `npc` (its own `staffMove`, since `core/npc.ts`'s doesn't fit this scene's acts) |
| `spec/talk-*.test.ts` | the specs; `spec/talk-replays/*.json` are the phone transcripts as menu picks |
| `vitest.talk.config.ts` | runs just the talk specs, no app needed |
| `scripts/talk-transcripts.ts`, `scripts/talk-laptop-transcripts.ts`, `scripts/talk-service-transcripts.ts` | generate NPC-vs-NPC transcripts for reading, one per scene |
| `poc/talk/` | the throwaway HTML page (`pnpm poc`) -- phone scene only; laptop has no page |
| `.talk-runs/` | generated transcripts (gitignored; regenerate any time) |
| `src/server/talkWire.ts` | wires the phone scene into `service.ts` for an NPC-staffed "phones" conversation: a deterministic per-conversation RNG, the `TurnView`-flattening of the engine's menu, the stock-reservation gap noted in its own header |
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
- **Wiring to the real server**: done for phone only, coexisting with the old engine
  (`src/server/talkWire.ts`, `server-wiring-proposal.md`, 2026-10-19). An NPC-staffed "phones"
  conversation is real: `Scene` persisted in `conversations.data`, one `events` row per turn.
  **Not wired:** laptop, service, a human-staffed "phones" conversation (still the old engine --
  the new engine's richer menu has no staff-side UI yet), and the "bought" ending does not reserve
  real stock (the new engine's model ids and the store's catalogue/stock ids were never
  reconciled -- a separate piece of work, named in `server-wiring-proposal.md`, not hidden).
- **Wording is placeholder** ([TK]): all phrases are in each scene's `lines.ts`; Ritesh rewrites
  them in his voice. Service's lines are especially placeholder-heavy (v1 proved the mechanism,
  not the wording).
- **Laptop has had no automated reviewer pass** (prompt E in `prompts.md`), no hand-written
  sample transcripts or replay suite, and Ritesh has not played either side or reviewed its
  wording. **Service has the same gaps**, plus it has never been played by a human at all (only
  NPC-vs-NPC and a 20-seed spot check). The two-review-passes-plus-Ritesh-plays-it bar in
  new-scene-playbook.md's "Definition of done for a scene" is not met for either.
- **Service v1's deliberate scope cuts** (service-scene-proposal.md section 3): the "replace the
  device" cross-scene handoff (needs the case/handoff machinery conversation-types.md section I
  names as separate shared work, not something this engine does internally), G2's other device
  classes, and any pricing mechanism beyond `[TK]`-labelled invented placeholder.
- **Unbuilt:** coverage report over reachable pools (specified in decisions.md, not built);
  mutation checks were done by hand on the important rules, not automated (the data-loss gate's
  own mutation check is an exception -- see `spec/talk-service-sim.test.ts`); listener facial
  reactions; an "annoyed" face (graphics' call); the other scenes (see the types document).
- **Decisions waiting for Ritesh:** whether the "check your earlier wishes" move should be
  forced; whether staff should require more than use-or-budget before recommending; a third
  automated review pass (token cost); which scene is next (greeter/G4 starts the case object
  several other scenes depend on; checkout/G5 closes the purchase journey).
- **Known blocked replay:** `r1b` (a customer who names a model and then wants to compare it
  with a smaller one): the engine collapses the pool to a named model. See findings #2 and #3.
  (Phone scene only; laptop and service have no replay suite to block.)
