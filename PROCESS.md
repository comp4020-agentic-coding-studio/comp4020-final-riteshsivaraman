# Process overview

## What I built

I built a shared first-person 3D store that is an obvious parody of a fruit-themed
retail store. Real visitors and CPU staff share one room, and customers talk to
staff through menus. Nothing in the room is a downloaded model.

## Why this stack

The brief fixes one small Fly machine that stops when idle, and one volume, so I
picked parts that fit that. SQLite on the volume is the only thing that survives a
restart, and it has one writer, which makes two visitors racing for the last unit
of stock easy to reason about. Hono ([`8bbe52e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8bbe52e)) is a small server with no
compile step. A `ws` WebSocket carries presence ([`2379cd6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/2379cd6)) because the room
needs both directions at about ten updates a second, which server-sent events or
polling would handle badly. React Three Fiber came from the idea: a first-person
store has to be 3D, and I can read and fix React code. The cost is that presence
lives in one process's memory, so a second machine would need a broker. The
options and costs are in [ADR 7](docs/adr/0007-stack.md).

## The moments that mattered

1. The 3D store was hard to cover with `pnpm check`, because there was nothing
   small to assert on. Instead of settling for screenshots, I had Claude draw a
   2D blueprint (the floor plan, four wall elevations and the ceiling) from the
   same shared data that the 3D room reads. The checks fail if the drawings and
   the model drift apart ([`baa57a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/baa57a6)). I knew this worked when I enlarged the
   room and every drawing and check moved with it ([`025c3ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/025c3ee)).

2. I did not want to describe the characters in a prompt and judge whatever came
   back. So I had Claude build a tool where I could change heads, bodies, eyes
   and expressions myself and look at them side by side ([`25558d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/25558d5)). I kept
   experimenting until I settled on a friendly body with round eyes as the
   default ([`076dfc7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/076dfc7)). I could only judge the characters by looking.

3. I was not sure what backend the customer service needed, and a guess would
   have meant rebuilding it. So I had Claude generate seven end-to-end
   transcripts of a store visit from the visitor accounts I collected
   ([`8299a2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8299a2f)). They showed a gap my first design missed: one script ended
   with "go to the Genius Bar", which created nothing for a genius to see. I
   rebuilt the state machine around a durable case per customer, with either
   side able to start ([`c16a1e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c16a1e6)).

4. Crit 10 asked me to narrate who did what from the logs. My events table
   recorded every state change, but `flyctl logs` showed only "listening on".
   The week 10 lecture says logs help only when a command the agent can run
   prints them, so every events row now prints one line with the visitor, the
   event and the time ([`a60962b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a60962b)). I checked it with two real WebSocket
   clients: the log alone said who joined, who was refused the back room and who
   left, and no session token appeared. Names went onto each line next
   ([`73bb0a0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/73bb0a0)). A test run then showed one notice logged 140 times and an
   error with no line at all, so repeats are folded and errors name the user and
   the message type ([`c5fbeff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c5fbeff)). Who may do what, checked on the server, is
   written in the addendum to [ADR 3](docs/adr/0003-conversations-and-player-state.md)
   ([`52318d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/52318d0)).

5. Corrections went into the harness. I once claimed a staff handoff did not exist
   after reading only one file. It did, in `service.ts` ([`9e511ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9e511ca), corrected
   in [`e3ab3cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e3ab3cb)). The rule to search the whole subsystem before writing a
   negative claim went into `CLAUDE.md` ([`8d20aff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8d20aff)). My tests also disturbed
   the game I was playing, so `pnpm check` now starts its own server
   ([`512c318`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/512c318)).
