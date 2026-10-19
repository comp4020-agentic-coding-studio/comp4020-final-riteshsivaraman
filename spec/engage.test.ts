import { describe, expect, it } from "vitest";
import { engagedMoment, rejoinMoment, servicePoint, STAND_OFF } from "../src/shared/engage.ts";
import { lookFor, withLook, validateLook } from "../src/shared/look.ts";
import { headingTo, wrap } from "../src/shared/steering.ts";
import { momentOf } from "../src/shared/storeday.ts";
import { appearanceFor } from "../src/shared/appearance.ts";

// Promise: an NPC that a visitor is talking to walks over, faces them, and when
// let go walks back to where the day has got to, with no jump at either end;
// and a visitor looks the same wherever the look is built.
const T = 5_000_000; // an arbitrary moment of the day
const NPC = "spec-phones";

describe("an NPC being served", () => {
  const visitor = { x: -1.6, z: -1.2 }; // in the lane between two table columns
  const e = { npcId: NPC, visitorId: "v", since: T, at: visitor };

  it("starts exactly where the timetable had it, so there is no jump when it is taken", () => {
    const a = momentOf(NPC, T);
    const b = engagedMoment(NPC, e, T);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05);
  });

  it("walks over at a walking pace, never faster", () => {
    let prev = engagedMoment(NPC, e, T);
    for (let t = 100; t < 30_000; t += 100) {
      const m = engagedMoment(NPC, e, T + t);
      expect(Math.hypot(m.x - prev.x, m.z - prev.z) / 0.1).toBeLessThan(2.5);
      prev = m;
    }
  });

  it("ends up in front of the visitor, facing them, no longer walking", () => {
    const m = engagedMoment(NPC, e, T + 60_000);
    expect(m.walking).toBe(false);
    expect(Math.hypot(m.x - visitor.x, m.z - visitor.z)).toBeCloseTo(STAND_OFF, 1);
    expect(Math.abs(wrap(headingTo(m.x, m.z, visitor.x, visitor.z) - m.ry))).toBeLessThan(0.05);
    expect(m.mode).toBe("talk");
  });

  it("stands the same way for everyone who computes it", () => {
    expect(engagedMoment(NPC, e, T + 25_000)).toEqual(engagedMoment(NPC, e, T + 25_000));
  });

  it("puts the service point towards where it came from, not behind the visitor", () => {
    const p = servicePoint({ x: -5, z: -1 }, { x: 0, z: -1 });
    expect(p.x).toBeCloseTo(-STAND_OFF);
    expect(p.z).toBeCloseTo(-1);
  });
});

describe("an NPC let go", () => {
  const from = { x: -1.6, z: -2.4 }; // open floor, not inside a table
  const r = { at: T, from };

  it("starts where it stood, and walks back without a jump", () => {
    const m0 = rejoinMoment(NPC, r, T)!;
    expect(Math.hypot(m0.x - from.x, m0.z - from.z)).toBeLessThan(0.05);
    let prev = m0;
    let t = 100;
    for (; t < 90_000; t += 100) {
      const m = rejoinMoment(NPC, r, T + t);
      if (!m) break;
      expect(Math.hypot(m.x - prev.x, m.z - prev.z) / 0.1, `at +${t}`).toBeLessThan(2.5);
      prev = m;
    }
    expect(t).toBeLessThan(60_000); // it does get back
  });

  it("hands over to the timetable exactly where the timetable has it", () => {
    let last = rejoinMoment(NPC, r, T)!;
    let t = 100;
    for (; t < 90_000; t += 100) {
      const m = rejoinMoment(NPC, r, T + t);
      if (!m) break;
      last = m;
    }
    const day = momentOf(NPC, T + t);
    expect(Math.hypot(last.x - day.x, last.z - day.z)).toBeLessThan(0.6);
  });
});

