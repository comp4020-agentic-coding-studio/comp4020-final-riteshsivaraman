# Learnings

A bank of what **I** did differently when directing the agents, kept so that I can pick moments out of it when I write `PROCESS.md`. Nothing here is copied into `PROCESS.md`: that is my own account, in my own words.

## The rule for this file

**Every sentence about me must trace to something I said, a decision recorded under my name (SCOPE.md), or my own earlier writing (reflections, PROCESS.md).** Technical detail belongs to the commit, not here: I only keep as much as I actually mentioned or chose. Where the record shows the agent doing something and not me, the entry sits in Part 2 and says so. Where a detail of my part is missing, it is a `[TK]` for me to fill from memory.

## What PROCESS.md has to show

From the course (assessment page, "Legibility of process", and the final-project checklist, section B): the top band wants **deliberate direction**: failures fixed at the **harness level** rather than retried, **judgement visible in what was thrown away**, and an account that justifies the call (why it beat the obvious alternative, how I knew it was right before accepting it). Every claim needs a **commit citation**, and the account should say where the record is **only the repo** and where it is **my recall**. Prefer moments newer than crit 9 that I have not already used. Budget: 900 to 1100 words.

Each Part 1 entry is a short narrative of what happened and what I did, then four fixed lines: where it landed, record, course lesson, and a PROCESS.md rating.

Restructured on 2026-11-07 by Claude at my request. Claude drafted this wording, so I check and reword it. The earlier wording is in git history.

## How my Assignment 1 and 2 `PROCESS.md` files read (the voice to match)

Read from `Assignments/comp4020-ass1-riteshsivaraman/PROCESS.md` (687 words) and `comp4020-ass2-riteshsivaraman/PROCESS.md` (623 words). Their moments share a shape, and the best ones do these things; the final account should too:

- **Say the instinct, then refuse it.** Ass1 moment 2: the page passed every check and was lifeless; "my initial instinct was to list what looked wrong", and instead I asked why it was delivered that way and how the *workflow* should change.
- **Fix the class, not the instance.** Ass1 moment 3 names the bug type and builds a defect loop (evidence before diagnosis, name the class, add the sensor that fires red, then fix).
- **A rule can be the defect.** Ass1 moment 4: the harness itself said simulations should "demonstrate themselves at rest"; the rule had to change with the code.
- **Put a number on it.** `0.0 x 143.3px` for a mark, 16 labels under 11px, a filmstrip from z=3.39 to 0.00, 154.5k of 200k tokens, seven replies before I noticed the review never happened. Specific figures are what make an account read as corroborated.
- **Say what I accepted, and what I stopped accepting.** Ass2: I stopped asking for tweaks and demanded a complete redesign; I noticed a "looks good" had approved a whole information architecture.
- **Divide the labour honestly.** Ass1 ends on what the sensors found (contrast, rounding, a 0px mark) versus what only I could perceive (a page that felt dead). Final project: same split between `spec/` and the feel-check.
- **Cite every claim** with a commit link; one line at the top says which repo the links point to.

# Part 1: moments where my own action is on the record

## I chose the shape of a feature from laid-out options, and the choice became a standing rule

*Seen-era (the archived email app, before the 11 October pivot)*

