#!/usr/bin/env node
// Writes the store blueprints from the shared model (src/shared/blueprint.ts):
//   docs/blueprint/canberra-plan.svg     top-down plan of the shop and back room
//   docs/blueprint/canberra-mall.svg     the mall around it, and the routes
//   docs/blueprint/canberra-walls.svg    the four wall elevations
//   docs/blueprint/canberra-ceiling.svg  ceiling slats and lights
//   docs/blueprint/canberra-blueprint.html  all of it on printable pages; print it
//     to PDF with Chrome (see the command in docs/blueprint/README.md)
// Run: node scripts/blueprint.ts   (spec/blueprint.test.ts fails if these are stale)
import { mkdirSync, writeFileSync } from "node:fs";
import { renderCeiling, renderDocument, renderMallPlan, renderPlan, renderWalls } from "../src/shared/blueprint.ts";

mkdirSync("docs/blueprint", { recursive: true });
writeFileSync("docs/blueprint/canberra-plan.svg", renderPlan());
writeFileSync("docs/blueprint/canberra-mall.svg", renderMallPlan());
writeFileSync("docs/blueprint/canberra-walls.svg", renderWalls());
writeFileSync("docs/blueprint/canberra-ceiling.svg", renderCeiling());
writeFileSync("docs/blueprint/canberra-blueprint.html", renderDocument());
console.log("wrote the plan, wall elevations and ceiling drawings to docs/blueprint/");
