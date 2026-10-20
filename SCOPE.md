---
status: draft
what: Working scope for the new final-project idea (parody 3D retail store). Decisions, tiers, open items. Not a marked document.
date: 2026-10-10
source: references/help-me-scope.md plus the scoping conversation of 2026-10-10
---

# Scope: parody 3D retail store

Brand name: none. The store has a logo but no name (an early placeholder idea was "Pineapple"). It is an obvious, loud
parody of a famous fruit-themed retail store, not a discreet lookalike. No real
logos, no real product names, never presented as official.

## 0. The one idea

A shared 3D store where **the Genius Bar queue is the shared state**. You can
see who is ahead of you, in the room, and they are a mix of real visitors and
CPU players. Everything in the MVP serves that. A feature that does not feed or
read the queue, the room's crowding, or what visitors leave behind is a cut
candidate.

## 0b. Direction for "what good means" (Ritesh's argument, 2026-10-10)

Not README text. The README prose is Ritesh's. This is the direction as stated:

- Good = each part of the store experience is simulated end to end, so you feel
  both the **satisfaction** and the **frustration** of a real visit.
- Satisfaction examples given: wanting a flagship phone, seeing colours,
  storage and memory options, being asked if you want to try other products
  (earbuds), swiping a card, being handed a bag.
- Frustration examples given: a problem not resolved, a colour or configuration
  out of stock, prices out of budget, long waits.
- Source material: real visitor accounts collected in `references/accounts.md` (links
  only; contents not yet verified by the agent, see below).

What this implies for scope (inference, to confirm):

- Products need **configurations** (colour, storage) with **shared, finite
  stock** that other visitors can deplete. That is a second shared resource
  beside Genius Bar slots, which partly reopens D2's "exactly one".
- A visitor needs a **budget**, so "out of budget" is a state the store can
  produce. The budget comes from the customer's own answer to the budget question in the conversation, not from the entry screen.
- Frustrations must be **designed, deterministic and visible** (a displayed
  wait, a stock count), not random punishments. Testable: an out-of-stock
  configuration cannot be bought. Judged: whether it feels frustrating.
- Real-time contention is now on the product, not only the queue: two visitors
  racing for the last unit is the best concurrency test and the best moment.

## 1. Decisions made (by Ritesh)

