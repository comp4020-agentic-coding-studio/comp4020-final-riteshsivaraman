# Store

<!-- Target: 400-600 words total. Budget noted per section below; Ritesh writes
     the actual sentences. Nothing below this line is final prose. -->

[TK, ~40 words: one-paragraph description of the store, in Ritesh's voice,
written from SCOPE.md section 0 ("the one idea") and D47 (2026-11-07): staff
attention, stock and demo tables are the scarce shared things; customers
browse until a staff member walks over, there is no visible line. Do not
describe a queue the visitor can see — D47 explicitly removed that. Mention
the logo-no-brand-name point (SCOPE.md line 10-12).]

## What good means here

[TK, ~90 words across the three sub-points below. Draw from SCOPE.md's "0.
The one idea" and "1c" sections, not from memory of the old queue draft.]

**Function.** [TK, ~30 words: who the store is for and what end-to-end
satisfactions/frustrations are simulated — source: references/accounts.md via
SCOPE.md 1b/1c, and the staff-attention/stock/table framing of D47. Do not
describe standing in a visible line; describe browsing until approached.]

**Quality of execution.** [TK, ~30 words: the calm, hotel-lobby feel (SCOPE.md
1c, "intended experience") and how a visitor interacts — E to talk, menus, a
staff member walking over. No mention of a queue being "lived."]

**Differentiation from the median.** [TK, ~30 words: what makes this not a
generic multi-user 3D room with avatars and chat — the shared scarce things
(staff attention, stock, demo tables, D47) and CPU/real staff interchangeability
(D48).]

## How it works

[TK, ~90 words. Cover: character choice and customisation; real and CPU staff
sharing one conversation model and one waiting list (D47 — internal, never
shown to the visitor); a free staff member is offered the longest-waiting
customer with a real user offered before a CPU (D47, D48, issue #1); payment
happens on a staff handheld, not at a counter (D49, issue #2); visitor
identity is a random browser token, no accounts; state is saved to SQLite
(ADR 7, docs/adr/0007-stack.md), survives a restart. Cite ADR 3
(docs/adr/0003-conversations-and-player-state.md) for who may do what.]

## What is enforced and what is judged

**Enforced in `spec/`:** [TK, ~40 words: list the current spec/ invariants —
back room is staff-only, out-of-stock can't be bought, last-unit race has one
winner, one visitor can't answer in another's conversation, drawings match the
3D model, every event logs a line naming who did it. Confirm against the
current spec/ directory and PROCESS.md's citations before listing — don't
assume the old list still matches; the stock-hold visibility work (issue #3,
D50) and staff-offer logic (issue #1, D48) may add or change entries.]

**Judged by me:** [TK, ~30 words: whether a wait feels frustrating and the room
calm, played as two visitors in separate profiles at 1920x1080 and 390x844.
Cite a specific dated play session if one exists for the post-D47 behaviour;
otherwise say none yet.]

## What I read

[TK, ~40 words: keep the three existing citations if still accurate (Robin
Sloan's home-cooked app essay, references/accounts.md, 12-Factor App's "XI.
Logs") or update if new sources were read for D47-D52's design, e.g. the
source for the mobile-POS / staff-handheld payment passage — [TK: source link
for the mobile-POS passage, Ritesh to provide] per issue #14's "depends on".]

## What I chose not to build

[TK, ~60 words: update SCOPE.md Tier 3 cut list and reasoning. Confirm refunds,
accounts, inter-visitor chat, voice, multi-store, VR and native mobile are
still the cuts, and that the reasoning (accounts/chat would let a visitor say
or be anything) still holds. Also note here if the visible queue UI itself
should be named as a conscious cut (D47) rather than something simply never
built.]

## Status

[TK, ~40 words: live URL (confirm it still resolves), and a factual list of
what's built as of the PR that fills this in — check WORKLOG.md and the issue
board (`gh issue list --state closed`) rather than assuming the list below the
old queue-era line is current. Name what's still open from D47-D52 (issues #1
through #8) rather than implying it's all done.]