**Commits:** [`cf2242d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/cf2242d)

I asked for a live preview in the email app, a real-time multi-user feature. The agent did not pick a reading and build it. It laid out the options, how much the recipient should see and how it should reach them, and asked. I chose the more invasive keystroke-level version, and SSE rather than the WebSocket that ADR 1 had already named. Neither was what it would have guessed.

The same commit wrote that into CLAUDE.md as a standing move: for decisions that affect many users or are expensive to reverse, lay out the options and costs and let me choose, instead of guessing.

- **Where it landed:** CLAUDE.md, same commit; the rule is still there.
- **Record:** Repo for the rule and commit; my recall for what the options were.
- **Course lesson:** [Week 8, “with an agent”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-8/#/adr-with-an-agent): “lay out three options for where this app stores X, and what each costs. Don't pick one yet.” Also [Week 9, “polling, server-sent events, WebSockets”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/three-transports), the choice I made between transports.
- **For PROCESS.md:** Strong. The correction landed in the harness and is still in force. Frame it as the origin of a standing rule, since the feature itself was in the archived app.

## I answered an interview about what "good" means, and the unanswered part stayed marked

*Seen-era (the archived email app, before the 11 October pivot)*

**Commits:** [`3284399`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/3284399)

For the Seen README, the agent interviewed me one question at a time with the week 8 framework instead of drafting a definition for me to react to. My answers on quality of execution and differentiation were specific. My answer on who it is for described the company's culture rather than a person, and the scaffold left that gap visibly marked instead of filling it with an invented persona. [TK: did I ask to be interviewed this way?]

- **Where it landed:** CLAUDE.md "Ritesh writes the prose" and the `[TK]` convention.
- **Record:** Repo for the scaffold; my recall for how I answered.
- **Course lesson:** [Week 8, “what would make it good?”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-8/#/good-not-features): ask that instead of “what should it do?”; and [Week 8, “is it any good?”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-8/#/is-it-any-good): the answer is about those people and that use.
- **For PROCESS.md:** Medium. The README is being rewritten for the store; use only as the origin of the interview-then-scaffold method.

## I caught a backwards tilt by looking at it, and the same kind of bug became one rule

**Commits:** [`2ed2c7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/2ed2c7a), [`a3b8070`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a3b8070), [`df52978`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/df52978), [`8d20aff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8d20aff)

In one session three different things had a rotation or offset the wrong way round. I caught the phone-lean tilt live, by looking at it; the agent had only checked a side render. After the third, the shape went into CLAUDE.md as one standing line: a rotation, heading or camera sign that looks right on a read-through is not evidence, so render it or write a test that fails against the old code first.

- **Where it landed:** CLAUDE.md "Known gotchas" (`8d20aff`).
- **Record:** Repo for commits and the rule; my recall for the one I caught.
- **Course lesson:** [Week 5, “ask for the artefact”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/): “the screenshot, the console, the response body, the exit code.” Also [Week 1, “done!” is a claim, not a fact](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-1/).
- **For PROCESS.md:** Strong. The same bug three times, then a rule. Not yet in PROCESS.md.

## I had a real photo of the phone and could see the agent's design from web sources was wrong

**Commits:** [`255ce19`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/255ce19)

The agent built the camera layout of a new phone from several web sources that agreed. I had an actual marketing photo of the real device and could see immediately that it was wrong; the sources were repeating a pre-launch leak. What had been built was thrown away. [TK: confirm it was rebuilt, and the commit.]

The rule written down was that a physical-layout claim is provisional until it is checked against a photo, and that the agent says so instead of reporting it as settled.

- **Where it landed:** `references/product-line.md` sourcing note.
- **Record:** Repo for the commit and note; my recall for the moment I saw the photo.
- **Course lesson:** [Week 1, “done!” is a claim, not a fact](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-1/), and [Week 5, “never assume it works until it has run”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/): the agreement between web sources was a claim, and the photo was the check.
- **For PROCESS.md:** Strong. Thrown-away work plus a rule, with a clear "how I knew". Not yet in PROCESS.md.

## The same visual fix had to be asked for twice, and a rendered image settled it

**Commits:** [`0f564d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/0f564d4), [`9b74a21`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9b74a21), [`8d20aff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8d20aff)

Face marks were poking through the head. The agent reported fixes it could not check, because its browser tool had WebGL off. [TK: confirm I asked twice.] The second request led it to render the scene to an image, and that showed marks floating off some faces, the opposite of the original problem. The rule in CLAUDE.md is to check both directions of any poke-through or overlap defect.

- **Where it landed:** CLAUDE.md "Known gotchas".
- **Record:** Repo for commits and rule; my recall for the two requests.
- **Course lesson:** [Week 5, “agentic manual testing”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/): drive the running artefact and report what you saw; and “ask for the artefact: the screenshot...”.
- **For PROCESS.md:** Strong. A repeated correction that ended in a harness rule.

## I dictated the conversation model first and had the agent answer with a picture and defaults

**Commits:** [`236e47e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/236e47e), [`d389a76`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/d389a76)

Redesigning the conversation model, I described it in one long unstructured message and told the agent to listen and clarify only at the end. It came back with a mockup and eight numbered questions, each with a default. Two defaults were wrong. It proposed free text between two human players and I ruled out free text entirely. And it treated "device" as the model alone; the answer is both, with questions narrowing to model plus storage plus colour and demos by model only.

