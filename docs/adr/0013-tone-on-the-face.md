---
status: draft
what: ADR 13 --- emotion as the existing tone, shown on the speaker's face, and why its state is in memory. Drafted by Claude at Ritesh's request, 2026-11-09; the direction is Ritesh's, the storage choice was Claude's.
date: 2026-11-09
---

# ADR 13: Tone on the face

## Context

Ritesh asked for "emotion ... available for both staff and customer, and it should be
visible in their face", with NPCs choosing "heavily biased towards neutral initially
but ... influenced by the other person's tone" (2026-11-09, issue #55). Claude first
built a separate emoji picker. Ritesh: "You added emotion thing as an extra feature
and using emojis (ew), I thought you would extend the existing tone feature used by
the staff." The engine already tags every line with a tone (friendly, neutral,
impatient, unsure) and maps each to a face (`TONE_EXPRESSION`), but nothing drew it.

## Options considered

| Option | Cost |
|---|---|
| A. A separate emotion set and an emoji bar (built, then removed) | A second vocabulary beside tone, new faces to draw, a UI nobody asked for. Rejected by Ritesh. |
| B. Extend tone: customers get the staff's tone chips; every tone shows as the speaker's face | One vocabulary; reuses the four faces that exist. Costs: only four moods, and "impatient" shows as the nearest face (focused), since there is no annoyed face. |
| C. Store each person's tone in the database | Survives a restart. But it is a fleeting state (twelve seconds), and every change would write a row. |

## Decision

B, with the state in server memory (a map of id to tone and expiry, broadcast as a
`toned` message). Ritesh chose the direction; Claude chose the storage, 2026-11-09.

- A customer's tone is sent with each answer (`talk_choose.tone`); a specialist's is
  the tone of the move they make (`staff_move.tone`).
- An NPC in a conversation with a person answers with its own tone (`npcTone`):
  mostly neutral, pulled by theirs (warmth is met with warmth; impatience makes it
  unsure or short). It reacts at most once every four seconds so a face never
  flickers. An NPC on its own changes face rarely, on a slow clock that is the same
  for everyone (`ambientTone`).
- A tone shows for twelve seconds, then settles to neutral.

## Consequences

- Someone who joins mid-conversation sees neutral until the next change.
- A restart clears all tones, which costs nothing visible.
- A timetable customer's own reply tone (from the engine's customer model) is not
  yet used for its face; the NPC's tone is drawn from the human's, not from its own
  scene.
- The chat engine's customer replies still pick a neutral default tone for a human
  customer's menu click inside the phone scene; the tone chip affects the face, not
  yet the engine's patience.

## Citations

- Issue #55 (tone/emotion). `SCOPE.md` D60. Ritesh's messages quoted above.
- `src/shared/emotions.ts`, `src/shared/talk/core/types.ts` (`TONE_EXPRESSION`),
  `src/server/service.ts` (`setTone`, `reactTo`), `src/server/presence.ts`.
- Related: ADR 6 (the engine whose tones these are).
