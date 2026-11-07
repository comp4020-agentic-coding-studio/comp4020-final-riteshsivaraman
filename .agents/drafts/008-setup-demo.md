# Setup demo: five short steps on the shared phone screen

labels: type:feature, area:server, area:client, touches:migration, size:l, wave:w3
status: draft (scoped with Ritesh 2026-11-07, D52). STRETCH: only if wave 2 lands clean before the Sunday 20:00 freeze.
depends on: 4a (shared screen state), 4b (screens), and unboxing (#7).

## Behaviour
After unboxing, the customer's new phone shows the setup flow on its screen, shared with the staff member who stays with them. Five steps: language, Wi-Fi, "transfer from your old phone" with a progress bar, a face-unlock-style step, and a "Hello" finish. The staff member's menu offers the next step and the customer taps it on the shared screen. When no human staff is present a CPU staff member drives it on a schedule derived from server time. Colour and model carry through (the wallpaper matches the phone they bought).

## Acceptance criteria
1. Steps advance only in order, and only the customer or their attending staff can advance them.
2. Both see the same step within about a second.
3. Progress persists across reload and restart; finishing sets the phone to "set up".
4. A CPU staff member advances the setup only when no real staff user is attending (D48 priority holds).
5. Each step writes an `events` row.

## Spec line
"Setup steps advance in order by the customer or attending staff, are the same for both, and persist; a CPU drives only when no real staff user is attending."

## Feeds
Staff attention (the staff member stays with the customer), demo tables.

## Out of scope
Real data transfer, accounts, passcodes.
