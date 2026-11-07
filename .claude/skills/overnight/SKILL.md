---
name: overnight
description: Bounded autonomous run while Ritesh is away. Only pre-approved issues, a spend cap, merges into integration only, and a morning digest. Ritesh must type /overnight himself because the ultracode keyword does not trigger from scheduled or headless runs. Use when he says "overnight", "while I sleep".
---
# Overnight run

Arguments: spend cap (default 15% of the credit), wave label (e.g. `wave:w2`), stop time.
1. `/audit-workflow` and `/budget`. Refuse to start if the audit has a FAIL or the cap does not fit under the 70% line.
2. Only issues with `status:ready` AND the given wave label that Ritesh already approved. No new scoping, no questions that block; park them in the digest.
3. Run `/sprint` repeatedly. After each wave re-run `/budget`. Stop at the cap, the stop time, or two consecutive failed waves.
4. Never push to `main`, never promote, never deploy, never use gen-image.
5. Last act: write the morning digest (merged with hashes, failed with reasons, parked questions, spend, what needs his feel-check) as `docs/digests/<date>.md` and `/worklog`.
