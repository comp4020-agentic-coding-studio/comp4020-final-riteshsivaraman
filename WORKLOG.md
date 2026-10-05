---
status: active
what: Running state of the Seen build, kept current so a fresh session can pick up without re-deriving context.
date: 2026-10-06
---

# Worklog

Read CLAUDE.md first --- it's the index of everything else ("Where things
live"). This file is the current state; LEARNINGS.md and CUTS.md are the
append-only history of gotchas and deliberate scope cuts.

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
- `spec/seen.test.ts`: 9 tests covering the fast/automatic/trustworthy checks
  from seen-spec.md §13 (see CLAUDE.md "Spec traceability" for what's
  deliberately NOT here and why).
- Placeholder deployed first (proved the Fly path), then this build's
  Dockerfile/fly.toml rewritten for the real stack and verified locally.

**Not yet done:**
- Real deploy of this build to Fly (placeholder was deployed and verified;
  the actual Seen build has only been run locally + in a local Docker
  container so far, not pushed to the live Fly app).
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
