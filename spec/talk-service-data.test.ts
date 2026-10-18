import { describe, expect, it } from "vitest";
import { FAULTS, faultById, runCheck, SYMPTOM_LABEL } from "../src/shared/talk/scenes/service/data.ts";

// Promise: the fault table is internally consistent (every symptom has at
// least one candidate, every fault id is unique) and run_check is genuinely
// deterministic, not a dice roll (G1's own note, quoted in
// docs/conversation-model/conversation-types.md).

describe("the fault table", () => {
  it("has a unique id per fault", () => {
    const ids = FAULTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least one candidate fault for every symptom", () => {
    for (const symptom of Object.keys(SYMPTOM_LABEL)) {
      expect(FAULTS.some((f) => f.symptom === symptom)).toBe(true);
    }
  });

  it("faultById throws on an unknown id, never returns undefined silently", () => {
    expect(() => faultById("not-a-real-fault")).toThrow();
  });
});

describe("runCheck is deterministic", () => {
  it("returns the same fault every time for the same inputs", () => {
    for (let i = 0; i < 20; i++) {
      expect(runCheck("wont_charge", true)).toEqual(runCheck("wont_charge", true));
      expect(runCheck("wont_charge", false)).toEqual(runCheck("wont_charge", false));
    }
  });

  it("points at a water-related fault when water exposure is confirmed, if one exists for that symptom", () => {
    const withWater = FAULTS.some((f) => f.symptom === "wont_charge" && f.waterRelated);
    expect(withWater).toBe(true);
    expect(runCheck("wont_charge", true).waterRelated).toBe(true);
  });

  it("never points at a water-related fault when water exposure is false", () => {
    for (const symptom of Object.keys(SYMPTOM_LABEL) as (keyof typeof SYMPTOM_LABEL)[]) {
      expect(runCheck(symptom, false).waterRelated).toBe(false);
    }
  });

  it("returns the lowest-likelihoodRank non-water fault when water exposure is not confirmed true", () => {
    const nonWater = FAULTS.filter((f) => f.symptom === "cracked_screen" && !f.waterRelated).sort((a, b) => a.likelihoodRank - b.likelihoodRank);
    expect(runCheck("cracked_screen", false).id).toBe(nonWater[0]!.id);
    expect(runCheck("cracked_screen", undefined).id).toBe(nonWater[0]!.id);
  });
});
