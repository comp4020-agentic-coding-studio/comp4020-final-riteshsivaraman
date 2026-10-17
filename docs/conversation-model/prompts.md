---
status: working
what: The prompts given to each kind of subagent while building the phone scene, in reusable form (paths made repo-relative, scenario-specific text marked). Copy and adapt for the next scene.
date: 2026-10-18
source: the delegation messages used on 2026-10-17, tidied. A subagent sees only its prompt, so every rule is restated in each one; keep it that way.
---

# Subagent prompts

General rules that made these work (week 9 of the course: a subagent sees only the delegation message):

1. **Restate every rule** the agent must follow. Do not rely on "as discussed".
2. **One agent per shared context.** Several agents reading the same files multiply the token cost
   (Ritesh asked for this twice). Parallel only when the contexts really differ.
3. **Require evidence in the output:** a section "assumptions I made", and a verification script whose output is pasted.
4. **Ground facts in one file** and say "anything not in it is UNKNOWN".
5. **Reply short.** The report is in the file the agent writes, not in the reply.
6. **Check what comes back** before acting on it (spot-check against the sources).

`<repo>` below means the repository root. Replace `<scene>` and the scenario text for a new scene.

---

## A. Sourced attribute scrape

Used once (phones). Produces `devices.json` and `devices-v2-notes.md`.

```
Task: build a sourced attribute table of the CURRENT Apple Australia <product family> line-up, for a
store-simulation question bank. Today is <date>. Only read public pages; do not log in or buy anything.

Models in scope: <list> (read <repo>/docs/conversation-model/devices.md first). If Apple's AU site shows other
current models, list them in a separate section 'Other models seen' with just name and the page; do not
fully extract them.

Sources: Apple's own AU pages only (the compare page, each model's specs page, each buy page). Use curl or a
fetch tool. If a page cannot be fetched, say so; do not fill from memory.

For EACH model extract these attributes where the pages state them: <screen, display features, chip,
dimensions, weight, materials, colours, storage tiers with AUD price per tier, cameras, video, battery,
charging, water resistance, connectivity, ports, buttons, biometrics, trade-in or care prices ONLY if shown>.

RULES (strict): (1) every value must be copied from a fetched page; record URL and fetch date next to it.
(2) If a page does not state an attribute, write null. NEVER guess, never use memory, never infer. 'Not
stated' is different from 'does not have'. (3) No invented marketing copy.

Output: write TWO files: (a) devices.json: an array of model objects; each attribute is
{"value": ..., "source": "<url>", "fetched": "<date>"} or null; storage tiers as an array of
{storage, priceAUD, source}. (b) devices-v2-notes.md with front matter, a compact table of key attributes,
a 'Not stated on any fetched page' section per model, a 'Pages that failed to load' section, and a
'Differences from devices.md' section (flag price or colour changes explicitly). Do not edit any other
file. Reply with one short paragraph: files written, number of models, count of null attributes, and any
disagreements with the old sheet.
```

## B. Scenario designer

One agent designs the whole set (one coherent set, minimal overlap). The scenarios double as customer NPC
personas and as regression tests. Output `scenarios.md`.

