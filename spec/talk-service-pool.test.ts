import { describe, expect, it } from "vitest";
import { poolOf, rank } from "../src/shared/talk/scenes/service/pool.ts";

// Promise: a pool of explanations, not a catalogue (service-scene-proposal.md
// finding (a)) -- empty with no symptom, populated by the symptom (a route
// question, not a hard filter on an existing pool), narrowed by a confirmed
// water exposure, and resolved to exactly one once run_check has written a
// confirmedFault.

describe("the service pool", () => {
  it("is empty with no symptom (the pool starts empty, unlike a product catalogue)", () => {
    expect(poolOf({})).toEqual([]);
  });

  it("populates once a symptom is given", () => {
    expect(poolOf({ symptom: "wont_charge" }).length).toBeGreaterThan(0);
  });

  it("a confirmed 'no' to water exposure never leaves a water-related fault in the pool", () => {
    const pool = poolOf({ symptom: "wont_charge", wetExposure: false });
    const faults = pool.map((r) => r.fault);
    expect(faults).not.toContain("liquid_damage_charge");
  });

  it("not-stated water exposure never eliminates a water-related fault (a null attribute keeps it)", () => {
    const pool = poolOf({ symptom: "wont_charge" });
    const faults = pool.map((r) => r.fault);
    expect(faults).toContain("liquid_damage_charge");
  });

  it("a confirmedFault narrows the pool to exactly that one row", () => {
    const pool = poolOf({ symptom: "wont_charge", confirmedFault: "port_debris" });
    expect(pool).toHaveLength(1);
    expect(pool[0]!.fault).toBe("port_debris");
  });

  it("ranks the most likely cause first when nothing has been confirmed yet", () => {
    const pool = poolOf({ symptom: "wont_charge" });
    const ranked = rank(pool, {});
    expect(ranked[0]!.fault.id).toBe("port_debris"); // likelihoodRank 1, the lowest non-water rank
  });
});
