---
status: working
what: The whole process of how the conversation model was made: why, the method, a timeline with commits, every decision and why, every class of bug found and how it was found, how subagents were used, what worked and what did not.
date: 2026-10-18
source: the build session of 2026-10-17 to 10-18 (Ritesh and Claude), reconstructed from the git log (236e47e to 417f949), decisions.md, the review reports and LEARNINGS.md. Ritesh's words are quoted and dated. Claude's account; check before it goes into PROCESS.md (that file is Ritesh's prose).
---

# How the conversation model was made

## 1. Why it was rebuilt

The store already had a conversation engine: a slot-filling design (ADR 6, `src/shared/conversation.ts`
for the shipped menus and `scripts/sim/` for a terminal prototype, SCOPE D41 and D43). It asked a fixed
list of slots in a priority order. Ritesh's verdict, 2026-10-17: *"replace the current engine, current
engine is trash."* The earlier live feedback (SCOPE, 2026-10-14) had already called the customer flow
"way too linear". The complaint was not a bug but a shape: a conversation that marches through a list
looks scripted, however the list is ordered.

What he wanted instead, in his words (2026-10-17): *"what we're trying to build here is the system, so
that it's genuinely non-linear and doesn't look scripted, and so that there is actually genuine choice,
and a bit of randomness for NPCs. [...] NPCs will behave in a loop, but really it is in a loop of making
these (quasi-random) choices."* And: *"you want word exchanges to actually be consistent and you need some
sort of internal representation of all of these and the pool of suitable actions or devices."*

So the goal was a **system** (a way to model any conversation), proven first on one scene (buying a phone),
which Ritesh sized as "really just like 5% of all the conversation models we have to build."

## 2. The shape of the idea (as dictated)

Ritesh described it as one unstructured message, and asked me to listen first and clarify at the end.
The settled content, compressed (full list with dates: `decisions.md`):

- Conversations always have **two** people: customer-customer (rare), customer-staff (most common, most
  complex), staff-staff (fairly common).
- Each kind has **subtypes** (greeting, phone specialist, billing, repair, backroom...), each with its own
  model, **context set before it starts**, and a **goal**. Phone specialist goal: narrow to a specific
  device, or the customer decides they want none.
- A turn is a **menu pick** on both sides. Staff pick a **question** from a bank (non-linear: any order);
  asked questions grey out but can be **reopened** ("you said 1200-1500, still right?").
- Every line carries an optional **tone**, so speech has variants.
- **Don't ask what you don't have to.** Start with "did you already have a phone in mind?".
- At four devices or fewer, staff can offer **demos**; staff highlight features; afterwards: choose it,
  demo another, or reopen questions. The customer can pick a device directly at any time.
- Questions have **preconditions and effects**, so the bank is consistent and developers can see which
  questions are missing.
- The customer answers a multiple choice (with "Not sure", sometimes several answers) and may **throw a
  question back** ("I'd like one of the Max models").
- **NPCs** act with quasi-randomness but sensibly: ask questions that genuinely narrow, offer demos with
  rising probability as the pool shrinks, reopen rarely unless forced; a customer NPC has a goal and never
  gives conflicting answers.
- If requirements leave **no device**, staff nudge the customer to widen.

## 3. The method (the loop that produced it)

```
describe  ->  mockup + numbered questions  ->  answers  ->  decisions.md
   |                                                           |
   v                                                           v
sourced data  ->  scenarios  ->  sample transcripts  ->  question bank
                                                            |
                      engine (pure) <-----------------------+
                         |
     replays of the transcripts  +  seeded NPC-vs-NPC simulation (invariants)
                         |
        playable page  ->  Ritesh plays, pastes transcripts  ->  fix + a spec each
                         |
        trace tool  ->  Haiku reviewer reads 40 conversations  ->  triage  ->  fix + spec each
```

Each arrow was a deliberate choice to **move correction earlier and make it cheaper**:

1. **Mockup before code.** A static HTML picture and eight numbered questions (each with my default)
   let Ritesh correct the design when correcting cost a sentence. Two defaults were wrong (free text between
   humans; "device" meaning model only) and would have been built in. (LEARNINGS 7c6b6e2 / d389a76.)
2. **Sourced data before conversations.** Every phone fact the characters can say comes from Apple AU's own
   pages, fetched and dated (SCOPE D37), with `null` for "not stated". A rule that follows from this: a
   character may only claim what a data field says.
3. **Transcripts before the question bank.** Sample conversations written by agents over the real data show
   which questions a conversation actually needs. Eleven transcripts (3 + 8) across two rounds; the new
   question types per round fell from 25 distinct names (many duplicates) to 5 genuinely new.
4. **Transcripts as tests.** Each transcript is converted to the menu picks both sides made; the engine must
   accept every move and land on the same pool. A gap between what a transcript does and what the model can
   express shows up at one step (`spec/talk-replay.test.ts`).
5. **A seeded simulation with invariants.** 400 NPC-vs-NPC conversations on every test run, checking things
   like "nobody is ever left without a legal move" and "every conversation ends".
6. **A human playing it.** Ritesh pasted transcripts from the page and said what sounded wrong. Every
   one became a spec before or with the fix.
7. **An automated reviewer.** Ritesh's idea, 2026-10-17: *"basically what I've been doing, but automated."* A
   trace tool writes many conversations with the menus both sides saw; a Haiku agent reads them and reports
   issues; I triage and fix.

The rule that held throughout (CLAUDE.md, week 3 and 5 of the course): **each finding becomes a failing
spec first, then the fix**; the important ones were mutation-checked (turn the fix off, confirm red).

## 4. Timeline (with commits)

| Phase | What happened | Commits |
|---|---|---|
| Dictation and grilling | Ritesh described the model; I listened, then answered with a mockup and 8 questions; he answered, which fixed free-text, storage-vs-model, tone effects, ranking, NPC realism, throwaway two-tab mode, "replace the engine" | `236e47e` mockup, `d389a76` decisions, `7c6b6e2` learning |
| Data | Phone fact sheet from the existing sourced catalogue; then one agent scraped 31 attributes per model from Apple AU (7 models). Surprise: Apple's own page says the Duo's main camera enables a 2x optical-quality telephoto, contradicting the third-party report the old sheet used | `2ef346b`, `34d7d4c` |
| Discovery, round 1 | Three agents wrote one transcript each (no phone in mind; model in mind and impatient; requirements that conflict). Reading them showed the structure: customer-initiated moves, throw-backs, options generated from the pool, hard vs soft signals, "Not sure" semantics | `a0a8149`, `42b8ca7` |
| Scenarios | One agent (Ritesh's preference over three) designed 17 customer briefs; 20 feasibility checks computed over the data, not asserted | `04c3d44` |
| Discovery, round 2 | Eight more transcripts using the real attributes, each with a pasted verification script. Settled the ranking rule, budget bands, "set my own ceiling", the telephoto-vs-crop wording | `72ffe67`, `58db6da` |
| Build | Six steps, each committed alone: data, pool/ranking, bank+engine+wording, replay runner, NPCs+simulation, replays, POC page | `687bafb` `ace7166` `70712e2` `a1d352c` `739eb14` `30cdf64` `a2a9f8c` `2f3c2f2` |
| Play-testing | Ritesh played it and pasted transcripts; twelve rounds of fixes (section 7) | `32878f7` through `417f949` |
| Automated review | Trace tool, two Haiku review passes on fresh seeds, triage, fixes | `422e49a`, `5fb95cc`, `1be68cf`, `c6b9987` |
| Documentation | this set of files | (this commit) |

## 5. The core design decisions and why

**Menus only, no free text** (Ritesh): free text "becomes difficult to tie to preconditions and
effects." Consequence: the customer's side needs *throw-backs* as parameterised menu items (compare two
phones, ask which has the longest battery) so the system, not language, resolves them.

**The pool, not a decision tree.** What is still possible given what has been said is *recomputed from the
answers each time* (state is a fold over answers). So reopening a question is just replacing its answer; there
are no stale effects to undo. This single choice removed a whole class of bugs.

**Hard constraints shrink the pool; soft signals only re-rank it** (the ranking is staff-side and the
customer never sees it). "Photos" does not eliminate a phone, it raises phones with more lenses. A feature
the customer says *matters* ("smoother 120Hz") is a hard requirement. Not-stated data (`null`) never
eliminates: "the page says nothing" is not "no".

**The pool is over SKUs (model x storage x colour)**, because price depends on storage and stock on colour.
Questions narrow to a SKU; demos are by model only (the demo unit has no specific storage and may be another
colour).

**Questions generate their own options from the pool**, and a hard question is only offered if some answer
narrows it. So "a question worth nothing" cannot be asked, and menus stay short. Budget bands are the pool's
price breakpoints (rounded up to A$100, thinned), plus "set my own ceiling" so an empty pool is reachable.

**The menu is the move, the character says the line.** Staff menu: "Ask about budget"; line: "What's the most
you'd like to spend?". The customer's menu works the same way ("Say it's too expensive" vs "That's more than I
wanted to spend."). This was a correction by Ritesh: the customer side had been the spoken text verbatim.

**Tone is phrasing and a face.** Four tones (friendly, neutral, impatient, unsure). Tone changes wording via
per-tone variants (never a lead-in stuck on a label) and each line is stamped with the character's own
facial expression for the 3D store (smile, neutral, focused, worried). Tone also nudges the NPC (patience).

**Mandatory open and close.** The first staff move can only be a greeting that introduces them; every scene
ends with a staff sign-off (a sale hands over to the till). Enforced by the engine, not by NPC taste.

**Obligations make conversations responsive.** If the customer throws back a question, staff *owe* an answer
in their next line (several at once are answered in order). If they ask for a demo, staff's only move is the
demo. "I know the range" forces "which range?". These are engine rules (`owed`, `forced`), so a human staff
member and an NPC are bound the same way.

**Acceptance.** A phone left over by elimination is *suggested*, not built on: colour, storage and the confirm
step wait until the customer has accepted it (named it, chosen it, liked it after a demo, agreed to a
suggestion). Two reviewers independently flagged staff confirming phones nobody had accepted.

**Preferences travel.** Changing the model keeps what the customer wanted: colour stays, an exact storage
tier becomes a floor; staff can check them ("Earlier you mentioned Black and at least 512GB. Is that still
what you want?"). A wish the next phone cannot meet goes through the empty-pool nudge, not silently away.

**Nothing is claimed that the data does not say.** Superlatives say what the comparison was ("Of our iPhones",
"Of the phones that fit what you've said so far"); a cut list says what cut it; no "closest to a phone we have
no data on". A spec scans simulated lines for these.

**Turned-down phones.** Staff never offer one again; the customer can always ask about it, ask to see it, or go
with it, which brings it back.

**Pure engine.** State in, state out, no DOM, no clock, no network. The same scene runs in a spec, in the
NPC-vs-NPC simulation and in the page. Wire it to the server later.

## 6. What the NPCs are

- **Customer NPC:** a hidden *persona* (target SKU or "cannot be satisfied", hard wants, ticks, how unsure,
  patience, what it would give up and after how many refusals, sometimes a looser first budget). Every answer
  is checked against the persona: an option is allowed only if it contradicts no want and leaves the target
  in the pool. Memory: once it concedes a want it does not insist on it again. It never throws back the same
  question twice and only asks about phones its own answer leaves in play.
- **Staff NPC:** weights over the legal moves. Questions weighted by how much they narrow the pool; use and
  budget come early; storage before colour; demos rise as the pool shrinks; recommend when asking runs out;
  reopening only when nothing fits; reconfirm after a change of model; never greets impatiently.
- Both pick tone from a small trait set. Both use a seeded generator, so a conversation replays from its seed.

## 7. Every class of bug found, and how it was found

The point of this table is the **classes**: the next scene will hit the same ones.

| # | Symptom | Class | Found by | Fixed in |
|---|---|---|---|---|
| 1 | Budget bands counted models, but the pool is over rows | rule disagrees with the examples | golden test over the s06 example | `ace7166` |
| 2 | Reopening a question with no model fixed crashed | wording assumed a state | first simulation run | `739eb14` |
| 3 | Staff stranded when questions and demos ran out | missing move | simulation (no legal move) | `739eb14` (the *recommend* move) |
| 4 | A relaxed requirement left its question "answered", so staff circled | state in two places | simulation | `739eb14` |
| 5 | Reopening on an empty pool offered menus with no options | dead-end menu | simulation | `739eb14` |
| 6 | "Not sure" on the model-line question emptied the pool (an empty allowed list means no phone) | empty list vs "no filter" | wording spec over 400 runs | `3b5ffdf` |
| 7 | Customer lines were labels with a tone phrase: "Sure. Not sure." | text composed from independent parts | Ritesh playing | `3b5ffdf` |
| 8 | Customer menu text equalled the spoken line | menu/speech not separated | Ritesh | `245800d` |
| 9 | A conversation opened with "What storage are you after?" | missing mandatory rule | Ritesh | `32878f7` |
| 10 | The Duo was demoed three times in a row; cheerful lead before bad news | memory of declined but not shown; lead-in ignores content | Ritesh pasting a transcript | `97da377` |
| 11 | "One phone fits: iPhone 17e" right after naming it; "show me another" ignored; telephoto question out of nowhere | wording for the wrong situation; request not honoured; premature technical question | Ritesh | `0c0d517` |
| 12 | "Sure thing. Good choice."; customer named the phone back | stacked polish | Ritesh | `07edc1d` |
| 13 | "Nothing fits iPhone 17" after the customer turned down the phone they had named | a thing both fixed and excluded | Ritesh | `ae12979` |
| 14 | "The closest we have is the iPhone 17e" for a phone we have no data on | invented fact | Ritesh | `904a898` |
| 15 | "None of these has a telephoto lens" / "the Duo is the lightest of these" after the pool had narrowed | claim scoped to the wrong set | automated review 1 | `1be68cf` |
| 16 | A feature the customer said mattered did not narrow the pool | soft where it should be hard | review 1 | `1be68cf` |
| 17 | "It comes in 512GB, 1TB, 2TB" for a phone that also comes in 256GB | a cut list passed off as the range | review 1 | `1be68cf` |
| 18 | "I know the range" and "What have you got?" ignored | request not honoured | review 1 | `1be68cf` |
| 19 | "iPhone 18 Pro" matched inside "iPhone 18 Pro Max"; "it" ambiguous after a different phone | substring matching; ambiguous reference | review 1 fix cycle | `1be68cf` |
| 20 | A phone left by elimination confirmed as if chosen; "of the ones we've been looking at" false when nothing had narrowed; two things thrown back at once overwrote each other | state not accepted; wording that over-claims; one slot for a list | review 2 | `c6b9987` |
| 21 | A turned-down phone could not be returned to | one-way exclusion | Ritesh | `417f949` |

Recurring causes, in rough order of how often they bit:

1. **Two features that interact** (named phone x demo reaction; reopen x empty pool; throw-back x answer in
   one turn). Unit tests of each in isolation passed.
2. **The same fact held in two places** (a constraint and the answer behind it; "fixed" and "excluded").
3. **Wording composed from independent parts** (lead-in + built-in acknowledgement; tone + label).
4. **A claim scoped to the wrong set** ("of these" after the pool changed).
5. **An invented fact** (never intended; each came from helpful-sounding glue).
6. **A rule that fits the examples but not the data** (band counting).

## 8. How subagents were used

Eleven subagent runs in total; the prompts are in `prompts.md`.

| Purpose | Runs | Notes |
|---|---|---|
| Round-1 transcripts | 3 (parallel) | Same context three times. Ritesh later: *"avoid launching multiple subagents with the same context, as it eats up token usage."* Saved as a memory note. |
| Sourced attribute scrape | 1 | 31 attributes x 7 models, source URL and date on each value, `null` when not stated. Two claims spot-checked against the live pages. |
| Scenario design | 1 | One agent, by Ritesh's preference. Feasibility claims computed by script. |
| Round-2 transcripts | 2 + 1 | Each pasted a python verification of every pool count and device claim. |
| Replay conversion | 1 | Converted 11 transcripts to menu-pick scripts and wrote `replay-findings.md`. |
| Automated review (Haiku) | 2 | 40 conversations each, batches of 6 to 8, appending to its report as it went. |

Things that made agents useful: (a) restating every rule in the prompt (a subagent sees only its prompt);
(b) a required "assumptions I made" section, which is what exposed the missing data; (c) a required
verification script with pasted output; (d) a list of "already decided, do not report" for the reviewer.
Things to watch: the reviewer is **noisy** (some patterns were intentional or already decided), so every claim
gets a spot-check against the transcripts, and fixes get re-reviewed on seeds the reviewer has not seen
(the second pass found problems the first round of fixes had introduced).

## 9. By the numbers (at `417f949`)

- Engine: 8 modules, about 2,100 lines (`src/shared/talk/`). POC page 245 lines. Trace tool 108 lines.
- Specs: 106 across 6 files (about 1,070 lines); 11 transcript replays + 1 smoke replay; 400 simulated
  conversations per run (seeds 1 to 400), 320 end in a sale.
- Data: 7 phone models, 31 attributes each, 14 null (all AppleCare prices are null: no page shows an AUD price).
- Transcripts: 3 + 8 written; 80 sample conversations read by a reviewer in two passes.
- Reviews: 38 patterns (5 blocker, 14 major, 19 minor), then 25 (2 blocker, 13 major, 10 minor, 1 regression).
- Learnings recorded: 5 entries in `LEARNINGS.md`.

## 10. What worked and what did not

**Worked**
- The mockup and numbered questions with defaults: cheap, and they caught two wrong assumptions.
- Making the pool a recomputation, not an accumulation: reopen, concede, carry over all became trivial.
- A pure engine with a seeded simulation: failures name a seed that replays exactly.
- Treating every pasted transcript as a bug report with a spec attached.
- The reviewer loop, once its output was verified before use.

**Did not (or cost more than it should)**
- Three same-context agents in parallel: wasteful, and Ritesh said so twice.
- Hand-written replay expectations for ranking leaders: three were removed because the engine's rule was the
  agreed starting rule and the transcripts' was an agent's assumption. Ranking is still a starting rule to tune.
- Fixing wording one transcript at a time: the same defect (a lead-in clashing with content) came back in three
  forms. The durable fix was *content-aware leads* plus a simulation check, not more phrases.
- A first version of "it" (substring match, any earlier mention): wrong in two ways at once.

**Surprises**
- The first simulation run found four engine gaps in minutes that 17 unit tests had not.
- Half of the bugs were in the *interaction between two correct rules*.
- The Duo does have a telephoto (Apple's own page), which flipped a scenario.
- Asking an agent to review its own writing style is useless; asking a fresh one, with the rules, is not.

## 11. Open items and decisions waiting

See the "Not done" section of `README.md`. In short: the ADR (after Ritesh approves the POC), wiring and the
event log, the old engine's removal, wording rewrite, the coverage report, forced reconfirm or not,
a third review pass, and every scene other than buying a phone.

## 12. Where the course lessons are

`LEARNINGS.md`, five entries from this work (each cites commits and names the lecture lesson):
- mockup first, numbered defaults: week 2 (`7c6b6e2`, `d389a76`, `236e47e`)
- restating rules in each subagent prompt: week 9 (`42b8ca7`, `a0a8149`)
- the seeded simulation found what unit tests missed: week 3 (`ce4aca0`, `739eb14`)
- a played transcript found a loop 400 green runs had not: week 5 (`83caf0a`, `97da377`)
- the automated reviewer found what my fixes broke, and needed checking: week 9 and 5 (`0691f5b`, `1be68cf`, `c6b9987`)