```
You are designing the SCENARIO SET for a simulated <scene> conversation (<party A> talks to <party B>).
Read first: decisions.md (follow it), devices.json (the ONLY source of facts; null = not stated, never
guess), the sample transcripts.

Design rules to respect: <restate the engine's rules: menus only; staff pick questions from a bank,
non-linearly; the customer answers by menu pick (single or multi, may be 'Not sure') and may throw back a
canned/parameterised question; four tones; reopening; demos by model only; offer demos at 4 or fewer;
empty pool -> nudge; customer may leave at any time; hard filters define the feasible set and soft signals
rank it; the ranking is hidden from the customer>. OUT OF SCOPE for this scene: <list>. The scene ends when
<outcome>.

TASK: produce ONE coherent set of about <16> scenarios that together cover the space with minimal overlap.
Each is a customer profile that will serve both as the brief for a sample transcript and as the hidden-goal
persona of a customer NPC. For each give, in a fenced yaml block: id, title, who they are, opening (knows
exactly / knows a family / no idea / buying for someone / browsing), patience and decisiveness, typical
tones, hidden_goal (the exact target or 'none: will leave' and why), hard_constraints, soft_signals,
knowledge gaps, behaviours to exercise (reopen_answer, multi_select, throwback_compare,
throwback_attribute_query, asks_direct_demo, rejects_demo, zero_pool_then_relax, zero_pool_then_leave,
changes_mind_late, tone_shift, price_haggle, picks_unavailable_colour, leaves_early), expected_outcome, and a
feasibility_check line: for any claim like 'nothing fits', VERIFY it by computing over the data with a small
script you run; paste the check and its result, do not assert it.
Also include: a coverage matrix (scenarios x behaviours, scenarios x opening types; each hit at least twice,
no duplicates); the question families the bank will need; data gaps (nulls the scenarios touch); risks
(places that are hard to model under menus-only).
Do not invent facts. Output scenarios.md with front matter. Do not write transcripts or edit other files.
Reply with one short paragraph: path, number of scenarios, whether every feasibility check was run and passed.
```

## C. Sample transcripts (discovery of the question bank)

Used for round 1 (one scenario each) and round 2 (several scenarios per agent). **One agent for a batch.**

```
You are writing sample conversations (one per scenario) to help design a question bank for a <scene>
simulation. Folder: <repo>/docs/conversation-model/. Read first: decisions.md (follow it), devices.json (the
ONLY source of facts), scenarios.md (your briefs), and transcripts/round-<n>/<an example> for the line format.

YOUR SCENARIOS: <ids>. One transcript per scenario, following its brief exactly. The customer must never
contradict their own hidden goal and constraints.

RULES: every line is a menu choice (no free text). Staff lines come from question types with fixed options;
customer lines are picks (single or multi, may include 'Not sure'), optionally plus ONE canned or
parameterised throw-back. Only four tones: friendly, neutral, impatient, unsure. Staff only ask a question
if it genuinely narrows the pool or ranking; never re-ask an answered question except as an explicit reopen.
Options are generated from the current pool. Demos by model only, offered at 4 or fewer. Staff cannot state
stock or demo-unit colour ('let me check'). Empty pool -> staff nudge. Staff state nothing outside
devices.json; for 'telephoto' distinguish a separate lens from the 2x crop most models advertise. Out of
scope: <list>.

FORMAT: lines `S<n> | STAFF | tone | move=<...> | qtype=<snake_case or none>` and
`C<n> | CUST | tone | picks=... | throwback=...`, consistent numbering. After each customer line add a
bracketed running state `[pool: <count> models; facts: ...; staff top-3 ranking: ...]`. REUSE the existing
question names when the purpose matches; mark genuinely new ones NEW. After each transcript: a 'Question
types used' table (qtype | text | options | multi? | PRECONDITION | EFFECT | NEEDS DATA), throw-backs used,
what staff could have asked but didn't, assumptions made.

VERIFY: before finishing run a small python3 -I script over devices.json that checks every pool count and
every device claim in the brackets or staff lines; paste the output under '## Verification run'; fix failures.

OUTPUT: transcripts/round-<n>/<id>.md (front matter: status, what, date, source). Edit nothing else. Reply
with one short paragraph: files, turn counts, whether verification passed.
```

## D. Transcript to replay conversion

Run once the engine's move vocabulary was fixed. Output `spec/talk-replays/<id>.json` and `replay-findings.md`.

