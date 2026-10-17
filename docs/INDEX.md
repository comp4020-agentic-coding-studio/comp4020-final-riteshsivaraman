---
status: reference
what: Index of every decision/working-state document in the repo, moved out of CLAUDE.md so the always-loaded file stays lean
date: 2026-10-17
source: verbatim from CLAUDE.md 'Where things live' (lines 143-273) before the prune
---

# Where things live
This file is the index. Any time a new document gets created that records a
decision or working state — an ADR, `WORKLOG.md`, `LEARNINGS.md`, `CUTS.md`,
anything in `spec/`, `PROCESS.md` — add a one-line pointer to it here, in
this section, when it's created. A fresh agent session should be able to
find every resource by reading this file, not by discovering it mid-task.
- `PROCESS.md` — the account of how this was built, Ritesh's prose, cites
  commits by hash. Candidate citations as they happen: ADR 1 (stack choice),
  the feel-vs-function verification split and why, the timer/catch-up design
  forced by Fly's auto-stop machine, a defect-loop instance that actually
  caught something, the subsystem-delegation structure and the
  fiction-integrity sweep (evidence of taking "satirise, don't harm"
  seriously).
- `reflections/crit-{8,9,10}.md` — the two standing crit prompts, one file
  per crit, Ritesh's prose.
- `spec/README.md` — what's fixed (the two invariants) vs the store's own.
- `SCOPE.md` — the store project's scope: the one idea, decisions D1 to
  D24, tiers, staff roles, scenarios, open items. The nearest thing to a
  spec; read it before building anything.
- `docs/adr/` — numbered decision records. Write one before changing stack,
  storage, or the data model. An accepted record is
  never edited; a changed decision gets a new, numbered record that
  supersedes it and says why.
- `docs/adr/0007-stack.md` — ADR 7 (draft): the stack as it stands (R3F, Hono + ws, SQLite on a Fly volume). Facts filled in, reasoning `[TK]` for Ritesh. Read before changing stack, storage or the real-time transport.
- `docs/adr/0003-conversations-and-player-state.md` — ADR 3 (draft): player state in
  the database, menu conversations, employees online see customers' states. Facts
  filled in, reasoning `[TK]` for Ritesh. Read before touching `visitors`,
  `player_state`, `conversations`, `stock` or `src/shared/conversation.ts`.