A picture with a default per question is cheaper to correct than code, and answering "defaults" to the right ones takes seconds. The settled list went into a doc so the next session loads it.

- **Where it landed:** `docs/conversation-model/decisions.md`.
- **Record:** Repo for the doc and commits; my recall for the two corrections.
- **Course lesson:** [Week 2, “make claude argue with you”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-2/): “what's ambiguous here, what did you assume, what have we missed?”
- **For PROCESS.md:** Strong. A cheap picture beat code, and the settled list is in the repo.

## I read one played transcript myself and found what 400 green simulated runs missed

**Commits:** [`97da377`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/97da377)

I pasted a conversation from the proof of concept and asked whether the agent could see what was wrong. Staff had shown the same phone three times in a row after the customer said they liked it, and had said "Sure thing." before "Nothing fits...". The simulation specs had all passed because they never said not to show the same phone twice.

Two new specs now reproduce it: they go red on seeds 8 and 9 with the old rule put back. I take away the habit of adding the spec before the fix.

- **Where it landed:** Two specs in `spec/` for repeated demos and ordering.
- **Record:** Repo: the transcript, the specs and the commit.
- **Course lesson:** [Week 5, “agentic manual testing”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/): drive the running artefact yourself and report what you saw, then turn each finding into a check; plus [Week 3, “one well-aimed failing test will reorganise an agent’s whole approach”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-3/).
- **For PROCESS.md:** Strong. A human reading found what the automation could not, and it ended in a check. Not yet in PROCESS.md.

## I suggested automating my hand review, and the automated reviewer was checked before it was trusted

**Commits:** [`1be68cf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/1be68cf), [`c6b9987`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c6b9987)

I had been reading generated conversations by hand. I suggested automating it: generate many NPC-vs-NPC conversations with the menus logged and have a Haiku agent read them. The first pass reported 38 patterns, five were spot-checked against the transcripts and all held. The second pass, on fresh seeds, caught two blockers the fixes themselves had just introduced. [TK: was the spot-check my instruction?]

- **Where it landed:** The review reports and the specs that pin each finding.
- **Record:** Repo for reports and specs; my recall for the decision to automate.
- **Course lesson:** [Week 9, “when to use a subagent”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/subagent-fit): “a review: a fresh context reviews better than one that wrote the code”; and [Week 5, “never assume it works until it has run”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/) for the spot-checks.
- **For PROCESS.md:** Strong. Delegation with verification, both halves in the repo.

## I asked for a prior-art check partway through the build

**Commits:** [`9f7fd78`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9f7fd78)

Partway through extracting the engine's generic core, someone joked that it sounded like Akinator and asked for a prior-art check before more build time was spent. [TK: confirm the joke and the request were mine.] The research found that no single library did what the design does, but that each half of it is a named, citable technique, and the finding went into `decisions.md` so a "why not use X" question at a crit has an answer.

- **Where it landed:** `docs/conversation-model/decisions.md`.
- **Record:** Repo for the commit and doc; my recall for the request.
- **Course lesson:** [Week 8, “record-worthy decisions”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-8/#/what-earns-a-record): decisions that are “expensive to reverse, or that someone will ask about later”. The lecture frames this at the start; asking mid-build is my extension.
- **For PROCESS.md:** Strong. A justified call with a cited record: why this design beat the obvious alternative.

## I said the conversation was too linear, then said patching it was not enough

**Commits:** [`a1fb3b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a1fb3b3)

After playing the customer side I said the flow was "way too linear", and that a fixed menu tree, however many branches, was "only like 1% of the possibilities." The first fixes were patches. Then I said they were still patching instances of a conversation that marched through one fixed question after another, "not fixing the underlying structure of how this can be a non linear conversation that can go in any order." The structure was replaced, not tuned.

I kept pushing past the patch. [TK: how I knew the new structure was right.]

- **Where it landed:** SCOPE.md D43 and its follow-ups (my quotes are from there).
- **Record:** Repo for the commit and the SCOPE text dated 2026-10-14; my recall for what I did between the two complaints.
- **Course lesson:** [Week 5, “agentic manual testing”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/): I drove the running thing myself and reported what I saw (“way too linear”) instead of reading code. Closest match; the lecture does not cover replacing a structure.
- **For PROCESS.md:** Strong, and new since crit 9. It is the same habit as Assignment 1's "refusing a one-off fix", so say it carried over, in one sentence, instead of retelling that story.

