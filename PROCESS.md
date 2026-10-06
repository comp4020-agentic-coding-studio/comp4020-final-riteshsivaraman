# Process overview

## What I built

Seen is an email client for a company whose whole brand is radical
transparency. I applied that premise with no exceptions, which is why BCC is
visible to every recipient, drafts sit on a public board anyone can edit, and a
recipient watches a draft being typed to them before it is sent. It runs on
Hono, a Preact SPA, better-sqlite3 and Drizzle
([`dc9a8ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/dc9a8ab)).
I did not reuse my crit 7 Astro stack, because crit 9 needs raw WebSocket
access and Astro would have needed a Node layer bolted on. The cost is a
slower boot, since the server runs through `tsx` with no compile step.

## The moments that mattered

### 1. Options before picking

I asked for a live preview of a draft, and the agent had a plausible reading
ready. Instead it laid out what the feature meant and which transport to use
as separate questions, and I chose keystroke level over SSE, not the WebSocket
plan from my first ADR
([`cf2242d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/cf2242d)).
This became a rule in CLAUDE.md, written before any app code
([`168ca9b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/168ca9b)).

### 2. A design spec the app ignored

I had a design doc with real colours, fonts and radii, but the app still used
its own blue accent and a different typeface. Nothing failed, because nothing
checked it. I compared the computed styles against the doc's hex values and
renamed every token to match
([`dbb8e65`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/dbb8e65)).
A rule I had written down was not the same as an app that followed it.

### 3. A reviewer for the invariant

I could not read every line the agents wrote, so I built an event log reviewer.
It found two actions that did not write their event
([`9127d9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/9127d9d)).
I also cut attachments to protect the draft board, and kept every check
(`CUTS.md`).
