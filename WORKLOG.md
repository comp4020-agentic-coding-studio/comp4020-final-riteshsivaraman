---
status: active
what: Running state of the Seen build, kept current so a fresh session can pick up without re-deriving context.
date: 2026-10-06
---

# Worklog

Read CLAUDE.md first --- it's the index of everything else ("Where things
live"). This file is the current state; LEARNINGS.md and CUTS.md are the
append-only history of gotchas and deliberate scope cuts.

## Current state: store project (branch `new-idea`, as of 2026-10-11)

Nothing from Seen is carried over (D1, `b61f6c7`). Scope and decisions D1 to
D24 are in `SCOPE.md`; this section is only "where did we leave off."

**Built** (all from the commit log, 2026-10-10 to 10-11; not re-run this
session):
- Server: Hono + ws presence server, SQLite with numbered migrations
  (`src/server/migrate.ts`, migration 1 = `visitors` + `events`), visitors
  by token, join/leave/role logged to `events`.
- Shared model in `src/shared/`: plan, world, mall, layout (`layout.json`),
  people, npcs, pose, protocol, blueprint, homography. Server, 3D and checks
  read the same data (D20).
- Client: first-person scene, people and NPCs, mall around the shop, dev
  role switch (D16), collision between people.
- Shop at 12 x 18.2 m under a 3 m wall (D21 to D24): 4 + 1 tables per side
  column, bar, back room, bays.
- Tools: rectify tool for the reference photos, layout editor
  (`pnpm layout`), `pnpm dev`, blueprint drawings and PDF in `docs/blueprint/`.
- Graphics modules under `src/client/src/gfx/`: phones, computers,
  furniture, shell (`562c87f` to `c8ba10a`), built to `docs/graphics-brief.md`.
- 12 test files in `spec/` (backroom, blueprint, homography, invariants,
  layout, mall, migrate, npcs, people, pose, presence, world).

**Not started or not verified** (inferred from the code and commit log, so
check before relying on it):
- Genius Bar queue, slots, stock, budget, the device interaction and its
  persistent trace: SCOPE Tier 1 items 6, 10, 11 are not visibly built.
  `events` only logs join/leave/role.
- Whether the Fly app is still serving Seen, or the store: not checked.
- `pnpm check` and `pnpm check:evidence` status on this branch: not run.

**Still open** (from SCOPE.md): brand name `[TK]`, occupancy cap (D12),
creatures vs humans spike (D11), AI boundary (D8), budget source, what the
device trace is. No ADR yet for the stack or for D8.

**2026-10-12 update (people in the store):** NPCs (staff and customers), mall
walkers and other visitors are now drawn as the new characters
(`src/client/src/gfx/character.ts`, `Actor.tsx`), and the store's NPCs follow a
purposeful timetable (`src/shared/storeday.ts`, D30 to D32 in SCOPE.md). A
character stage with every option and a crowd test lives at `?stage=1`
(`gfx/CharacterStage.tsx`); `?labels=1` in the store shows each NPC's intent and
`?t=<seconds>` shows a moment of the day. Specs: `npcs`, `steering`, `interaction`,
`behaviour`, `appearance`. Not done: staff/customers do not react to real
visitors (decision pending, D32); `Person.tsx` is now unused; the draw call and
phone frame-rate cost of ~30 people has not been measured on a real device.

**2026-10-12, later (conversations, subsystem 1 of 3):** ADR 3 drafted
(`docs/adr/0003-...`, reasoning `[TK]` for Ritesh); D34 in SCOPE.md. Migration 2
adds `visitors.role/specialty/look`, `player_state`, `conversations`, `stock`.
`src/shared/conversation.ts` is the pure menu state machine (greeter and phones
script; stock passed in), `src/server/stock.ts` seeds and takes stock
atomically, `src/shared/catalogue.ts` is `[TK]` placeholder data. Specs:
`conversation` (graph integrity, out-of-stock cannot be bought, last unit goes
to one visitor, migration keeps existing visitors). **Not yet:** server wiring
(protocol messages, persisting state, broadcasting to employees), the
onboarding screen and character customiser, the conversation menu UI, the
staff view, NPC takeover and rejoin (D1). Open: stock reservation expiry.