| # | Decision | Date |
|---|---|---|
| D1 | Fresh idea on branch `new-idea`; nothing carried over from Seen | 2026-10-10 |
| D2 | Scarce shared resource = Genius Bar appointment slots + visible queue | 2026-10-10 |
| D3 | Both real visitors and CPU players share the store | 2026-10-10 |
| D4 | Movement: tap-to-walk first; joystick + drag-look is the second version | 2026-10-10 |
| D5 | Client: React Three Fiber (+ drei) | 2026-10-10 |
| D6 | Obvious spoof branding | 2026-10-10 |
| D7 | One store only, with an occupancy cap | 2026-10-10 |
| D8 | Runtime AI via a free-tier Gemini key, with a fallback when it is unavailable (see section 6; boundary still open) | 2026-10-10 |
| D9 | Visitor-to-NPC talk = predefined options (pick from a list, Pokemon-style), not free text. NPC-to-NPC talk is only simulated (ambient speech bubbles), never a real exchange | 2026-10-10 |
| D10 | Visitor-to-visitor talk = fixed phrase menu, with AI choosing which phrases to suggest from a fixed pool (option B). No free text between visitors. AI is optional; the menu works without it | 2026-10-10 |
| D11 | Creatures vs humans decided by a rendering spike (same scene, both, measured at 390x844), not up front | 2026-10-10 |
| D12 | Occupancy cap left undefined until it can be measured against the final scope | 2026-10-10 |
| D14 | First-person view (you are in the store; others are seen as characters). Movement built as one "intent" layer so third-person could share it later. Tap-to-walk stays as the cheap input. Weekend 1 order: deploy, then real-time presence (crit 9 cutoff Wed 14 Oct 08:30), then the creature/human spike | 2026-10-10 |
| D15 | Multiple stores are wanted eventually, each with its own staff and stock, but only the Canberra-style store is built for now. The design keeps the door open (section 3g); nothing multi-store is built yet | 2026-10-11 |
| D16 | Two kinds of live player: a human can act as a customer or as staff at the same time as others, and customers can interact with each other. For now a DEV button switches role and the server trusts the claim. Must be backed by real roles or switched off (`DEV_ROLE_SWITCH=0`) before strangers use it | 2026-10-11 |
| D17 | Staff have roles that decide where they roam: greeter (door), specialist (one per product lane), genius (behind the bar), stock (back room and the door), technician (repair benches). Roles are data on each NPC, not code | 2026-10-11 |
| D18 | The back room is staff-only, behind a flush door that blends into the wall, with labelled shelving and repair benches where technicians work. Enforced on the server by clamping positions per role | 2026-10-11 |
| D19 | The store sits in a shopping mall so it does not feel isolated: a concourse along the glass front, neighbouring and opposite shops, a mezzanine walkway with people on it, people walking past, and customers who come in and out. Mall people are scenery driven by the shared clock (no real accounts); the mezzanine and neighbours are not enterable | 2026-10-11 |
| D20 | The drawings (plan, four wall elevations, ceiling) are the specification: 3D, server and checks are built from the same data (`src/shared/plan.ts`, `world.ts`, `mall.ts`), and a check fails if the committed drawings are stale. Ritesh approves the drawings before the 3D is changed | 2026-10-11 |
| D21 | The shop is about 10 x 10 x 3 m, from the rectified references (back wall 3.3 : 1, side walls 3.35 : 1, wall height 3 m as Ritesh gave it). This replaces the earlier 16 x 15 x 3.8 m, whose proportions the photographs did not support. The 3 m height is the one absolute scale; not yet deployed, held for approval of the blueprint PDF | 2026-10-11 |
| D22 | Tables (Ritesh, 2026-10-11): each side column has four almost-square product tables (1.0 x 1.2 m) and, nearest the bar, a larger square service table (1.2 m side, no products, a stool left and right) for customers to sit and talk with staff; the middle column has three product tables and one service table. One product on each side of a product table | 2026-10-11 |
| D23 | Room enlarged (Ritesh, 2026-10-11, "option A"): 11 x 15.4 m under the same 3 m wall, so product tables are 1.0 m apart front to back and 2.0 m or more apart across, with 2.5 m clear inside the glass where customers are received. Service tables have two stools each on their left and right, tucked under; the bar runs almost from the far edge of one service table to the other (6.6 m) with 13 tucked stools; the staff door follows the bar end. The wall bench stops where the indented bays start, with a short ledge in front of half of each bay carrying one product (which half and which product are working defaults). Supersedes the size in D21; the 3.3 : 1 and 3.35 : 1 ratios are no longer the shop's | 2026-10-11 |
| D24 | Tables, floor and people (Ritesh, 2026-10-11): product tables 1.2 x 2.0 m (larger, elongated), service tables 1.8 m square (1.5x), the 4+1 / 3+1 counts and 1.0 m gaps kept, so the shop is 12 x 18.2 m with 1.5 m clear inside the glass (was 2.5 m: "too much space at the front"). The store is on the **first floor** of a mall atrium: a 3.4 m walkway outside the glass with a glass balustrade, the void down to the ground-floor concourse, opposite shopfronts on both floors; visitors may step out through the entrance and look down (my addition, one constant to remove). People collide: visitors, staff, customers and first-floor walkers are solid to a visitor (server and client share `people.ts`); NPCs follow fixed paths and do not dodge. Faces have expressions; product screens and faces are original procedural textures, no photos | 2026-10-11 |
| D13 | Intent: shopping is pretend ("the joy of shopping, no real purchase"), including fun details such as the card swipe. Tier and flow not yet decided; this partly re-opens the Tier 3 cut of purchases | 2026-10-10 |
| D25 | Characters are procedural humans built from primitives (no rig, no sourced models), made more realistic and varied in shape, size, face, hair and clothing. Closes D11 without the spike and supersedes Tier 1 item 2 ("fictional creatures") and the Tier 3 cut on "human-like rigged characters", which stays true for rigged models. Existing code was already human (`Person.tsx`) | 2026-10-11 |
| D26 | Devices can be inspected: look within about 1.5 m, click or tap, the camera eases in, drag to rotate, Esc or tap-away returns. Works the same on desktop and 390x844. Logs an `inspect` event | 2026-10-11 |
| D27 | The inspected device gets a richer procedural version built on demand and discarded afterwards. The 512 px texture cap in `docs/graphics-brief.md` stays for the room; the one inspected device may use up to 1024 px | 2026-10-11 |
| D28 | Inspect shows the device only: no name, price or stock. Each device gets a stable slot id (table and position) for the event and a later catalogue row. The catalogue (3e) is its own decision | 2026-10-11 |
| D29 | Look pass A (Ritesh, 2026-10-11): walls become one satin grey with a gentle three-tone step (`WALL_TONES` in `plan.ts`, shared by the 3D room and the drawings), the floor a darker matte grey, ambient light lower so lightboxes, panels and screens are the bright things. Band heights (`WALL_BANDS`) are unchanged, so D20's drawings stay the spec | 2026-10-11 |
| D30 | Characters (Ritesh, 2026-10-11 to 12): procedural low-poly people, one skinned mesh and one draw call each (about 2,800 triangles, 16 bones). Defaults: friendly body (about 6 heads), round eyes, toon shading; 6 body styles, 9 eye styles, 7 face shapes, 5 beard options kept as options. Faces and frames vary by id via `appearanceFor`. Supersedes D25's "built from primitives" | 2026-10-12 |
| D31 | People are shared and solid, and walk round things: `shared/steering.ts` (local steering, hard obstacles, committed side) plus a grid A* route for long legs. The same function runs in the demo, the store timetable and the specs | 2026-10-12 |
| D32 | Store NPCs have a role or purpose and follow a **timetable** generated from fixed seeds (`shared/storeday.ts`): customers want a phone, laptop, tablet, audio, a repair, a pick-up or just a look; the greeter meets them, the matching specialist helps, geniuses serve the bar, stock fetches. A pure function of the server clock (480 s cycle), so it is the same for every visitor with no server tick. **This is option A of the behaviour decision (schedules). B (server state machines that react to real visitors) and C (both) are not built and still need Ritesh's choice and an ADR** | 2026-10-12 |
| D33 | Sitting and devices (Ritesh, 2026-10-12): customers and staff sit at the genius bar and at the three square tables for sit-down discussions, and take out a device (customers a phone, staff a tablet) to look at and use together. Scheduled in the timetable (kind `sitdown`, never started at random): a "consult" customer sits opposite a genius at a square table; a repair customer sits at a bar stool. Both ends are mutual and seated on a real stool (specs) | 2026-10-12 |
| D34 | Conversations and player state (Ritesh, 2026-10-12). Entry: on opening the link, choose customer or an employee kind (greeter, specialist, genius, stock, technician) and customise the character. State is in the database, one row per visitor, server-authoritative, visible to employees online so they can coordinate (claim, hand on). A "real employee" is an employee role controlled by a user; the choice is trusted for now. Conversations are Pokemon-style menus. A character only talks to a visitor who starts it. While an NPC serves a visitor it drops its timetable and rejoins the day at the current time (D1). First slice: the greeter and the phones specialist. See docs/adr/0003 | 2026-10-12 |
| D35 | Conversation details (Ritesh, 2026-10-12, "defaults"): a human employee serves a customer through **menus on both sides** (the customer picks, the employee picks the reply, one state machine drives both). Several humans may hold the same employee kind; the matching NPC goes off duty while at least one is in, and returns when the last leaves. The entry screen offers every employee kind, marked where there is no customer script yet. A customer starts a conversation by walking within about 2.5 m of a character and pressing **E** (tap on a phone). A reserved unit is held for **5 minutes** (a stored deadline caught up on the next request, no timer) and released early if the visitor leaves. Customisable: name, body style, eyes, face shape, hair style and colour, beard, skin, shirt; employees keep a fixed uniform. The entry screen shows every time, prefilled with the last choices | 2026-10-12 |
| D36 | Cases and moves (Ritesh, 2026-10-12): customer service is modelled as a durable case with facts, an owner and a basket, and conversations are moves with preconditions (option B). Either party can always start a conversation; an employee must be near the customer; the employee's reply is a menu in the customer's format. See docs/adr/0004 and docs/customer-journeys.md | 2026-10-12 |
| D37 | Product names (Ritesh, 2026-10-12): the devices in the store use the real, current product and model names, copied from the maker's own pages (fetched, sourced, dated; not from memory). Still invented: logos and brand marks, the store's company name, packaging and box art, all imagery. Supersedes the product-name part of D6 and the "no name" part of D28. The shop stays an obvious spoof and is never presented as official | 2026-10-12 |
| D38 | Back of house redesign (Ritesh, 2026-10-12, "this is good"): the back room is rebuilt as a clear runner concourse inside the staff door, a stock hall of six double banks with a 1.8 m staff lane down the east side, a 1.8 m spine corridor, rooms off the spine (restrooms, cleaner's store, repair), open receiving straight from the dock door, and the break room and office with doors onto receiving. Same footprint. Drawn in docs/blueprint/back-redesign.png; measured by spec/backroom.test.ts. Supersedes the back-room placement in D18/D23; the staff-only rule stays | 2026-10-12 |
| D39 | Inspect feature, first pass (Ritesh, 2026-10-12): pilot on the phone only. Picking up/inspecting keeps the device on the table (D26's camera-ease-and-orbit; no first-person hand-hold). Another visitor must see you inspecting a device live, in real time — built server-authoritative, mirroring the existing `Engagement` pattern (NPC talk): new `inspect_start`/`inspect_end` client messages, a server-held table of current inspections broadcast to everyone (so a visitor who joins mid-inspection still sees it, matching how `welcome.engaged` back-fills in-progress NPC conversations), not piggybacked on the ~10 Hz move broadcast. Trigger is **E to interact**, matching the existing NPC-talk convention, not a direct click on the device. Logs a start/end event pair (not a single post-hoc `inspect` row), since another visitor needs to know "is this happening right now" | 2026-10-12 |
| D40 | NPCs act without a human online, first slice (Ritesh, 2026-10-12, reported live: "nobody fucking asks to help me out... NPCs just stand around... biggest thing is you should allow NPC to approach you"). No new timer: both checks ride a request that was already happening (a move message, a conversation step), per the no-background-processes rule. **Built and wired:** the greeter approaches a nearby customer who hasn't asked for anything yet, once per customer (`tryGreeterApproach`) — the walk-over is free, reusing the Engagement/`engagedMoment` animation already built for human claim. **Built, unit-tested, deliberately NOT wired:** `tryNpcAutoClaim` (an idle on-duty NPC claims a customer already `waiting_for_help` for its post, same as a human's `claim()`). With today's scripts (D34: only greeter and phones exist) its only live effect would be on `specialist:phones` — the one post this project's own service.test.ts and D35 treat as a deliberate human-staff interaction showcase — so wiring it would let an idle NPC beat a human to every customer, every time, making that showcase unplayable. This is a real-time/multi-user-behaviour tradeoff, not a default to pick alone; **open for Ritesh:** wire it everywhere (accepting the human-showcase cost), wire it only for designations with no human currently online at all, wire it only after some grace period, or leave unwired until genius/stock/technician get their own scripts (at which point it is a pure win for those posts and a no-op can stay a no-op for phones). Full per-role reactive state machines, mentioned in the same message, are explicitly deferred past this slice | 2026-10-12 |
| D41 | Behaviour loop and conversation mechanism, reached by grilling (Ritesh, 2026-10-13): resolves D32's open "option B/C" behaviour decision as **C** — NPCs/staff keep the `storeday.ts` timetable as default, interruptible out of the current segment, with no rewind (D1's "rejoin at current time" already covers resuming) and no third mission-progress layer (progress is just the facts already in `player_state`/`conversations`/`case_facts`). One generic loop skeleton covers every customer purpose and staff role, with `repair` and `pickup` as named exceptions. Interrupts only apply to idle/schedule segments, not mid-conversation (T6's staff walk-away is a voluntary `talk_leave`, not a forced preemption); sources are mostly a customer's own request, secondarily a staff approach (generalises D40's `tryGreeterApproach` to every role). A human-controlled visitor's state is read by the identical loop logic as an NPC's — no is-human branch. Concretises D36/ADR4's "moves with preconditions over a case" as **slot-filling + an ordering policy** (named facts like budget/storage/tradein, each with its own question and answer handling, plus a per-script policy choosing the next unfilled slot) rather than an authored node graph scaled up, so adaptive question order (customer-journeys.md: "asked in the order that fits the answer") doesn't explode into one node per ordering. D40's own `tryNpcAutoClaim` wiring question and which mission/role is built first remain open. See docs/adr/0006 | 2026-10-13 |
| D42 | Case persistence, option B (Ritesh, 2026-10-13, "the point is basically to have some kind of internal CRM running in the bg"): builds ADR4's already-decided three-lifetime model (visit / case / exchange) rather than the cheaper alternative of adding an owner+facts blob directly to `player_state` (option A, considered and rejected — stays 1:1 with one visitor, can't outlive the visit or later cover two visitors in one case). A `cases` row (owner, status, a deadline column for a hold/appointment) plus `case_facts` (one row per learned fact, who learned it and when) is the thing a handoff actually reassigns; `conversations` becomes one exchange within a case, many per case. Corrects an earlier claim in this session: a staff-to-staff handoff **already exists** (`handOn` in `service.ts`, tested) but is a single 140-char free-text note, written only from an explicit human "Hand on" action — it never fires from a conversation script itself (T1, T7's in-script handoffs), and can't be read programmatically by the receiving script. Case/case_facts is the structured, scriptable version of the same idea, not a new concept. **Open, logged rather than resolved:** multi-person parties sharing one conversation (T3: a parent deciding, a child asking) and staff-to-staff consultation mid-conversation while the customer waits (T3's carrier-plan check) — neither is covered by this decision or anything decided before it | 2026-10-13 |
| D43 | Terminal prototype, option B (Ritesh, 2026-10-13, "I just wanted to make this terminal based game to make sure that we can make sure we're on the same page but cheaply"): a throwaway text sim (`scripts/sim/`, `pnpm sim`) checks the loop/case/slot design feels right before investing in the real engine, rather than building ADR 6's slot engine for real against the live server first (the alternative, rejected for now: bigger commitment, and the design hadn't been played yet). Standalone and in-memory — a mirror of `src/server/cases.ts`'s shape, not the real module; reuses the real sourced catalogue (D37) for believability. Covers both POVs (customer, employee: greeter or specialist:phones) and the phones slot script only (use_case, budget, storage, colour, tradein, accessories, careplan, setup); `repair`/`pickup` exceptions are not built here. NPC randomness: each NPC gets seeded traits (impulsiveness, price sensitivity, decisiveness, staff attentiveness) once, so its own answers stay consistent with itself while differing between NPCs — "everyone doesn't act rationally, otherwise everybody would act the same way" (Ritesh), modelled as personality bias, not independent per-turn dice. All four hooks wired: NPC slot answers, a mind-change/upsell-or-abandon roll before committing, a payment-stall roll, and staff-notice-delay (`noticeDelay`, `npc.ts`) — a low-attentiveness Mira or Dan can leave a waiting customer for up to two checks before noticing, echoing T2's "nobody comes," in the ambient run and in both human-played POVs; never a permanent block, and never rolled against a human's own choice when the human is the one playing that post.
| D44 | Apple's own assets and OS names (Ritesh, 2026-10-17): no Apple Design Resources (SF Pro, SF Symbols, UI kits, templates) in the repo or the shipped app, because the Apple Design Resources licence (2023-06-21) only permits mock-ups of UIs for Apple-platform software and bars embedding, extraction and distribution (sections 2A to 2C, 3); the downloaded files live outside the repo at `Final/apple-design-resources-reference-only/` as visual reference only. Everything on the phone screens stays procedural (D20 spirit, `docs/graphics-brief.md`). Extends D37: real OS and first-party app names (iOS, iPadOS, watchOS, "Dynamic Island") may be used the same way as real product and model names, sourced and dated; Apple's logo, wordmark and artwork stay invented. OS and app names are not yet sourced from Apple's pages; copy them from there before using | 2026-10-17 |
| D45 | Poster and signage pictures are generated with the course image proxy and shipped as image files (Ritesh, 2026-10-19: "replace all handmade graphics posters with actual stuff using the image generation tool"). This is an explicit exception to the procedural-only rule (D20 spirit, `docs/graphics-brief.md`) and to CLAUDE.md's "reference only" note, for wall posters only: prompts ask for no text, logos or brand names, files are `src/client/public/posters/*.webp`, the old canvas posters remain as the fallback until each picture loads. Devices, furniture and everything else stay procedural | 2026-10-19 |

**2026-10-14 follow-up, live feedback:** Ritesh played it and flagged the customer-POV flow as "way too linear" — the model was picked by a hidden dice roll and only revealed at checkout, there was no "not sure" option anywhere, and no compare/demo step at all; a fixed menu tree, no matter how many branches, was still "only like 1% of the possibilities." Fixed by making product choice its own first move (never hidden, `scripts/sim/product.ts`'s real two-candidate shortlist-by-budget replaces the silent pre-roll) and by wiring an **optional free-tier Gemini bridge** (`scripts/sim/ai.ts`, same shape as D8: env-var key, scripted fallback when missing or failed) so the human side of a conversation takes free text instead of a menu — answer, say "not sure" and get a real suggestion explained, ask a question back and have the same question stand until actually answered, or volunteer several facts in one breath (T7) and have them all land. The model only classifies/narrates; `setFact`/`handOff` stay in the deterministic engine, same AI boundary D8 already drew for the real game. Grounded against invented specs: the prompt is told to hedge on anything beyond name/tier/price (mirroring Dan's own "I don't want to guess" in T3), and `[verify]` Google's current free-tier data-use terms, checked live this session — free-tier content is used to improve Google's products, paid tier isn't; resolves the question this left open in section 6. With no key, every path still falls back to the original menu flow, so this is additive, not a replacement. The employee POV's NPC-customer side has **not** been upgraded to the same free-text engagement yet — an explicit next step, not silently finished.

**Same day, provider swap:** live testing surfaced that Google's free tier is 5 requests/minute on this account (a single conversation needs more than that) and that model availability shifts mid-session — `gemini-2.5-flash`/`-flash-lite` both 404'd as "no longer available to new users" despite `models.list()` still showing them, and a second, billing-linked key hit `402` with its prepaid credits depleted (checked live: once billing is linked, a project is on the paid tier for every request, no free allowance underneath it — this is not "free until some threshold"). Switched `ai.ts` to **OpenRouter** instead: `:free`-suffixed models are genuinely free with no billing link at all, 20 req/min and 50/day with no purchase, rising to 1,000/day after a one-time **lifetime** $10 (not a balance that's spent) — checked against OpenRouter's own rate-limit docs and its public `/models` endpoint, not guessed. Plain `fetch`, no SDK dependency; `@google/genai` removed. Key lives in `mise.local.toml` as `OPENROUTER_API_KEY`, same never-committed pattern.

**Same day, the actual structural fix:** Ritesh, correctly, called out that the per-slot turn improvements above were still patching instances of a conversation that marched through `SLOT_ORDER` one fixed question at a time — "not fixing the underlying structure of how this can be a non linear conversation that can go in any order." Replaced the whole loop: `interpretTurn` (`ai.ts`) is given every still-open slot at once, every turn, and a single utterance can answer several of them, none, revisit nothing in particular, or ask something back — what happens next comes from the model's own judgement over the full open set, not a for-loop. `SLOT_ORDER` still decides what the *engine* would fall back to asking if nothing else is driving the conversation (`openSlotList`'s ordering, and the stale-turns fallback), but it's a fallback shape now, not the conversation's shape. **Found by actually testing it, not just by it compiling:** the small free model (`liquid/lfm-2.5-2.6b`) narrated "confirmed black, no trade-in" while returning an *empty* answers object -- nothing recorded despite what Dan said out loud -- and separately fabricated a storage answer out of a question that was never a decision. A much larger free model (`nvidia/nemotron-3-super-120b-a12b`) got both right in the identical test. Multi-item structured extraction needs real model headroom; single-slot extraction tolerated a much smaller one | 2026-10-13 to 14 |

Superseded: the earlier "no runtime AI calls" constraint in `references/help-me-scope.md`
section 2. D8 reverses it, so it needs its own decision record when built.

## 1b. What the accounts say (read from `references/accounts.md`, Accounts 1 to 3)

Each is one person's post, so these are anecdotes, not policy. Only the top
three were pasted; accounts 4 to 8 (Genius Bar and repair) are unread.

| Pattern | Where | Design reading |
|---|---|---|
| Staff read off display info; knowledge varies | A1, A2 | Staff have a knowledge level; a "wrong" answer is plausible |
| Wrong answer corrected later ("I went and asked...") | A2 | Delayed correction is a cheap, humane frustration |
| Paid by tapping phone on a payment terminal; the taker "simply disappeared" | A1 | Payment can enter a limbo state; a staff handoff loses context |
| "We have 140 staff today. Please go back and wait where you have been told to." | A1 | Waiting where told, with no visible progress |
| Staff: "the money is in limbo", "not much we can do" | A1 | An unresolved outcome that no dialogue option fixes |
| ~10 min for products to be brought over; 10 to 15 min more waiting | A1 | Visible, long, uneven waits |
| Left for a competitor: 30 minutes, a discount, a free band | A1 | "Visitor walks out" is a real outcome |
| Pre-paid app pickup: window given, then "time stamp is gone" | A3 | Reservation windows that stop meaning anything |
| Huge outside line; people walking in and out for other reasons | A3 | Crowd you can't read from outside |
| Ask for the pickup table, not the pickup line; "anyone can help you anywhere"; introduced to one named person, done in 30 min | A3 | A discoverable shortcut; a handoff by introduction |
| Fun chit-chat; help picking a strap colour | A2 | The satisfying side exists, thinly |

Gaps (not in the accounts): colour/storage/memory choice, being offered
accessories, the card swipe as a pleasure, being handed a bag, and a clean
Genius Bar diagnosis. Those are Ritesh's design, not sourced. The README should
say which parts are sourced and which are invented.

Note: in A1 and A3 the queue and the wait are mostly in **purchase, payment and
pickup**, not the Genius Bar. Genius Bar accounts (4, 5, 7) are the unread ones.

## 1c. The intended experience (read from `references/experience.md`)

Instagram carousel text, OCR'd (noisy). It is brand-psychology commentary by
someone interpreting the design, not visitor testimony; its own disclaimer says
the psychology and performance claims are interpretations. The post gives no
figures I can check. Use it for **design intent**, not fact.

Intent it describes:

- No checkout counters, no cash registers, no loud sale signs; staff carry
  mobile devices and take payment anywhere in the store.
- Staff approach you where you stand; trained as guides, not pushers; help
  "only when the customer actually needs it".
- Open wooden tables, everything touchable, hands-on testing encouraged.
- Calm, hotel-lobby feel; the goal is to make people stay longer.

**The spine this suggests (inference, Ritesh to confirm):** the gap between the
*intended* experience (calm, no queues, staff everywhere) and the *lived* one
(A1 and A3: lines, payment limbo, "wait where you have been told"). The store
shows the first and delivers the second. Satire lives in that gap, and so does
a defensible definition of good.

### Satire beats (read from `references/reels.md`, two reels; ASR transcripts, noisy)

Satire exaggerates; use these for **tone and mechanics**, and use the accounts
for realism. Paraphrased beats only: do not copy a reel's lines into the app.
Reel 1: https://www.instagram.com/reel/DdAgtZuR7BJ/ ; reel 2:
https://www.instagram.com/reel/DciIvxXRGGq/ (share-token query strings
dropped; Instagram requires login, so the agent could not read either).

| Beat | Reel | Mechanic it suggests |
|---|---|---|
| Greeter can only check you in, cannot sell; "do you have an appointment?" | 1 | Staff have narrow roles; a role can't do your task |
| Staff specialise by product line; wrong specialist hands you to the right one | 1 | Handoff to a specialist restarts the wait |
| Customer wants to pay now and asks where to tap; staff insist on process | 1 | Payment gated behind the right person |
| After the wait, the item is out of stock; fall back to another product | 1 | Stock check happens late, after the wait |
| Staff "see who's available to bring it out" | 1 | Fetch-from-back step with its own delay |
| "The mall closes in about 10 minutes" | 1 | A closing-time deadline on the visit |
| Added to a waiting list; told to stand to the side and wait for staff | 2 | Visible waiting list |
| Others get served first because they are not on the list | 2 | Two lanes with a visible but defensible unfairness |
| Customer helping a child with a tablet while waiting, parent-and-kid chaos | 2 | Ambient NPC pair; waiting-room behaviour |
| After a long wait, the answer is "help yourself, it's on the back wall" | 2 | A self-serve shortcut the wait never needed |

Cross-source pattern (inference): A3 ("ask for the pickup table, not the
line") and reel 2 ("you could have just helped yourself") both say the thing
you waited for did not need the wait. That is a strong, repeatable moment.

Tone decision (Ritesh to confirm): the butt of the joke is the process, not the
confused customer.

## 2. Fixed by the course (confirmed from the course site and repo)

- Multi-user, real-time (about 1 s), persistent across restarts and redeploys.
- Deployed `*.fly.dev`; `fly.toml` shape is fixed: one shared-cpu-1x, 256 MB,
  one volume at `/data`, machine auto-stops when idle.
- Marked at **1920x1080 and 390x844 phone**, latest Chrome, from the URL alone,
  starting at `/readme/`. Both are full marking environments.
- Multi-user tested in separate Chrome profiles; persistence tested by the
  marker returning next day (machine will have restarted).
- `README.md` 400 to 600 words (published at `/readme/`), `PROCESS.md` 900 to
  1100 words, `CLAUDE.md`, `spec/`, commit history. `pnpm check` and
  `pnpm check:evidence` pass.
- Kept from the starter: `spec/invariants.test.ts`, `spec/global-setup.ts`,
  `scripts/check-evidence.ts`, `fly.toml` settings.

## 3. Scope tiers

### Tier 1: MVP (must exist for a coherent, markable submission)

1. **One store room.** Floor, Genius Bar, 3 to 4 tables, 6 to 8 devices.
   Procedural geometry plus a few sourced CC0 models. One lighting setup.
2. **Characters are fictional creatures**, built procedurally (shared body mesh
   with variants: size, colour, one accessory). No rigged human models.
3. **Tap-to-walk** on a hand-authored walkable grid with A* pathing. Same
   input on desktop (click) and phone (tap).
4. **Anonymous identity**: server-issued id and generated name/colour, kept in
   a token. No PII collected.
5. **Live presence** over WebSocket: positions about 10 Hz, interpolated on the
   client, never persisted.
6. **Genius Bar queue and slots**: join, leave, book a slot, cancel.
   Server-authoritative; humans and CPUs go through the same code path.
7. **CPU players**: take real slots and queue positions; behaviour is a pure
   function of server time and persisted state (no server tick).
8. **Staff NPCs (2)**: scripted dialogue that reads live queue state.
9. **Customer NPCs (3 archetypes)**: arrive and leave on a time schedule,
   occupy devices, yield to humans (see D7 rules below).
10. **One device interaction** that leaves a persistent trace for the next
    visitor. the interaction is inspecting a device (`startInspect`); the trace it leaves is an `inspect_start` / `inspect_end` row in `events`.
11. **Occupancy cap** with a defined "store is full" behaviour.
12. **Events log** (append-only: who, what, when), also the server logs crit 10
    reads.
13. **Reconnect** with backoff and a state resync after a cold start.
14. **Deploy on day one**, `/readme/`, `spec/` checks over the WebSocket/HTTP
    protocol.

### Tier 2: only after Tier 1 works live, in two browsers, on both viewports

- Joystick + drag-look (D4 second version).
- AI-assisted dialogue (section 6). The scripted dialogue interface in Tier 1
  is built so the AI adapter plugs into it.
- A second device interaction, or more customer archetypes.
- Ambient sound.

### Tier 3: explicitly cut from this submission

Refunds, user accounts, chat between visitors, voice, more than one store,
multiple floors, rigged characters, VR, native mobile, any paid API. (The
original cut also named baskets, purchases, payments, repair flows and product
comparison; D13 reopened purchases and the store now has payment on the spot,
a device-service scene and demos, so those are no longer cut.)

## 3b. Staff roles (draft; names are invented parody names)

Staff are a finite shared resource: each has a role, a specialty, a
`busy_until`, a current customer, and two dials (knowledge, warmth) that pick
dialogue variants. Behaviour is a state machine driven by server time.

| Role | Can do | Cannot do | Evidence | Tier |
|---|---|---|---|---|
| Greeter / check-in | Welcome, ask need, put you on the list, call someone over | Sell, pay, check stock | Reel 1, A3 | 1 |
| Specialist (per product line: phone, laptop, tablet/watch, accessories) | Demo, recommend configs, offer extras, ask runner to check stock, start a sale | Help a different product line (hands you off); take payment | Reel 1, A2, careers pages | 1 (2 lines) |
| Checkout handler | Take card, give receipt and bag | Know stock or product details | A1, Reel 1 | 1 |
| Stock runner (back room) | Fetch an item, report real stock | Talk to the customer | A1 ("brought over"), Reel 1 | 1 |
| Technician (repair/diagnosis role) | Diagnose, give an outcome (fixed, can't, replace) | Sell | Careers pages; accounts 4, 5, 7 unread | 1 |
| Pickup / orders | Hand over a pre-paid order | Sell | A3 | 2 |
| Manager | Take an escalation: apologise, "not much we can do" | Fix payment limbo | A1, A2 | 2 |
| Session host | Run a time-scheduled group event | Serve a queue | Not sourced (my idea) | 3 |

Staff verbs: greet, ask need, check in, call over, hand off, escort, demo,
recommend, upsell, request stock check, fetch, quote, take payment, hand over
receipt and bag, diagnose, give outcome, give a wrong answer then correct it
later (A2), say "help yourself" (reel 2), escalate, announce closing.

## 3c. What a visitor can do

Walk; look and tap a device to inspect/rotate; compare two; configure (colour,
storage, memory) against live stock, price and budget; ask staff via option
menus; check in; browse while waiting and watch the queue; accept or decline an
extra; pay (swipe or tap); take receipt and bag; leave happy; leave for a
competitor; say a phrase to another visitor (D10). Later: trade in, drop off a
device for repair, pick up an order.

## 3d. End-to-end scenarios (each is a path through the same state machines)

A scenario = a sequence of states plus an outcome rule, so each can also be a
scripted-bot test in `spec/` over the real protocol.

| # | Scenario | Tier |
|---|---|---|
| S1 | Happy path: greet, check in, specialist, configure, extra declined or accepted, swipe, bag, leave | 1 |
| S2 | Browse and leave, nobody serves you | 1 |
| S3 | Wrong specialist: handed off, wait again | 1 |
| S4 | Out of stock after the wait: fall back or leave | 1 |
| S5 | Over budget: configure down or leave | 1 |
| S6 | Self-serve: the wait wasn't needed ("help yourself") | 1 |
| S7 | Payment limbo: stuck, escalation, no fix | 2 |
| S8 | Repair: drop off, diagnose, outcome | 2 |
| S9 | Order pickup: the table, not the line | 2 |
| S10 | Closing time hits mid-visit | 2 |
| S11 | Two visitors race for the last unit | 1 (the concurrency test) |

## 3e. Catalogue ("a lot of products")

Breadth is cheap if a product is a data row, not a model: a family (phone,
tablet, laptop, watch, earbuds, desktop, display, accessory) has one shared
parametric mesh and one shared interaction; a product is name, family, options
(colour, storage, memory), price and stock. Prices and names are invented
parody data, never real ones. Breadth of **scenarios** is the
expensive axis (each needs a state machine, dialogue and a test), so the
catalogue can be wide while the scenarios stay few.

## 3f. Layout reference: `references/canberra-store.png` (Ritesh: a Canberra store). Rectified corners and ratios: `docs/blueprint/rectify.json`

Reference only. Do not ship the photo or its logo. What I read from it:
glass shopfront on a mall concourse; one wide, symmetric room on a central
axis; a central cluster of wooden demo tables, two angled rows either side;
long wooden wall benches with devices; backlit poster panels and accessory
racks on the side walls; a long wooden counter with stools at the back; linear
ceiling light strips; a plain grey floor. Zones: entrance, front tables, wall
benches, accessory walls, back counter (checkout, repair, pickup). All of this
is simple geometry (boxes, planes), which is why the visual target is
achievable procedurally.

## 3g. Visual pass and multiple stores (Ritesh, 2026-10-11)

References supplied (photos, not shipped): a Canberra shopfront, a Singapore
waterfront store (louvred dome, indoor trees, a very large screen), and a New
York flagship (white ceiling with lit circular openings, glass spiral stair,
indoor trees). Canberra stays the reference for now.

**Planned visual pass, Canberra first (all plain geometry and lighting):**
backlit poster panels on the walls, long wall benches carrying devices,
accessory racks, stools at the back counter, a ceiling grid with light panels,
a glass front with mullions, a patterned floor, better materials (wood,
stone) and lighting. Devices become per-family meshes with colour variants
(the catalogue needs these anyway).

**What it will not be:** photoreal. The target is a clean, lit, stylised
interior that reads as that kind of store. Posters and screens carry invented
parody artwork and the spoof brand, never a real logo.

**Harder, later or never:** Singapore's dome (repeated curved louvres, doable
with instancing) and trees (need sourced models); New York's glass spiral
staircase (hard; probably cut) and lit circular ceiling openings (doable as a
repeated emissive ring). Each flagship is its own mini-project.

**Keeping the door open for several stores (cheap now, costly to retrofit):**

1. Anything about staff, stock, queue, appointments and events gets a
   `store_id` from the first migration that creates it. Not added yet, since
   those tables do not exist yet.
2. A store's layout is data (a definition of floor, solids, zones, theme), not
   file-level constants. `world.ts` is the single Canberra definition today.
3. Presence rooms are keyed by store; the capacity cap is per store.
4. A store has its own staff roster and its own stock rows.

Not decided: how a visitor chooses a store (URL path, a door, a menu), and
whether stock is shared across stores.

## 4. State: what persists and what does not

| State | Persisted? | Realtime? |
|---|---|---|
| Visitor identity (id, name, colour, last seen) | Yes | No |
| Genius Bar slots and bookings | Yes | Yes, to all sessions |
| Queue order | Yes | Yes |
| Device trace (what the last visitor left) | Yes | Yes, to viewers of that device |
| Events log | Yes | Optional feed |
| Positions, presence, who is in the room | No (memory) | Yes |
| NPC positions | No: computed from time + persisted state | Derived |
| AI conversation text | No | n/a |

## 5. Rules decided so far

- **Server is authoritative** for slots, queue, device claims. Single Node
  process with synchronous SQLite writes; claims and bookings use
  `BEGIN IMMEDIATE`. Schema constraints (unique slot, one active booking per
  visitor) enforce what code might forget.
- **No background timers** for anything that must happen. The machine stops
  when idle; store deadlines in columns and catch up on the next request.
- **Humans win over CPUs** for slots, devices and capacity. A CPU gives way,
  never a human.
- **CPUs are labelled** (visibly, and in the README). Not disguised.
- **Per-frame work stays in `useFrame`/refs**, not React state (phone perf).
- **Phone first for rendering budget**: pixel ratio capped, no heavy
  post-processing, small texture sizes, because a marker may run two 3D
  sessions on one machine.
- **Both viewports** for every feature before it counts as done.

## 6. Runtime AI (D8): what is and is not decided

Decided: free-tier Gemini key, if the quota runs out the NPC falls back to a
scripted line (example given: "Mike is staring at you blankly...").

Proposed boundary, **not yet agreed**:

1. Scripted dialogue is the baseline and must be complete without the AI. The
   AI is an optional layer behind the same interface.
2. Calls are made server-side only. The key lives in a Fly secret
   (`fly secrets set`) and in `mise.local.toml` (gitignored) for local dev.
   Never in a file in the repo, never in chat.
3. AI output is flavour only. It can never change slots, queue, devices or any
   persisted state.
4. Per-visitor and global rate limits; short max input and output length.
5. Conversation text is not stored.
6. README discloses that visitor text is sent to a third party.

Why these matter: free quotas run out (including from markers and crit
agents), visitor text is untrusted input to a model, output is not
deterministic and so cannot be asserted in `spec/`, and the data-use terms of
the free tier have not been checked by me. `(checked on 2026-10-14, below)`

**Checked live, 2026-10-14** (while building the terminal sim's AI bridge,
D43): per Google's own pricing and rate-limit pages, free-tier content is
explicitly marked "used to improve our products" (training/review); the
paid tier explicitly says content is **not**. No credit card is needed for
the free tier itself, and limits are per-project rather than per-key —
Google doesn't publish a fixed number, it's shown live in AI Studio and
scales with account usage. This matters for the real game once it sends
real visitor text (item 6 above, "disclose it's sent to a third party"); it
doesn't matter for the sim, which sends only invented play-session text.

Testable: with the key unset, dialogue returns the scripted fallback and the
app works. Not testable: whether the AI lines are good (judged).

## 7. Open items (need Ritesh)

- Brand name: none; the store has a logo and no name.
- Open: occupancy cap number (D12: measure first), and behaviour at the cap
  (humans waiting? CPUs despawn first?).
- Open: the phrase pool for visitor-to-visitor talk (D10), and what the
  "AI suggests" step is allowed to see.
- Open: what expires and what is kept for good (queue entries, bookings,
  device traces). The marker returns the next day, so this decides what they
  find.
- Closed by D25: characters are procedural humans, so the creature vs human spike (D11) was not needed.
- Settled in `docs/customer-journeys.md` and the talk scenes: the end-to-end store journey (door to exit) and which stages are modelled.
  Draft needs Ritesh's own account of a real visit; see the conversation of
  2026-10-10.
- Open: device interaction and the persistent trace it leaves.
- Open: the three customer archetypes (children/adults were suggested; if
  creatures, what are the types).
- Open: how many CPU players, and what a CPU does when the queue is empty.
- Everything is procedural except generated posters and the logo (D45); no downloaded assets.
- Crit group is **Dachi** (Wed 10:30 to 12:00, cutoff Wed 08:30, no
  exceptions listed): crit 9 cutoff **Wed 14 Oct 08:30**, crit 10 cutoff
  **Wed 21 Oct 08:30**, final **Mon 9 Nov 12:00**.

## 8. Milestones (provisional order, not dates)

| M | Deliverable | Done when |
|---|---|---|
| M0 | Placeholder deployed to Fly from this branch | `/` and `/readme/` live; deploy path proven |
| M1 | Empty room, tap-to-walk, two browsers see each other | Both viewports; two Chrome profiles |
| M2 | Queue + slots, atomic, persisted | Concurrent-claim test passes; survives restart |
| M3 | CPU players + staff NPCs + cap | CPUs use the same path; cap enforced server-side |
| M4 | Customer NPCs + device trace | Schedule is time-derived; trace persists |
| M5 | README (Ritesh's prose), `CLAUDE.md`, spec traced to promises | `pnpm check` + `check:evidence` pass |
| M6 | Tier 2 items in value order | Only if M1 to M5 are green on the live URL |

## 9. Harness skeleton (to be turned into real files later)

Testable promises (candidates for `spec/`): two concurrent claims on one slot
yield exactly one success; occupancy never exceeds the cap; CPUs never hold a
slot a human requested first; a visitor id survives reconnect; data survives a
server restart (may be manual or a documented crit-time check); with the AI key
unset, dialogue falls back and nothing breaks.

Judged, not testable: whether the store feels like a place, whether the spoof
reads, whether the CPUs feel alive. These go in the README as judged, with how
they were judged.

## 10. Biggest risks

1. Phone viewport (touch, rendering budget).
2. Visual quality without visual feedback; programmer-art look.
3. NPC content (looks, dialogue, personalities) growing faster than the
   queue mechanic, which is the thing that is marked.
