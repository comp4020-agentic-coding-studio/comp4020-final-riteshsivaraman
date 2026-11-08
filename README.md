# Store

This is a shared 3D store that you can walk around in first person, and it's an
obvious parody of a certain fruit-themed tech store (it has a logo, but no brand
name). You can come in as a customer looking for a new phone, or as a staff
member who has to find customers, check the stock and take payment on a
handheld, ideally before a CPU colleague beats you to it! Everyone is in the
same live room.

Live: <https://comp4020-final-riteshsivaraman.fly.dev/>

Numbers like D47 are decisions in the dated decision table in
[SCOPE.md](SCOPE.md).

## What good means here

The whole store is built around one idea, which is that a few things are
actually scarce, and everyone in the room is sharing them. Staff attention, the
last phone in stock and a demo table can only go to one person at a time, and
you can be on either side of that. As a customer, you're waiting for someone to
notice you, and as staff, you're the one everybody is waiting on. If you've ever
stood around in the real store waiting for help, I'm hoping you'll find it
pretty funny.

I made it for a few friends to jump into together, and Robin Sloan argues that
an app made for a few people doesn't need to scale to be good. I agree, so it
runs on one small machine. However, two friends alone would make the scarcity
meaningless, so CPU people fill the room and follow the same rules as real ones
(D55), while a waiting customer is always offered to a real staff member first
(D47, D48).

## How it works

You pick customer or a staff role and customise your character. There are no
accounts, since your browser keeps a random token so the store remembers you.
You press E near someone to talk through menus. A customer who needs help goes
on a hidden waiting list, the nearest free staff member gets 15 seconds to
claim them, then the next one does, and only then a CPU. Everything that needs
to last is in SQLite on the Fly volume ([ADR 7](docs/adr/0007-stack.md)).

## What is enforced and what is judged

**Enforced in `spec/`**, against the running app:

- Customers stay out of the back room (`presence.test.ts`).
- Out-of-stock items can't be sold, and only one of two visitors gets the last
  unit (`service.test.ts`).
- Held units are shown to everyone live (`3-stock-holds-visible.test.ts`).
- Real staff are offered a customer before a CPU
  (`1-real-staff-offered-first.test.ts`).
- Two visitors can't take the same demo slot (`inspect-live.test.ts`).
- The blueprint drawings match the 3D model (`blueprint.test.ts`).
- Every event logs one line naming who did it (`eventlog.test.ts`).

**Judged by me.** On 8 November I played as two visitors in separate browser
profiles, one as staff and one as a customer. I checked that staff could find
the customer and that the room felt calm. I haven't judged yet whether waiting
feels frustrating in a believable way.

## What I read

- Robin Sloan,
  [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/).
  This is why I was happy for the store to stay small.
- Eight public accounts of real store visits
  ([references/accounts.md](references/accounts.md)). These showed me the
  waiting and payment limbo the store simulates, and the good parts too, like
  hands-on tables.
- The Twelve-Factor App, [XI. Logs](https://12factor.net/logs), for how the app
  reports who did what.

## What I chose not to build

I didn't build accounts or chat between visitors, since both would let people
say or pretend to be anything in a room full of strangers. I also left out paid
APIs to keep it cheap to run, and kept it to one store and one floor so people
actually run into each other. Lastly, I cut the visible queue (D47), because
standing in a line was pretty much dead time, and one slow customer held up
everyone else.

## Status

So far I've built the store, talking, stock and holds, staff offers, CPU
customers, handheld payment and returning customers. Receipts (#22), demo phone
screens (issues #4 to #6), unboxing (#7) and the setup demo (#8) aren't built
yet.