**2026-10-12, later still (conversations, subsystem 2 of 3: the server):**
`src/server/service.ts` holds the store's rules over a database (start a
conversation, take a turn, employee reply, claim, hand on, leave, reservation
expiry, who is waiting), returns the messages to send and touches no socket;
`presence.ts` only validates the profile in `hello` and delivers. New:
`shared/look.ts`, `profile.ts`, `duty.ts` (profile validation; posts and which
NPCs stand down), migration 3 (`reservations`), protocol messages (`talk_start`,
`talk_choose`, `staff_respond`, `claim`, `hand_on`; `turn`, `staff_turn`,
`staff_view`, `state`, `duty`, `engaged`, `released`, `notice`; `welcome` now
carries identity, state, offDuty, engaged). Specs: `service` (in-memory db, 6
mutations checked), `profile`, `conversations-live` (real sockets).
`seedStock` runs at boot (found empty in the real file, fixed). **Not yet:** the
entry screen and character customiser, the conversation menu and employee panel
in the client, drawing identity/look of other visitors, NPCs walking to a visitor
and back (D1 on screen), E to talk, deploying.

**Conversations, subsystem 3 (client), 2026-10-12.** Written and type-checked,
suite green (207), committed in `4a4d325`, `9e672eb`, `c96d04d`:
`Entry.tsx` (customer/employee, post, name, customiser with live preview),
`Talk.tsx` (numbered choices, 1-9 / Space), `StaffPanel.tsx` (customers,
Take, Hand on, staff replies), HUD chips and toast in `main.tsx`, other
players drawn with look + uniform + name tag, NPCs off duty / engaged /
rejoining. `?enter=<kind>&lane=<specialty>` skips the entry screen for checks.
**Not yet checked by a human:** the entry screen was seen in a still only; the
in-store flow (E to talk, panel, NPC walking over and back) has never been run in a
real browser with two players. Headless Chrome never settles on the live store.
Not deployed.

**Product line, Step 1 and 2, 2026-10-12.** `references/product-line.md`:
every family Apple AU currently sells, sourced live this session (a browser
session, not WebFetch — see the doc's own sourcing note on why). Flags
Hermès Watch lines as a second real brand needing their own decision before
use (not covered by D37), and several facts as text-only/unverified
(physical layout for everything except the already-photo-verified iPhone 18
Pro). `src/shared/catalogue.ts` replaced the placeholder with the 6 phones
Apple AU sells direct; other families wait on a conversation script to sell
them. ADR 5 (`docs/adr/0005-storage-sku-key.md`): storage widened into the
real stock key (`stock`/`reservations` migration 4), `src/shared/conversation.ts`
untouched (no picker yet — the server sells `defaultStorage()`'s SKU until one
exists). `spec/catalogue.test.ts` added; `service.test.ts`/`conversation.test.ts`
updated off the old placeholder ids. 231 tests, 1 pre-existing flaky live-socket
test unrelated to this (server contention from manual browser testing, not a
regression — confirmed by rerunning in isolation).

**Pilot phone model, 2026-10-12.** `src/client/src/gfx/phones-geo.ts`
(`PhoneModelSpec`, `buildPhoneBody`) makes a phone's camera plateau, lenses
and buttons data-driven, so each further model is a spec, not new drawing
code. iPhone 18 Pro built first: initial pass trusted web-search coverage of
the 17 Pro's redesign and got the plateau shape wrong (full-width bar); a
real marketing photo Ritesh supplied corrected it to a square plateau with an
L-shaped lens cluster (commit `255ce19`) — logged as a reminder that
text-only physical-layout claims need a photo check, not just a second
source. Home-screen vs lock-screen is a real toggle (`ScreenMode` in
`phones.tsx`). `?device=1` (`DeviceStage.tsx`) previews one product alone,
orbitable, on a table-surface scrap; `?pilotPhone=<id>` puts a real model on
every phone table in the live store for an in-context look check. Both are
permanent dev tooling for the rest of this build, not just this pilot.

**Step 3, every family built, 2026-10-12.** Dispatched as parallel subagents,
each confined to its own files, then a photo-verification follow-up pass
after Ritesh's "always photo-verify whenever you can" instruction:
- Phones/watches/audio (`phones-geo.ts`, `phones.tsx`; commits `c9d56bf`,
  `c6178eb`, plus a verification pass): 14 more models — iPhone Duo
  (foldable), Air, 17, 16, 17e; Watch Series 12, Ultra 4, SE 3; AirPods 5,
  Pro 3, Max 2; HomePod, HomePod mini; AirTag.
- Computers (`computers.tsx`, `computers-geo.ts`; commits `8bf10f2`,
  `294e6d5`, `f0d533f`, `df53056`, plus a verification pass): 16 models —
  iPad Pro/Air/base/mini, MacBook Neo/Air/Pro, iMac, Mac mini, Mac Studio,
  Studio Display/XDR. Found and corrected a wrong assumption in
  `references/product-line.md`: Studio Display XDR is a new model, not a
  renamed Pro Display XDR.
- `docs/graphics-brief.md` now has a standing "always photo-verify what you
  can" rule for every future family (Ritesh, after the 18 Pro's wrong-plateau
  lesson repeated as an explicit instruction).
