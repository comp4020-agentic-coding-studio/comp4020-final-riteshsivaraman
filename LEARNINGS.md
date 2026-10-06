# Learnings

What Ritesh is learning about prompting and working with AI coding assistants
on this project --- not stack gotchas (those were tracked here up to the entry
below this note; new entries are about the prompter, not the stack). Each
entry cites the commit(s) it's about, e.g.
[`a1b2c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a1b2c3d),
so a claim can be checked against what actually happened. Append-only --- if
one turns out to be wrong, add a correction entry, don't delete the original.

## "Navigate to a non-Inbox page and check" needs an in-app click, not a URL bar change, or the test can pass for the wrong reason

[`a4c671f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a4c671f)

Verifying the global live-preview banner, my first check used the browser
tool's `navigate` action to jump straight to `/sent` by URL. The banner
vanished -- which looked exactly like a failed fix, but wasn't: a URL-bar
navigation is a full page reload in this SPA, which opens a brand-new
`EventSource` with nothing played back (ADR 2's design is deliberately
no-queue, no-replay). It would have told me the old, already-saved draft
event was "lost," when the real question -- does the banner survive
*client-side* route changes within one mounted session -- was never asked.
Re-tested by clicking the in-app sidebar links (Inbox -> Compose -> Board)
instead, which is how an actual user navigates and how the feature is
specified to work, and the banner correctly persisted. Lesson: when a
feature's whole point is "survives navigating away," the verification step
has to navigate the way the app is actually used (`route()`/client-side),
not however the tool defaults to doing it -- a reload-based check tests a
different, stricter thing than what was asked for, and a failure there
isn't evidence of anything.

## Hono sub-app routes don't match a trailing slash on the mount path

`draftRoutes.post("/", ...)` mounted at `app.route("/api/drafts", draftRoutes)`
matches `POST /api/drafts`, not `POST /api/drafts/` --- the trailing slash
404s. Caught by testing the real endpoint with curl, not by reading the
route table. Lesson: when a client fetch 404s on a route that's clearly
registered, check for a trailing-slash mismatch between the client call and
how the sub-app was mounted before suspecting anything else.

## Deleting a row with a dependent FK reference needs the dependent deleted first

