# Store sim — agent harness

COMP4020 final project, on `main`: an obvious parody of a famous
fruit-themed retail store, as a shared first-person 3D shop (React Three
Fiber client, Hono + ws + SQLite server). Real visitors and CPU players share
one room. There is no queue of customers: they browse until a staff member
approaches them. Internally the store keeps a waiting list of unattended
customers, staff are the resource, and a free staff member is assigned to the
next waiting customer and walks over (a traditional retail floor, not a
line). A real user behind a screen is always offered a waiting customer
before a CPU staff member (SCOPE D47). Scarce shared things: staff attention, stock, demo tables. The store
has a logo and no brand name.
Scope, decisions D1 to D46, tiers and open items: `SCOPE.md`.

## Don't invent, don't guess through ambiguity
No made-up copy, stats, sources or feature details. If a decision isn't pinned
(`SCOPE.md` open items), say so and ask; never build through an ambiguous
requirement by picking the most plausible reading. A wrong guess under other
code costs more than a pause.

A confident negative ("X isn't built") must be checked first: grep the whole
subsystem, not the one file open, before writing it into a doc (LEARNINGS,
`9e511ca`, corrected `e3ab3cb`).

For decisions affecting multiple users or expensive to reverse (week 8: stack,
person definition, persistence, real-time mechanism; records in `docs/adr/`),
lay out the options and costs first, pick none, and let Ritesh choose. Then
record it in `SCOPE.md`'s decision table with the date.

## Event log is load-bearing
Every state-changing action (today: join, leave, role switch in
`src/server/presence.ts`; later staff assignment, slot booking, stock
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
- **Feel, not just function.** The store's value is a feel (calm, hotel-lobby;
  satisfaction and frustration simulated end to end, SCOPE.md 0b) that
  `pnpm check` cannot measure. No feature is done until someone has used it as
  two different visitors in two browser profiles, at 1920x1080 and 390x844.
  Every checkpoint asks two questions: is it broken (automated), and how does
  it feel (human, live, never a described screenshot).
- **State claims are checked against the real thing.** "Did it save?" means
  opening the SQLite file (`/data/app.db`, or local `.data/`). "A visitor can't
  do X" means a second, genuinely different profile (not a second tab, which
  shares cookies) confirms it: the staff-only back room (D18) and an
  out-of-stock configuration being unbuyable, specifically.
- **Sensor admission bar.** A check joins the blocking `pnpm check` only if
  specific, fast, automatic and trustworthy. Fuzzy ones (does a wait feel
  frustrating, is the room calm) stay advisory. The drawings-match-model check
  (D20) is the opposite kind.
- **Spec traceability.** `SCOPE.md` 3d lists scenarios S1 to S11; each Tier 1
  one has a `spec/*.test.ts` or a note in PROCESS.md saying why it's advisory.
- **Cut the feature, never the harness.** Behind schedule, the answer is smaller
  scope, not a skipped feel-check or a merged red test.