describe("a look", () => {
  it("is built from the seed the visitor chose, so a preview matches what others see", () => {
    const a = lookFor("some-visitor-id", { seed: "abc123", skin: "#8d5a3b" });
    const b = lookFor("a-different-visitor-id", { seed: "abc123", skin: "#8d5a3b" });
    expect(a).toEqual(b);
    expect(a.skin).toBe("#8d5a3b");
    expect(lookFor("x", { seed: "abc123" }).height).toBe(appearanceFor("abc123").height);
  });

  it("uses the id when there is no seed, and leaves the base alone with no choices", () => {
    expect(lookFor("someone", undefined)).toEqual(appearanceFor("someone"));
    expect(withLook(appearanceFor("q"), undefined)).toEqual(appearanceFor("q"));
  });

  it("only accepts a plain seed", () => {
    expect(validateLook({ seed: "abc_DEF-123" }).seed).toBe("abc_DEF-123");
    expect(validateLook({ seed: "x y" }).seed).toBeUndefined();
    expect(validateLook({ seed: "<script>" }).seed).toBeUndefined();
    expect(validateLook({ seed: "x".repeat(40) }).seed).toBeUndefined();
  });
});

describe("walking over to a visitor never goes through furniture", () => {
  // Ritesh, 2026-10-19: "don't let staff walk through a table during convo".
  // Every point of the route, and the spot they stop at, is clear floor for staff.
  it("stops and routes only over floor staff can stand on, wherever the visitor is", async () => {
    const { planPath } = await import("../src/shared/storeday.ts");
    const { solidsFor, clampToWalkable } = await import("../src/shared/world.ts");
    const solids = solidsFor("staff");
    const inside = (p: { x: number; z: number }) => solids.some((b) => Math.abs(p.x - b.x) < b.w / 2 - 0.02 && Math.abs(p.z - b.z) < b.d / 2 - 0.02);
    let checked = 0;
    for (const id of ["spec-phones", "spec-phones-2", "greeter-1", "genius-1"]) {
      for (const t of [0, 120, 300]) {
        const start = momentOf(id, t * 1000);
        if (!start.present) continue;
        for (let x = -5; x <= 5; x += 1.25) {
          for (let z = -8; z <= 8.5; z += 1.25) {
            const v = clampToWalkable("customer", x, z);
            if (Math.hypot(v.x - x, v.z - z) > 0.05 || solids.some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2)) continue;
            const goal = servicePoint(start, v);
            expect(inside(goal), `${id} stops in furniture for a visitor at (${x}, ${z}): (${goal.x.toFixed(2)}, ${goal.z.toFixed(2)})`).toBe(false);
            const bad = planPath({ x: start.x, z: start.z }, goal, "staff").pts.find(inside);
            expect(bad, `${id} walks through furniture to a visitor at (${x}, ${z})`).toBeUndefined();
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe("people read as the gender they are", () => {
  // Ritesh, 2026-10-19: "some female name employees look like male employees"
  it("draws every named NPC as the gender their name says, with hair to match", async () => {
    const { NPC_NAME } = await import("../src/shared/duty.ts");
    const { npcLook } = await import("../src/shared/look.ts");
    const { genderOfName } = await import("../src/shared/names.ts");
    let women = 0;
    for (const [id, name] of Object.entries(NPC_NAME)) {
      const look = npcLook(id, name);
      expect(look?.gender, `${id} (${name})`).toBe(genderOfName(name));
      const a = lookFor(id, look);
      if (look?.gender === "female") {
        women++;
        expect(["long", "bun"], `${name}'s hair`).toContain(a.hairStyle);
        expect(a.beard).toBe("none");
      } else {
        expect(["long", "bun"], `${name}'s hair`).not.toContain(a.hairStyle);
      }
    }
    expect(women).toBeGreaterThan(5);
  });

  it("overrides a saved short cut on a woman and a long one on a man", () => {
    expect(withLook(appearanceFor("x"), { gender: "female", hairStyle: "buzz" }).hairStyle).toBe("long");
    expect(withLook(appearanceFor("x"), { gender: "male", hairStyle: "long" }).hairStyle).toBe("short");
  });
});
