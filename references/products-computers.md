---
status: working
what: Real product dimensions and looks the laptops, tablets, monitors and desktops in the store scene are scaled from, and what the scene uses for each (all names and marks in the scene are invented).
date: 2026-10-11
source:
  - https://www.apple.com/macbook-air/specs/
  - https://www.apple.com/macbook-pro/specs/
  - https://www.apple.com/ipad-pro/specs/
  - https://www.apple.com/ipad-air/specs/
  - https://www.apple.com/ipad-11/specs/
  - https://www.apple.com/ipad-keyboards/
  - https://www.apple.com/imac/specs/
  - https://www.apple.com/studio-display/specs/
---

# Products: laptops, tablets, monitors, desktops

Numbers marked **sourced** came from the pages above (fetched 2026-10-11).
Numbers marked **estimate** are mine: the pages don't give them (bezel widths,
lid/base split, display-housing thickness, chin height, stand plate sizes).
Ritesh: check the estimates if they matter. Nothing from those pages is copied
into a texture. In the scene the products have no names, just generic words
on the one spec-sheet screen ("LAPTOP 14", "TABLET") and the same invented
ring-and-dot mark the phones use.

## Devices

| Product (real) | Dimensions, sourced | Scene model (m) | Look used |
|---|---|---|---|
| Thin-and-light laptop, 13-inch class (13.6", 2560 x 1664) | 304.1 x 215 x 11.3 mm | 0.304 x 0.215 x 0.0113 (base 0.0068 + lid 0.0045, estimate split) | rounded-corner unibody, flat sides; full-width keyboard (no side grilles, the real one hides speakers in the hinge), big trackpad; lid open 105 deg |
| Thin-and-light laptop, 15-inch class (15.3", 2880 x 1864) | 340.4 x 237.6 x 11.5 mm | not modelled (tables fit 0.43 m pitch; noted only) | |
| Pro laptop, 14-inch class (14.2", 3024 x 1964) | 312.6 x 221.2 x 15.5 mm | 0.3126 x 0.2212 x 0.0155 (base 0.0100 + lid 0.0055, estimate split) | thicker, rounded unibody; keyboard flanked by two speaker grilles; trackpad; lid open 105 deg |
| Pro laptop, 16-inch class (16.2") | 355.7 x 248.1 x 16.8 mm | not modelled | |
| Tablet, 11-inch pro | 249.7 x 177.5 x 5.3 mm | 0.2497 x 0.1775 x 0.0053 | rounded corners (radius ~0.011, estimate), thin even bezel (~0.007, estimate), front camera on the long edge (the pages say the front camera sits on the landscape side), camera bump back corner, two buttons on the top edge |
| Tablet, 13-inch pro | 281.6 x 215.5 x 5.1 mm | 0.2816 x 0.2155 x 0.0051 | same look, larger |
| Tablet, 11-inch air | 247.6 x 178.5 x 6.1 mm | noted only (same size class as the pro) | |
| Tablet, basic 11-inch | 248.6 x 179.5 x 7 mm | noted only | |
| Tablet keyboard, pro/air style | dimensions not published on the pages fetched | 0.25 x 0.19 x 0.006 keyboard base (estimate) | page says: a function row, a built-in trackpad, the tablet floats on a cantilever arm with an adjustable angle. Scene: keyboard base with a function row and trackpad, an arm rising from its back edge, the tablet held in front of it with its bottom edge floating over the function row; whole thing on a low dark wedge display stand (store fixture, invented) |
| All-in-one desktop, 24-inch class (23.5" visible, 4480 x 2520) | 547 x 461 mm (w x h with stand); stand 147 / 130 mm (the page's labels are garbled: one is stand depth, one stand width) | 0.47 x 0.40 (scaled 0.86, see note), panel 0.0115 thick (commonly quoted, not on the page fetched: estimate) | very thin flat panel, light bezel around the screen, a colour-matched chin below it, a bent-plate stand; colour line on the real one: blue, purple, pink, orange, yellow, green, silver. Scene: five invented pastel finishes (blue, green, pink, silver, apricot), compact keyboard and an oval mouse in front |
| Standalone display, 27-inch class (5120 x 2880) | 623 x 478 mm (w x h with tilt stand), stand depth 168 mm; 31 mm deep with VESA adapter | 0.623 x 0.478, stand 0.168 deep, housing 0.02 thick (estimate) | thin even black bezel (~0.013, estimate), aluminium housing, single bent-plate stand rising from a flat foot to the back of the display |

## Details used across the models

- Finishes: the scene's six `DEVICE_COLOURS` stand in for the real line-ups.
  The dark graphite and silver go on the pro laptop (the real pro is sold in
  a black and a silver); the four lighter or tinted ones go on the
  thin-and-light (the real one comes in sky blue, silver, starlight, midnight).
  Tablets take the 11-inch or 13-inch body by colour too.
- Ports (sourced): thin-and-light has charging + two USB-C on the left, a
  headphone jack on the right; pro adds HDMI and a card slot on the right. Not
  modelled: too small to read from 1.5 m.
- Display aspect: laptops about 1.54:1 (from the resolutions above), tablets
  about 1.4:1, desktop and display 16:9.
- Camera: drawn as a dot in the top bezel (I left out the notch the real
  laptops have, to avoid copying a distinctive look).

## Note for the lead: one shared number

`SIDE_WALL["-x"]` puts the five desktops at a 0.5 m pitch. A real 24-inch
all-in-one is 0.547 m wide, so at true size neighbours would overlap by
about 5 cm. I scaled the desktops to 0.47 m wide. If true size matters,
the pitch would need to be about 0.6 m (the row would then be 2.4 m long,
not 2.0 m).
