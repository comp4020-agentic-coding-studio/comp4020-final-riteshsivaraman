# Learnings

Stack-specific gotchas, found the hard way, as they come up. Append-only ---
if one turns out to be wrong, add a correction entry, don't delete the
original. (Pattern carried from crit 7's LEARNINGS.md.)

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