## The defect loop
When something's wrong: report the symptom, not your diagnosis of it. Add
the failing sensor before attempting the fix, and confirm it's red for the
right reason. Name the bug class, not just the instance. For code written
without Ritesh watching it get written, mutate it afterward to confirm the
suite would actually catch it broken — apply this especially to
the server-authoritative rules where a subtly wrong implementation looks
identical to a correct one in every normal run: staff assignment (one staff member per customer), slot booking,
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
Every claim in them is tied to a commit or a file, and a gap in the record is
stated as a gap, never filled with an invented fact. For the final submission he
rewrites them in his own words. (The brief warns agent-written docs read like
the crit agents' median answer.)

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
project. `.claude/agents/fiction-integrity-reviewer.md` runs this check.
The course's image-generation proxy (`.claude/skills/gen-image`) may be used
to turn a design idea into a concrete reference picture — **ask Ritesh first**
every time, even when it's for the agent's own reference rather than to show
him, since it spends the shared course image budget. Generated images are
mood/reference only, never shipped as a texture or asset (everything in the
app stays procedural, same rule as above).

## Keys never touch this repo
The runtime-AI key (D8; OpenRouter now, `mise.local.toml`'s `OPENROUTER_API_KEY`,
switched from Gemini after its free tier proved unusable) and anything else
secret goes in Fly secrets (`fly secrets set`), never in a file, never asked
for in chat.

## Session handoff
Keep `WORKLOG.md` current in the repo (`/worklog`). `LEARNINGS.md` is about
prompting and working with AI assistants, not stack gotchas; every entry ties to
a named COMP4020 lecture lesson (which week, what it said) and cites its
commit(s). Candidates are captured with `/learn capture` into
`docs/learnings-inbox.md` after each exchange with Ritesh, and promoted with
`/learn promote`; every reply says whether it captured a candidate. Log cuts in
`CUTS.md` as they happen (`/cuts-log`): a cut under pressure is process evidence.

## Workflow: parallel agents and the GitHub board
Protocol: `docs/workflow.md`. Binding rules:
- **The issue board is the source of truth** for pending, in-progress and done
  work (labels `status:*`); WORKLOG.md is only the handoff. No work without an
  issue, no PR without `Fixes #n`.
- **Only the orchestrator assigns; builders never self-claim.** One issue, one
  branch `agent/<n>-<slug>`, one worktree. No two issues sharing a hot spot
  (`touches:` labels; migrations are single lane).
- **Ritesh talks to the `interface` agent** (fast, sonnet), which refines his
  requests into work orders (`/brief`, `.agents/inbox/`) for the slow ultracode
  `orchestrator`. Worker agents message only the orchestrator and comment
  progress on their own issue. Questions for Ritesh go in one batched digest
  (`/clarify`).
- **Context comes from records, not memory:** agents find it via
  `docs/INDEX.md` and read the binding ADRs and docs before editing. A decision
  that is expensive to reverse gets an ADR first (`needs-adr`; Ritesh chooses).
- **Spec first:** a failing check, red for the right reason, before the builder.
  Reviewer is a fresh, read-only context. Max 2 fix loops, then cut or split.
- **PRs target `integration`.** Only Ritesh approves a promote to `main`
  (`main` deploys). Never amend, rebase published history, or force-push.
- **The workflow audits itself:** `/audit-workflow` (script + judgment) at
  session start, before each wave, before a promote, and on a 30 minute loop.
  A repeated finding means tighten this section or the skill, not just fix it.
- **Spend:** `/budget` each wave; pause at 70%, stop at 85%.
- **Ritesh's prose stays his:** agents leave scaffolds and `[TK]`.

## Where things live
Full index: `docs/INDEX.md`. Read it when you need to find a decision or a
document; it is not loaded every turn. When you create a new ADR, worklog,
spec file or other record, add its one-line pointer there, not here. The
ones to know by heart:
- `SCOPE.md` — the scope, decisions D1 onwards, tiers, scenarios. Read before building anything.
- `WORKLOG.md` — where we left off. Read first in a fresh session.
- `docs/adr/` — numbered decision records. Read before changing stack, storage or the data model.
- `LEARNINGS.md`, `CUTS.md`, `PROCESS.md`, `reflections/` — the process evidence; cite commits by hash.

## How we work
Build one subsystem at a time, with a fresh context per subsystem rather
than one long session, to avoid context bleed. Graphics is split across
specialists who own separate files and never run git; the lead commits. A reviewer pass checks
one cross-cutting invariant across subsystems: event-log-write-completeness
(see above) — not a full re-review of everything. Before a large batch of
building starts, restate the complete settled list for one explicit
sign-off, since a quick "yes" on a big question shouldn't be stretched to
cover more than was actually seen.

## Known gotchas
- `pnpm start` serves the gitignored `static/` build, not a dev server: run
  `pnpm build` after editing client source.
- better-sqlite3 has foreign keys ON; a migration that rebuilds a table needs
  `PRAGMA foreign_keys = OFF` before `migrate()`, `ON` + `foreign_key_check` after.
- Stop every dev server you start; check `lsof -i` before destructive cleanup.
- A bare-substring assertion can pass for the wrong reason: assert on markup
  unique to the thing under test.
- Node `readline/promises` drops lines from a bulk non-TTY pipe: test
  interactive CLIs (`scripts/sim/`) through a real pty.
- A rotation, heading or camera sign that "looks right" isn't evidence (three
  backwards-sign bugs in one session; LEARNINGS `2ed2c7a`, `a3b8070`,
  `df52978`). Render it, or write a test that fails against the old code.
- A defect check that measures one direction passes while the opposite ships
  ("pokes through" vs "floats off"): assert both (LEARNINGS `0f564d4`, `9b74a21`).

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

## Reporting: teach, open what he has to read, close with a lecture lesson
Explain the mechanism, not just the diff: this is Ritesh's app to defend at a
crit. If "what I need from you" involves reading something (file, diff, commit,
drawing, running page), open all of it first (`code <path>`, else `open`; a
diff goes to a scratch file; a dev server's URL opens) and say what was opened.
Never hand him a path or hash. **Any URL opens in Safari:** `open -a Safari <url>`.

End every response with one or two lessons from the COMP4020 lecture notes
relevant to what comes next, preferably weeks 8 to 10. Don't recall them from
memory: read `~/Documents/ANU/3RD_YEAR/SEMESTER 2/COMP4020/Lectures/`
(`lessons-by-week.md`, `final-checklist.md`, `week-N.md`). Use the
`comp4020:handbook` skill only for course admin or a week not yet there.

## One idea, carried all the way
Every feature serves the scarce things real and CPU people share in one room:
staff attention, stock, and demo tables. A feature that doesn't feed or read
one of them is a cut candidate, not a maybe. (Replaces the old "someone's
always watching" line, which was the previous email-app idea. Wording to be
confirmed by Ritesh.)
