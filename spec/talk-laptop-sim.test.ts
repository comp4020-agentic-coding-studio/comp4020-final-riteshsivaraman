import { describe, expect, it } from "vitest";
import { newScene } from "../src/shared/talk/scenes/laptop/bank.ts";
import { randomPersona, randomStaff, runConversation, type Persona } from "../src/shared/talk/scenes/laptop/npc.ts";
import { makeRng } from "../src/shared/talk/core/rng.ts";
import type { Scene } from "../src/shared/talk/scenes/laptop/types.ts";

// Promise: whatever two NPCs do in the laptop scene, the conversation is
// well-formed, on the same invariants spec/talk-sim.test.ts checks for
// phones. Seeded, so a failure names the seed to replay.

const RUNS = 400;

function play(seed: number): { persona: Persona; scene: Scene; stuck?: string } {
  const rng = makeRng(seed);
  const persona = randomPersona(rng, `seed-${seed}`);
  const r = runConversation(persona, randomStaff(rng), rng, newScene());
  return { persona, scene: r.scene, stuck: r.stuck };
}

const results = Array.from({ length: RUNS }, (_, i) => ({ seed: i + 1, ...play(i + 1) }));

describe(`${RUNS} laptop-scene NPC-vs-NPC conversations`, () => {
  it("never leave a side without a legal move, and always end", () => {
    const bad = results.filter((r) => r.stuck).map((r) => `seed ${r.seed}: ${r.stuck}`);
    expect(bad).toEqual([]);
  });

  it("open with the greeting and end with a staff sign-off", () => {
    const bad: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      if (!(log[0]?.who === "staff" && (log[0].qid === "opening_intent" || log[0].qid === "known_model") && /^Hi, welcome in/.test(log[0].text))) bad.push(`seed ${r.seed}: opened with ${log[0]?.qid}`);
      if (r.scene.ended && !(log.at(-1)?.who === "staff" && log.at(-1)?.move === "close")) bad.push(`seed ${r.seed}: ended without a sign-off`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never end up wanting and refusing the same laptop", () => {
    const both = results.filter((r) => r.scene.fixed && r.scene.excluded.includes(r.scene.fixed)).map((r) => `seed ${r.seed}`);
    expect(both.slice(0, 5)).toEqual([]);
  });

  it("never show the same laptop twice unless the customer asks to see it again", () => {
    const repeats: string[] = [];
    for (const r of results) {
      const shown = r.scene.demoed;
      const asked = r.scene.log.some((l) => l.who === "customer" && l.move.includes("action:demo"));
      if (new Set(shown).size !== shown.length && !asked) repeats.push(`seed ${r.seed}: demoed ${shown.join(", ")}`);
    }
    expect(repeats.slice(0, 5)).toEqual([]);
  });

  it("only ask about performance or battery priority after the customer has shown they care", () => {
    const early: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      log.forEach((l, i) => {
        if (l.who !== "staff" || (l.qid !== "performance_pref" && l.qid !== "battery_priority") || l.move.includes("reopen")) return;
        const said = log.slice(0, i).filter((x) => x.who === "customer").flatMap((x) => x.picks ?? []);
        const interested = l.qid === "performance_pref" ? said.some((p) => p === "creative" || p === "gaming" || p === "dev") : said.some((p) => p === "travel");
        if (!interested) early.push(`seed ${r.seed}: ${l.qid} at turn ${l.turn}`);
      });
    }
    expect(early.slice(0, 5)).toEqual([]);
  });

  it("open warmly: the first staff line is never impatient or unsure", () => {
    const bad = results.filter((r) => !["friendly", "neutral"].includes(r.scene.log[0]!.tone)).map((r) => `seed ${r.seed}: ${r.scene.log[0]!.tone}`);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never reopen an answered question for no reason", () => {
    const bad: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      log.forEach((l, i) => {
        if (l.who !== "staff" || !l.move.includes("reopen")) return;
        const prev = log[i - 1];
        const asked = prev?.move.startsWith("action:change") || prev?.move.includes("action:change") || prev?.picks?.some((p) => p === "colour" || p === "storage") || prev?.after.rows === 0;
        if (!asked) bad.push(`seed ${r.seed} turn ${l.turn}: reopened ${l.qid}`);
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never throw back the same question twice in one conversation", () => {
    const bad: string[] = [];
    for (const r of results) {
      const seen = new Set<string>();
      for (const l of r.scene.log) {
        if (l.who !== "customer" || !l.throwback) continue;
        if (seen.has(l.throwback)) bad.push(`seed ${r.seed}: ${l.throwback} twice`);
        seen.add(l.throwback);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never ask a question twice except as a reopen or a retry after 'Not sure'", () => {
    const repeats: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      const asked = new Map<string, boolean>();
      log.forEach((l, i) => {
        if (l.who === "customer" && l.picks?.some((p) => p.startsWith("drop:"))) asked.clear();
        if (l.who !== "staff" || !l.qid) return;
        const reply = log[i + 1];
        if (l.move.includes("reopen")) {
          asked.set(l.qid, false);
        } else if (asked.has(l.qid) && !asked.get(l.qid)) {
          repeats.push(`seed ${r.seed}: ${l.qid} asked again at turn ${l.turn}`);
        }
        asked.set(l.qid, reply?.picks?.includes("notsure") ?? false);
      });
    }
    expect(repeats.slice(0, 5)).toEqual([]);
  });

  it("keep what a satisfiable customer came for in the pool until the end", () => {
    const lost: string[] = [];
    for (const r of results) {
      const t = r.persona.target;
      if (!t || r.persona.relax) continue;
      for (const l of r.scene.log) if (l.who === "customer" && l.after.rows > 0 && !l.after.models.includes(t.model) && !l.move.startsWith("action:leave")) lost.push(`seed ${r.seed} turn ${l.turn}`);
    }
    expect(lost.slice(0, 5)).toEqual([]);
  });

  it("only sell what the customer came for, and never sell to someone who cannot be satisfied", () => {
    const wrong: string[] = [];
    for (const r of results) {
      const e = r.scene.ended;
      if (e?.how !== "bought") continue;
      const t = r.persona.target;
      if (t && (e.sku.model !== t.model || e.sku.storageGb !== t.storageGb || e.sku.colour !== t.colour)) wrong.push(`seed ${r.seed}: sold ${e.sku.model} ${e.sku.storageGb} ${e.sku.colour}`);
      if (!t && !r.persona.relax) wrong.push(`seed ${r.seed}: sold to an unsatisfiable customer`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("sell to most satisfiable customers, and are not endless", () => {
    const satisfiable = results.filter((r) => r.persona.target);
    const sold = satisfiable.filter((r) => r.scene.ended?.how === "bought").length;
    expect(sold / satisfiable.length).toBeGreaterThan(0.6);
    const turns = results.map((r) => r.scene.turn);
    expect(Math.max(...turns)).toBeLessThan(80);
    expect(turns.reduce((a, b) => a + b, 0) / turns.length).toBeGreaterThan(6);
  });
});
