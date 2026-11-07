---
name: brief
description: Turn Ritesh's rough request into a precise work order for the orchestrator and hand it off. Use whenever he asks for something that is a feature, a fix, a wave, or anything for the build agents, instead of passing his raw words on. The interface agent runs it.
---
# Brief the orchestrator

1. **Understand.** Re-read his words. Check what already exists (grep the whole subsystem) and which SCOPE decisions apply (D47 etc.).
2. **Clarify once.** If anything is ambiguous, ask him in one batch now. The orchestrator must not stall on him.
3. **Write the work order** to `.agents/inbox/<YYYYMMDD-HHMM>-<slug>.md`:
```
from: interface        to: orchestrator        priority: <now | this wave | before freeze>
his words: "<verbatim>"
refined request: <goal in one paragraph>
issues: <existing #n, or "to be created from .agents/drafts/...">
constraints: <CLAUDE.md rules and SCOPE decisions that bite; hot spots and touches: labels>
acceptance: <observable lines> | spec line: <the one testable promise>
out of scope: <explicit>
already decided with Ritesh: <answers so nobody re-asks>
needs from Ritesh later: <feel-check, approval, prose>
```
4. **Notify.** SendMessage to the orchestrator session (find it with ListAgents; if it is not running, say so and leave the file: it reads the inbox on start and on its loop).
5. **Report** to Ritesh in one line: what was handed off, which issues, what happens next. Then `/learn capture`.
