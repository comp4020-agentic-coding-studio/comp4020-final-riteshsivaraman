---
status: working
what: What the shell and lighting artist learned about real flagship and mall phone stores (finishes, ceiling, lightboxes, glass, back of house, staff door hardware, atrium) and the dimensions used in the model. For Ritesh to check.
date: 2026-10-11
source:
  - https://www.e-architect.com/london/apple-shop-in-regent-street
  - https://architizer.com/projects/apple-regent-street/
  - https://parametric-architecture.com/?p=135249
  - https://www.dezeen.com/2021/11/25/reflections-shadows-la-apple-store-foster-partners/
  - https://9to5mac.com/2020/05/27/apple-store-sydney-reopening-photos/
  - https://9to5mac.com/2019/12/05/apple-store-eaton-centre-new-design/
  - https://idighardware.com/2016/01/mounting-height-alert/
  - https://quantek.co.uk/blog/dda-height-for-access-control/
  - https://www.monarchmetal.com/?p=669
  - https://www.iqglassuk.com/technical-advice/regulations-and-best-practice-for-glass-balustrades/s88644/
  - https://moderngov.stockton.gov.uk/documents/s1481/Appendix 5.pdf
---

# Shell and lighting: research notes

Written up from public articles (descriptions only, nothing downloaded or
embedded) plus the reference photos already in this folder. Where I could not
find a number I say so and give the working value I used, marked *assumed*.

## What the sources say (my words)

- **Flagship finishes.** The architect-designed flagships use a short palette:
  grey stone floors, pale timber tables, and bead-blasted stainless steel wall
  panels (Fifth Avenue renovation, via parametric-architecture). Newer stores
  move to terrazzo floors and stone walls (Eaton Centre, Sydney reopening:
  white terrazzo replaced tile).
- **Ceilings.** Flagships use very long backlit ceiling panels: an even white
  glow with an acoustic fabric face (Regent Street, Sydney's fabric-over-LED
  "membrane" ceiling). The Canberra mall store in our reference photos is the
  older mall type instead: grey slats running across the room, long recessed
  light panels in two rows either side of the centre, black track rails with
  small spot heads near the walls, and the mark hung on a rod just inside the
  glass. I modelled the photo, not the flagship.
- **Walls (from `canberra-left-wall.png`).** Big brushed-grey panels with fine
  vertical seams; a darker band below the bench, a mid band, then a light upper
  wall. The panel module looks to be about 1.2 m wide (*assumed*: no source
  gives it).
- **Lightboxes (same photo).** Recessed, glowing white boxes. The product art
  is huge and cropped: phones fanned at an angle, often cut off by the frame,
  with a white margin, and one small framed accessory picture. No text.
- **Glass front.** Full-height glass with thin steel mullions, a solid header
  band across the top, and a centre opening (the plan's 3 m is `[TK]`).
- **Back of house.** I found no authoritative standard. What turned up:
  fire-rated back-of-house doors with vision panels and closers (UK fit-out
  documents); one schedule with door leaves of 845 x 2100 mm and 100 mm walls;
  yellow floor lines on concrete to separate walkways from stock and dock
  zones. Grey painted walls and sealed concrete are my reading of that, not a
  sourced spec.
- **Staff door hardware.** Lever handles and access readers go between 34 and
  48 in (865 to 1220 mm) above the floor in US codes; UK guidance puts handles
  at 900 to 1000 mm and readers at 750 to 1000 mm. Kick plates are usually 6 to
  12 in (150 to 300 mm) high. No source for closer position (*assumed*: top of
  the leaf on the back-room side).
- **Atrium.** 1100 mm is the usual guard height for balustrades in public
  buildings, with a continuous top rail if the glass is plain toughened. No
  source for mall floor-to-floor; the model's 4.4 m sits in the 4 to 4.5 m
  range the brief gave.

## What I modelled, and the numbers

| Element | Value used | Basis |
|---|---|---|
| Shop floor tiles | 0.9 x 0.9 m, light grey stone, 7 mm joints, low roughness | *assumed*; photo shows a pale, almost jointless floor |
| Wall panel module | 1.2 m wide, seams 1 to 2 px | *assumed* from photo |
| Wall bands | dark to 0.95, mid to 1.5, light to 3.0 (gradient) | `plan.ts` (fixed) |
| Skirting | 80 mm dark charcoal | *assumed* |
| Ceiling slats | 0.25 m pitch, bevel and shadow gap | `plan.ts` |
| Light panels | 1.8 x 0.4 m, rows 1.4 m apart, soft spill on the slats | `plan.ts` |
| Track spots | every 1.1 m, heads tilted about 30 degrees to the wall | `plan.ts`; tilt *assumed* |
| Glass | mullions 50 mm, header 0.45 m | `plan.ts` |
| Staff door | 1.0 x 2.3 m leaf, lever at 1.0 m, reader at 1.1 m, kick plate 250 mm, swings 90 degrees into the back room | `plan.ts` for size and reader; handle and plate from the hardware sources |
| Back-room doorways | 1.0 m wide, 2.1 m clear with a header to the 2.6 m wall top | width from `world.ts`; 2.1 m from the 2100 mm leaf schedule |
| Back-room walls | mid-grey paint, panel seams 1.2 m, 120 mm baseboard, coloured band per area | *assumed* |
| Back-room floor | sealed concrete, saw cuts every 3 m, yellow lines at doorways | *assumed* |
| Dock roller door | 4.0 m wide (from `world.ts`), 2.6 m high, vision strip at 1.5 m | height *assumed* |
| Mall balustrade | 1.1 m glass, steel top rail | sources above |
| Mall paving | chevron terrazzo with metal divider strips | reference photo (per the task) |

All brand marks, signs and artwork in the scene are invented; no real names or
marks.
