import { describe, expect, it } from "vitest";
import { newScene } from "../src/shared/talk/bank.ts";
import { randomPersona, randomStaff, runConversation } from "../src/shared/talk/npc.ts";
import { makeRng } from "../src/shared/talk/rng.ts";
import { applyCustomer, applyStaff } from "../src/shared/talk/scene.ts";
import { TONES, type Scene, type Tone } from "../src/shared/talk/types.ts";

// Promise: what the characters say reads as English. Tone is carried by
// phrasing, so it never produces "Sure. Not sure." or "I guess Not sure.",
// a sentence never starts in lower case, and staff never say "Great." to a
// customer who has just said they are not sure.

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

describe("customer wording", () => {
  it("says 'not sure' as a sentence in every tone, with nothing in front of it", () => {
    for (const tone of TONES) {
      const t = said("use_case", ["notsure"], tone);
      expect(t, tone).toMatch(/^(Hmm, I'm not sure, sorry\.|I'm not sure\.|I don't know, honestly\.|Um\.\.\. I'm really not sure\.)$/);
    }
  });

  it("says a budget, a colour and a model as sentences in every tone", () => {
    for (const tone of TONES) {
      expect(said("budget_ceiling", ["ceiling:1200"], tone), tone).toMatch(/^(Up to|Maybe up to) A\$1,200/);
    }
    let sc = ok(applyStaff(newScene(), { t: "ask", qid: "known_model" }, "neutral"));
    sc = ok(applyCustomer(sc, { picks: ["model:17"], tone: "friendly" }));
    expect(sc.log[1]!.text).toBe("Hi. The iPhone 17, please.");
  });

  it("joins several answers into one sentence", () => {
    const t = said("use_case", ["photos", "video", "travel"], "friendly");
    expect(t).toBe("Mostly photos, video and travel.");
  });
});

describe("every line of 400 simulated conversations", () => {
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
        // (an ellipsis may run on in lower case: "Let me see... which colour")
        if (/(^|[^.][.?!] )(?!iPhone)[a-z]/.test(t)) bad.push(`${at} has a sentence starting in lower case`);
        if (l.who === "customer") {
          if (/Not sure/.test(t)) bad.push(`${at} has a bare menu label`);
          if (/\b(Sure\.|I guess|Happy to say|Quick answer|Just:|Look,)/.test(t)) bad.push(`${at} has a retired lead-in`);
          if (!/[.?!]$/.test(t)) bad.push(`${at} does not end like a sentence`);
        } else {
          const prev = log[i - 1];
          if (prev?.picks?.some((p) => NEGATIVE.has(p)) && /^(Great|Lovely|Sure thing)\./.test(t)) bad.push(`${at} cheers a downbeat answer`);
          if (/^(Great|Lovely|Sure thing)\. (That's the listed price|We don't carry)/.test(t)) bad.push(`${at} cheers bad news`);
        }
        if (/  | \.|\.\.\.\./.test(t.replace(/\.\.\./g, ""))) bad.push(`${at} has stray spacing or punctuation`);
      });
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });
});
