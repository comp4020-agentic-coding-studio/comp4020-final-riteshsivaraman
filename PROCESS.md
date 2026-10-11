# Process overview

## What I built

I built a shared first-person 3D store that is an obvious parody of a fruit-themed
retail store. Real visitors and CPU staff share one room, and customers talk to
staff through menus. It is built on React Three Fiber, with a Hono, ws and
SQLite server, and nothing in the room is a downloaded model.

## The moments that mattered

1. The 3D store was hard to cover with `pnpm check`, because there was nothing
   small to assert on. Instead of settling for screenshots, I had Claude draw a
   2D blueprint (the floor plan, four wall elevations and the ceiling) from the
   same shared data that the 3D room reads. The checks then compare the
   committed drawings with the model, and fail if the two drift apart
   ([`baa57a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/baa57a6)).
   I knew this worked when I enlarged the room and every drawing and check
   moved with it, instead of me finding the server and the scene disagreeing
   later
   ([`025c3ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/025c3ee)).

2. I did not want to describe the characters in a prompt and judge whatever
   came back. So I asked Claude to build a tool where I could change heads,
   bodies, eyes and expressions myself and look at them side by side, starting
   from one low-poly bust
   ([`25558d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/25558d5)).
   It grew into full bodies and a crowd test, and I kept experimenting until I
   settled on a friendly body with round eyes as the default, with the other
   options kept in the tool
   ([`076dfc7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/076dfc7)).
   The decision was made by looking at the characters, which is the only way I
   could have judged them.

3. I was not sure what backend the customer service pipeline needed, and a
   guess would have meant rebuilding it later. So I asked Claude to generate
   seven full, end-to-end transcripts of a store visit, based on the visitor
   accounts I had collected, marking who starts each exchange and what state
   changes
   ([`8299a2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8299a2f)).
   They showed a gap my first design had missed. One script ended with "go to
   the Genius Bar", which created nothing for a genius to see, and staff had to
   be able to start a conversation as well as customers. I used them as context
   to rebuild the state machine around a durable case per customer, with either
   side able to start
   ([`c16a1e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c16a1e6)).
