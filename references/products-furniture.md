---
status: working
what: What the furniture artist found about real flagship-store fixtures and back-of-house furniture, and the dimensions used to model them in src/client/src/gfx/furniture*.tsx. For Ritesh to check.
date: 2026-10-11
source:
  - https://9to5mac.com/2019/06/18/apple-store-pricing-sign-watch-display-design-changes/
  - https://michaelsteeber.com/glossary/fixtures/tray/
  - https://michaelsteeber.com/glossary/fixtures/forum-table/
  - https://michaelsteeber.substack.com/p/have-a-seat
  - https://sawmillcreek.org/goto/post?id=3159492
  - https://draftingsuppliesdew.com/perpetulab-wooden-leg-tables-butcher-block
  - https://hauslondon.com/products/bar-stool-64-by-artek
  - https://innes.co.uk/products/artek-ar64-barstool
  - https://www.staples.ca/products/3153250-en-homcom-counter-height-bar-stools-with-back-and-footrest-white-2-pack
  - https://www.birchlane.com/furniture/pdp/joss-main-modica-bar-and-counter-stool-b000662826.html
  - https://www.o2.co.uk/help/phones-sims-and-devices/apple/watch-series-10-watchos-11/specifications
  - https://realestate.ucsf.edu/sites/g/files/tkssra6491/f/10%2056%2026%20Manual%20UCSF%20MC%20Master%20220103.pdf
  - https://bradfordsystems.com/wp-content/uploads/2017/03/Mechanical-Assist-Shelving-Specs.pdf
---

# Furniture research

Numbers only, looks described in my words. Nothing downloaded or embedded.
Footprints, heights and positions come from `src/shared/world.ts` and
`plan.ts` and were not changed; research only set thickness, section, edge,
finish and small-part sizes.

## What I found

### Display tables
- No published dimensions for the real store tables turned up (no top
  thickness, no leg section). a measured number would replace this.
- Material: early stores pale maple, later stores white oak (secondary
  sources disagree whether the maple was solid or veneer; a forum post names a
  Salt Lake City millwork firm as maker). Unverified.
- Closest published comparable (a solid-maple butcher-block lab table, not a
  store fixture): 44 mm (1-3/4 in) solid maple top, 57 mm (2-1/4 in) square
  solid legs.
- The reference photo (`references/canberra-store.png`) shows a chunky top
  with square legs at the corners, read by eye as roughly 80 to 100 mm.
- The "forum" variant hides power and network sockets in rotating wooden
  blocks under the top. Not modelled.

### Watch table
- 2019 report: stores had two watch tables. One was a sunken cabinet: rows of
  watches below a glass panel, LED-lit, not touchable. The other had leather
  try-on mats and band shelves. One flagship replaced the cabinet with two
  rows of nine watches on pedestals customers can pick up.
- Band trays: older ones white plastic with grey fabric, newer ones white oak,
  with slots or recessed sections (one tray has 5 recessed sections, standard
  ones 10 slots).
- Watch case (current generation): 42 x 36 x 9.7 mm and 46 x 39 x 9.7 mm
  (height x width x depth).

### Bar stools
- The early service-bar stool was a round birch three/four-leg design: seat
  height 65 cm (counter) or 75 cm (bar), seat diameter about 52 to 54.5 cm
  overall footprint. A later store design used a different maker's stool in
  several heights. Neither has a back; Ritesh's photo shows wooden stools with
  backs, so those are what I modelled.
- Typical wooden counter stool with a back (retail listings): seat about
  41 x 41 cm, seat height 60 to 65 cm, backrest about 37 cm above the seat,
  overall about 91 to 97 cm, footrest about 20 to 30 cm off the floor.

### Rolling (high-density) storage
- Shelving units commonly 24 in (0.61 m) deep, default height 84 in (2.13 m),
  most systems 76 to 90 in.
- Floor rail: a steel T section about 27 mm (1-1/16 in) high on a 54 mm
  base flange. Track, wheels and carriage add about 150 to 230 mm to the
  height. Manual carriages use a three-spoke hand wheel on the end panel.

### Back of house (from the brief, standard sizes)
- Lockers 0.3 to 0.45 wide x 0.45 to 0.5 deep x 1.8 to 1.9 high.
- Desks 1.4 to 1.6 x 0.7 to 0.8 x 0.74 high.
- Euro pallet 1.2 x 0.8 x 0.144. (Australia's standard pallet is 1.165 m
  square; I know this from general knowledge, not one of the sources above.)

## What I modelled and the dimensions used

| Thing | Used |
|---|---|
| Product table top | footprint from world.ts (1.2 x 2.0), top 0.085 thick, pale maple grain along z, 6 mm lighter chamfer on the top edge |
| Table legs | 0.09 square, set in 0.05 from the corners, dark hairline seam where they meet the apron |
| Apron | 0.07 deep, set back 0.03 under the top edge |
| Watch bed (T5, T6) | recess 0.36 x 0.74, 0.035 deep, charcoal felt floor, satin metal rim 6 mm, a glass pane at the top surface and an LED line along the inside of the rim (the sunken-cabinet look) |
| Watches in the bed | 6 (two rows of 3), case 0.042 x 0.036 x 0.010, band 0.022 wide looped over a felt pillow, different band colours, rows 0.18 apart, 0.22 between watches |
| Bar stools | seat 0.70 (plan.ts), seat 0.40 diameter, 4 splayed square legs 0.035, footrest ring at 0.28, curved back rail 0.33 above the seat |
| Table stools | low round wooden stool with leather pad, seat top 0.65, footring at 0.25 |
| Service bar | top 0.06 (BAR_TOP) lighter maple, 0.3 overhang (BAR_OVERHANG), base set back, 0.1 recessed toe kick, panel seams every ~1 m, steel foot rail 0.04 dia at 0.22 |
| Wall bench | 0.12 thick slab (as before), 15 mm lighter top skin, chamfer, hidden fixing (dark shadow gap at the wall) and a soft shadow on the wall below |
| Bay shelves | plates where plan.ts puts them (0.24 deep, 25 mm), brushed-metal finish, 12 mm front lip, a lit strip under each |
| Storage racks | footprint from world.ts (2.7 x 0.62 x 2.4), 5 decks, 0.12 carriage on floor rails 27 mm high, end panels with three-spoke hand wheels, cartons |
| Lockers | footprint from world.ts (0.5 deep x 2.8 long x 1.9), 7 columns 0.4 wide x 2 tiers, louvre vents, number plates, handles |
| Manager's desk | footprint from world.ts (1.6 x 0.8 x 0.75), modesty panel, drawer pedestal, monitor, office chair |
| Break table | 1.2 x 0.9 x 0.75 (world.ts), 4 chairs, seat 0.45 |
| Pallets | footprint from world.ts (1.0 x 1.0), deck 0.144 high, cartons under shrink-wrap |

## Shared numbers that differ from the research
- Pallet footprint in world.ts is 1.0 x 1.0; a euro pallet is 1.2 x 0.8 and an
  Australian one 1.165 square. Drawn at 1.0 x 1.0 to match collision.
- Lockers 0.5 deep is at the top of the 0.45 to 0.5 range; fine.