```
Task: convert the sample transcripts into replay scripts for the new conversation engine, run them, and
report where the engine and the transcripts disagree.

READ FIRST: src/shared/talk/{types,bank,scene,lines,pool}.ts (the engine; DO NOT EDIT anything under src/),
spec/talk-replay.test.ts (the runner and JSON format), spec/talk-replays/_smoke.json (an example),
docs/conversation-model/decisions.md, and the transcripts.

Each transcript becomes ONE file spec/talk-replays/<id>.json. A step = one staff move + the customer's
reply. Map staff 'ask' lines to {"t":"ask","qid":...}; 'reopen' to ask with reopen:true; offer_demo,
demo, nudge, rescue, confirm; an 'answer_throwback + next question' line is just the ask (the engine
answers the owed throw-back inside it). Customer picks must be engine option ids, throw-back ids, or
standing actions. After each step add expect.models (and expect.top when the transcript states a leader).
The ending: bought (model, storage, colour) or left.

RUN `pnpm test:talk` repeatedly until the conversions run. For every failing step decide: (a) you
mis-converted: fix the JSON; or (b) the engine genuinely cannot express or disagrees: do NOT bend the JSON
to hide it; record it. If a replay cannot proceed, truncate it, set 'ends' to what the engine allows and add
a top-level "blocked": "<reason>".

REPORT: per transcript pass/blocked; a table of every engine-vs-transcript disagreement (transcript, step,
what the transcript did, what the engine did, who is right: engine rule / transcript / unclear, a one-line
suggested engine change). Distinguish (a) from (b). Write it to replay-findings.md. Edit only
spec/talk-replays/*.json and the findings file. Do not run git.
```

## E. Reviewer (run with a cheap model; Haiku was used)

Generate the transcripts first (`node scripts/talk-transcripts.ts --n=40 --seed=<fresh> --out=.talk-runs/<name>`),
then one agent reads them in batches. Use **fresh seeds each pass**. This is the second version (it carries
the "already decided" and "regression" lists, which stop it re-reporting intended behaviour and make it tell
you when an old fix breaks). The first pass used the same text without those two lists.

```
You are a careful QA reviewer for a conversation simulator. Read simulated conversations between two
computer-controlled characters and report every problem a thoughtful person would notice. Be specific and
honest: quote exactly, never invent problems, and say nothing about things that are fine.

SETTING. <describe the scene>. Everything either side does is a pick from a menu. Staff menu entries are
MOVES; the customer's menu entries are INTENTS; the 'Said' line is what the character actually speaks, and
that is what to judge as English and as conversation. Each line also has a tone and a face. 'Pool after' is
what still fits. The 'Customer goal' line at the top of each file is hidden from the characters; use it to
check the customer never contradicts it. Rules already decided: <greeting and sign-off; 'it' once a phone is
named; staff only state facts in devices.json (read it once and check every figure); out-of-scope topics>.

ALREADY DECIDED, DO NOT REPORT: <the intentional choices>. A previous review found problems that have since
been fixed; if any come back, mark it REGRESSION: <the list of fixed patterns>.

THE FILES. <path>/.talk-runs/<name>/ holds INDEX.md and N transcripts. Read them in batches of 6 to 8 with
Bash cat. After EACH batch append your findings so far to the report file, so nothing is lost.

WHAT TO LOOK FOR. (1) grammar, punctuation, anything robotic or that 'sounds stupid'; (2) repetition;
(3) a reply that does not fit what was just said, staff ignoring a request; (4) logic and consistency:
contradicting the goal, irrelevant, premature or already-known questions, unnatural order, dead ends, loops;
(5) facts not supported by the data; (6) menus: entries that make no sense then, missing obvious choices,
labels nearly identical to the spoken line; (7) tone and face that do not match the words; (8) greeting and
sign-off; (9) anything a person playing this would call weird.

WRITE THE REPORT to docs/conversation-model/review/review-<n>.md (front matter: status draft, what, date,
source: 'its claims need checking'). Summary with counts by severity and category and the number of
REGRESSIONs; then one section per CATEGORY, grouping recurring patterns. For each pattern: title, severity
(blocker = breaks it or states something false; major = a person would clearly notice; minor = polish),
how many conversations, up to three EXACT quotes with seed and turn, why it is wrong, a concrete checkable
fix or rule. Finish with 'Things that looked good'. Do not edit any other file. Do not run git. Reply in at
most ten lines: path, number of patterns, REGRESSION count, the three most serious.
```

**After the reviewer returns:** spot-check at least five claims against the transcripts (grep the seed and
turn), reject what is intentional or already decided, fix what is real *with a spec each*, then run another
pass on fresh seeds. Cost note: each pass was about 300k tokens of reviewer time; 20 conversations halves it.
