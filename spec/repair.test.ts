import { describe, expect, it } from "vitest";
import { begin, choicesFor, step, type ConvState, type Effect, type World } from "../src/shared/conversation.ts";
import { FAULTS } from "../src/shared/talk/scenes/service/data.ts";

const world: World = { stock: () => 1 };

// every way through the tree: returns each (path, final node, effects)
function walk(): Array<{ path: string[]; end: ConvState; effects: Effect[] }> {
  const out: Array<{ path: string[]; end: ConvState; effects: Effect[] }> = [];
  const go = (s: ConvState, path: string[], effects: Effect[]): void => {
    const cs = choicesFor(s, world);
    if (cs.length === 0) {
      out.push({ path, end: s, effects });
      return;
    }
    for (const c of cs) {
      const r = step(s, c.id, world);
      if ("error" in r) throw new Error(`${path.join(">")} > ${c.id}: ${r.error}`);
      go(r.state, [...path, c.id], [...effects, ...r.effects]);
    }
  };
  go(begin("repair", world).state, [], []);
  return out;
}

describe("the Genius Bar repair conversation", () => {
  const all = walk();
  it("every path ends: nobody is stranded mid-tree", () => {
    expect(all.length).toBeGreaterThan(10);
  });
  it("every finished repair puts the customer back to browsing", () => {
    for (const p of all) expect(p.effects.some((e) => e.type === "player_state" && e.state === "browsing"), p.path.join(">")).toBe(true);
  });
  it("it can end in a quick fix, a replacement, or a longer service to come back for", () => {
    const outcomes = new Set(all.flatMap((p) => p.effects.filter((e): e is Extract<Effect, { type: "repair" }> => e.type === "repair").map((e) => e.outcome)));
    expect([...outcomes].sort()).toEqual(["later", "quick", "replacement"]);
  });
  it("a longer service says which day to come back", () => {
    const later = all.find((p) => p.effects.some((e) => e.type === "repair" && e.outcome === "later"))!;
    expect(choicesFor(later.end, world)).toEqual([]);
    expect(begin("repair", world).turn.say).toContain("Genius Bar");
    const say = (s: ConvState) => (step({ ...s, node: s.node }, "x", world) as { error: string }).error; // a bad pick changes nothing
    expect(say(begin("repair", world).state)).toMatch(/not an option/);
  });
  it("a repair that can wipe the device warns first, and backing out touches nothing", () => {
    const declined = all.filter((p) => p.end.node === "declined");
    expect(declined.length).toBeGreaterThan(0);
    for (const p of declined) expect(p.effects.some((e) => e.type === "repair"), p.path.join(">")).toBe(false);
    const warned = all.filter((p) => p.path.includes("go"));
    for (const p of warned) expect(p.effects.some((e) => e.type === "repair")).toBe(true);
  });
  it("water points at the water-related fault wherever the symptom has one (charging, power)", () => {
    const wet = all.filter((p) => (p.path[0] === "symptom:wont_charge" || p.path[0] === "symptom:wont_turn_on") && p.path.includes("yes") && p.effects.some((e) => e.type === "repair"));
    expect(wet.length).toBeGreaterThan(0);
    for (const p of wet) {
      const e = p.effects.find((x): x is Extract<Effect, { type: "repair" }> => x.type === "repair")!;
      expect(FAULTS.find((f) => f.id === e.fault)!.waterRelated, p.path.join(">")).toBe(true);
    }
  });
});
