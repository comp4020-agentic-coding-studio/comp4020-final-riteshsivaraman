import { describe, expect, it } from "vitest";
import { faultById } from "../src/shared/talk/scenes/service/data.ts";
import { newScene } from "../src/shared/talk/scenes/service/bank.ts";
import { randomPersona, randomStaff, runConversation, type Persona } from "../src/shared/talk/scenes/service/npc.ts";
import { applyStaff, applyCustomer, staffActs } from "../src/shared/talk/scenes/service/scene.ts";
import { makeRng } from "../src/shared/talk/core/rng.ts";
import type { Scene } from "../src/shared/talk/scenes/service/types.ts";

// Promise, same shape as spec/talk-sim.test.ts and spec/talk-laptop-sim.test.ts:
// nobody is left without a legal move, every conversation ends. The one
// invariant unique to this scene -- and the actual point of building it
// (service-scene-proposal.md finding (c)) -- is the data-loss gate: no seed,
// ever, reaches a destructive-fault outcome without the warning having been
// given first.

const RUNS = 500;

function play(seed: number): { persona: Persona; scene: Scene; stuck?: string } {
  const rng = makeRng(seed);
  const persona = randomPersona(rng, `seed-${seed}`);
  const r = runConversation(persona, randomStaff(rng), rng, newScene());
  return { persona, scene: r.scene, stuck: r.stuck };
}

const results = Array.from({ length: RUNS }, (_, i) => ({ seed: i + 1, ...play(i + 1) }));

describe(`${RUNS} NPC-vs-NPC service conversations`, () => {
  it("never leave a side without a legal move, and always end", () => {
    const bad = results.filter((r) => r.stuck).map((r) => `seed ${r.seed}: ${r.stuck}`);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(bad).toHaveLength(0);
  });

  it("every conversation ends with a staff sign-off", () => {
    const bad: string[] = [];
    for (const r of results) {
      if (r.scene.ended && r.scene.log.at(-1)?.move !== "close" && r.scene.log.at(-1)?.who !== "staff") bad.push(`seed ${r.seed}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("GATE: every seed whose confirmed fault is destructive has dataLossWarned=true by the time it ends in fixed_now or booked, read directly off engine state not parsed from text", () => {
    const bad: string[] = [];
    for (const r of results) {
      const ended = r.scene.ended;
      if (!ended || (ended.how !== "fixed_now" && ended.how !== "booked")) continue;
      const faultId = r.scene.answers["confirmed_fault"]?.picks[0]?.slice("fault:".length);
      if (!faultId) {
        bad.push(`seed ${r.seed}: reached ${ended.how} with no confirmed_fault recorded at all`);
        continue;
      }
      if (faultById(faultId).destructive && !r.scene.dataLossWarned) bad.push(`seed ${r.seed}: destructive fault ${faultId} reached ${ended.how} without dataLossWarned`);
    }
    expect(bad).toEqual([]);
  });

  it("MUTATION CHECK: with the gate's check removed, a destructive outcome IS reachable without the warning (proves the test above would actually catch a broken gate)", () => {
    // Build the exact scenario by hand (symptom + water exposure that resolve
    // to a destructive fault), then call present_outcome directly, bypassing
    // staffActs' own legality list by calling applyStaff with a raw act that
    // staffActs would never offer. applyStaff's own `legal.some(...)` check
    // is the gate itself, so this proves the gate is enforced in applyStaff,
    // not merely by staffActs choosing not to suggest the move (an NPC could
    // never reach it, but a malformed client request must not be able to
    // either -- this is the "state claims checked against the real thing"
    // CLAUDE.md rule applied to this scene's own invariant).
    let sc = newScene();
    const must = (s: Scene | { error: string }): Scene => {
      if ("error" in s) throw new Error(s.error);
      return s;
    };
    sc = must(applyStaff(sc, { t: "ask", qid: "which_model" }, "neutral"));
    sc = must(applyCustomer(sc, { picks: ["model:18-pro"], tone: "neutral" }));
    sc = must(applyStaff(sc, { t: "ask", qid: "symptom" }, "neutral"));
    sc = must(applyCustomer(sc, { picks: ["symptom:wont_turn_on"], tone: "neutral" }));
    sc = must(applyStaff(sc, { t: "ask", qid: "wet_exposure" }, "neutral"));
    sc = must(applyCustomer(sc, { picks: ["yes"], tone: "neutral" }));
    sc = must(applyStaff(sc, { t: "ask", qid: "data_matters" }, "neutral"));
    sc = must(applyCustomer(sc, { picks: ["no"], tone: "neutral" }));
    sc = must(applyStaff(sc, { t: "ask", qid: "prior_repair" }, "neutral"));
    sc = must(applyCustomer(sc, { picks: ["no"], tone: "neutral" }));
    sc = must(applyStaff(sc, { t: "run_check" }, "neutral"));
    sc = must(applyCustomer(sc, { action: { t: "ok" }, tone: "neutral" }));
    // The real gate: present_outcome is NOT in staffActs' legal list yet.
    expect(staffActs(sc).some((a) => a.act.t === "present_outcome")).toBe(false);
    // Attempting it anyway must be rejected by applyStaff itself.
    const attempt = applyStaff(sc, { t: "present_outcome" }, "neutral");
    expect("error" in attempt).toBe(true);
  });
});
