---
name: write-check
description: Write the failing-first spec for one issue and prove it is red for the right reason. Use before any builder starts, or when a bug is reported (defect loop: sensor before fix).
---
# Write the check first

1. Read the issue's acceptance criteria and spec line. Write `spec/<issue>-<slug>.test.ts` over the real WebSocket/HTTP protocol (scripted bots as in existing `spec/*-live.test.ts`), not over internals.
2. Run it. It must fail, and for the right reason: the behaviour is missing, not a typo, bad import or timeout. Paste the failing output on the issue.
3. Admission bar: specific, fast, automatic, trustworthy. Anything about feel stays advisory and goes on the issue's feel-check list.
4. For rules where a wrong implementation looks right (staff assignment, finite stock races, cap, back-room clamp) also assert the opposite direction.
5. Never edit `src/**`.
