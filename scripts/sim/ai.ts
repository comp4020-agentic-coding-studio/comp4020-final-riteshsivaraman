// Thin LLM bridge for the terminal sim's human-played side, following
// SCOPE D8's already-decided shape for the real game: free-tier Gemini
// key, read from the environment, with a scripted fallback whenever it's
// missing or fails. The model only ever classifies and narrates free
// text -- it never decides state itself. setFact/handOff/stock stay in
// the deterministic engine, the same boundary D8 draws for the shipped
// app ("AI output is flavour only. It can never change slots... or any
// persisted state"). Dependency added for this (`@google/genai`, the
// official SDK) -- see the commit that introduces this file.
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const key = process.env.GEMINI_API_KEY;

export function aiAvailable(): boolean {
  return Boolean(key) && key !== "paste-your-key-here";
}

const ai = aiAvailable() ? new GoogleGenAI({ apiKey: key }) : null;

// Dan's voice, anchored to the actual transcripts (docs/customer-journeys.md)
// rather than described in the abstract: short sentences, a real trade-off
// instead of a feature list, admits what he doesn't know instead of
// guessing (T3: "I don't know that one. I don't want to guess and have you
// sign up for the wrong thing"), and only ever states a price or model name
// that's actually in the context below. Camera/battery/spec-level claims
// are not sourced in this catalogue -- hedged, not asserted, same as the
// deterministic compare line in product.ts does by construction.
const PERSONA = `You are Dan, a phone specialist at a satirical big-box electronics store, talking to a customer in a text game.
Voice: short sentences, no filler, no "I'd be happy to help!" chatbot phrasing. State a real trade-off, don't list features.
Ground truth: the "Context" line below is everything you actually know -- model names, tiers, prices, and facts already on this customer's case. Never invent a price, model, or exact spec (camera zoom, battery hours, storage speed) that isn't in it.
If asked something outside that -- a specific camera/battery number, trade-in value, care plan terms, a carrier plan -- say plainly you'd need to check or that it's not your lane, the way a real specialist would, rather than inventing an answer.
Broad, hedged trade-off framing (e.g. "the higher tier usually gets the newer camera") is fine; a specific invented number is not.`;

export interface Interpretation {
  type: "answer" | "not_sure" | "question" | "unclear";
  value?: string; // one of the offered options, verbatim, only when type is "answer"
  reply?: string; // a short in-character line, when type is "not_sure" | "question" | "unclear"
  extra?: Record<string, string>; // other, not-yet-asked facts volunteered unprompted (T7: stating everything upfront)
}

// Reads a free-text reply against the question just asked and the real
// options on offer, and classifies it. `otherSlots` lets a customer who
// volunteers more than was asked (T7's "I want the pro, 512, silver") have
// the rest captured too, each value still checked against that slot's own
// real options by the caller -- this function never writes state itself.
export async function interpret(args: {
  question: string;
  options: readonly string[];
  utterance: string;
  context: string;
  otherSlots?: Record<string, readonly string[]>;
}): Promise<Interpretation | null> {
  if (!ai) return null;
  const otherSlotsBlock = args.otherSlots
    ? `\nOther things they might volunteer unprompted, each with its real options -- capture any of these only if they clearly said so, in "extra":\n${Object.entries(
        args.otherSlots,
      )
        .map(([k, opts]) => `  ${k}: ${opts.join(" | ")}`)
        .join("\n")}`
    : "";
  const prompt = `${PERSONA}

Question just asked: "${args.question}"
Options actually on offer for this question: ${args.options.join(" | ")}
Context -- facts already known to be true about this case; never invent beyond this: ${args.context}${otherSlotsBlock}
The customer just said: "${args.utterance}"

Classify as exactly one of:
- "answer": they answered this question (match loosely -- "the cheaper one" means the lower-priced option)
- "not_sure": they don't know, or want help deciding
- "question": they're asking something back instead of answering
- "unclear": none of the above fit

Reply with ONLY compact JSON, no markdown fence:
{"type": "...", "value": "<exact option text for this question, only if type is answer>", "reply": "<one short in-character Dan sentence, only if type is not_sure, question, or unclear>", "extra": {"<slot key>": "<its exact option text>", ...}}
Omit "extra" entirely if nothing else was volunteered.`;
  try {
    const res = await ai.models.generateContent({ model: MODEL, contents: prompt });
    const text = (res.text ?? "").trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(text) as Interpretation;
    if (!["answer", "not_sure", "question", "unclear"].includes(parsed.type)) return null;
    return parsed;
  } catch {
    return null; // quota, network, or bad JSON -- caller falls back to the menu
  }
}
