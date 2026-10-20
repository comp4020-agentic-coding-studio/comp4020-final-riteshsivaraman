import { describe, expect, it } from "vitest";
import { derive, newScene } from "../src/shared/talk/scenes/laptop/bank.ts";
import { customerLine } from "../src/shared/talk/scenes/laptop/lines.ts";
import { customerMove, randomPersona, randomStaff, runConversation, staffMove, type Memory } from "../src/shared/talk/scenes/laptop/npc.ts";
import { makeRng } from "../src/shared/talk/core/rng.ts";
import { applyCustomer, applyStaff, customerMenu } from "../src/shared/talk/scenes/laptop/scene.ts";
import { TONE_EXPRESSION, TONES, type Scene, type Tone } from "../src/shared/talk/scenes/laptop/types.ts";

// Promise: what the characters say in the laptop scene reads as English, the
// same promise spec/talk-lines.test.ts makes for phones. The exact wording
// differs (this scene's own placeholders), but the shape of what is
// checked -- no bare menu label, no stacked acknowledgements, tone maps to a
// real face, menu text never equals speech -- is identical.

const ok = (r: Scene | { error: string }): Scene => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const asked = (qid: string): Scene => {
  let sc = ok(applyStaff(newScene(), { t: "ask", qid: "opening_intent" }, "neutral"));
  sc = ok(applyCustomer(sc, { picks: ["help"], tone: "neutral" }));
  return ok(applyStaff(sc, { t: "ask", qid } as never, "neutral"));
};
const said = (qid: string, picks: string[], tone: Tone): string => ok(applyCustomer(asked(qid), { picks, tone })).log.at(-1)!.text;

describe("laptop customer wording", () => {
  it("says 'not sure' as a sentence in every tone, with nothing in front of it", () => {
    for (const tone of TONES) {
      const t = said("use_case", ["notsure"], tone);
      expect(t, tone).toMatch(/not sure|don't know/i);
      expect(t, tone).toMatch(/^[A-Z]/);
    }
  });

  it("says a budget and a model as sentences in every tone", () => {
    for (const tone of TONES) {
      const t = said("budget_ceiling", ["ceiling:2500"], tone);
      expect(t, tone).toMatch(/A\$2,500/);
      expect(t, tone).toMatch(/[.?!]$/);
    }
    let sc = ok(applyStaff(newScene(), { t: "ask", qid: "known_model" }, "neutral"));
    sc = ok(applyCustomer(sc, { picks: ["model:air-13"], tone: "friendly" }));
    expect(sc.log[1]!.text).toContain("MacBook Air 13-inch");
    expect(sc.log[1]!.text).toMatch(/^[A-Z]/);
  });

  it("joins several answers into one sentence", () => {
    const t = said("use_case", ["office", "study", "basics"], "friendly");
    expect(t).toMatch(/[.?!]$/);
    expect(t.split(" and ").length + t.split(",").length).toBeGreaterThan(2); // more than one item joined
  });
});

describe("every line of 400 simulated laptop conversations", () => {
  const NEGATIVE = new Set(["notsure", "unsure", "no", "notforme", "expensive", "keep", "decline", "think", "another", "avg", "notyet"]);
  const logs = Array.from({ length: 400 }, (_, i) => {
    const rng = makeRng(i + 1);
    return { seed: i + 1, log: runConversation(randomPersona(rng, "x"), randomStaff(rng), rng, newScene()).scene.log };
  });

  it("read as English", () => {
    const bad: string[] = [];
    for (const { seed, log } of logs) {
      log.forEach((l, i) => {
        const t = l.text;
        const at = `seed ${seed} turn ${l.turn} (${l.who}): "${t}"`;
        if (!/^[A-Z0-9"]/.test(t)) bad.push(`${at} does not start with a capital`);
        if (/(^|[^.][.?!] )(?!MacBook)[a-z]/.test(t)) bad.push(`${at} has a sentence starting in lower case`);
        if (l.who === "customer") {
          if (/Not sure/.test(t) && !/not (really )?sure/i.test(t)) bad.push(`${at} has a bare menu label`);
          if (!/[.?!]$/.test(t)) bad.push(`${at} does not end like a sentence`);
        } else {
          const prev = log[i - 1];
          if (prev?.picks?.some((p) => NEGATIVE.has(p)) && /^(Great|Lovely|Sure thing)\./.test(t)) bad.push(`${at} cheers a downbeat answer`);
          if (/^(Great|Lovely|Sure thing|That's fine|No problem|OK|Right|Of course)\. (Good choice|Great choice|Great|Lovely|Sure thing|That's fine|No problem|Of course)\b/.test(t)) bad.push(`${at} stacks two acknowledgements`);
        }
        if (/  | \.|\.\.\.\./.test(t.replace(/\.\.\./g, ""))) bad.push(`${at} has stray spacing or punctuation`);
      });
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });
});

describe("the laptop customer's menu is not the customer's speech", () => {
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ").trim();

  it("says every option differently from how the menu labels it, in every tone, for the common question types", () => {
    const same: string[] = [];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const rng = makeRng(seed);
      const persona = randomPersona(rng, "x");
      const staff = randomStaff(rng);
      const mem: Memory = { wants: persona.wants, conceded: new Set() };
      let sc = newScene();
      while (!sc.ended && sc.turn < 60) {
        const sm = staffMove(sc, staff, rng);
        const a = applyStaff(sc, sm.act, sm.tone);
        if ("error" in a) break;
        const menu = customerMenu(a);
        if (!menu) break;
        const ctx = derive(a);
        for (const tone of TONES) {
          for (const o of menu.options) {
            if (o.param) continue; // free-text budget entry isn't a fixed label to compare against
            const spoken = customerLine({ picks: [o.id], tone }, menu.options, ctx, 4, menu.pending);
            const k = `${menu.pending.kind}/${o.id}/${tone}`;
            if (o.label && spoken && !seen.has(k) && norm(spoken) === norm(o.label)) same.push(`${k}: "${o.label}" -> "${spoken}"`);
            seen.add(k);
          }
        }
        const c = applyCustomer(a, customerMove(a, persona, rng, mem));
        if ("error" in c) break;
        sc = c;
      }
    }
    expect([...new Set(same)].slice(0, 12)).toEqual([]);
  });
});

describe("laptop scene tones and faces", () => {
  it("maps every tone to an expression the 3D character has", async () => {
    const { EXPRESSIONS } = await import("../src/client/src/gfx/character.ts");
    const have = EXPRESSIONS.map((e: { name: string }) => e.name);
    for (const tone of TONES) expect(have, tone).toContain(TONE_EXPRESSION[tone]);
    expect(new Set(TONES.map((t) => TONE_EXPRESSION[t])).size).toBe(TONES.length);
  });

  it("stamps each line with the face for its tone", () => {
    const sc = ok(applyStaff(newScene(), { t: "ask", qid: "opening_intent" }, "unsure"));
    expect(sc.log[0]).toMatchObject({ tone: "unsure", expression: "worried" });
    const c = ok(applyCustomer(sc, { picks: ["help"], tone: "impatient" }));
    expect(c.log[1]).toMatchObject({ tone: "impatient", expression: "focused" });
  });
});
