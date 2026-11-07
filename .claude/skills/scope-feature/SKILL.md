---
name: scope-feature
description: Interview Ritesh about a rough feature idea, one question at a time with a recommended answer, until it can become well-formed GitHub issues. Use when he says "scope", "I want to add", "let's plan X", or when the orchestrator needs new issues. Writes drafts to .agents/drafts/, never creates issues itself.
---
# Scope a feature

Run as the `scoper` agent (opus, high). Output goes to `.agents/drafts/<slug>.md`, then `/new-issue`.

1. Read SCOPE.md (D47, tiers), CLAUDE.md "One idea", and grep the code for what already exists. Do not claim something is unbuilt without grepping the whole subsystem.
2. Ask one question at a time, each with your recommended answer. Stop when the next answer would not change the issue. Order: who it is for and where in the journey; what the player sees and does; what is shared and what persists; what it feeds (staff attention, stock, demo tables; if none, recommend cutting it); what it must never do.
3. Produce, per issue: title, user-visible behaviour, acceptance criteria (observable), **one testable promise** (the spec line), what is advisory/judged, labels (`type:`, `area:`, `touches:`, `size:`), dependencies, out of scope.
4. Split anything that spans client and server or touches two hot spots into separate issues with a dependency.
5. Say what you cut and why. Hand the drafts to `/new-issue`; Ritesh approves the batch.
