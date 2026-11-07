# Demo phones: lock, home and three apps drawn in code (4b)

labels: type:feature, area:client, size:l, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: 4a (server state) for the shared part; the drawing can start from the iOS pilot behind `?ios=1`.

## Behaviour
Tapping the demo phone screen while inspecting it wakes it and lets the visitor move through: lock screen, home screen, and three apps: Camera (viewfinder is 4c), Settings (shows this model's real name, storage and colour from the catalogue), and Photos (a grid of procedurally drawn images). Wallpaper and the camera cut-out (island, notch, punch) follow the model. Everything is drawn in canvas code; no downloaded textures, fonts or Apple assets. Touch targets work at 390x844.

## Acceptance criteria
1. Lock -> home -> Settings -> Photos -> back works by taps, on desktop click and phone tap.
2. Settings shows the product name, storage and colour from the catalogue, not hard-coded strings.
3. The cut-out follows the model's `ScreenCutout`.
4. Texture stays within the graphics brief's size cap (about 512 px) and draws only when the screen state changes (no per-frame canvas redraw).
5. Screen shown equals the server state from 4a for every viewer.

## Spec line
"The screen texture is derived from server demo state and catalogue data; a pure draw function maps (state, model) to the same output for every viewer." (Pure-function check in spec/; the look is advisory.)

## Open decision for Ritesh (D44)
The pilot's PNGs are baked files. Recommended: redraw as canvas code so the procedural-only rule holds without an exception. If you accept the PNG exception, say so and I will record it as a SCOPE decision.

## Feeds
Demo tables.

## Out of scope
Messages, Clock, Wallet, real apps, any Apple branding.
