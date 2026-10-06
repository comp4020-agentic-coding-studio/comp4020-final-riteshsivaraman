# Seen — agent harness

Cursed email app, COMP4020 final project. Theme: someone's always watching.
Full spec and decisions: not in this repo — see PROCESS.md for what's
recorded here; the rest stays in the brainstorm folder's history.

## Don't invent, don't guess through ambiguity
No made-up copy, stats, sources, or feature details. If a decision isn't
pinned (see seen-spec's "open" items), mark it `[TK]` and ask rather than
guessing plausibly. This extends to implementation: never build through an
ambiguous requirement by picking the most plausible reading and proceeding —
stop and ask. A wrong guess built on top of other code is more expensive to
unwind than a short pause would have cost.

For a decision affecting multiple users or expensive to reverse (per the week
8 lecture: stack, user/person definition, persistence, real-time mechanism —
see the ADR note below), lay out the real options and their costs first,
without picking one, and let Ritesh choose before anything gets built or
written up. Don't collapse straight to a recommendation on these.

## Event log is load-bearing
Every user action (send, open, draft edit, forward, contribute, destroy)
writes an `events` row first. Stats, sorts, the C10 "creepy mirror", and any
debugging of "did this actually happen" all read this table — don't build a
feature's effect without also logging the event that caused it. This is also
the one invariant a reviewer pass checks across every subsystem (see "How we
work" below): did every state-changing action write its event row.

## No background processes
The Fly machine stops when nobody's connected (`auto_stop_machines =
"stop"`, `min_machines_running = 0`). Never rely on `setInterval`/`setTimeout`
for anything that must happen (auto-send, self-destruct). Store the deadline
as a column and catch up on the next request that touches it.

## Verification: checked for real, not reported
- **Feel, not just function.** Seen's whole value is a feel (anxiety, the
  slow creep of being watched) that `pnpm check` cannot measure. A harness
  that only checks stills (screenshots, static DOM, settled-state asserts)
  makes the quality nothing measures decay to zero. No feature is done until
  someone has sat in two browser tabs as two different users and felt the
  thing happen — not just read a green test name. Every checkpoint asks two
  separate questions: is it broken (automated) vs how does it feel (human,
  live, never a described screenshot).
- **State claims get checked against the real thing.** "Did it save?" means
  opening the actual SQLite file (`/data/app.db` in the container, or the
  local `.data/` path) directly, never trusted from the agent's own report.
  "A stranger can't see X" means a second, genuinely different browser
  session (not the owner's own session re-rendered) confirms it's actually
  hidden — recipients, attachments, and quoted thread on a public draft,
  specifically.
- **Sensor admission bar.** A check only goes into the blocking `pnpm check`
  suite if it's specific, fast, automatic, and trustworthy. Anything fuzzier
  stays advisory (or becomes a manual crit-time check) instead of being
  forced into a flaky gate. Voice-escalation timing and "does this feel
  anxiety-inducing" are the canonical advisory-only examples — don't try to
  assert those in `spec/`.
- **Spec traceability.** seen-spec.md section 13 lists the candidate checks.
  Every one of them either has a matching `spec/*.test.ts`, or an explicit
  note in PROCESS.md saying why it's advisory-only — don't let one quietly
  fall off the list under deadline pressure.
- **Cut the feature, never cut the harness.** When behind schedule, the
  answer is smaller scope, not a skipped feel-check or a merged red test.
  The verification discipline above is the thing that doesn't flex.

## The defect loop
When something's wrong: report the symptom, not your diagnosis of it. Add
the failing sensor before attempting the fix, and confirm it's red for the
right reason. Name the bug class, not just the instance. For code written
without Ritesh watching it get written, mutate it afterward to confirm the
suite would actually catch it broken — apply this especially to the
auto-send/self-destruct catch-up timers and the draft-visibility rules,
since a subtly wrong implementation there looks identical to a correct one
in every normal run.

## Git hygiene and dependencies
Commits are normal and expected. Amend, rebase, and force-push are flatly
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

## Fiction integrity
Before shipping, a fresh subagent with no prior context in this session
reviews the live app purely as a stranger would, flagging anything that
breaks the cover (stray real company names, visible COMP4020/crit/marker
language inside the app itself, placeholder copy that doesn't read as a
boring normal email client). Scoped to in-app copy and the company name —
the repo's own docs (README/PROCESS/reflections) are expected to say it's a
COMP4020 project.

## Keys never touch this repo
Gemini key (and anything else secret) goes in Fly secrets
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
- `docs/adr/0001-stack.md` — ADR 1 (Hono + Preact SPA vs crit-7 fallback).
  Facts filled in; narrative sections are `[TK]` for Ritesh. Read everything
  in `docs/adr/` before changing stack, storage, or the data model — an
  accepted record is never edited; a changed decision gets a new, numbered
  record that supersedes it and says why.
- `docs/design-handoff.md` — the visual design spec the real app is built
  against: color/type tokens, layout, the two permitted signature "dread"
  devices, copy voice, component inventory. Came from a standalone frontend
  exploration outside this repo; read this doc, not that directory, going
  forward.
- `WORKLOG.md` — current state of the build, read this first for "where did
  we leave off."
- `LEARNINGS.md` — what Ritesh is learning about prompting/working with AI
  coding assistants, cited to commits (older entries predate this and are
  stack gotchas instead).
- `CUTS.md` — what got cut under deadline pressure and why (attachments from
  C8, the auto-send-deadline check left advisory-only, company name still
  `[TK]`).
- `.claude/agents/event-log-reviewer.md` — checks the event-log-write-
  completeness invariant above; run it after a subsystem build.
- `.claude/agents/fiction-integrity-reviewer.md` — the fiction-integrity
  sweep below; run it before shipping public.
- `.claude/skills/mutation-check/` — the defect-loop mutation check below,
  on demand for code built unwatched (timers, draft-visibility).
- *(add further ADRs here as they're created — don't let this list go stale.)*

## How we work
Build v0.1 one subsystem at a time, with a fresh context per subsystem
rather than one long session, to avoid context bleed. A reviewer pass checks
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

End every response with one or two lessons from the COMP4020 lecture notes
relevant to whatever comes next — not necessarily the most recent lecture,
whichever week's content actually applies (e.g. drawing on persistence or
decision-record guidance from an earlier week while building a later
feature). Fetch live via the `comp4020:handbook` skill rather than recalling
from memory.

## One idea, carried all the way
Every feature serves "someone's always watching." A feature that doesn't tie
back to that is a cut candidate, not a maybe.
