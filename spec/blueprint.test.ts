import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderCeiling, renderPlan, renderWalls } from "../src/shared/blueprint.ts";

// Promise: the blueprints Ritesh approves and the model the 3D scene and the
// server are built from are the same. The drawings are generated from the
// shared model, so if someone changes a dimension without regenerating and
// re-approving them, this fails. Regenerate with `node scripts/blueprint.ts`.

it("has a committed floor plan that matches the model", () => {
  expect(readFileSync("docs/blueprint/canberra-plan.svg", "utf8")).toBe(renderPlan());
});

it("has committed wall elevations that match the model", () => {
  expect(readFileSync("docs/blueprint/canberra-walls.svg", "utf8")).toBe(renderWalls());
});

it("has a committed ceiling drawing that matches the model", () => {
  expect(readFileSync("docs/blueprint/canberra-ceiling.svg", "utf8")).toBe(renderCeiling());
});
