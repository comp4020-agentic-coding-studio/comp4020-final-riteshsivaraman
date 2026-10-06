---
name: mutation-check
description: Deliberately break a piece of Seen's code to confirm the test suite would actually catch it, then revert the break. Use when the user says "mutation check <file/function>", "would the suite catch this if it broke", or after writing code they didn't watch get written - especially the auto-send/self-destruct catch-up timers and draft-visibility rules, where CLAUDE.md's defect loop requires this check.
---

# Mutation check

Implements this repo's defect-loop rule: code written without Ritesh watching
needs to be mutated afterward to confirm `spec/*.test.ts` would actually catch
it broken. A green suite on correct code proves nothing by itself - this is
what proves the suite is watching that code at all.

## Steps

1. **Confirm a clean starting point.** Run `git status` on the target file(s).
   If there are uncommitted changes already, stop and ask - don't mutate on
   top of unrelated in-progress work.
2. **Pick one realistic bug**, not a syntax error. It should be the kind of
   mistake a plausible-but-wrong implementation would actually make:
   - Flip a comparison (`<` to `<=`, `>` to `>=`) on a timer/deadline boundary.
   - Skip or make conditional a write that should be unconditional (e.g. an
     `events` insert, a visibility flag flip).
   - Off-by-one a catch-up window or retry count.
   - Swap which side of a draft/visibility check a condition applies to.
   Pick the single most realistic bug for the target code, not the easiest
   one to catch.
3. **Apply the mutation directly in the file** (Edit tool, not a patch file).
4. **Run the suite**: `pnpm check` for the full gate, or `pnpm test` /
   `pnpm vitest run spec/<file>.test.ts` if you only need the relevant spec
   file for a faster loop.
5. **Check the result is red for the right reason.** A failure is only a
   catch if the failing assertion is actually about the behavior you broke -
   not an unrelated flaky failure, a typecheck error from the mutation itself
   being syntactically invalid, or a different test failing for a different
   reason. Read the actual failure output.
6. **Revert immediately**, whether the suite caught it or not. Re-run
   `git status` (and `git diff` if anything looks off) on the target file to
   confirm it's byte-identical to before - never leave a mutation in the
   working tree.
7. **Report per the shape below.** If the suite did *not* go red, this is the
   actual finding - name the bug class and what kind of test/sensor is
   missing, per CLAUDE.md's defect-loop rule ("name the bug class, not just
   the instance"). Don't write the fix yourself unless asked; the point of
   this skill is surfacing the gap, not closing it.

## Output shape

```
Target: <file:function>
Mutation: <one line describing the exact change>
Suite run: <command used>
Result: CAUGHT (<test name>, <assertion that failed>) | NOT CAUGHT
Gap (if not caught): <bug class> - <what sensor/test would need to exist>
Reverted: confirmed clean (git status/diff)
```

## Notes

- If `pnpm check` is slow, prefer the narrowest relevant spec file for
  iteration, but run full `pnpm check` once at the end to also confirm
  typecheck didn't silently break from the revert.
- This checks test *sensitivity*, not test *coverage breadth* - a target with
  no related test at all is an immediate, obvious gap; don't bother mutating
  it, just report that no sensor exists yet.
- Never run this against code currently under active edit, and never leave
  the repo in a mutated state if interrupted - if something goes wrong
  mid-check, revert first and report second.
