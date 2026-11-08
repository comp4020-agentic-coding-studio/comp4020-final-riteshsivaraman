---
status: draft
what: What in the store comes from somewhere else, who made it, and what credit or notice it needs. Checked by Claude on 2026-11-09 against the repo and the production dependencies; items marked [TK] could not be established from the record.
date: 2026-11-09
---

# Credits and assets

Almost everything is made in the code: the building, furniture, people, faces, devices, signage art and every sound are generated procedurally. No downloaded 3D models, textures, fonts, music or sound effects are in the repo or the shipped app.

## Generated pictures

| What | Where | Made with | Notes |
|---|---|---|---|
| Nine wall and lightbox posters | `src/client/public/posters/*.webp` | The course image proxy, model `flux-1.1-pro` (commit `eff4a52`, SCOPE D45) | Prompts asked for no text, logos or brand names. AI-generated: say so wherever the project is presented. |
| The store's logo (three files) | `src/client/public/brand/*.png`; options in `docs/experiments/logo/` | The course image proxy (commit `5946a20`); which model: [TK] | AI-generated, picked from four options. |

## Real-world names and data

- Product names, specifications and prices in the catalogue are taken from Apple's public Australian website, fetched 2026-10-12 (`src/shared/catalogue.ts`, SCOPE D37). "iPhone" and the other product names are Apple's trademarks. This is a university course prototype that is not affiliated with, or endorsed by, Apple. The store is a fictional one, and the fault table's turnaround days, cost bands and replacement odds are invented (marked as such in `src/shared/talk/scenes/service/data.ts`).
- Third-party photographs used while scoping are kept local and git-ignored (`references/README.md`); none are published or shipped.

## Code we use

All production dependencies are permissively licensed. 105 packages: 86 MIT, 9 ISC, 7 Apache-2.0, 1 BSD-3-Clause, 1 "MIT or WTFPL", 1 "BSD-2-Clause or MIT or Apache-2.0"; none are GPL, unknown or proprietary. The ones that matter most:

- three.js (MIT) with React Three Fiber and drei (MIT): the 3D scene.
- React (MIT), Vite (MIT), Hono (MIT) with `@hono/node-server`, `ws` (MIT), better-sqlite3 (MIT), tsx (MIT).
- Pulled in by drei and used only if the feature is used: Rapier (`@dimforge/rapier3d-compat`, Apache-2.0), MediaPipe tasks (Apache-2.0), Draco (Apache-2.0), hls.js (Apache-2.0).

The licences ask that their copyright and licence text stay with copies of the code. Each package's `LICENSE` is in `node_modules/<name>/` and is what `pnpm licenses list --prod` reports; if this is ever distributed as source or a bundle outside this repo and the deployed app, add the full texts.

## Fonts and sound

Text uses the system's own fonts (`system-ui`, `ui-monospace` and a handwriting stack): no font files are shipped. Music, chatter and cues are synthesised in the browser with the Web Audio API; there are no audio files (a spec, `spec/11-procedural-soundscape.test.ts`, fails if one is added).
