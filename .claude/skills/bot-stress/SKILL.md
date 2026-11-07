---
name: bot-stress
description: Run 20 to 30 headless scripted clients through customer and staff flows with throttled latency, including two acting at once and a restart, and file one issue per distinct failure. Use before promoting, and after the freeze.
---
# Bot stress

1. Harness in `scripts/bots/`, built on `scripts/sim/` and the real protocol. Local Docker image by default; the live URL only on the orchestrator's say-so and at low volume (one small Fly machine).
2. Scenarios: S1, S2, S4, S11 (race for the last unit), staff joins mid-wave, disconnect and reconnect, restart with state intact, 3 staff and 25 customers at once.
3. Add latency (100 to 400 ms) and a slow-connection run.
4. Report scenario, bot count, failures, p95 round trip. File one issue per distinct failure: `type:bug status:needs-triage`, exact repro. Do not fix.
