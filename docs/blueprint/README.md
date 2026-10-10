---
status: draft, awaiting Ritesh's approval
what: The Canberra-style store's blueprints (plan, walls, ceiling, mall) and the dimensions the 3D model and the checks are built on.
date: 2026-10-11
source: Ritesh's rectified corners in rectify.json (the rectify tool), the reference photographs, and his instructions. Regenerate with `node scripts/blueprint.ts`.
---

# Canberra store blueprints

Open **`canberra-blueprint.pdf`**: one document with a cover, a table-by-table
page for positions and orientation, the top-down plan of the shop and back
room, the mall plan, the four wall elevations and the ceiling.

Everything is drawn from the same constants the 3D scene, the server and the
checks use (`src/shared/world.ts`, `plan.ts`, `mall.ts`, `protocol.ts`).
`spec/blueprint.test.ts` fails if a committed drawing is stale, so what you
approve here is what is built.

Files: `canberra-plan.svg|png` (shop and back room), `canberra-mall.svg|png`,
`canberra-walls.svg|png`, `canberra-ceiling.svg|png`, `canberra-blueprint.html`
(the printable source) and `canberra-blueprint.pdf`.

To rebuild the PDF after `node scripts/blueprint.ts`:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --print-to-pdf=docs/blueprint/canberra-blueprint.pdf \
  "file://$PWD/docs/blueprint/canberra-blueprint.html"
```

## What the references set

From your rectified corners: the side walls are about **3.35** times as long
as they are high, the back wall about **3.3** times as wide as high, and you
gave the wall height as **3 m**. That fixes the shop at about **10 m wide, 10 m
deep, 3 m high**. The earlier 16 x 15 x 3.8 m had proportions of 4.2 and 4.0,
which the photographs do not support.

## To approve or correct

"Source" says how each number was reached. The 3 m wall height is the one
absolute scale; the photographs give proportions only.

| # | Part | Value | Source | Confidence | Your call |
|---|---|---|---|---|---|
| 1 | Shop width x depth x height | 10 x 10 x 3 m | Wall ratios 3.3 and 3.35 at your 3 m wall height | Medium | [ ] |
| 2 | Table columns | x = -2.5, 0, +2.5 | About a quarter of the width either side (photo) | Medium | [ ] |
| 3 | Tables | 1.05 wide x 1.9 long, three down each side column, two down the middle, long side front to back | About a tenth of the width across (photo); length assumed | Low | [ ] |
| 4 | Products | four to a table, 1.3 m apart, facing outward | Your instruction: room for one person each | Design choice | [ ] |
| 5 | Wall benches | 0.56 deep, 8.6 long, 0.95 m high, open underneath | Photo; bench top at about 0.3 of the wall height | Medium | [ ] |
| 6 | Service bar | 5 m x 0.8, 1.05 m high, 5 stools | Shortened to half the back wall at your request | Your call | [ ] |
| 7 | Staff space behind the bar | 0.6 m deep, closed by partitions | Your description | Medium | [ ] |
| 8 | Staff door | 1.0 m wide, left of the bar as you face it (+x side), flush with the wall | Your description | Medium | [ ] |
| 9 | Left wall (+x) | lightboxes 2.0, 1.25 and 0.6 m, two monitors, three bays above the bench | Close-up photo | Medium | [ ] |
| 10 | Right wall (-x) | lightbox 2.0 m, large display 1.5 x 0.8 m, laptop lightbox 0.8 m, five desktops before the bays, headphones at the front end | Close-up photo | Medium | [ ] |
| 11 | Bays | three per wall, 0.9 m wide between 0.2 m piers, from the bench top (0.95 m) to 2.55 m; the grey panel runs unbroken below the bench | Two close-up photos | Medium | [ ] |
| 12 | Back wall above the bar | three screens 1.3 x 0.75 m with a service mark between, sign above | Photo and your note | Medium | [ ] |
| 13 | Ceiling | slats across the room every 0.25 m; six paired rows of 1.8 x 0.4 m panels; track rails 0.5 m in from the walls with spots every 1.1 m; one hanging mark | Front-on photo and close-ups; panel count is an estimate | Low | [ ] |
| 14 | Entrance opening | 3 m wide in the middle of the glass front | Assumed ([TK]) | Low | [ ] |
| 15 | Back room | 10 m deep, same footprint, two shelving rows, two repair benches | Your instruction | Design choice | [ ] |
| 16 | The mall | 68 m concourse, 20.5 m wide, neighbouring shops either side, opposite shopfronts, mezzanine walkway at 4.4 m with a glass balustrade, roof at 7.4 m | Your request; sizes assumed | Low | [ ] |
| 17 | People in the mall | five walkers (two stop to window-shop), three customers who come in and leave, three on the mezzanine | Your request; routes are mine | Design choice | [ ] |

## One decision this surfaced

The photographs fix proportions, not size. With a 3 m wall the shop is about
**10 m square**, much smaller than I had been building. If the real ceiling
is higher, the whole shop scales with it (a 4 m ceiling is about 13 m square).
The alternative is to keep a larger footprint and a taller ceiling, which is
cheaper to build but no longer matches the proportions you set.
