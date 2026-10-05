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
