# Store sim — agent harness

COMP4020 final project, branch `new-idea`: an obvious parody of a famous
fruit-themed retail store, as a shared first-person 3D shop (React Three
Fiber client, Hono + ws + SQLite server). Real visitors and CPU players share
one room, and the Genius Bar queue is the shared state. Brand name is `[TK]`.
Scope, decisions D1 to D24, tiers and open items: `SCOPE.md`.

**`main` is a different app** (Seen, the cursed email client, deployed
earlier). `new-idea` replaced it wholesale in `b61f6c7`; nothing is carried
over (D1). Anything below that says "Seen" is history on `main`, and the
Seen-only agents and ADRs are flagged where they appear.

## Don't invent, don't guess through ambiguity
No made-up copy, stats, sources, or feature details. If a decision isn't
pinned (see `SCOPE.md`'s `[TK]` items and open decisions), mark it `[TK]` and ask rather than
guessing plausibly. This extends to implementation: never build through an
ambiguous requirement by picking the most plausible reading and proceeding —
stop and ask. A wrong guess built on top of other code is more expensive to
unwind than a short pause would have cost.

For a decision affecting multiple users or expensive to reverse (per the week
8 lecture: stack, user/person definition, persistence, real-time mechanism —
see the ADR note below), lay out the real options and their costs first,
without picking one, and let Ritesh choose before anything gets built or
written up. Don't collapse straight to a recommendation on these. Once he
chooses, record it in `SCOPE.md`'s decision table with the date.

## Event log is load-bearing
Every state-changing action (today: join, leave, role switch in
`src/server/presence.ts`; later queue join/leave, slot booking, stock
changes, device interactions) writes an `events` row (`ts, visitor_id, type,
data`, table from migration 1 in `src/server/migrate.ts`) first. The crit 10
server-log reads, and any debugging of "did this actually happen", read this
table — don't build a feature's effect without also logging the event that
caused it. This is the one invariant a reviewer pass checks across every
subsystem (see "How we work" below): did every state-changing action write
its event row. Presence positions (about 10 Hz) are never persisted and are
not events.

## No background processes
The Fly machine stops when nobody's connected (`auto_stop_machines =
"stop"`, `min_machines_running = 0`). Never rely on `setInterval`/`setTimeout`
for anything that must happen. CPU players and staff are a pure function of
server time plus persisted state (SCOPE.md Tier 1 item 7); a deadline such as
a slot expiry or closing time is a stored column caught up on the next
request that touches it, never a timer. The presence loop only exists while
someone is connected.

## Verification: checked for real, not reported
- **Feel, not just function.** The store's whole value is a feel (the
  calm, hotel-lobby intent against the lived queue; satisfaction and
  frustration both simulated end to end, SCOPE.md 0b) that `pnpm check`
  cannot measure. A harness
  that only checks stills (screenshots, static DOM, settled-state asserts)
  makes the quality nothing measures decay to zero. No feature is done until
  someone has sat in two browser profiles as two different visitors, at 1920x1080
  and 390x844, and felt the thing happen — not just read a green test name. Every checkpoint asks two
  separate questions: is it broken (automated) vs how does it feel (human,
  live, never a described screenshot).
- **State claims get checked against the real thing.** "Did it save?" means
  opening the actual SQLite file (`/data/app.db` in the container, or the
  local `.data/` path) directly, never trusted from the agent's own report.
  "A visitor can't do X" means a second, genuinely different browser
  profile (not the same session re-rendered, and not a second tab of one
  profile, which shares the cookie jar) confirms it — the back room being
  staff-only (D18, enforced by server clamping), and an out-of-stock
  configuration being unbuyable, specifically.
- **Sensor admission bar.** A check only goes into the blocking `pnpm check`
  suite if it's specific, fast, automatic, and trustworthy. Anything fuzzier
  stays advisory (or becomes a manual crit-time check) instead of being
  forced into a flaky gate. Whether a wait "feels" frustrating or the room feels calm and
  crowded are the canonical advisory-only examples — don't try to assert those
  in `spec/`. The drawings-match-the-model check (D20) is the opposite kind:
  specific, fast, blocking.
- **Spec traceability.** `SCOPE.md` section 3d lists the end-to-end
  scenarios (S1 to S11), and each Tier 1 one is meant to be a scripted-bot
  check in `spec/` over the real protocol. Each either has a matching
  `spec/*.test.ts`, or an explicit note in PROCESS.md saying why it's
  advisory-only — don't let one quietly fall off the list under deadline
  pressure. (Adapted from the Seen rule; confirm this is how you want it.)
- **Cut the feature, never cut the harness.** When behind schedule, the
  answer is smaller scope, not a skipped feel-check or a merged red test.
  The verification discipline above is the thing that doesn't flex.

## The defect loop
When something's wrong: report the symptom, not your diagnosis of it. Add
the failing sensor before attempting the fix, and confirm it's red for the
right reason. Name the bug class, not just the instance. For code written
without Ritesh watching it get written, mutate it afterward to confirm the
suite would actually catch it broken — apply this especially to
the server-authoritative rules where a subtly wrong implementation looks
identical to a correct one in every normal run: queue and slot booking,
finite stock (two visitors racing for the last unit, S11), the occupancy cap,
and the staff-only back-room clamp.

## Git hygiene and dependencies
Commit regularly: after each coherent working change, and before
deploying it, in small logical commits --- not one big batch at the end. The
history is marked evidence, and PROCESS.md and LEARNINGS.md cite it by hash.
Pushing still needs a yes from Ritesh. Amend, rebase, and force-push are flatly
banned, not just "ask first" — PROCESS.md cites commits by hash, and the
marker follows those links; rewriting history breaks a citation silently.
Adding a new dependency needs a stated reason at the point it's added (a
commit message line is enough) — an unexplained pile of packages reads as
the agent deciding alone, not a considered choice.

## Ritesh writes the prose
README.md, PROCESS.md, ADR text, and reflections/*.md are his, in his voice.
Draft structure, fact lists, and `[TK]` markers for gaps — never finished
paragraphs standing in for his account. (The brief warns agent-written docs
read like the crit agents' median answer.)

## Parody integrity
This is an *obvious* spoof (D6), not a discreet lookalike. No real
company's name, logo or distinctive mark anywhere in code, textures, signs or
copy; invent the marks and the store's name. **Product and model names may be
the real current ones (D37, Ritesh 2026-10-12), copied from the maker's own
pages with the source and date recorded, never from memory.** Everything is procedural: no downloaded models,
textures or fonts (`docs/graphics-brief.md`). Never presented as official.
Before shipping, a fresh subagent with no prior context reviews the live app
for stray real names and for visible COMP4020/crit/marker language inside
the app itself. The repo's own docs are expected to say it's a COMP4020
project. **`.claude/agents/fiction-integrity-reviewer.md` is still written
for Seen's "boring email client" cover and needs rewriting before use here.**

## Keys never touch this repo
Gemini key (D8, runtime AI with a fallback; boundary still open) and
anything else secret goes in Fly secrets
(`fly secrets set`), never in a file, never asked for in chat.

## Session handoff
Keep `WORKLOG.md` current in the repo (not `~/.claude/plans/`, which is
local-only and won't survive a fresh session or machine). Append to
`LEARNINGS.md` as Ritesh learns something about prompting or working with AI
coding assistants — not stack gotchas; that's what the file tracked before
this was flagged and is being redirected (see the file's own header). Cite
the commit(s) each entry is about. Every reply says whether that turn added a
LEARNINGS.md entry. Log cuts as they happen in `CUTS.md` (what, why, when)
rather than reconstructing them from memory later — a cut made under
deadline pressure is real process evidence, not just a loose end.

## Where things live
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
- `spec/README.md` — what's fixed (the two invariants) vs what's Seen's own.
- `SCOPE.md` — the store project's scope: the one idea, decisions D1 to
  D24, tiers, staff roles, scenarios, open items. The nearest thing to a
  spec; read it before building anything.
- `docs/adr/0001-stack.md`, `docs/adr/0002-live-preview-transport.md` —
  **both are Seen's** (Preact SPA, SSE draft preview), kept as history. The
  `new-idea` stack (React Three Fiber, Hono + ws, SQLite via better-sqlite3)
  has **no ADR yet**, nor does D8's reversal of "no runtime AI". Write one
  before changing stack, storage, or the data model. An accepted record is
  never edited; a changed decision gets a new, numbered record that
  supersedes it and says why.
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
  traits so their randomness is personality, not per-turn dice. Read before
  deciding whether/how to port its validated design into the real engine.
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
- `docs/design-handoff.md` — the visual design spec the real app is built
  against: color/type tokens, layout, the two permitted signature "dread"
  devices, copy voice, component inventory. Came from a standalone frontend
  exploration outside this repo; read this doc, not that directory, going
  forward.
- `WORKLOG.md` — current state of the build, read this first for "where did
  we leave off." Top section is the store project; Seen's log is kept below
  it as history.
- `LEARNINGS.md` — what Ritesh is learning about prompting/working with AI
  coding assistants, cited to commits (older entries predate this and are
  stack gotchas instead).
- `CUTS.md` — what got cut under deadline pressure and why. Entries so far
  are Seen's (attachments from C8, auto-send check advisory-only, company
  name `[TK]`); none yet for the store project.
- `.claude/agents/event-log-reviewer.md` — checks the event-log-write-
  completeness invariant above; run it after a subsystem build. Its prompt
  still lists Seen's actions (send, forward, self-destruct); update it to
  the store's actions before relying on it.
- `.claude/agents/fiction-integrity-reviewer.md` — see "Parody integrity";
  Seen-era prompt, needs rewriting.
- `.claude/skills/mutation-check/` — the defect-loop mutation check below,
  on demand for code built unwatched. Examples in its text are Seen's.
- `tools/layout/index.html` + `scripts/layout-server.ts` (`pnpm layout`, port 8124) —
  the floor-plan editor for tables, benches and stools; writes only
  `src/shared/layout.json`. After saving run `node scripts/blueprint.ts`.
- `docs/graphics-brief.md` — the brief the four graphics specialists work to:
  fixed sizes, budget, ownership of `src/client/src/gfx/*`, how to check a look.
- `README.md`, `PROCESS.md`, `reflections/crit-8.md` — currently describe
  Seen. Ritesh's prose; they need his rewrite for the store project, and
  nothing here should paper over that.
- `pnpm dev` (`scripts/dev.ts`) — server on 8080 plus the client on 5173 with
  hot reload; open http://localhost:5173.
- `references/table-map.md` — my reading of what stands on each table in the
  Canberra photo, for Ritesh to correct.
- *(add further ADRs here as they're created — don't let this list go stale.)*

## How we work
Build one subsystem at a time, with a fresh context per subsystem rather
than one long session, to avoid context bleed. Graphics is split across
specialists who own separate files and never run git; the lead commits. A reviewer pass checks
one cross-cutting invariant across subsystems: event-log-write-completeness
(see above) — not a full re-review of everything. Before a large batch of
building starts, restate the complete settled list for one explicit
sign-off, since a quick "yes" on a big question shouldn't be stretched to
cover more than was actually seen.

## Known gotchas (carried from crit 7, LEARNINGS.md)
- `pnpm check` can pass/fail on a stale `dist/`, not your code — clear it
  after a route/page rewrite, not just the DB.
- better-sqlite3 defaults foreign keys ON; migrations that rebuild a table
  need `PRAGMA foreign_keys = OFF` before `migrate()`, `ON` + a
  `foreign_key_check` after.
- Stop every dev server you start before finishing a task; check `lsof -i`
  on this project's ports before any destructive cleanup.
- A weak assertion (bare substring match) can pass for the wrong reason when
  the same text also appears elsewhere on the page — assert on markup unique
  to the thing under test.
- Node's `readline/promises` drops lines when driven by a bulk, non-TTY pipe
  (printed/`yes`-fed input): a real terminal (and a pseudo-tty, e.g. Python's
  `pty`) works fine. Don't trust a piped smoke test of an interactive CLI
  (`scripts/sim/`) that hangs or shows a shifted answer — verify through a
  real pty before concluding the tool itself is broken.

## Keep this file honest
When a new rule is needed, integrate it into an existing section rather than
appending a new one, and re-read the whole file before editing. Kept lean on
purpose so it's something that actually gets re-read before a crit, not
skimmed past.

## Catch repetition
If the same multi-step task gets done by hand more than once — a defect
write-up, a spec addition, a deploy-and-verify pass, a specific kind of
check — notice it and say so: propose turning it into a skill rather than
quietly repeating the ad hoc version each time. Consistency here matters
more than cleverness.

## Teach, don't just report
When reporting finished work, take the chance to actually explain how that
part of the app works — the mechanism, not just the diff — since this is
Ritesh's app to understand and defend at a crit, not just to have built. A
status update that only says what changed is a missed opportunity if the
underlying structure is new to him.

When a report's "what I need from you" list involves reading something (a
file, a diff, a commit, a drawing, a running page), open all of it for him
before sending the list: `code <path>` in VS Code, `open <path>` otherwise,
the diff written to a scratch file and opened, the dev server's URL if it
needs a browser. Never hand him a path or hash to go and find. Say in the
report what was opened. **Any URL or page opens in Safari, never Brave or the
default browser:** `open -a Safari <url>`, not a bare `open <url>`.

End every response with one or two lessons from the COMP4020 lecture notes
relevant to whatever comes next — not necessarily the most recent lecture,
whichever week's content actually applies (e.g. drawing on persistence or
decision-record guidance from an earlier week while building a later
feature). Fetch live via the `comp4020:handbook` skill rather than recalling
from memory.

## One idea, carried all the way
Every feature serves "someone's always watching." A feature that doesn't tie
back to that is a cut candidate, not a maybe.
