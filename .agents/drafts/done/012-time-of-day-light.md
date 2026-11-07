# Light: soft shadows and a time-of-day sun from the real clock

labels: type:feature, area:client, size:m, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: none.

## Behaviour
The store gets soft shadows and sunlight through the windows whose angle and colour follow the real server clock (morning, midday, evening, night with interior lights). A marker returning tomorrow at a different hour sees a different store. Budget: phone first (capped pixel ratio, no heavy post-processing, small shadow maps); a quality setting falls back to flat light if frame time is over budget.

## Acceptance criteria
1. Light direction and colour are a pure function of the server time (testable without a renderer).
2. Soft shadows on staff, customers and tables at 1920x1080 and 390x844 stay within the frame budget (report frame times).
3. A low-quality fallback exists and is chosen automatically when frames are slow.
4. No downloaded textures or HDRIs.

## Spec line
"Sun direction and colour are a pure function of server time and are identical for every viewer at the same instant."

## Advisory / judged
Looks expensive and calm, not blown out. Two viewports.

## Feeds
Persistence (a different store tomorrow), atmosphere for the calm-room claim.

## Out of scope
Ray tracing, reflections, post-processing stacks.
