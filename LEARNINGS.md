# Learnings

What Ritesh is learning about prompting and working with AI coding assistants
on this project --- not stack gotchas (those were tracked here up to the entry
below this note; new entries are about the prompter, not the stack). Each
entry cites the commit(s) it's about, e.g.
[`a1b2c3d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a1b2c3d),
so a claim can be checked against what actually happened. Append-only --- if
one turns out to be wrong, add a correction entry, don't delete the original.

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
