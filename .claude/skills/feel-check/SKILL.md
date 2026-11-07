---
name: feel-check
description: Drive the app as two separate users in two Chrome profiles at both marking viewports, acting at once, then restart and confirm persistence. Attach screenshots and console output as evidence. Use for any PR that changes behaviour a person sees, and in /post-deploy-smoke.
---
# Feel-check (two profiles, two viewports)

Use the claude-in-chrome tools. Profiles must not share cookies (incognito counts; two tabs of one profile do not).
1. Start the app from a fresh build (`pnpm build && pnpm start` on a free port).
2. Profile A at 1920x1080 as a customer, profile B at 390x844 as staff (swap and repeat for the issue's scenario). Both on screen, acting at the same time.
3. Walk the issue's acceptance criteria. Capture a screenshot per step and the console. Watch the Network tab for errors.
4. Real-time: confirm a change in A appears in B within about a second with no action from B.
5. Persist: stop and restart the server, reload both, confirm state is still there; also check the SQLite file directly for the claim.
6. Judge only what can be seen. For calm, frustration, "does it feel right", write what you observed and add `needs-feel-check` for Ritesh. Post the evidence table on the PR.
