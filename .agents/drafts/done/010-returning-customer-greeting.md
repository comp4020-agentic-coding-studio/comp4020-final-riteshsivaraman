# Returning customers: the greeter knows your name and your last purchase

labels: type:feature, area:server, area:shared, touches:service, size:s, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: none (purchase and visit data are already persisted).

## Behaviour
A visitor who comes back with the same browser token is greeted by the greeter by name, and if they bought a phone before: "welcome back <name>, how's the <colour> <model>?" A short "your visits" list (date, what happened) is available in their things. A first-time visitor gets the existing greeting.

## Acceptance criteria
1. A returning token with a prior paid order gets the purchase line; without one, a name-only line; a new token gets the old greeting.
2. The line uses stored data only (orders, events), never client-supplied text.
3. The visits list matches the `events` rows for that visitor.
4. The greeting happens once per visit (existing per-visit rule in `tryGreeterApproach`).

## Spec line
"The greeting variant is chosen from the stored visit and order history of the token: new, returning, or returning with a purchase."

## Feeds
Persistence.

## Out of scope
Accounts, email, cross-device identity.