`finalizeSend` deleted the `drafts` row after sending but before deleting its
`draft_contributors` rows, so `better-sqlite3`'s foreign-key check (on by
default) threw `FOREIGN KEY constraint failed` on the early-send path only
(the auto-send path hadn't been exercised with contributors yet, so it
hadn't surfaced). Lesson: a soft delete bug that only shows up once a row
has a dependent child is easy to miss testing the happy path once; test the
actual multi-user edit flow, not just "does sending work."

## Testing two users in two tabs of the same browser profile doesn't give two sessions

Both tabs share one cookie jar (same origin), so logging in as a second user
in tab 2 silently rotates the session cookie for tab 1 too --- tab 1's UI
still shows the first user (stale client-side state) while every request it
makes now authenticates as the second user. This looked exactly like an
authorization bug ("only the owner can send") until checked against the
database directly. Lesson: for a live two-person manual check, use two
genuinely separate browser contexts (incognito + regular window, or two
browsers), never two tabs of one profile. The automated `spec/seen.test.ts`
tests don't have this problem --- `spec/helpers.ts`'s `Client` class keeps
its own cookie string per instance.

## A manual DB edit that misses a dependent row crashes the whole app on every subsequent boot

Cleaned up a leftover test account directly via `flyctl ssh console` +
`sqlite3`: deleted the `users` row but not its `events` row (the signup
event referencing that user id). `db.ts` runs `PRAGMA foreign_key_check`
after every migration at every boot and throws if anything fails it --- so
the app crash-looped on every restart afterwards, including Fly's normal
auto-stop/auto-start cycle, until the orphaned `events` row was deleted too.
Bug class: any manual edit to a table with dependent rows elsewhere needs
the dependent rows cleaned up in the same pass, and this app's boot-time FK
check has no self-healing path --- one bad row takes the whole site down
until someone fixes the data by hand. If this happens again under time
pressure: check `flyctl logs --no-tail` first (the crash reason is always
right there), not the proxy's generic 502. Worth considering for a future
pass: should the FK check degrade (log + continue) rather than hard-crash
the boot, given this app wakes from a cold stop on every request after idle.

*(Entries above this line predate the redirect described in this file's
header and are stack gotchas, not prompting lessons --- kept as history.)*

## "Lay out options, don't pick yet" turned a guess into a real decision

[`cf2242d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/cf2242d)

Asked to build "live preview (reading an email someone is sending you)" for
a real-time, multi-user feature, I had a plausible reading ready to run with
(keystroke-level stream to the recipient) but it wasn't the only one
(coarse presence-only was equally plausible from the words alone), and the
transport choice underneath it (polling / SSE / WebSocket) was explicitly
the kind of decision the week 8 lecture says gets its own ADR. Laying out
both the semantics question and the transport options as separate
AskUserQuestion calls --- without picking one in either case --- surfaced
that Ritesh wanted the more invasive keystroke-level version *and* SSE over
the WebSocket ADR 1 had already named, neither of which I'd have guessed
right by defaulting to "pick the most plausible reading and proceed."
Lesson: when a request names a feature but not its exact shape, and the
shape is itself a multi-user decision, the fix isn't a better guess --- it's
turning the guess into an explicit choice before any code exists. Written
into CLAUDE.md itself (the commit above) so this is a standing move the next
session takes too, not something that only happened because I was asked
twice in one session.

## `pkill -f "tsx src/server/index.ts"` doesn't reliably kill the dev server, and a stale one fakes a passing mutation check

[`ae9a0cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/ae9a0cd)

Building the live-preview SSE feature, I edited `src/server/lib/drafts.ts` to
add a deliberate mutation (dropping `bcc` from the live-preview broadcast
audience, per the mutation-check skill), restarted with
`pkill -f "tsx src/server/index.ts"; pnpm start &`, and reran the spec --- it
passed clean, which should have been alarming on its own (a real bug in the
code should fail a test written specifically to catch it). The `pkill`
pattern didn't match anything (`tsx` execs into a bare `node` process that
`lsof -i :8080` shows as `COMMAND node` with no visible args), so it never
killed the old process; `pnpm start &` then hit `EADDRINUSE` and exited
silently into its own log file I hadn't checked, leaving the *original*
(pre-mutation, then later also post-revert) server still answering
requests the whole time. I only caught it because a later bcc-only manual
`curl`/`fetch` check against what I believed was the freshly-mutated server
still delivered the preview --- the one result that shouldn't have been
possible if the mutation were actually live. Lesson: after any
"kill the dev server and restart" step, confirm the restart actually
happened --- `lsof -ti :8080` (not `pkill -f` on the launch command string)
for the PID, kill that PID directly, re-check the port is free, *then*
start, and read the startup log for `EADDRINUSE` before trusting that a
subsequent test run reflects the code on disk. A green (or red) result
against a stale process is worse than no result, since it looks identical
to a real one.

## Interviewing for "what good means" surfaced a real framing gap I'd have papered over

[`3284399`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/3284399)

Asked to help define "good" for the README, I used the week 8 lecture's own
framework (function / quality of execution / differentiation from the
median) and asked one question at a time instead of drafting a definition
and asking Ritesh to react to it. Two of the three came back fast and
specific (quality of execution: buys the transparency pitch first, only
gradually clocks the horror; differentiation: no villain, it's the culture's
own stated values applied with total consistency) --- but the first one,
"who is this actually for," got an answer about the company's culture, not
a specific persona, and I didn't push past that before moving on. The
scaffold I wrote (structure/fact-list/`[TK]`, not finished prose, per
CLAUDE.md) correctly left that one `[TK]` rather than inventing a persona to
fill the gap --- but if I'd been drafting instead of interviewing, "a young
employee at a transparency-first startup" is exactly the kind of plausible-
sounding filler I'd have written in without noticing it was never actually
answered. Lesson: when interviewing for a definition that'll anchor later
decisions (this one anchors a C9 grading criterion), an unanswered question
needs to stay visibly unanswered (`[TK]`), not get smoothed over by my own
next-most-plausible guess just because the conversation moved on.
