---
status: active
what: Running state of the Seen build, kept current so a fresh session can pick up without re-deriving context.
date: 2026-10-06
---

# Worklog

Read CLAUDE.md first --- it's the index of everything else ("Where things
live"). This file is the current state; LEARNINGS.md and CUTS.md are the
append-only history of gotchas and deliberate scope cuts.

## Live-preview banner made global (2026-10-07)

Fixed the reported bug: the live-draft preview (ADR 2, `d8a87f2`) only
existed inside `Inbox.tsx`'s own mount effect, so the `EventSource` and the
card both died on navigating away from `/inbox`. Moved the connection and
state up to the app shell:

- `src/client/src/LiveStreamContext.tsx` (new) --- owns the single
  `EventSource("/api/stream")` for the logged-in session's lifetime, a
  `Map<draftId, {subject, body}>` that replaces per-`draftId`, exposed via
  `LiveStreamProvider`/`useLiveStream()`. Shaped to carry a second event
  type later without restructuring (state object, not a hardcoded "just
  drafts" value).
- `src/client/src/LiveStreamBanner.tsx` (new) --- the pinned bar: one
  collapsed line per tracked draft, click to expand in place. Calm/neutral
  styling per ADR 2 (not `.watch-strip`'s red treatment).
- `src/client/src/App.tsx` --- wraps the shell in `LiveStreamProvider`,
  renders `<LiveStreamBanner />` directly (outside `<Router>`) between the
  topbar and the rest.
- `src/client/src/pages/Inbox.tsx` --- the old `EventSource`/`LiveDrafts`
  code removed entirely; back to just being the inbox.
- `src/client/src/styles.css` --- `.app-shell` changed from a single grid to
  a flex column (topbar / banner / `.app-body`), because the banner renders
  `null` when empty and a CSS Grid row sized for an item that sometimes
  isn't there breaks auto-placement (see LEARNINGS.md). `.app-body` is the
  original two-column grid, now one level down.

Verified live, not just by reading code: signed in as a second account over
curl, addressed and saved a draft to the browser account's address while
that tab sat on `/sent`, `/board`, and `/compose` (via in-app sidebar nav,
not a full reload) --- the banner appeared and updated on all three without
the tab ever visiting `/inbox`. `pnpm check` (typecheck + the 14 existing
vitest tests) green against a rebuilt `static/`.

## Where this stands (2026-10-06, overnight session)

Built v0.1 for the C8 cutoff (Wed 7 Oct, 08:30), attachments cut (see
CUTS.md). Stack: Hono + Preact SPA + better-sqlite3 + Drizzle + Vitest, ADR 1
at `docs/adr/0001-stack.md` (facts filled in, narrative `[TK]` for Ritesh).

**Built and verified** (against the Docker-built image, `pnpm check` green,
plus a live two-tab browser pass):
- Accounts (signup/login/session cookie), in-app address `<user>@panopticorp.test`.
- Compose/send/inbox/sent/threads, reply/forward plumbing (forwardRootId
  chain), BCC exposed both ways.
- Public draft board: manual publish, 30s-heartbeat-timeout auto-publish,
  single-editor lock, contributors list frozen onto the sent email.
- Hesitation timer, forward alerts, self-destruct (unopened/opened/tombstone),
  per-user fast mode, a minimal voice-escalation module.
- Event log (`events` table) behind everything --- every action tested
  writes its row; checked directly against the SQLite file, not just the API.
- `spec/seen.test.ts`: 14 tests covering the fast/automatic/trustworthy checks
  from seen-spec.md §13 (see CLAUDE.md "Spec traceability" for what's
  deliberately NOT here and why).
- Live draft preview backend (ADR 2, `docs/adr/0002-live-preview-transport.md`):
  authenticated `GET /api/stream` (`src/server/routes/stream.ts`) using
  `hono/streaming`'s `streamSSE`, backed by an in-process pub/sub
  (`src/server/lib/livePreview.ts`, no persistence --- `drafts` stays the
  source of truth). `saveDraft()` in `src/server/lib/drafts.ts` broadcasts to
  every resolved to/cc/bcc recipient on both the owner-edit and
  stranger-public-draft-edit branches; address resolution is shared with
  `sendEmail` via `resolveAddresses()` (extracted in `src/server/lib/mail.ts`).
  Mutation-checked: dropping bcc from the broadcast audience is caught by
  `spec/seen.test.ts`'s "live draft preview (ADR 2)" describe block.
- Live draft preview frontend: `Inbox.tsx` opens an `EventSource` to
  `/api/stream` on mount, keyed by `draftId`, and renders a quiet card above
  the inbox list (styled in `styles.css`, deliberately not styled like the
  red `.watch-strip` motif --- this is a feature surface, not a third
  signature device). Verified live: curl-driven sender (separate cookie jar
  from the browser) saving a draft addressed to a browser-logged-in
  recipient via `to` and via `bcc` both showed up and updated in place.
  `Compose.tsx` and the server are untouched.
- Placeholder deployed first (proved the Fly path), then this build's
  Dockerfile/fly.toml rewritten for the real stack and verified locally.

**Deployed:** the real Seen build is live at
https://comp4020-final-riteshsivaraman.fly.dev/ (verified `/` and `/readme/`
both 200, signup smoke-tested against the live app). One leftover test
account, username `smoketest`, is in the live DB --- a mass-delete attempt to
clean it up was correctly blocked by the permission classifier (deleting all
users/sessions/events on a live app, even a pre-launch one, isn't a solo
call); clear it yourself with a single `DELETE FROM users WHERE
username='smoketest'` (and its sessions row) via `flyctl ssh console` if you
want it gone before the crit.

**Not yet done:**
- Repo is still **private** --- flipping it public is Ritesh's call, not
  done autonomously (course brief: C8 wants it public at the cutoff).
- README.md / PROCESS.md: still template boilerplate. Ritesh writes these
  (CLAUDE.md "Ritesh writes the prose"). ADR 1's narrative sections are
  `[TK]`.
- `reflections/crit-8.md`: not written --- Ritesh's prose, two standing
  prompts (see `reflections/README.md`).
- Company name still `Panopticorp [TK]` (CUTS.md).
- Fiction-integrity sweep (CLAUDE.md) not yet run --- do this before shipping
  public, after the company name is real.

## Design-token implementation pass (2026-10-07)

`docs/design-handoff.md` (the real design spec, not tracked here until
`?? docs/design-handoff.md` in git status is resolved -- it's currently
untracked, add it when ready) had never actually been implemented:
`styles.css` had its own blue `--accent`, IBM Plex Sans instead of Inter, and
a `--radius-md` that was really the spec's `--radius-lg` value wearing the
wrong name. Fixed in commit `dbb8e65`: every color/font/radius token renamed
to match the doc exactly (brick-red `--signal`, `--onyx`/`--bone` "stamped
chrome" pair, `--sidebar-bg`, radius-sm/md/lg = 6/8/10px), `.watch-strip`'s
stale hardcoded `rgba(179,38,30,...)` replaced with a `color-mix()` derived
from `--danger`, and Inter swapped in for IBM Plex Sans in `index.html`.
Verified with computed-style JS against a running instance (not just
screenshot eyeballing) -- every token matches the doc's literal hex.

Also added the first of the two signature devices: the unread asterisk
(`✳`, rotated, `--signal`) in `EmailListRow`, wired through `Inbox.tsx` via a
new `myAddress` prop; `Sent.tsx` doesn't pass it, so it never shows on your
own sent mail. The ghost-read line (second signature device) is still not
built -- its trigger condition is `[TK]` in the design doc itself, don't
guess at it.

No new LEARNINGS.md entry from this pass -- the stale-`static/`-dir gotcha I
hit (`pnpm build` after editing client source, since `pnpm start` serves
the gitignored `static/` dir, not a dev server) is already documented in
CLAUDE.md's "Known gotchas."

## Next session should

1. Confirm the Fly token is still valid (`mise exec -- flyctl status -a
   comp4020-final-riteshsivaraman`), then `flyctl deploy --remote-only
   --ha=false -a comp4020-final-riteshsivaraman` with this build.
2. Verify the live URL the same way local Docker was verified: `/` and
   `/readme/` both 200, then a real two-separate-browser-context pass (see
   LEARNINGS.md on why two tabs of one profile doesn't work for this).
3. Ritesh writes README.md, PROCESS.md (citing the commits from this
   session), reflections/crit-8.md, and picks the company name.
4. Run the fiction-integrity sweep (fresh subagent, no prior context) once
   the company name is real.
5. `/comp4020:preflight`, then Ritesh decides on `/comp4020:ship`.