- **Photo-verification pass, same day** (`d0768ff`, `4f0db02`, `5b1ba13`):
  went back over every guess the two builds above had flagged as text-only,
  against Apple's own AU buttons/connectors/size diagrams and gallery
  photos (browser tools, not WebFetch). Phones: 3 of 5 flagged items were
  actually wrong (iPhone Duo's side/volume buttons on the wrong half of the
  folded body, Watch Ultra 4's Action button above centre instead of below,
  AirPods Max 2's crown and listening-mode button swapped) — fixed; 2 were
  already right, comments upgraded from "unverified" to a cited source.
  Computers: most flagged guesses were wrong (iPad Pro's camera-bump
  internals and several models' button positions, all three MacBooks' port
  order/spacing, the Mac Studio's entire back port set — invented as "six
  USB-C", it's Thunderbolt/Ethernet/USB-A/HDMI — the iMac's housing height
  and stand angle, both displays' stands rebuilt from a dimensioned
  drawing) — fixed; base iPad's resolution/ppi/no-flash claim confirmed.
  Net: confirms the new graphics-brief rule earns its keep — most first-pass
  guesses across both families turned out wrong on inspection, not right.

Keyboards/folios were tinting to the tablet's colour (wrong — real ones are
white/black regardless); fixed in the verification pass.

**Step 4, table/wall/bay placement, 2026-10-12** (`639dedc`): `src/shared/assignments.ts`
is pure data (table id/side/wall-slot -> model id), drawing on
`layout.json`/`world.ts`/`plan.ts` without moving them, matching
`references/table-map.md`'s own pattern — a proposal, not final, for Ritesh
to correct. Covers all 11 product tables, the wall bench's 5 desktop/2
monitor/3 headphone slots, and all 6 bay ledges. The desktop wall honours
"fewer iMacs" (mostly Mac mini/Studio, iMac the occasional one — the iMac
is true-to-size against a 0.5m bench pitch that was never widened). Colour
is still the old cycling placeholder hex, not a real Apple colour name — no
one has sourced a hex value for "Burgundy" or "Space Black" yet, on
purpose. Verified live at several in-store camera angles, console clean.

**Not yet:** accessories (cases, chargers, bands — deferred, lower priority
per the customer-journey scenarios), real per-unit colour (needs a sourced
name-to-hex mapping), inspect-view integration (Step 5, D26-28 — not built
at all yet, this is bigger than a "later" tweak), the storage-picker
conversation step ADR 5 left open, Hermès Watch lines left out of the
catalogue (a second real brand, a different question from D37).

