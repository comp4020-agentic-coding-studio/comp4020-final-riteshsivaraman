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
| 11 | Staff door | 1.3 m wide, immediately left of the bar | Your description | Medium | [ ] |
| 12 | Side-wall lightboxes | three per wall: 3.2, 2.0, 0.9 m wide | Close-up photo | Medium | [ ] |
| 13 | Product bays | four per wall, 1.1 m wide, recessed 0.3 m between full-height piers (floor to ceiling) | Second close-up photo | Medium | [ ] |
| 14 | Back room | 17 x 15 m, 2 shelving rows, 2 repair benches | Your instruction: same footprint as the shop | Design choice | [ ] |

When this is approved the checks become dimension checks against these rows
(the current `spec/layout.test.ts` already encodes the proportions).
