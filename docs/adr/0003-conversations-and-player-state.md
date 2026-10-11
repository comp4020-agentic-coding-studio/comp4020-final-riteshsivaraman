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

## Why this, and not the alternatives

[TK] Ritesh's reasoning, in his own voice.

## What would change this

[TK]