**Materials/glossiness pass, 2026-10-12** (`471dccf`, `f2b26c3`): the store
already had a procedural environment map (`Reflections` in `Store.tsx` —
`RoomEnvironment` + `PMREMGenerator`, no downloaded image) but devices
weren't using it — roughness was too high and screens used a flat
`meshBasicMaterial`. Fixed: `phones.tsx`'s shared `FinishMeshes` (metal,
gloss, matte/body all lowered roughness, raised metalness, added
`envMapIntensity`), a new `ScreenGlass` component replacing
`meshBasicMaterial` at every phone/watch/earbuds/headphones screen (mirrors
the pattern `computers-screens.ts` already used), and the same treatment
extended to `computers-geo.ts`'s `bodyMaterial()`. Also exported
`Reflections` from `Store.tsx` into `DeviceStage.tsx`, which previously had
no environment at all — every earlier per-model screenshot this session was
under flatter lighting than the real store. Verified: the specular highlight
on an iPhone 18 Pro genuinely shifts position between two camera angles
(real reflection, not static), MacBook Pro lid shows a real edge highlight.
249 tests green.

**Character-object pairing pilot, 2026-10-12** (`fe45d9c`): the "device"
behaviour (sitdown consults, D33) was scaling up a flat invented box+screen
baked directly into the character's own skinned mesh
(`character.ts`'s `buildCharacter`) — disconnected from the real catalogue,
exactly the "actions independent of objects" gap. Removed the baked
geometry, kept the `dev` bone as a bare attachment point, added
`deviceKind?: "phone"|"tablet"` to `Character`. Found a real R3F bug along
the way: rendering `<primitive object={existingBone}>` as a sibling JSX
element reparents that bone to the component's own output (R3F attaches a
primitive to its JSX parent on mount) instead of adding to it in place —
this silently tore `dev` out of the skeleton with no console error. Fixed by
rendering a plain `<group ref={devRef}>` and attaching it imperatively in a
`useEffect` (`bone.add(group)` / `bone.remove(group)` on cleanup) — now the
documented pattern for any future bone/socket attachment. Applied to
`Actor.tsx` (real NPCs; new `HELD_DEVICE` map — customers hold an iPhone 18
Pro, staff an iPad mini) and `CharacterStage.tsx` (dev preview). Verified via
`?stage=1&behave=15&snap=1`: a real iPhone 18 Pro appears in the raised
hand, following the arm's pose.

