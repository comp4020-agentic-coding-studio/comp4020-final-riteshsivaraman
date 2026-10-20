---
status: draft
what: ADR 3 --- where a visitor's state and conversations live, who can see them, and how a conversation with a character is shaped. Facts filled in; the narrative sections are [TK] for Ritesh.
date: 2026-10-12
---

# ADR 3: Player state and conversations

## Context

Until now the store's NPCs were a pure function of the server's clock
(`src/shared/storeday.ts`, D32): the same for every visitor, no server state,
and they could not react to a real visitor at all. The next step is real
interaction between a visitor and the characters, with a state that other
visitors who work in the store can see. That changes what is stored, who may
read it and who may write it. The week 8 lecture names persistence and the
real-time mechanism as decisions that are expensive to reverse.

Constraints carried over: one small Fly machine that stops when idle (no
timers that must fire), a SQLite file on a volume that outlives every deploy,
anonymous visitors (a token and a generated name, no accounts), and the
`events` table that every state change writes first (CLAUDE.md).

## What was decided (Ritesh, 2026-10-12)

| | Decision |
|---|---|
| Entry | On opening the link a visitor chooses customer or employee, and which kind of employee, and customises their character. |
| State | In the database, one state per visitor, server-authoritative. Employees online can see every customer's state and coordinate. |
| Employee | A role that a user controls. The role is the user's own choice and is trusted for now (no accounts). |
| Conversation | Menus, each turn picked from a short list (SCOPE D9). No free text and no AI in the first slice. |
| Who starts | A character only talks to a visitor who starts it. |
| NPC's day | While an NPC serves a visitor it drops its timetable, then walks back and rejoins the day at the current time (D1). |
| First slice | The greeter and the phones specialist. |

## Options considered

| Question | Options | Cost |
|---|---|---|
| Where state lives | client only / **database, server-authoritative** | client-only is cheap but not shared; the database needs a migration and contention rules |
| What the player says | **menu** / free text / menu with AI replies | menu is deterministic and testable with no key; the others vary or need a key |
| Who starts | **visitor only** / characters approach too | approaching needs the timetable to include a real visitor |
| NPC after serving | **pause and rejoin** / reserve in the day | reserving needs the day regenerated on the fly |

## Consequences

- Facts (checked against the code, 2026-10-12):
  - A new migration (step 2) adds a profile to `visitors` (role, specialty,
    look) and the tables `player_state`, `conversations` and `stock`.
  - A conversation is a pure function `(state, choice) -> (state, effects)`
    in `src/shared/conversation.ts`, with the shop's stock passed in, so
    "an out-of-stock colour cannot be bought" is a spec.
  - Every turn writes an `events` row (the harness invariant).
  - A scripted customer's day can change because a visitor took their
    specialist: they wait longer, which is intended.
  - `visitors.role` is trusted. Anyone can choose employee. This is not safe
    for strangers and has to be backed by something before the store is
    public.
- Reservation of stock is not yet bounded in time: a reserved unit stays
  reserved. [TK] decide an expiry (a column and a catch-up on the next
  request, not a timer).

## Addendum 2026-10-21: who may see and do what, checked on the server (crit 10)

> **AI-drafted facts, Ritesh to check.** Claude read the code at commit `c5fbeff` and rewrote the
> 2026-10-18 table, which named functions that no longer exist (`staffRespond`, `claim`,
> `handOn`). Every `[TK]` is Ritesh's to write, in his own words.

**Who a visitor is.** Whoever holds the token (`resolveVisitor`, `src/server/presence.ts`). The
token is random, kept by the browser, sent in `hello`, and never written to a log line. No
account. A second tab with the same token takes over the first (the old socket is closed with code 4000, "opened elsewhere").

**The rule that makes the rest hold.** The acting person is always the socket's own session
(`me.id`). No message carries an "as whom" field, so one visitor cannot act as another. A client
can only name the *thing* it acts on (a conversation id, an intent id, a device slot), and the
server then checks that the session is allowed to touch that thing.

**What each action checks, on the server:**

| Action | Checked in | Rule |
|---|---|---|
| Walk (`move`) | `presence.ts`, `clampToWalkable(role, ...)` | A customer is clamped to the shop floor and outside; the back room is staff-only (D18). At most 25 updates a second; non-finite numbers are dropped. The client runs the same function for feel, the server's answer wins. |
| Press E at someone (`talk_start`) | `requestTalk` / `resolveTalk` | Only a visitor in a customer state (arriving, browsing, waiting for help); in range; the other person on duty and with a script. |
| Take a turn (`talk_choose`) | `chooseTurn` | Only the customer of that conversation, only while it is open, only a choice the script is offering. Another visitor's conversation id gets "That conversation is over." (`spec/service.test.ts:184`). |
| Staff move (`staff_move`) | `staffMove` | Only the staff member the conversation is with, only while it is open, only a move the script offers; not while a checkout or walk is under way. |
| Show / accept intent | `showIntentById`, `acceptIntentById` | Only the person the intent is addressed to (`staff_id` / `to_id`), and only while it is still live. |
| Take a stock order (`order_take`) | `takeOrder` | Only the specialist the order names, in range of the runner, after the runner has arrived. |
| Inspect a device | `startInspect` | In range, and not while someone else holds that slot. |
| Leave / close a conversation | `leaveConversation`, `closeTalk` | Acts on the caller's own open conversation only. |
| Switch role | `presence.ts`, unless `DEV_ROLE_SWITCH=0` | **A claim, not a check.** Anyone can become staff. Switching back re-clamps the position. |

**What each person sees.** Everyone gets presence (positions, names, colours), who is inspecting
what, the chat pairs and the intents. Staff additionally get the customers' states
(`staffViewFor`, `customersView`). A conversation's turns go only to its two people. A notice goes
to the one person it is for, except announcements (someone left, an NPC stands in), which go to
all.

**What the log shows.** Every action above writes an `events` row and one stdout line
(`src/server/eventlog.ts`). A customer refused a staff-only spot logs `staff_area_refused` once
per approach. A throw in a handler or an uncaught exception logs `handler_error` /
`uncaught_exception` on stderr with the user, the message type and the error text, never the
message body. Repeated identical notices fold into one line with `repeated=N`. Read it with
`mise exec -- flyctl logs -a <app> --no-tail`.

**Known gaps, stated plainly.**

- Role is the visitor's own choice, so "staff only" holds against a customer who stays a
  customer, not against one who picks staff. [TK] Ritesh: acceptable for the crit, or does
  something back it first (a staff code, a separate staff URL)?
- Stock tracks only a few phones; the rest count as available (`[TK]`, Ritesh said fine for now).
- Two people at once: `freeTableFor` reads the open conversations and walking escorts in one
  synchronous call on a single-threaded server, so two requests cannot be handed the same table.
  `spec/service.test.ts:432` checks a held table is held; I found no test that fires two
  requests for the last free table together. [TK] confirm before claiming it at the crit.

**Why this way:** [TK] Ritesh, in his own voice.

## Why this, and not the alternatives

[TK] Ritesh's reasoning, in his own voice.

## What would change this

[TK]
