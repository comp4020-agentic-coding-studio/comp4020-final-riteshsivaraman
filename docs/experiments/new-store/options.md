---
status: draft, awaiting Ritesh's choice
what: Experiment only (not replacing the current store). Three layout concepts for a glassy, planted, multi-level parody store, with the render-feasibility check per component.
date: 2026-10-18
source: Ritesh's five reference photos (this session); public press coverage of Foster + Partners retail stores (Dezeen, Foster + Partners project pages); a read-only render-feasibility agent run over the repo on 2026-10-18 (cost figures are its estimates, not measured)
---

# New store experiment: options

Nothing here changes `world.ts`, `layout.json` or the current blueprint. Parody rules hold: all procedural, no real marks, brand name `[TK]`.

## What the references share (from the five photos and public coverage)
- Mature interior trees, in rows, blurring inside and outside.
- Pale stone or terrazzo floor, pale oak tables in long lines, metal-clad round columns.
- A showpiece ceiling (oculi, stepped concentric rings, or a triangulated timber lattice).
- A glass stair or void connecting levels, with a glass balustrade.
- Product wall niches lit from inside, and a large video wall.
- Public sources describe three zones (Avenue, Boardroom, Forum) as a pattern; no formal "design principles" document was found. That is an inference from press, not Apple's own words.
- Photo 2 (ornate historic theatre conversion) is a restoration of an existing building. It is not reproducible procedurally and is out of scope.

## Options (propose only; Ritesh chooses)

### A. Grove Hall (one level, double height)
A 7 m hall, full-height glass front, two rows of ~16 trees, angled clerestory light wells, oak tables in two lines, stocked wall niches both sides, service forum and video wall at the back. Closest to photo 5.
- Sim cost: none. Stays 2D.
- Render risk: low.

### B. Atrium Stair (two levels)
A central void with a glass spiral stair, round oculi above, green wall around the stair core, tables on the ground floor, service bar and boardroom on a mezzanine ring. Closest to photo 1 and 3.
- Sim cost: high. Needs a floor id (see below).
- Render risk: moderate.

### C. Canopy Pavilion (dome, water, sunken floor)
A glass dome entrance pavilion over a reflecting pool and waterfall, a bridge in, and a sunken sales floor under a timber lattice ceiling. Closest to the dome and to photo 4.
- Sim cost: moderate (a sunken floor needs a ramp or steps).
- Render risk: highest (dome overdraw, water).

## Render feasibility (agent report, read-only, nothing was run)
Budgets read from source: under ~150 added draw calls, textures max 512 px, no post-processing, no shadow maps (`docs/graphics-brief.md`); 3 lights, no shadows, env map from RoomEnvironment (`Store.tsx:449-479`). Ceiling is 3 m (`protocol.ts`), floor 12 x 18.2 m.

| Component | Verdict | Cheapest faithful technique |
|---|---|---|
| 7 m hall, glass front | CHEAP | instanced mullions, one transparent plane |
| Interior trees (10 to 24) | MODERATE | instanced trunks, planters, alpha-tested leaf quads |
| Green wall | CHEAP / MODERATE | one canvas leaf texture, optional instanced leaves |
| Glass spiral stair | MODERATE | instanced treads, fake glass, no transmission |
| Void and mezzanine ring | MODERATE | slab with hole, fake-glass strip, instanced posts |
| Oculi, stepped ceiling, clerestory | CHEAP to MODERATE | emissive discs and baked gradient, no real lights |
| Perforated timber ceiling | CHEAP | one canvas texture, not real holes |
| 30 m glass dome | MODERATE | one transparent icosphere cap plus instanced mullions |
| Pool and waterfall | MODERATE | fake reflection via env map, scrolling texture or small shader |
| Terrazzo floor, oak tables | CHEAP | 512 px canvas textures |
| Stocked niches | MODERATE | use the instanced box path; cap full device meshes near 100 to 150 |
| LED video wall | CHEAP | 256 to 512 px canvas texture, throttled |
| Metal columns, curved fascia | CHEAP | metalness 0.9 cylinders using the env map |

Top risks: (1) a floor id through `Pose`, protocol, server clamp, collisions and NPCs; (2) transparent overdraw on phones; (3) no budget for real reflections or transmission; (4) device meshes are not instanced; (5) hard-coded 3 m ceiling and 12 x 18.2 m floor in shared code.

Files a two-level store would touch (agent's list, read from source): `protocol.ts`, `pose.ts`, `world.ts`, `presence.ts`, `net.ts`, `Store.tsx`, `Npcs.tsx`, `people.ts`/`npcs.ts`/`engage.ts`/`gaze.ts`, `slots.ts`/`interaction.ts`, `mall.ts`.

## Public skills found (not installed)
- `cloudai-x/threejs-skills@threejs-fundamentals`, `-materials`, `-geometry` (12K to 15K installs): relevant to the render side.
- `curiositech/some_claude_skills@interior-design-expert` (1K installs): residential focus, retail not mentioned. Low value here.
- `eachlabs/skills@floor-plan-generation`, `architecture-rendering` (under 1K): image-generation oriented, not useful for procedural work.

## Open
- Which option to take forward `[TK]`.
- Any new store would need an ADR before touching the data model (floor id).
