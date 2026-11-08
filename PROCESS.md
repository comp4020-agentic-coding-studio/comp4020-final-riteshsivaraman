# Process overview

Citations link to `comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman`.
Numbers like D47 are decisions in the dated decision table in
[SCOPE.md](SCOPE.md).

## What I built

I built a shared first-person 3D store that is an obvious parody of a fruit-themed
retail store. Real visitors and CPU staff share one room, and customers talk to
staff through menus. Nothing in the room is a downloaded model.

## The pivot

This project actually started as Seen, a mock email service, and I'd already
written its harness before any app code
([`168ca9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/168ca9b)).
On 10 October I dropped it (D1), and the store replaced it the next day
([`b61f6c7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/b61f6c7)).
D1 only records the decision, so the reasons here are from memory. Seen didn't
really fit the brief, since in an inbox two people almost never act on the same
thing, and nobody would notice an email arriving a second faster. The whole
point of Seen was also that it should feel slowly uncomfortable, and I didn't
think a tutor would pick up on that in a short crit. I also just found the store a lot more fun to build.

## The second pivot: away from a visible queue

My first plan for the store was a visible Genius Bar queue as the shared state
(D2). However, when I played it, standing in the line was pretty much dead
time, and one slow customer would hold up everyone behind them. I didn't write
that play session down, so this part is from memory. The real store doesn't
have a line either, since you just browse until a staff member comes to you.
So on 7 November I replaced the queue with a waiting list that customers never
see, where staff are the limited resource (D47,
[`9676dc0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9676dc0)).
Before building anything new, I also had CLAUDE.md and SCOPE updated to drop
anything that still described a queue. Nothing was broken, but every agent reads
those files, so they would have kept building towards the old idea.

## What good means here

Robin Sloan argues that an app made for a few people you know doesn't need to
scale to be good, and I agree with him, so it runs on one small machine on
purpose ([ADR 7](docs/adr/0007-stack.md)). The catch is that a store with only
two friends in it feels empty, and the scarce staff and stock only matter if
someone else wants them too. This is why CPU people fill the room and go
through the same rules as real ones (D55), so even two friends get a busy store
to compete in.

## Why this stack

The brief fixes one small Fly machine that stops when idle, and one volume, so I
picked parts that fit that. SQLite on the volume is the only thing that survives a
restart, and it has one writer, which makes two visitors racing for the last unit
of stock easy to reason about. Hono, kept from Seen's scaffold ([`8bbe52e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8bbe52e)), is a small
server with no compile step. A `ws` WebSocket carries presence ([`2379cd6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/2379cd6)) because the room
needs both directions at about ten updates a second, which server-sent events or
polling would handle badly. React Three Fiber came from the idea: a first-person
store has to be 3D, and I can read and fix React code. The cost is that presence
lives in one process's memory, so a second machine would need a broker. The
options and costs are in [ADR 7](docs/adr/0007-stack.md).

## Why this agent workflow

I kept the habit from Assignments 1 and 2 of writing the harness first, and
added trying the idea out cheaply before building it properly. For instance,
the conversation model ran as a terminal game before the real engine was built
(D43,
[`1ae8e01`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/1ae8e01)).
Until the last week, I worked through one subsystem at a time, but the issue
list got too long for that, and I also wanted to try what week 9 taught. So I moved to an issue board where each agent works on one issue in
its own git worktree, with a failing spec written before the build and a fresh
reviewer checking it after
([`e97c1ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e97c1ac)).
The worktrees meant builders couldn't overwrite each other's work. However, a
quick one minute test showed that a worktree only starts from committed work,
so none of the builders would have seen my uncommitted CLAUDE.md edits. The test
itself left no commit, but because of it the harness now gets committed before
every wave (`docs/workflow.md`,
[`e97c1ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e97c1ac)). The downside was
that everything still went through me (moment 5).

## The moments that mattered

### 1. Testing a 3D room through flat drawings

The 3D store was hard to cover with `pnpm check`, because there was nothing
small to assert on. Instead of settling for screenshots, I had Claude draw a
2D blueprint (the floor plan and four wall elevations) from the
same shared data that the 3D room reads. The checks fail if the drawings and
the model drift apart ([`baa57a6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/baa57a6)). I knew this worked when I enlarged the
room and every drawing and check moved with it ([`025c3ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/025c3ee)).

### 2. Reading real visits

I wasn't sure what backend customer service needed, and my first instinct was to
explain it better in a prompt. Instead, I had Claude write out seven full store
visits based on real accounts I'd collected
([`8299a2f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8299a2f)).
One of them ended with "go to the Genius Bar", which didn't actually create
anything for a genius to see, so I redesigned the backend around a case for
each customer
([`c16a1e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c16a1e6))
and then built its data layer
([`e3ab3cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e3ab3cb)).
Something similar happened later with testing. **400 seeded simulation runs**
all passed
([`739eb14`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/739eb14)),
but when I read one transcript myself, the staff demoed the same phone **three
times in a row**. Two specs now catch this, and I checked them by putting the
old rule back, which turned them red on seeds 8 and 9
([`97da377`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/97da377)).
Since then I make sure to read at least one run myself.

### 3. Throwing away the handshake

On 19 October I'd decided on a handshake, where people showed they wanted to
talk before a conversation opened. At crit 10, everyone ended up stuck behind
one greeting, with "Maya wants to talk" floating over every head. I could have
tuned the handshake, but I decided talking shouldn't need one at all (D46). So
right after the crit I removed it, and now pressing E opens a conversation
straight away, or says the person is busy, and nobody queues
([`21d4d97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/21d4d97)).
I knew it worked because I played it again with more than one person and nobody
got stuck, and a new spec checks that the next customer inside gets greeted
once the greeter is free
([`eb65c80`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/eb65c80)).

### 4. When Claude was confidently wrong

At one point, Claude told me a staff handoff didn't exist after only reading one
file, but it was already there in `service.ts` (the correction is recorded in
[`e3ab3cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/e3ab3cb)).
Instead of just correcting it that once, a rule went into `CLAUDE.md` to search
the whole subsystem before writing any "X isn't built" claim
([`8d20aff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/8d20aff)).
I haven't seen it tested since, so all I can say is that the rule is there.

### 5. What level to parallelise at

In the first parallel wave on 7 November, up to seven agents were building at
once, and **PRs #19 to #29 all merged within two hours**
([`1a01be3...d80d33a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/compare/1a01be3...d80d33a)). However, every one of
them still went through me, and I asked whether the time and spend were
"justified by the features being delivered" (`docs/learnings-inbox.md`). The easy answers would
have been to add even more agents, or to go back to one at a time. Instead, I
asked what level we were actually parallelising at. This is when we decided
that anything I need to feel-check goes one issue at a time, and only the
mechanical work runs in parallel
([`5bbc6f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/5bbc6f5)).
On 8 November, PRs #43 to #48 merged one at a time
([`3e2b050...1d1bd68`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/compare/3e2b050...1d1bd68)), and one of them fixed
something I found while playing
([`2c36781`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/2c36781)).
From memory, feedback felt a lot faster after this, and it made me realise the
agents were mostly waiting on me.
