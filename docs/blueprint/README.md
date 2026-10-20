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

## What the references set, and what changed

From your rectified corners the references gave about **10 m wide, 10 m deep,
3 m high** (side walls 3.35 times as long as high, back wall 3.3 times as wide
as high, wall height 3 m as you gave it). You then asked for more room so
tables can be spread out and people can move between them, and chose to keep
the 3 m wall: the shop is now **12 m wide, 18.2 m deep, 3 m high** (SCOPE D23, then D24), deliberately
longer than the reference proportions. There is 1.5 m clear inside the glass
where customers are received, 1.0 m between product tables front to back, and a
metre-wide aisle behind people seated at the bar.

## To approve or correct

"Source" says how each number was reached. The 3 m wall height is the one
absolute scale; the photographs give proportions only.

| # | Part | Value | Source | Confidence | Your call |
|---|---|---|---|---|---|
| 1 | Shop width x depth x height | 12 x 18.2 x 3 m | Your choice (option A, then larger tables, SCOPE D23 and D24): more room than the 10 x 10 m the references gave | Your call | [ ] |
| 2 | Table columns | x = -3.2, 0, +3.2 | About a quarter of the width either side (photo) | Medium | [ ] |
| 3 | Product tables | 1.0 wide x 1.2 long (almost square), four in each side column and three in the middle, 1.0 m clear between them front to back | Your description | Medium | [ ] |
| 3b | Service tables | 1.2 m square (the long edge of a product table), one nearest the bar in each side column and one in the middle column, two stools tucked under each of its left and right sides, no products | Your description | Medium | [ ] |
| 4 | Products | one on each side of a product table, facing outward | Your instruction: room for one person each | Design choice | [ ] |
| 5 | Wall benches | 0.56 deep, 13.2 long (stops where the bays start), 0.95 m high, open underneath; one short ledge on the front half of each bay with one product (which half and product are working defaults) | Your instruction | Medium | [ ] |
| 6 | Service bar | 8 m x 0.8, 1.05 m high, 13 stools tucked under a 0.3 m overhang | Almost from the far end of one service table to the other; 13 stools by your instruction | Your call | [ ] |
| 7 | Staff space behind the bar | 0.65 m deep, closed by partitions | Your description | Medium | [ ] |
| 8 | Staff door | 1.0 m wide, left of the bar as you face it (+x side), flush with the wall | Your description | Medium | [ ] |
| 9 | Left wall (+x) | lightboxes 2.0, 1.25 and 0.6 m, two monitors, three bays above the bench | Close-up photo | Medium | [ ] |
| 10 | Right wall (-x) | lightbox 2.0 m, large display 1.5 x 0.8 m, laptop lightbox 0.8 m, five desktops before the bays, headphones at the front end | Close-up photo | Medium | [ ] |
| 11 | Bays | three per wall, 0.9 m wide between 0.2 m piers, from the bench top (0.95 m) to 2.55 m; the grey panel runs unbroken below the bench | Two close-up photos | Medium | [ ] |
| 12 | Back wall above the bar | three screens 1.5 x 0.75 m with a service mark between, sign above | Photo and your note | Medium | [ ] |
| 13 | Ceiling | slats across the room every 0.25 m; twelve paired rows of 1.8 x 0.4 m panels; track rails 0.5 m in from the walls with spots every 1.1 m; one hanging mark | Front-on photo and close-ups; panel count is an estimate | Low | [ ] |
| 14 | Entrance opening | 3 m wide in the middle of the glass front | Assumed | Low | [ ] |
| 15 | Back room | 18.2 m deep, same footprint, six double banks of rolling shelves, two repair benches | Your instruction | Design choice | [ ] |
| 16 | The mall | 68 m concourse, 20.5 m wide, neighbouring shops either side, opposite shopfronts, mezzanine walkway at 4.4 m with a glass balustrade, roof at 7.4 m | Your request; sizes assumed | Low | [ ] |
| 17 | People in the mall | five walkers (two stop to window-shop), three customers who come in and leave, three on the mezzanine | Your request; routes are mine | Design choice | [ ] |

## Still open

- Which half of each bay gets a ledge, and which product stands on it: working
  defaults (front half, one product each), easy to change in `plan.ts`
  (`BAY_LEDGES`).
- The entrance opening is still an assumed 3 m.
- The 3 m wall height is the one absolute scale. A taller ceiling would make
  the room feel less like a long corridor; the references only give proportions.
