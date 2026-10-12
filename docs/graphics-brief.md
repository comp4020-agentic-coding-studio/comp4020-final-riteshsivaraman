---
status: working
what: The shared brief for the four graphics specialists (phones and accessories, laptops and tablets, furniture, shell and lighting): what is fixed, what each owns, how to check work.
date: 2026-10-11
---

# Graphics brief

The store is a parody retail store (an obvious spoof; the brand name is still
`[TK]`). Three.js through React Three Fiber, **procedural only**: no downloaded
models, textures or fonts, nothing sourced from the web. Everything is drawn in
code (geometry, canvas textures, small instanced meshes).

## Real products: always photo-verify what you can (Ritesh, 2026-10-12)

A physical-layout claim (camera count/arrangement, button placement, bezel
shape, hinge mechanism) from spec-page text or pre-launch leak coverage can
be confidently wrong even with several sources agreeing — they can all be
repeating the same unconfirmed rumour (LEARNINGS.md: the iPhone 18 Pro's
camera plateau, caught only because Ritesh had a real marketing photo).
Before building a model's distinguishing shape: look at a real product photo
if one is reachable (the maker's own AU product pages, via the browser tools
— not WebFetch, which has returned unreliable content on this project more
than once) before falling back to text coverage. Where no photo was
reachable, say so plainly in your report and flag the guess in a code
comment at the relevant field — never present an unverified layout as fact.

## Never

- Use a real company's name, logo or distinctive mark anywhere in a texture or
  sign. Invent the brand marks and box art. **Product and model names may be the
  real current ones (SCOPE D37), sourced from the maker's pages, not memory.**
  Where no real name applies use generic words ("CASE") or an abstract mark.
  Do not invent the company name itself: that is `[TK]`.
- Change `src/shared/*` or any spec. Positions, sizes and heights there are the
  model the server, the collision and the drawings use. Draw on them, do not
  move them. If you believe a shared number is wrong, say so in your report.
- Run git commands (commit, stash, reset, checkout). The lead commits.
- Edit a file you do not own (see below). If you need a small shared helper,
  put it in a **new** file in `src/client/src/gfx/` named for your area.
- Read or print any file you did not need to. Do not open `references/*.png`
  except the ones listed under "Reference photos".

## Fixed heights and sizes (metres)

Table top 0.95 (TABLE_H, raised from 0.9, Ritesh 2026-10-12); wall bench top 0.95; bar top 1.05; stool seat 0.7;
ceiling 3.0; wall bands: dark low band to 0.95, mid band to 1.5, light above;
lightboxes 1.0 high from 1.55; bays 0.9 wide between 0.2 piers, shelves from
1.05 every 0.27 up to six, panel top 2.55, shelf plate 0.24 deep. Product
tables are 1.2 x 2.0 (x by z), service tables 1.8 square. A person is about
1.7 tall, radius 0.3.

## Budget

It must run on a phone and on a laptop with two tabs open: aim for under about
150 draw calls added in total across all four areas, textures at most 512 px
(most 256), no per-frame React state, animate with refs in `useFrame` only if
the effect is worth it. Use `InstancedMesh` (see `BoxField` in `common.tsx`) or
shared geometry and materials for anything repeated more than a dozen times.
No post-processing, no real shadow maps. Soft blob shadows exist (`BlobShadow`).

## Who owns what (all under `src/client/src/`)

| Area | Owns | Does |
|---|---|---|
| Phones and accessories | `gfx/phones.tsx` | phones, watches, earbuds, headphones, speakers, trackers; **packaged product boxes** with original box art on the bay shelves (`bayStock`) |
| Laptops and tablets | `gfx/computers.tsx` | laptops, tablets (with and without keyboard), monitors, desktops, their screens |
| Furniture | `gfx/furniture.tsx` | tables (and the watch bed on the centre tables), stools, wall benches, ledges, the bar, bay frames and shelves, rolling storage racks, repair benches, back-room furniture |
| Shell and lighting | `gfx/shell.tsx`, `Mall.tsx`, the lights in `Store.tsx` | floor, walls, glass, ceiling and lights, posters, lightboxes, logo, the staff door, the back room's walls and signs, the atrium |

`gfx/common.tsx` and `gfx/Device.tsx` are shared and stable: add to them only
if you must, and only additively (new exports). Do not rename or remove.

## Contracts to keep

- `phones.tsx` exports `PhoneDevice` (props: kind, x, y, z, rotY, colour; origin
  is the surface point under the product, facing rotY, 0 faces +z) and
  `bayStock(): { stock: Cuboid[]; flats: Cuboid[] }`. You may change what
  `bayStock` returns **only** together with the one place that consumes it
  (`WallSections` in `shell.tsx`): if you need richer output (several meshes,
  textured boxes) export a new component from `phones.tsx` such as `<BayStock />`
  and tell the lead, who wires it. Do not edit `shell.tsx` for that.
- `computers.tsx` exports `ComputerDevice` (same props), `Monitor` and
  `Desktop` (props x, z, side).
- `furniture.tsx` exports `Table`, `TableStool`, `WallBench`, `BayLedges`,
  `Stools`, `ServiceBar`, `bayFrames`, `StorageRacks`, `RepairBenches`,
  `BackFurniture` with the props they have now.
- `shell.tsx` exports `ShopShell`, `BackRoom`, `WallSections`, `StaffDoor`.

## Check your work

1. `mise exec -- pnpm exec tsc --noEmit` (errors in files you do not own are
   someone else's mid-edit; ignore them and recheck later).
2. The store is running with hot reload at http://localhost:5173 (and the game
   server on 8080). Take pictures with headless Chrome, **look at them**, and
   iterate; do not report from the code alone:

   ```sh
   CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   "$CH" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
     --hide-scrollbars --window-size=1280,720 --virtual-time-budget=25000 \
     --screenshot=/private/tmp/claude-503/gfx/<yourarea>-<name>.png \
     "http://localhost:5173/?shot=1&at=<x>,<z>,<yawDegrees>,<pitchDegrees>"
   ```

   `at` places the camera (eye 1.6 m above the store floor; yaw 180 faces the
   back of the shop, 0 faces the glass, 90 faces +x; pitch negative looks
   down). Useful viewpoints: entrance `0,-8.6,180`; tables `5,-3,150,-10`;
   left wall bays `5,5.5,90,-5`; right wall `-5,5.5,-90,-5`; the bar
   `0,3.5,180`; repair room `-3,20.5,180,-5`; storage `0,10.4,180`; back door
   `4.2,10.4,0` is the door from inside; the walkway and atrium
   `0,-11,0,-30`. Check the browser console is clean: add
   `--enable-logging=stderr --v=0` and grep stderr for `Uncaught`.
3. `mise exec -- pnpm exec vitest run` should stay green (the server is up).
4. A thing is not done until you have looked at a picture of it from walking
   distance (1.5 to 4 m) and it reads as that object.

## Reference photos (read only these, only if useful)

`references/canberra-store.png` (whole shop), `canberra-left-wall.png`,
`canberra-right-wall.png`, `canberra-bays.png`, `canberra-front-ceiling.png`.
They are third-party photos: study the look, never copy a mark.

## Report

End with: what you changed (files), what it looks like now (cite the picture
paths you looked at), draw-call/texture notes, anything you could not do and
why, and any shared number you think is wrong. Short.
