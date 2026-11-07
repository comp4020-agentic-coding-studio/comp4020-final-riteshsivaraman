---
name: gen-image
description: Generate concept/mockup images via the COMP4020 strproxy image API (Flux etc), download them immediately before the URL expires, and check the shared course image budget before and after. Use when the user asks to generate, render, or mock up images for this project, or asks about remaining image-gen budget.
---

# gen-image

Wraps the course's image-generation proxy
(`comp4020:handbook` → `topics/generating-images`). Images are illustrative
concept art only — never a substitute for this repo's procedural graphics
(see `docs/graphics-brief.md`, D44 in `SCOPE.md`).

Shared flat budget across the whole course, not per-student. Check it, don't
assume it.

## Steps

1. **Check budget first**: `.claude/skills/gen-image/scripts/budget.sh | jq .`
   Shows `image_budget`, `image_spend`, `image_budget_remaining`, and the live
   model list with per-image price. If remaining budget is low (under ~$1, or
   under the cost of the batch about to run), tell the user and confirm
   before proceeding rather than burning the rest silently.
2. **Generate each image**:
   ```
   .claude/skills/gen-image/scripts/gen.sh <out-dir> <slug> "<prompt>" [model] [size]
   ```
   - `out-dir`: where to save, e.g. `docs/experiments/<name>/concept-art`
   - `slug`: short filename stem, no spaces (e.g. `b-atrium-stair-blueprint`)
   - `model` default `flux-1.1-pro`, `size` default `1792x1024` — override
     only if the user asks for something else from the live model list.
   - The script downloads the result immediately (URLs on the delivery CDN
     expire) and prints the saved path. It cleans up its own temp response
     file and never prints the auth token.
3. **Open the results** for the user (`open <path>` on macOS) rather than
   just naming the file.
4. **Report spend**: after generating, note how much was spent this call
   (`n images × price_usd`) and the new remaining balance — re-run
   `budget.sh` if the user wants the confirmed live figure rather than the
   arithmetic estimate.

## Notes

- One `gen.sh` call = one image. Loop it for multiple prompts/options.
- Prompts should stay parody-safe per this repo's rules: no real brand names,
  logos or marks — describe the fictional/generic version.
- If `ANTHROPIC_AUTH_TOKEN` isn't set, or the course network/VPN isn't
  reachable, the scripts fail loudly rather than hanging — report the error,
  don't retry blindly.
