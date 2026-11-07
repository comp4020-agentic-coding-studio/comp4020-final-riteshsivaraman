---
name: post-deploy-smoke
description: After a deploy, check the live URL the way a marker would: / and /readme/ return 200, a two-profile real-time pass, state survives a restart, and the logs show the events. Use after every promote and as the last step before the deadline.
---
# Post-deploy smoke

1. `curl -s -o /dev/null -w "%{http_code}"` for `/` and `/readme/` on the live URL; `/readme/` HTML contains the README headings.
2. `/feel-check` against the live URL: two profiles, both viewports, a change visible in the other within about a second.
3. Persistence: `flyctl machine restart` is not ours to run unprompted; instead wait for the machine to auto-stop when idle, then come back and confirm state is still there (this is what a marker does the next day). Report if you could not wait.
4. `flyctl logs -a comp4020-final-riteshsivaraman` shows the events for what you just did, not only "listening on".
5. Report a table with evidence paths. On failure, give the last known good tag.
