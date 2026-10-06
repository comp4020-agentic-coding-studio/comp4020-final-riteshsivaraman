# Cuts

What got cut under deadline pressure, and why. Append-only, like
LEARNINGS.md --- a cut is a decision worth keeping, not a loose end.

## 2026-10-06: Attachments cut from C8 scope entirely

seen-spec.md §3 decides attachments are in, with a 2MB/3-per-email limit.
Ritesh cut them from the C8 cutoff specifically (not from the app) to
protect time for the mechanics the "someone's always watching" idea actually
depends on: the public draft board, self-destruct, forward alerts, BCC
exposure. Moving to v0.2 alongside the real-time layer.

## 2026-10-06: Draft-auto-send-after-real-world-deadline check left out of `spec/`

Per CLAUDE.md's sensor admission bar: even fast mode's 2-minute auto-send
deadline is too slow for a blocking test suite. The underlying catch-up
logic (`catchUpAutoSend` in `src/server/lib/drafts.ts`) is exercised
indirectly by the early-send path in `spec/seen.test.ts`, and manually
verified in a live browser session, but there's no automated test that
waits out a real auto-send deadline. Manual/crit-time check instead.

## 2026-10-06: Company name left as `[TK]` placeholder (`Panopticorp`)

Ritesh deferred the real company name decision; `Panopticorp` is a
placeholder throughout code and copy (search for `[TK]` / `panopticorp` to
find every spot). Needs a real decision before shipping --- check it's not a
real company.

## 2026-10-07: `spec/seen.test.ts`'s self-destruct timing is only safe at near-zero latency

Running `APP_URL=<live fly.dev URL> pnpm check` (not what CI does --- see
below) against the deployed app fails "stays silent (no notice) when opened
before destruction" consistently, not flakily. Cause: the test opens an
email with a 300ms self-destruct window, and `mailRoutes`' own middleware
calls `catchUpUserEmails` on every request including the `/open` request
itself --- if real network latency pushes that request's arrival past the
300ms deadline, the middleware's catch-up destroys-and-notifies before the
route handler gets to mark it opened. That's not a bug: if the open request
genuinely didn't land within the window, "opened too late" is the correct
outcome. The test's 300ms budget is simply too tight to assert over real
internet latency to the deployed instance, same class of problem as the
auto-send check above.

**Not a submission blocker**: `.github/workflows/checks.yml`'s `check` job
runs `pnpm check` with `APP_URL=http://localhost:8080` against the same
Docker image on the same runner (near-zero latency) --- identical to a local
run, which is green. This only surfaces when testing against the public
internet URL directly, which goes beyond what CI does.

## 2026-10-07: General UI/UX polish deferred past C8

Ritesh's own read after using the live app: "the UI/UX is very poor." This
is distinct from the design-token mismatch fixed earlier today (`dbb8e65`)
--- that pass made the app's colors/font/radii actually match
`docs/design-handoff.md`'s written values, but matching the spec's tokens
isn't the same as the layout, spacing, density, and overall feel actually
being good to use. Nobody has done an actual UX pass yet. Explicitly covered
by C8's own spec ("feature completeness, real-time functionality, and
polish are explicitly deferred" for this crit) --- not cut under pressure so
much as never in scope for tonight. Deferred to C9/v0.2 with real time
budgeted for it, rather than rushed in the ~3.5 hours before the C8 cutoff.
