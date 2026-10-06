# Seen

An internal email client for a company whose whole brand is radical
transparency. I built it by taking that premise literally, with no
exceptions. Nobody in it is a villain, and that is the point.

## What good means here

**Function.** Seen is for a new hire on their first week at a company whose
careers page says "no secrets." It is a normal email client with one change:
nothing is private by default. Everyone sees the BCC, drafts sit on a public
board anyone can edit, and a recipient sees a draft being typed to them before
it is sent.

**Quality of execution.** Good here is a slow reveal. At first a user should
believe the pitch, because it reads as nice, on brand corporate values, and
only gradually notice what the mechanics are doing. This is why the interface
is deliberately boring and trustworthy, with one small unread asterisk that
gives it away on a second look (`docs/design-handoff.md`). If it feels spooky
on the first screen, it has failed.

**Differentiation.** A generic version would be surveillance horror, with a
villain and a Big Brother feel. Seen has no villain. It only lives up to what
transparency culture already says about itself, and the unease comes from
that consistency.

## Core mechanics

- Compose, send, reply and forward, with BCC exposed both ways.
- A public draft board. A draft publishes on request, or after 30 seconds of
  silence, and has one editor at a time.
- Self destruct, which still logs an event when nobody saw the email.
- Forward alerts, and a live preview of a draft for its To, Cc and Bcc
  recipients.

## What is enforced and what is judged

Enforced in `spec/`: every action writes an event row, drafts that should be
hidden from strangers are hidden, and the live preview reaches Bcc recipients.
Judged by me: whether it feels slow and uncomfortable. No automated check can
tell me that, so I sit in two separate browsers as two users and judge it
myself (`CLAUDE.md`).

## What I read

I used the week 8 lecture's three questions (function, quality of execution
and differentiation from the median) to shape this definition, and the final
project brief's notes on what good means at a small scale. For the decisions
behind the app I followed Michael Nygard's
[architecture decision records](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(`docs/adr/`). This is a first version, and I expect to add sources as I go.

## What I chose not to build

Attachments are cut for now, so the draft board, self destruct and forward
alerts got the time. I also left out any villain, any spooky styling and any
framing that says someone is to blame.

## Status

Live at [comp4020-final-riteshsivaraman.fly.dev](https://comp4020-final-riteshsivaraman.fly.dev/).
Accounts, mail, the draft board, self destruct, forward alerts and the live
preview are built. The second signature design device is not built yet.