**Known rough edges, not yet fixed:** the phone's tabletop display-stand nub
still renders while held (needs a `held` variant that skips the stand); the
hand-hold position/rotation is eyeballed and **currently differs between
`Actor.tsx` and `CharacterStage.tsx`** (the latter was tuned, the former
wasn't updated to match) — these need reconciling to one verified value;
only the phone/customer case has been screenshotted, tablet/staff uses the
same code path but hasn't been checked; orientation in the hand hasn't been
validated from multiple angles.

**Table-slot device orientation, re-validated 2026-10-12:** checked whether
screens on product tables actually face the aisle (phone, tablet, watch,
laptop) using the live store's `?shot=1&at=x,z,yaw,pitch` debug camera.
`furniture.tsx`'s `Table` component assigns `rotY: -Math.PI/2` for every
table's "-x" side and `+Math.PI/2` for every "+x" side, identically
regardless of product kind — so this was a single code path to check, not
four. Screenshots at T1 (phone), T3 (tablet), T5 (watch) and T7 (laptop)
confirm screens face their own side's aisle and backs face the other side's
aisle, correctly, on all four. No bug found. (Note for future screenshot
debugging: the yaw convention is 0° = faces -z/entrance, 90° = faces -x,
180° = faces +z, 270° = faces +x — confirmed empirically from the world
origin; an earlier working note in this session had 90/270 backwards.)

**Device inspect, phone pilot (D39), 2026-10-12** (`e7d7796`, `cc9fd3b`,
`ac7b9f0`): the device stays on the table (no pick-up); camera eases in and
orbits on drag; E to interact within ~1.5-2m; Esc or a tap-away (vs. a drag)
puts it down. Built server-authoritative, mirroring the existing `Engagement`
pattern (NPC talk) rather than piggybacking on the ~10Hz move broadcast, per
D39's own reasoning: another visitor must see it live, including one who
joins mid-inspection.
- `src/shared/slots.ts` (new): every product-table device gets a stable id
  (D28), extracted from position math `furniture.tsx`'s `Table` component
  used to compute inline — now there is exactly one source of truth the
  render and the server's range check both read, so they can't disagree
  about where a device actually is.
- Migration 5: an `inspections` table, one open row per slot; `service.ts`
  gained `startInspect`/`endInspect`/`inspections`, gated to phones only
  (pilot scope), range-checked, and mutually exclusive per slot (the same
  race class as S11's stock race, a view instead of a sale). Starting a
  conversation or leaving the store always closes an open inspection first.
  Every start/end writes its own `events` row.
- Client: `Player`'s camera takes over during an inspection (initial orbit
  yaw derived from the slot's own `rotY`, so it starts facing the screen);
  `Interact()` gained a device-hint scan beside the existing talk-hint one
  (talk wins if both are in range); a new `InspectMarkers` component shows
  a live "`<name>` looking" label over any slot someone is inspecting, to
  every visitor, not just the one doing it.
- **Verification is split and incomplete on purpose, not glossed over:**
  `spec/inspect.test.ts` (in-memory db, 14 cases: the phone-only gate, range
  edges, mutual exclusion, switching devices, cleanup on leave/talk) and
  `spec/inspect-live.test.ts` (4 cases, real WebSockets against the actual
  running server: a second connection sees a start/end live, gets backfilled
  if it joins mid-inspection, is refused a taken slot, and sees it end on a
  disconnect, not just an explicit `inspect_end`) both pass — this is the
  "is it broken" half. The "how does it feel" half (does the camera-ease and
  orbit feel natural, is the live label legible, any jank) is **not yet
  checked by a human**: the only browser available this session had no
  WebGL at all (confirmed directly, not just the app's fallback message), so
  the planned two-profile live walkthrough could not render anything. Needs
  Ritesh, in his own Chrome, two profiles, one inspecting while the other
  watches.
- Known cut: the exit transition snaps back to standing instantly rather
  than easing out (D26 only asked for the entrance to ease).
- Not built: tablet/watch/laptop inspect (phone-only is the stated pilot
  scope), the reference-photo stand-style question (chunky puck vs. a thin
  oval plinth) raised earlier this session and still unaddressed, and the
  `Actor.tsx`/`CharacterStage.tsx` held-device offset mismatch from the
  character-pairing pilot above.

**Docs that still describe Seen:** `README.md`, `PROCESS.md`,
`reflections/crit-8.md`, ADRs 1 and 2, `CUTS.md` entries, and the prompts in
`.claude/agents/` and `.claude/skills/mutation-check/`. Flagged in CLAUDE.md.
README and PROCESS are Ritesh's prose.

---

# Seen history (branch `main`)

Everything below is the log for the Seen email app, kept for the commit
citations in PROCESS.md and LEARNINGS.md. It does not describe `new-idea`.

## Live-preview banner made global (2026-10-07)

Fixed the reported bug: the live-draft preview (ADR 2, `d8a87f2`) only
existed inside `Inbox.tsx`'s own mount effect, so the `EventSource` and the
card both died on navigating away from `/inbox`. Moved the connection and
state up to the app shell:

- `src/client/src/LiveStreamContext.tsx` (new) --- owns the single
  `EventSource("/api/stream")` for the logged-in session's lifetime, a
  `Map<draftId, {subject, body}>` that replaces per-`draftId`, exposed via
  `LiveStreamProvider`/`useLiveStream()`. Shaped to carry a second event
  type later without restructuring (state object, not a hardcoded "just
  drafts" value).
- `src/client/src/LiveStreamBanner.tsx` (new) --- the pinned bar: one
  collapsed line per tracked draft, click to expand in place. Calm/neutral
  styling per ADR 2 (not `.watch-strip`'s red treatment).
- `src/client/src/App.tsx` --- wraps the shell in `LiveStreamProvider`,
  renders `<LiveStreamBanner />` directly (outside `<Router>`) between the
  topbar and the rest.
- `src/client/src/pages/Inbox.tsx` --- the old `EventSource`/`LiveDrafts`
  code removed entirely; back to just being the inbox.
- `src/client/src/styles.css` --- `.app-shell` changed from a single grid to
  a flex column (topbar / banner / `.app-body`), because the banner renders
  `null` when empty and a CSS Grid row sized for an item that sometimes
  isn't there breaks auto-placement (see LEARNINGS.md). `.app-body` is the
  original two-column grid, now one level down.

Verified live, not just by reading code: signed in as a second account over
curl, addressed and saved a draft to the browser account's address while
that tab sat on `/sent`, `/board`, and `/compose` (via in-app sidebar nav,
not a full reload) --- the banner appeared and updated on all three without
the tab ever visiting `/inbox`. `pnpm check` (typecheck + the 14 existing
vitest tests) green against a rebuilt `static/`.

## Where this stands (2026-10-06, overnight session)

Built v0.1 for the C8 cutoff (Wed 7 Oct, 08:30), attachments cut (see
CUTS.md). Stack: Hono + Preact SPA + better-sqlite3 + Drizzle + Vitest, ADR 1
at `docs/adr/0001-stack.md` (facts filled in, narrative `[TK]` for Ritesh).

**Built and verified** (against the Docker-built image, `pnpm check` green,
plus a live two-tab browser pass):
- Accounts (signup/login/session cookie), in-app address `<user>@panopticorp.test`.
- Compose/send/inbox/sent/threads, reply/forward plumbing (forwardRootId
  chain), BCC exposed both ways.
- Public draft board: manual publish, 30s-heartbeat-timeout auto-publish,
  single-editor lock, contributors list frozen onto the sent email.
- Hesitation timer, forward alerts, self-destruct (unopened/opened/tombstone),
  per-user fast mode, a minimal voice-escalation module.
- Event log (`events` table) behind everything --- every action tested
  writes its row; checked directly against the SQLite file, not just the API.
- `spec/seen.test.ts`: 14 tests covering the fast/automatic/trustworthy checks
  from seen-spec.md §13 (see CLAUDE.md "Spec traceability" for what's
  deliberately NOT here and why).
- Live draft preview backend (ADR 2, `docs/adr/0002-live-preview-transport.md`):
  authenticated `GET /api/stream` (`src/server/routes/stream.ts`) using
  `hono/streaming`'s `streamSSE`, backed by an in-process pub/sub
  (`src/server/lib/livePreview.ts`, no persistence --- `drafts` stays the
  source of truth). `saveDraft()` in `src/server/lib/drafts.ts` broadcasts to
  every resolved to/cc/bcc recipient on both the owner-edit and
  stranger-public-draft-edit branches; address resolution is shared with
  `sendEmail` via `resolveAddresses()` (extracted in `src/server/lib/mail.ts`).
  Mutation-checked: dropping bcc from the broadcast audience is caught by
  `spec/seen.test.ts`'s "live draft preview (ADR 2)" describe block.
- Live draft preview frontend: `Inbox.tsx` opens an `EventSource` to
  `/api/stream` on mount, keyed by `draftId`, and renders a quiet card above
  the inbox list (styled in `styles.css`, deliberately not styled like the
  red `.watch-strip` motif --- this is a feature surface, not a third
  signature device). Verified live: curl-driven sender (separate cookie jar
  from the browser) saving a draft addressed to a browser-logged-in
  recipient via `to` and via `bcc` both showed up and updated in place.
  `Compose.tsx` and the server are untouched.
- Placeholder deployed first (proved the Fly path), then this build's
  Dockerfile/fly.toml rewritten for the real stack and verified locally.

**Deployed:** the real Seen build is live at
https://comp4020-final-riteshsivaraman.fly.dev/ (verified `/` and `/readme/`
both 200, signup smoke-tested against the live app). One leftover test
account, username `smoketest`, is in the live DB --- a mass-delete attempt to
clean it up was correctly blocked by the permission classifier (deleting all
users/sessions/events on a live app, even a pre-launch one, isn't a solo
call); clear it yourself with a single `DELETE FROM users WHERE
username='smoketest'` (and its sessions row) via `flyctl ssh console` if you
want it gone before the crit.

**Not yet done:**
- Repo is still **private** --- flipping it public is Ritesh's call, not
  done autonomously (course brief: C8 wants it public at the cutoff).
- README.md / PROCESS.md: still template boilerplate. Ritesh writes these
  (CLAUDE.md "Ritesh writes the prose"). ADR 1's narrative sections are
  `[TK]`.
- `reflections/crit-8.md`: not written --- Ritesh's prose, two standing
  prompts (see `reflections/README.md`).
- Company name still `Panopticorp [TK]` (CUTS.md).
- Fiction-integrity sweep (CLAUDE.md) not yet run --- do this before shipping
  public, after the company name is real.

## Design-token implementation pass (2026-10-07)

`docs/design-handoff.md` (the real design spec, not tracked here until
`?? docs/design-handoff.md` in git status is resolved -- it's currently
untracked, add it when ready) had never actually been implemented:
`styles.css` had its own blue `--accent`, IBM Plex Sans instead of Inter, and
a `--radius-md` that was really the spec's `--radius-lg` value wearing the
wrong name. Fixed in commit `dbb8e65`: every color/font/radius token renamed
to match the doc exactly (brick-red `--signal`, `--onyx`/`--bone` "stamped
chrome" pair, `--sidebar-bg`, radius-sm/md/lg = 6/8/10px), `.watch-strip`'s
stale hardcoded `rgba(179,38,30,...)` replaced with a `color-mix()` derived
from `--danger`, and Inter swapped in for IBM Plex Sans in `index.html`.
Verified with computed-style JS against a running instance (not just
screenshot eyeballing) -- every token matches the doc's literal hex.

Also added the first of the two signature devices: the unread asterisk
(`✳`, rotated, `--signal`) in `EmailListRow`, wired through `Inbox.tsx` via a
new `myAddress` prop; `Sent.tsx` doesn't pass it, so it never shows on your
own sent mail. The ghost-read line (second signature device) is still not
built -- its trigger condition is `[TK]` in the design doc itself, don't
guess at it.

No new LEARNINGS.md entry from this pass -- the stale-`static/`-dir gotcha I
hit (`pnpm build` after editing client source, since `pnpm start` serves
the gitignored `static/` dir, not a dev server) is already documented in
CLAUDE.md's "Known gotchas."

## Next session should (Seen, as of 2026-10-07)

1. Confirm the Fly token is still valid (`mise exec -- flyctl status -a
   comp4020-final-riteshsivaraman`), then `flyctl deploy --remote-only
   --ha=false -a comp4020-final-riteshsivaraman` with this build.
2. Verify the live URL the same way local Docker was verified: `/` and
   `/readme/` both 200, then a real two-separate-browser-context pass (see
   LEARNINGS.md on why two tabs of one profile doesn't work for this).
3. Ritesh writes README.md, PROCESS.md (citing the commits from this
   session), reflections/crit-8.md, and picks the company name.
4. Run the fiction-integrity sweep (fresh subagent, no prior context) once
   the company name is real.
5. `/comp4020:preflight`, then Ritesh decides on `/comp4020:ship`.
