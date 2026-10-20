# Store

Store is a shared first-person 3D shop, an obvious parody of a famous fruit-themed
retail store. Real visitors and CPU staff walk the same room, and the Genius Bar
queue is the shared state: you can see who is ahead of you, and they are a mix of
people and characters. It has a logo but no brand name, and it is never presented as official.

## What good means here

**Function.** Store is for anyone who has stood in a busy shop wanting a phone and
not getting one. Each part of a visit is simulated end to end, so a visitor feels
both the satisfaction and the frustration of the real thing. The satisfaction is
choosing a phone, seeing the colours and storage, sitting down to talk it through,
paying and being handed a bag. The frustration is a colour that is out of stock, a
price over budget, and a wait. Stock is finite and shared, so two visitors can
race for the last unit.

**Quality of execution.** The room should feel calm, like a hotel lobby, while the
queue is lived. Nobody should have to read instructions: a character looks at you, waves and
walks over, and you answer from a short menu.

**Differentiation from the median.** A generic multi-user 3D shop would be an empty room
with avatars and a chat box. Here the people matter because they use the same
scarce things: a specialist, a table, the last phone. When a real employee leaves,
a CPU takes their place and the conversation carries on.

## How it works

Visitors choose customer or an employee kind and customise a character. Real and
CPU staff use the same conversation model, and conversations are menus, never free
text. A visitor is whoever holds a random token in their browser, so there are no
accounts. The server decides what each person may do ([ADR 3](docs/adr/0003-conversations-and-player-state.md)),
and every change is saved to SQLite, so it is all still there after a restart.

## What is enforced and what is judged

Enforced in `spec/`: the back room is staff-only, an out-of-stock phone cannot be
bought and only one of two visitors gets the last unit, one visitor cannot answer
in another's conversation, the drawings of the store match the 3D model, and every
event becomes a log line that names who did it.

Judged by me: whether a wait feels frustrating and the room feels calm. No test can
tell, so I play it as two visitors in separate browser profiles at 1920x1080 and
390x844. A play session on 14 October found the customer flow "way too linear"
([SCOPE.md](SCOPE.md)), and I changed it.

## What I read

- Robin Sloan, [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/): an app can be good because it is made for a small group, which is the scale of this room.
- Eight public accounts of store visits ([references/accounts.md](references/accounts.md)), the source of the satisfactions and frustrations above.
- The Twelve-Factor App, [XI. Logs](https://12factor.net/logs), for how the app reports what people did.

## What I chose not to build

Refunds, user accounts, chat between visitors, voice, more than one store, VR and
native mobile are cut ([SCOPE.md](SCOPE.md), Tier 3). Accounts and chat matter
most. Both would let a visitor say or be anything, and the store works because
what you can do is limited to asking for help, looking at devices and paying.

## Status

Live at [comp4020-final-riteshsivaraman.fly.dev](https://comp4020-final-riteshsivaraman.fly.dev). Built today: customers and employees, a greeter who approaches arrivals, real and CPU specialists, demos, tables, a stock runner, payment on the spot and a log of who did what. There is no occupancy cap yet.