- `docs/customer-journeys.md` — seven end-to-end customer transcripts (draft, for
  Ritesh's review) and what they imply; read before writing any conversation
  script. Prices and policies in it are `[TK]`/`[verify]`.
- `docs/adr/0004-cases-and-moves.md` — ADR 4 (draft): a durable case per customer
  goal and conversations as moves with preconditions; either party can start.
  Supersedes ADR 3's "character only talks if the visitor starts". **Option B
  confirmed and schema built 2026-10-13 (SCOPE D42)** — see the addendum.
  Reasoning `[TK]`.
- `scripts/sim/` (`pnpm sim`, optional `--seed=N` to replay a run) — SCOPE
  D43: a throwaway terminal prototype of the loop/case/slot design, option B
  (cheap and disposable, not the shipped engine — `src/server/cases.ts`
  below is the real one). Play as customer or employee; NPCs get seeded
  traits so their randomness is personality, not per-turn dice. The
  customer POV takes free text via an optional OpenRouter bridge (`ai.ts`,
  key in `mise.local.toml` as `OPENROUTER_API_KEY`, same fallback-when-
  unavailable shape as D8 — switched from Gemini after its free tier
  turned out to be 5 req/min and model availability shifted mid-session).
  Slot-filling is a genuinely non-linear turn (`interpretTurn`, every open
  slot on the table each turn, any order, several at once or none), not a
  for-loop over a fixed question list — `SLOT_ORDER` is only the engine's
  own fallback shape now. Needs a large free model (120B tested); a small
  one narrated answers it never actually recorded. The employee POV's
  NPC-customer side is still menu-only. Read before deciding whether/how
  to port its validated design into the real engine.
- `src/server/cases.ts` — the case/case_facts data layer ADR 4's addendum
  describes: `openCase`, `handOffCase`, `setFact`, `factsOf`. Pure, like
  `stock.ts`; not yet wired into `service.ts`'s claim/handOn/open flow, and
  writes no `events` row itself — that belongs at the call site once wired.
  Migration 6 (`src/server/migrate.ts`) adds its tables. Read before touching
  `cases`, `case_facts`, or `conversations.case_id`.
- `docs/adr/0006-behaviour-loop-and-conversation-engine.md` — ADR 6 (draft,
  from a grilling session): resolves D32's open timetable-vs-reactive
  behaviour decision as "timetable + interruptible", one generic
  idle/converse/leave loop shared by every customer purpose and staff role
  (repair and pickup excepted), and concretises ADR 4's "moves with
  preconditions" as slot-filling with a per-script ordering policy instead of
  an authored node graph. D40's NPC-auto-claim wiring question and build
  sequencing remain open. Reasoning `[TK]`. See SCOPE.md D41.
- `docs/data-overview.html` — diagram of where every kind of data lives today.
- `src/shared/assignments.ts` — maps every table id+side, wall desktop/
  monitor/headphone slot, and bay ledge to a specific real model id (pure
  data, doesn't touch `layout.json`/`world.ts`/`plan.ts`). A proposal, not
  final — read `references/table-map.md` alongside it.
- `src/shared/slots.ts` — every product-table device's stable id (D28:
  "table and position"), one source of truth the 3D render and the
  server's inspect range-check (D39) both read. Read before touching how
  or where a device actually sits on a table.
- `docs/prompts/product-line-session.md` — the prompt for the session that designs
  every device as a real, named, distinct model (SCOPE D37). Hand it to a fresh session.
- `references/product-line.md` — Step 1 of the above: every family Apple AU
  currently sells, sourced live (phones, iPad, Mac laptops/desktops, displays,
  Watch, AirPods, HomePod, AirTag, a representative accessories slice), with
  physical-layout claims flagged text-only/unverified. Read before cataloguing
  or modelling anything outside phones.
- `src/shared/catalogue.ts` — the real sourced catalogue (phones only so far;
  other families wait on a conversation script to sell them). `docs/adr/0005-storage-sku-key.md`
  is the ADR for its storage axis; read both before touching `stock`,
  `reservations`, `catalogue.ts` or `src/server/stock.ts`.
- `docs/blueprint/` — the floor plan, four wall elevations, ceiling and mall
  drawings (D20: the drawings are the specification), drawn from
  `src/shared/plan.ts`, `world.ts` and `mall.ts`.
- `src/shared/` — the model every layer reads (layout, plan, world, mall,
  people, npcs, pose, protocol). Graphics work draws on it, never moves it.
- `references/` — photos, visitor accounts, the experience and reel notes,
  product notes. `references/README.md` says what each is.
- `docs/design-handoff.md` — the visual design spec of the earlier app on
  `main`, kept as marked history. It is **not** the store's design; the store's
  look is `docs/graphics-brief.md`. `[TK]` whether to delete it.
- `WORKLOG.md` — current state of the build, read this first for "where did
  we leave off." Top section is the store project; the earlier app's log is kept below
  it as history.
- `LEARNINGS.md` — what Ritesh is learning about prompting/working with AI
  coding assistants, cited to commits (older entries predate this and are
  stack gotchas instead).
- `CUTS.md` — what got cut under deadline pressure and why. Entries so far
  are the earlier app's (kept as marked history); none yet for the store project.
- `.claude/agents/event-log-reviewer.md` — checks the event-log-write-
  completeness invariant above; run it after a subsystem build. Its action list was
  written from `service.ts` and `presence.ts` on 2026-10-17, so re-check it
  when a new kind of action is added.
- `.claude/agents/fiction-integrity-reviewer.md` — see "Parody integrity";
  rewritten for the store on 2026-10-17.
- `.claude/skills/mutation-check/` — the defect-loop mutation check below,
  on demand for code built unwatched. Examples in its text were rewritten for the store on 2026-10-17.
- `tools/layout/index.html` + `scripts/layout-server.ts` (`pnpm layout`, port 8124) —
  the floor-plan editor for tables, benches and stools; writes only
  `src/shared/layout.json`. After saving run `node scripts/blueprint.ts`.
- `docs/graphics-brief.md` — the brief the four graphics specialists work to:
  fixed sizes, budget, ownership of `src/client/src/gfx/*`, how to check a look.
- `README.md`, `PROCESS.md`, `reflections/crit-8.md` — Ritesh's prose.
  `README.md` is a scaffold of facts and `[TK]` markers for him to write
  into; `reflections/crit-8.md` is marked history of the earlier app.
- `pnpm dev` (`scripts/dev.ts`) — server on 8080 plus the client on 5173 with
  hot reload; open http://localhost:5173.
- `references/table-map.md` — my reading of what stands on each table in the
  Canberra photo, for Ritesh to correct.
- *(add further ADRs here as they're created — don't let this list go stale.)*
- `docs/conversation-model/mockup-v0.html` — static mockup of the proposed phone-specialist conversation model (v0, for correction before any code).
- `docs/conversation-model/` — conversation-model design: `decisions.md` (settled so far), `devices.json` + `devices-v2-notes.md` (sourced attributes, 2026-10-17), `transcripts/round-1/`.
- `docs/conversation-model/README.md` — **start here** for the conversation model: status, where everything is, commands, what is not done. Siblings: `how-we-built-it.md` (the whole process), `engine-reference.md`, `new-scene-playbook.md`, `conversation-types.md` (brainstorm of every store conversation), `prompts.md` (reusable subagent prompts), `review/` (automated review reports), `replay-findings.md`.
- `src/shared/talk/`, `spec/talk-*.test.ts`, `scripts/talk-transcripts.ts`, `poc/talk/` — the engine, its specs, the transcript tool and the playable page (`pnpm test:talk`, `pnpm poc`).
