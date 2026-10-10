#!/usr/bin/env node
// Writes the store blueprints from the shared model (src/shared/blueprint.ts):
//   docs/blueprint/canberra-plan.svg     top-down floor plan
//   docs/blueprint/canberra-walls.svg    the four wall elevations
//   docs/blueprint/canberra-ceiling.svg  ceiling slats and lights
// Run: node scripts/blueprint.ts   (spec/blueprint.test.ts fails if these are stale)
import { mkdirSync, writeFileSync } from "node:fs";
import { renderCeiling, renderPlan, renderWalls } from "../src/shared/blueprint.ts";

mkdirSync("docs/blueprint", { recursive: true });
writeFileSync("docs/blueprint/canberra-plan.svg", renderPlan());
writeFileSync("docs/blueprint/canberra-walls.svg", renderWalls());
writeFileSync("docs/blueprint/canberra-ceiling.svg", renderCeiling());
console.log("wrote the plan, wall elevations and ceiling drawings to docs/blueprint/");
