// How someone sounds shows on their face (issue #55). This extends the tone a
// specialist already picks with each move (friendly / neutral / impatient /
// unsure, TONE_EXPRESSION in talk/core/types.ts): customers pick one too, and
// an NPC picks its own, heavily biased to neutral and nudged by the other
// person's tone. The server holds who sounds how and for how long; the client
// only turns a tone into a face.

import { TONES, TONE_EXPRESSION, type Tone } from "./talk/core/types.ts";

export { TONES, type Tone };
export const isTone = (s: unknown): s is Tone => typeof s === "string" && (TONES as string[]).includes(s);
export const toneFace = (t: Tone): string => TONE_EXPRESSION[t];
export const TONE_LABEL: Record<Tone, string> = { friendly: "Friendly", neutral: "Neutral", impatient: "Impatient", unsure: "Unsure" };

// how long a tone stays on the face before it settles back to neutral
export const TONE_HOLD_MS = 12_000;

const weighted = (rng: () => number, w: Array<[Tone, number]>): Tone => {
  const total = w.reduce((a, [, n]) => a + n, 0);
  let r = rng() * total;
  for (const [t, n] of w) {
    r -= n;
    if (r < 0) return t;
  }
  return "neutral";
};

// What an NPC sounds like in reply to the other person's tone: mostly neutral,
// pulled a little by theirs (warmth is returned, impatience makes it unsure or
// short in turn), so it feels responsive without being a mirror.
export function npcTone(other: Tone, rng: () => number = Math.random): Tone {
  switch (other) {
    case "friendly":
      return weighted(rng, [["neutral", 6], ["friendly", 4]]);
    case "impatient":
      return weighted(rng, [["neutral", 6], ["unsure", 2.5], ["impatient", 1.5]]);
    case "unsure":
      return weighted(rng, [["neutral", 7], ["unsure", 1.5], ["friendly", 1.5]]);
    default:
      return weighted(rng, [["neutral", 14], ["friendly", 1], ["unsure", 0.4], ["impatient", 0.2]]);
  }
}

// An NPC on its own (nobody talking to it): a rare, brief change on a slow
// clock, the same for everyone because it is a pure function of id and time.
export function ambientTone(id: string, nowMs: number): Tone {
  const bucket = Math.floor(nowMs / 20_000);
  let h = 2166136261;
  for (const c of `${id}:${bucket}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  if (r < 0.92) return "neutral";
  return r < 0.97 ? "friendly" : "unsure";
}