## I threw away the intent-to-talk handshake after watching everyone get stuck behind one greeting

**Commits:** [`a494c2b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a494c2b), [`21d4d97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/21d4d97), [`eb65c80`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/eb65c80)

After crit 10, where everyone was stuck behind one greeting and "Maya wants to talk" floated over every head, I decided talking has no handshake at all (SCOPE D46, 2026-10-21, superseding the 2026-10-19 decision). Pressing E at a free person opens the conversation at once, at a busy one it says they are with someone else, and nothing queues. The handshake had only just been built; the removal came two days after the decision it replaced. [TK: what I saw when I re-ran it.]

- **Where it landed:** SCOPE D46, the removal commit, and a `greeter-live` spec (`eb65c80`).
- **Record:** Repo for D46 and the commits; my recall for the crit observation.
- **Course lesson:** [Week 10, “a multi-user app”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-10/#/multi-user-definition): “telling people apart, deciding what each may do, and handling two of them at once”, tested with “two Chrome profiles”. The handshake only broke with several people in the room.
- **For PROCESS.md:** Strong. "Judgement visible in what was thrown away" is a named top-band descriptor.

## Crit 10 reads logs with a command, so I made the events readable by that command

**Commits:** [`a60962b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a60962b)

Crit 10 asks for who-did-what narrated from the logs, and the logs are read with `flyctl logs`. Every state change already wrote an `events` row, but nothing reached the output that command shows. Following the week 10 point that logs help only when a command the agent can run prints them, I had every event print a line, then checked it with two real WebSocket clients: the log alone said who joined, who was refused the back room and who left, and no session token appeared. A later run showed one notice logged 140 times and an error with no line, so repeats are folded and errors name the user (`73bb0a0`, `c5fbeff`).

- **Where it landed:** The logging code, `73bb0a0`, `c5fbeff` and the ADR 3 addendum `52318d0`.
- **Record:** Repo only (this is already in my PROCESS.md in my own words).
- **Course lesson:** [Week 10, “what to log”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-10/#/what-to-log): “each event that matters: who, what, when, one line each”; never secrets or tokens.
- **For PROCESS.md:** **Already used** as moment 4 of PROCESS.md. Don't repeat it.

## I said a real Apple Store has no queue, and had the files that said otherwise checked

**Commits:** [`9676dc0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9676dc0)

On 2026-11-07 I said that a real Apple Store has no queue: you browse until staff find you, and payment is taken on the spot. Our README, CLAUDE.md and SCOPE.md still said "the Genius Bar queue is the shared state". Nothing had failed; the documents had drifted from what I now meant, and the README is marked against them. So before scoping anything I asked for a hygiene check of README.md and CLAUDE.md to remove outdated assumptions and add missing ones.

I then refined it: there is still an internal queue with staff as the resource, but staff approach the customer rather than customers lining up, and a real user behind the screen is always offered a customer before a CPU. That became SCOPE D47.

- **Where it landed:** SCOPE D47 and a rewritten idea in CLAUDE.md (that commit), then D48 to D52.
- **Record:** Repo for the commit; my recall for the wording of what I said.
- **Course lesson:** [Week 6, “the compound step: write what you learned into the harness”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-6/), and “what compounding costs: every rule you compound in is context you pay” (the reason to prune); see also [Week 4, “you add it because the work kept failing”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-4/).
- **For PROCESS.md:** Strong, and new since crit 9: the scope moved, and the harness moved with it in the same sitting.

## I asked for the check that a rule is followed at the same time as the rule

**Commits:** [`e97c1ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e97c1ac), [`9676dc0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9676dc0)

While describing the parallel-agent workflow I added: "we need some kind of scheduled audits (or even self audits) to make sure this workflow is actually being followed and it not, it should be made more direct in the claude md." I asked for the rule and for a way to notice when it is not followed, together, instead of waiting for the first drift.

That became an audit script, an `/audit-workflow` skill and a "Workflow" section in CLAUDE.md. [TK: what the first run found, from my memory; the audit log is not committed.]

- **Where it landed:** `scripts/audit-workflow.sh`, the `/audit-workflow` skill and CLAUDE.md "Workflow".
- **Record:** Repo for the files; my recall for what it found.
- **Course lesson:** [Week 3, “guides and sensors”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-3/): guides steer before doing, sensors measure what was generated; the audit script is a sensor on the workflow. And [Week 3, “what makes a sensor worth wiring in”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-3/): specific, fast, automatic, trustworthy.
- **For PROCESS.md:** Strong. A new harness-level move.

## I named the failure I feared, and a one-minute test found one I had not named

**Commits:** [`e97c1ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e97c1ac)

In the workflow brief I said "it is very important that agents don't overwrite each other's work when working in parallel, so it may be worthwhile using worktrees/branches." That put worktrees into the design. I agreed to a one-minute test before relying on them, and it showed that a worktree is taken from the committed work, so my uncommitted CLAUDE.md and SCOPE edits would have been invisible to any builder. That changed the order: commit the harness first, and work on `integration` so `main`, which deploys, stays untouched.

- **Where it landed:** A wave precondition (commit first), the harness commits on `integration`, and an audit check for uncommitted paths.
- **Record:** Repo for the checks; my recall for the test result.
- **Course lesson:** [Week 9, “worktrees”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/parallel-worktrees): “two subagents editing one checkout overwrite each other; a git worktree gives each its own checkout”. Also [Week 9, “reading: run several at once; writing: one worktree each”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/reads-and-writes).
- **For PROCESS.md:** Medium to strong. A cheap test that found a failure I had not named.

## I noticed the cost of talking to the slow agent, and split talking from doing

**Commits:** [`8118e74`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8118e74)

After the orchestrator was set to run on ultracode, I said "if i try to talk with the orchestrator running ultracode everytime, it takes a lot of time for it to respond", and that it might work better with prompts that had been refined first. We added a faster `interface` agent for me to talk to, and the orchestrator runs separately. [TK: how it felt in use; it had not been run when this was written.]

- **Where it landed:** `.claude/agents/interface.md`, `/brief`, `/status`.
- **Record:** Repo for the files; my recall for how it felt.
- **Course lesson:** [Week 9, “Ben uses… different models”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/ben-uses-subagents): “default subagents to sonnet … and reserve the session's top model for the genuinely hard subtasks”; and [Week 9, “subagent costs”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/subagent-costs) (about 15x the tokens). This is a slide, not one of the two listed lessons.
- **For PROCESS.md:** Medium. A good design call; strong once I can say how I knew it helped.

## I asked "does it know about our other files?" after the build, not before

**Commits:** [TK: commit of the context-pack edits; none yet]

Once the workflow existed I asked: "does this workflow know to interact ewith other files in this project like adr etc". It mostly did not: the agents named CLAUDE.md and SCOPE, and only one named an ADR. I only found out because I asked. The fix gave every agent a rule to find context through `docs/INDEX.md`, added a `needs-adr` label, and made the steward scaffold the ADR when a decision is expensive to reverse.

- **Where it landed:** A shared context rule in all agents, the brief's READ FIRST line, the `needs-adr` label (not yet committed).
- **Record:** Repo once committed; my recall for the question.
- **Course lesson:** [Week 9, “two context windows”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/subagent-context): the subagent knows only what the delegation message tells it; and [Week 8, “with an agent”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-8/#/adr-with-an-agent): put in CLAUDE.md “Read them before changing the stack, storage or data model.”
- **For PROCESS.md:** Medium. New and harness-level. Needs its commit before it can be cited.

# Part 2: findings recorded in the agent's voice

The earlier entries below were written by the agent about its own work, in the first person, and they contain technical detail I never mentioned. I have not claimed them as mine. Each is kept as one line so the facts are not lost; if I did something in one of these (a decision, a catch, an instruction), I add it from memory and move it up to Part 1, and otherwise it stays out of `PROCESS.md`.

| Finding | Commit | Where it landed | Course lesson | If it was me, add |
|---|---|---|---|---|
| A banner check that reloaded the page proved nothing (verify by navigating like a user). Seen-era | [`a4c671f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a4c671f) | nowhere | [Week 5, agentic manual testing](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/) | [TK] |
| A failing piped test of an interactive tool was the test's fault; check through a real terminal | [`1ae8e01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/1ae8e01) | CLAUDE.md gotchas | [Week 5, agentic manual testing](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-5/) | [TK: who proposed the check] |
| A false "it isn't built" claim about staff handoff, caught when the fix needed reading the code; rule: search the whole subsystem before a negative claim | [`9e511ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9e511ca), [`e3ab3cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e3ab3cb), [`8d20aff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8d20aff) | CLAUDE.md "Don't invent". **Already in PROCESS.md moment 5**, in my own words | [Week 1, “done!” is a claim](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-1/) | [TK: how I caught it, and whether I asked for the audit pass] |
| Trailing slash on a mounted sub-app route 404s. Seen-era stack gotcha | none | nowhere | [Week 7, the field name is a contract](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-7/) | skip |
| A delete order bug with a foreign key child, found only on one path. Seen-era stack gotcha | none | nowhere | [Week 7, “what survives?”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-7/) | skip |
| Two tabs of one browser profile are not two users. Seen-era | none | CLAUDE.md "Verification": a second, genuinely different profile; still drives `/feel-check` | [Week 10, “two Chrome profiles”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-10/#/multi-user-definition) | [TK: how I ran into it] |
| A manual database edit left an orphan row and crash-looped the Seen app. Seen-era stack gotcha | none | nowhere | [Week 10, “what to log”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-10/#/what-to-log): paste the lines around the failure | skip |
| A stale dev server made a mutation check look like it passed. Seen-era | [`ae9a0cd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/ae9a0cd) | CLAUDE.md gotchas (stop every dev server, check `lsof`) | [Week 3, “what makes a sensor worth wiring in”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-3/): trustworthy | [TK] |
| Three parallel subagents were each given the no-invented-facts rule and asked to list their assumptions, and all three flagged the same gap | [`a0a8149`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a0a8149) | the "NEEDS DATA" list | [Week 9, “two context windows”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-9/#/subagent-context) | [TK: did I require the assumptions section?] |
| A seeded NPC-vs-NPC simulation of 400 runs failed four ways that 17 green unit tests had not | [`739eb14`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/739eb14), [`30cdf64`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/30cdf64) | invariants in the talk specs | [Week 3, “one well-aimed failing test”](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/lectures/week-3/) | [TK: who asked for the simulation?] |

## Carried over from Assignments 1 and 2 (the harness compounds; don't retell these)

The final-project brief says `CLAUDE.md` is "carried forward and grown from one deliverable to the next". Rules that started in my earlier PROCESS.md files, and where they stand in this repo's harness:

| From | Commit | The rule | In this `CLAUDE.md` now? |
|---|---|---|---|
| Ass1 "Harness before page" | [`6073ba3`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-riteshsivaraman/commit/6073ba3) | Sensors, layering and design rules go in before any markup | Spirit kept: "Cut the feature, never the harness" and the sensor admission bar |
| Ass1 "Refusing a one-off fix" | [`9698457`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-riteshsivaraman/commit/9698457), [`77ca492`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-riteshsivaraman/commit/77ca492) | Stills-only sensors measure nothing about motion; add a multi-frame one | Idea kept as "Feel, not just function"; the stills sentence was pruned on 2026-11-07 |
| Ass1 "Making the protocol repeatable" | [`9d3b1f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-riteshsivaraman/commit/9d3b1f5) | The defect loop (evidence, name the class, red sensor, then fix) | Yes: "The defect loop" |
| Ass2 "vague approvals" | [`06c6f7c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-riteshsivaraman/commit/06c6f7c) | A large approval is read back, a vague constraint is quantified first, review is spoken not filed | **No.** Not in this repo's `CLAUDE.md`. [TK: do I want it back?] |
| Ass2 "delegate, don't inline" | [`2a9d21a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-riteshsivaraman/commit/2a9d21a) | After 154.5k of 200k tokens went on small inline fixes, the test is "does this need my judgement while it's written" | **No**, and it matters more now that builders run in parallel. The Workflow section covers who builds, not this test. [TK] |

If I want the last two back it is one line each in `CLAUDE.md` "Workflow", written by me; the point for PROCESS.md is that the harness grew across deliverables, which is exactly what the markers read for.
