import { describe, expect, it } from "vitest";
import { derive, newScene } from "../src/shared/talk/bank.ts";
import { customerLine } from "../src/shared/talk/lines.ts";
import { customerMove, randomPersona, randomStaff, runConversation, staffMove, type Memory } from "../src/shared/talk/npc.ts";
import { makeRng } from "../src/shared/talk/rng.ts";
import { applyCustomer, applyStaff, customerMenu } from "../src/shared/talk/scene.ts";
import { TONE_EXPRESSION, TONES, type Scene, type Tone } from "../src/shared/talk/types.ts";

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
      expect(said("budget_ceiling", ["ceiling:1200"], tone), tone).toMatch(/^(My budget is around A\$1,200\.|No more than A\$1,200\.|A\$1,200 at the most\.|Maybe around A\$1,200\?)$/);
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
          // Asked "would you like a look at it?", nobody answers by saying the phone's name back.
          if (log[i - 1]?.text.endsWith("have a look at it?") && /iPhone/.test(t)) bad.push(`${at} names the phone again`);
          if (/Not sure/.test(t)) bad.push(`${at} has a bare menu label`);
          if (/\b(Sure\.|I guess|Happy to say|Quick answer|Just:|Look,)/.test(t)) bad.push(`${at} has a retired lead-in`);
          if (!/[.?!]$/.test(t)) bad.push(`${at} does not end like a sentence`);
        } else {
          const prev = log[i - 1];
          if (prev?.picks?.some((p) => NEGATIVE.has(p)) && /^(Great|Lovely|Sure thing)\./.test(t)) bad.push(`${at} cheers a downbeat answer`);
          if (/^(Great|Lovely|Sure thing)\. (That's the listed price|We don't carry|Nothing fits|I can't promise)/.test(t)) bad.push(`${at} cheers bad news`);
          if (/^(Great|Lovely|Sure thing|That's fine|No problem|OK|Right|Of course)\. (Good choice|Great choice|Great|Lovely|Sure thing|That's fine|No problem|Of course)\b/.test(t)) bad.push(`${at} stacks two acknowledgements`);
        }
        if (/  | \.|\.\.\.\./.test(t.replace(/\.\.\./g, ""))) bad.push(`${at} has stray spacing or punctuation`);
      });
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });
});

// The staff side already works this way: the menu says the move ("Ask: colour
// prefs") and the character says it in words. The customer's menu has to as
// well: what you pick is the intent, never the line itself.
describe("the customer's menu is not the customer's speech", () => {
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ").trim();

  it("says every option, throw-back and action differently from how the menu labels it, in every tone", () => {
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
            const pick = o.param ? `${o.param.prefix}${o.param.min + 10 * o.param.step}` : o.id;
            const spoken = customerLine({ picks: [pick], tone }, menu.options, ctx, 4, menu.pending);
            const label = o.param ? "" : o.label;
            const k = `${menu.pending.kind}/${o.id}/${tone}`;
            if (label && !seen.has(k) && norm(spoken) === norm(label)) same.push(`${k}: "${label}" -> "${spoken}"`);
            seen.add(k);
          }
          for (const act of menu.actions) {
            const spoken = customerLine({ action: act.action, tone }, menu.options, ctx, 4, menu.pending);
            if (norm(spoken) === norm(act.label)) same.push(`action ${act.label}: "${spoken}"`);
          }
        }
        for (const tb of menu.throwbacks as { id: string; label: string; said: string }[]) if (norm(tb.said) === norm(tb.label)) same.push(`throw-back ${tb.id}`);
        const c = applyCustomer(a, customerMove(a, persona, rng, mem));
        if ("error" in c) break;
        sc = c;
      }
    }
    expect([...new Set(same)].slice(0, 12)).toEqual([]);
  });
});

// In the store a tone is a face. The mapping lives in the engine, and every
// name in it has to be one the character can actually make.
describe("tones and faces", () => {
  it("maps every tone to an expression the 3D character has", async () => {
    const { EXPRESSIONS } = await import("../src/client/src/gfx/character.ts");
    const have = EXPRESSIONS.map((e: { name: string }) => e.name);
    for (const tone of TONES) expect(have, tone).toContain(TONE_EXPRESSION[tone]);
    expect(new Set(TONES.map((t) => TONE_EXPRESSION[t])).size).toBe(TONES.length); // four tones, four faces
  });

  it("stamps each line with the face for its tone", () => {
    const sc = ok(applyStaff(newScene(), { t: "ask", qid: "opening_intent" }, "unsure"));
    expect(sc.log[0]).toMatchObject({ tone: "unsure", expression: "worried" });
    const c = ok(applyCustomer(sc, { picks: ["help"], tone: "impatient" }));
    expect(c.log[1]).toMatchObject({ tone: "impatient", expression: "focused" });
  });
});
