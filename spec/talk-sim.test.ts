import { describe, expect, it } from "vitest";
import { newScene } from "../src/shared/talk/bank.ts";
import { randomPersona, randomStaff, runConversation, type Persona } from "../src/shared/talk/npc.ts";
import { makeRng } from "../src/shared/talk/rng.ts";
import type { Scene } from "../src/shared/talk/types.ts";

// Promise: whatever two NPCs do, the conversation is well-formed. Nobody is
// ever left without a legal move, every conversation ends, a question is not
// asked twice unless it is an explicit reopen (or a "Not sure" storage/colour
// being asked again), a customer who can be satisfied is never offered a pool
// that has lost the thing they came for, and one who cannot never buys.
// Seeded, so a failure names the seed to replay.

const RUNS = 400;

function play(seed: number): { persona: Persona; scene: Scene; stuck?: string } {
  const rng = makeRng(seed);
  const persona = randomPersona(rng, `seed-${seed}`);
  const r = runConversation(persona, randomStaff(rng), rng, newScene());
  return { persona, scene: r.scene, stuck: r.stuck };
}

const results = Array.from({ length: RUNS }, (_, i) => ({ seed: i + 1, ...play(i + 1) }));

describe(`${RUNS} NPC-vs-NPC conversations`, () => {
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

  it("never show the same phone twice unless the customer asks to see it again", () => {
    const repeats: string[] = [];
    for (const r of results) {
      const shown = r.scene.demoed;
      const asked = r.scene.log.some((l) => l.who === "customer" && l.move.includes("action:demo"));
      if (new Set(shown).size !== shown.length && !asked) repeats.push(`seed ${r.seed}: demoed ${shown.join(", ")}`);
    }
    expect(repeats.slice(0, 5)).toEqual([]);
  });

  it("never offer a demo of the phone the customer has already chosen and seen", () => {
    const bad: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      let fixedAndSeen = false;
      log.forEach((l, i) => {
        if (l.who === "customer" && l.picks?.includes("happy")) fixedAndSeen = true;
        if (l.who === "staff" && l.move === "offer_demo" && fixedAndSeen && l.after.models.length === 1) bad.push(`seed ${r.seed} turn ${l.turn}`);
        void i;
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("only ask about the telephoto lens or the battery after the customer has said it matters", () => {
    const early: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      log.forEach((l, i) => {
        if (l.who !== "staff" || (l.qid !== "telephoto_need" && l.qid !== "battery_priority") || l.move.includes("reopen")) return;
        const said = log.slice(0, i).filter((x) => x.who === "customer").flatMap((x) => x.picks ?? []);
        const interested = l.qid === "telephoto_need" ? said.some((p) => p === "photos" || p === "video") : said.some((p) => p === "travel" || p === "streaming");
        if (!interested) early.push(`seed ${r.seed}: ${l.qid} at turn ${l.turn}`);
      });
    }
    expect(early.slice(0, 5)).toEqual([]);
  });

  it("never ask a question twice except as a reopen or a retry after 'Not sure'", () => {
    const repeats: string[] = [];
    for (const r of results) {
      const log = r.scene.log;
      const asked = new Map<string, boolean>(); // question -> was the last answer "Not sure"
      log.forEach((l, i) => {
        // Agreeing to drop a requirement forgets the answers behind it, so those questions may be asked afresh.
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
      if (t && (e.sku.model !== t.model || e.sku.storage !== t.storage || e.sku.colour !== t.colour)) wrong.push(`seed ${r.seed}: sold ${e.sku.model} ${e.sku.storage} ${e.sku.colour}`);
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
