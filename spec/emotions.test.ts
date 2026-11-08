import { describe, expect, it } from "vitest";
import { ambientTone, npcTone, toneFace, TONES, type Tone } from "../src/shared/emotions.ts";

const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const tally = (other: Tone): Record<string, number> => {
  const r = seeded(7);
  const c: Record<string, number> = {};
  for (let i = 0; i < 4000; i++) {
    const t = npcTone(other, r);
    c[t] = (c[t] ?? 0) + 1;
  }
  return c;
};

describe("tone on the face (issue #55)", () => {
  it("an NPC answering a neutral person sounds neutral almost all of the time", () => {
    expect((tally("neutral").neutral ?? 0) / 4000).toBeGreaterThan(0.85);
  });
  it("an impatient person draws unsure or short replies from an NPC more than a neutral one does, but it stays mostly neutral", () => {
    const a = tally("impatient");
    const n = tally("neutral");
    expect((a.unsure ?? 0) + (a.impatient ?? 0)).toBeGreaterThan(((n.unsure ?? 0) + (n.impatient ?? 0)) * 3);
    expect((a.neutral ?? 0) / 4000).toBeGreaterThan(0.5);
  });
  it("a friendly person is answered warmly more often", () => {
    expect(tally("friendly").friendly ?? 0).toBeGreaterThan((tally("neutral").friendly ?? 0) * 5);
  });
  it("every tone has a face", () => {
    for (const t of TONES) expect(toneFace(t)).toBeTruthy();
  });
  it("an idle NPC is neutral nearly always, the same for everyone, and changes only on a slow clock", () => {
    let neutral = 0;
    for (let t = 0; t < 1000; t++) if (ambientTone("cust-3", t * 20_000) === "neutral") neutral++;
    expect(neutral / 1000).toBeGreaterThan(0.85);
    expect(ambientTone("cust-3", 5_000)).toBe(ambientTone("cust-3", 6_000));
  });
});
