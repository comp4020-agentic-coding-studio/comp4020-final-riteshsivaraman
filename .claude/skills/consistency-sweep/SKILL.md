---
name: consistency-sweep
description: Check that README, CLAUDE.md, SCOPE.md, docs/INDEX.md and spec/ agree with each other and with the code, and list drift. Use after each promote, after any scope change, and before the freeze. The marker reads README, then CLAUDE.md, then spec, then the app, looking for the same idea in each.
---
# Consistency sweep

1. Extract the claims: README "what good means" and "enforced" lists, CLAUDE.md rules, SCOPE decisions D1 onwards, the testable promises in section 9.
2. For each README promise, find the CLAUDE.md rule and the `spec/` check that protect it. A promise with neither is drift.
3. Grep for stale vocabulary (`queue`, `Panopticorp`, `Seen`, `email`, `new-idea`, "someone's always watching") outside historical records.
4. Check `docs/INDEX.md` pointers resolve; CLAUDE.md is near 2,100 words; SCOPE decisions are dated and append-only.
5. Output a table: claim, where stated, where enforced, status. Fix doc drift via the `steward`; marked prose is reported to Ritesh, not edited.
