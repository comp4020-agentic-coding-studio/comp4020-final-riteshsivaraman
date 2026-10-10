---
status: draft, awaiting Ritesh's approval
what: The Canberra-style store floor plan and the dimensions the 3D model and the checks are built on.
date: 2026-10-11
source: references/canberra-store.png and the side-wall close-up, read by the agent. Regenerate the drawing with `node scripts/blueprint.ts`.
---

# Canberra store floor plan

`canberra-plan.svg` is drawn from the same constants the 3D scene, the server
and the layout checks use (`src/shared/world.ts`, `protocol.ts`), so the
drawing cannot drift from the model. Open it in a browser. Entrance at the
bottom, back wall and the staff-only back room at the top.

## To approve or correct

"Source" says how I got the number. Only the proportions come from the photos;
absolute sizes are assumptions, because a photo has no scale.

| # | Dimension | Value | Source | Confidence | Your call |
|---|---|---|---|---|---|
| 1 | Shop width | 16 m | Glass front is about 3.8 times as wide as high (photo), at an assumed 3.8 m ceiling | Medium | [ ] |
| 2 | Shop depth | 15 m | Not measurable from a front-on photo; fits five table rows, the bar and a front lane | Low | [ ] |
| 3 | Ceiling height | 3.8 m | Assumed | Low | [ ] |
| 4 | Table columns | 3, at x = -4, 0, +4 | Photo: five evenly spaced lines (bench, column, centre, column, bench) | Medium | [ ] |
| 5 | Rows per column | 5 each side, 3 in the middle | Photo, counted in perspective | Medium | [ ] |
| 6 | Table size | 1.7 x 1.0 m | About a tenth of the width across (photo); depth assumed | Low | [ ] |
| 7 | Products per table | 4 (2 each long side), 1.7 m apart | Your instruction: room for one person per product | Design choice | [ ] |
| 8 | Wall benches | 0.9 deep, 13 m long, both side walls | Photo | Medium | [ ] |
| 9 | Service bar | 8 m x 0.9, 5 stools | Photo showed about three quarters of the back wall; shortened to half at your request | Your call | [ ] |
| 10 | Staff space behind bar | 1.65 m deep, closed by partitions | Your description | Medium | [ ] |
| 10b | Back wall above the bar | three black screens with a service mark between them | Photo and your note | Medium | [ ] |
| 11 | Staff door | 1.3 m wide, immediately to the left of the bar as you face it (the +x side), flush with the wall | Your description; corrected after drawing from the visitor's side | Medium | [ ] |
| 12 | Side-wall lightboxes | three per wall: 3.2, 2.0, 0.9 m wide | Close-up photo | Medium | [ ] |
| 13 | Product bays | three per wall, 1.4 m wide, recessed between 0.3 m piers, from the bench top (0.95 m) to 3.15 m; the grey panel runs unbroken below the bench | Two close-up photos (the earlier "four, from the floor" was wrong) | Medium | [ ] |
| 14 | Back room | 17 x 15 m, 2 shelving rows, 2 repair benches | Your instruction: same footprint as the shop | Design choice | [ ] |

When this is approved the checks become dimension checks against these rows
(the current `spec/layout.test.ts` already encodes the proportions).
| 15 | Left wall (+x) features | large phones lightbox 3.2 m, medium phones lightbox 1.9 m with two monitors under it, small card lightbox 0.9 m | Close-up photo | Medium | [ ] |
| 16 | Right wall (-x) features | large phones lightbox 3.2 m, large black display 2.4 x 1.3 m, laptop lightbox 1.2 m, five desktop displays before the bays, headphones at the front end | Close-up photo | Medium | [ ] |
| 17 | Ceiling | slats across the room every 0.3 m; long panels 2.6 x 0.5 m in six paired rows, 2.0 m apart, 3.6 m either side of the middle; track rails 0.6 m in from the front and side walls with spots every 1.5 m; one hanging mark near the front | Front-on photo and close-ups; panel count is an estimate | Low | [ ] |
| 18 | Entrance opening | 3 m wide in the middle of the glass front | Assumed ([TK]) | Low | [ ] |
| 19 | The mall | 68 m concourse, 18 m wide, neighbouring shops either side of the store, opposite shopfronts, mezzanine walkway at 4.4 m with a glass balustrade, atrium roof at 7.4 m | Your request; sizes assumed | Low | [ ] |
| 20 | People in the mall | five walkers (two stop to window-shop), three customers who come in through the opening, wander and leave, three people on the mezzanine | Your request; routes are mine | Design choice | [ ] |
