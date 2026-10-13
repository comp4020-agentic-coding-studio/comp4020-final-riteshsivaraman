// Thin LLM bridge for the terminal sim's human-played side, following
// SCOPE D8's already-decided shape for the real game: a free-tier key,
// read from the environment, with a scripted fallback whenever it's
// missing or fails. The model only ever classifies and narrates free
// text -- it never decides state itself. setFact/handOff/stock stay in
// the deterministic engine, the same boundary D8 draws for the shipped
// app ("AI output is flavour only. It can never change slots... or any
// persisted state").
//
// Switched from Gemini to OpenRouter (2026-10-14, SCOPE D43 follow-up):
// Google's free tier turned out to be 5 requests/minute and model
// availability shifted mid-session (2.5-era models 404'd as "no longer
// available to new users"). OpenRouter's `:free`-suffixed models are
// genuinely free with no billing link at all -- 20 req/min, 50/day with
// no purchase, 1,000/day after a one-time $10 (a lifetime threshold, not
// a balance that's spent) -- checked live against its own docs and
// models endpoint, not guessed. Plain fetch; no SDK dependency needed.
// google/gemma-4-31b-it:free is routed through Google AI Studio behind the
// scenes and hit a 429 from *that* shared pool (every OpenRouter free user
// of it, not just our own 20/min) within seconds of real use. Liquid's LFM
// isn't Google-backed, and its own listing describes it as built for
// "agent workflows, data extraction" -- closer to what interpret() does
// than a general chat model.
const MODEL = process.env.OPENROUTER_MODEL || "liquid/lfm-2.5-2.6b:free";
const key = process.env.OPENROUTER_API_KEY;

export function aiAvailable(): boolean {
  return Boolean(key) && key !== "paste-your-key-here";
}

// 20 req/min on the free tier; 3.5s gives a half-second margin over the
// strict 3s that would be.
const MIN_INTERVAL_MS = 3_500;
let lastCallAt = 0;

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
  value?: string; // the option this answers, OR -- for "not_sure" -- Dan's own recommended option
  reply?: string; // a short in-character line. Always include one, even for "answer" -- a real conversation acknowledges what was said instead of silently moving on
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
  if (!aiAvailable()) return null;

  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 500) console.error(`[ai] pacing to stay under the free tier's rate limit -- waiting ${(wait / 1000).toFixed(1)}s`);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

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
- "answer": they answered this question. Match generously and by intent, not just keywords -- "set it up" for a now-vs-home question means "now, while I'm here"; "as much as possible" for storage means the largest option listed. Always fill "value" with the exact option text, and "reply" with a short acknowledgment of what they said before moving on (e.g. "Got it, the 2TB." or a one-line reason it's a good fit) -- never leave a correct answer silently unacknowledged.
- "not_sure": they don't know, or want help deciding. Still fill "value" with the single option you'd actually recommend given the context, and "reply" with why, in one short sentence.
- "question": they're asking something back instead of answering (e.g. "what do you have?" for colour means they want the option list, not a guess at one of them) -- "reply" answers it using only real options/context above, never a guess at which one they meant.
- "unclear": genuinely none of the above fit -- "reply" asks them to restate it.

Examples:
- Question "Any colour you had in mind?", said "what do you have?" -> {"type":"question","reply":"Burgundy, Glacier, Silver, or Black -- which sounds good?"}
- Question "Want me to set it up now, or at home?", said "set it up" -> {"type":"answer","value":"now, while I'm here","reply":"Sure, I'll get that going for you now."}

Reply with ONLY compact JSON, no markdown fence:
{"type": "...", "value": "<exact option text, for answer or not_sure>", "reply": "<one short in-character Dan sentence -- include this for every type>", "extra": {"<slot key>": "<its exact option text>", ...}}
Omit "extra" entirely if nothing else was volunteered.`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (data.choices?.[0]?.message?.content ?? "").trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(text) as Interpretation;
    if (!["answer", "not_sure", "question", "unclear"].includes(parsed.type)) return null;
    return parsed;
  } catch (err) {
    // Printed to stderr, not the game's own output, and never the key
    // itself -- just enough to tell quota/auth/model-name apart from an
    // actual network stall, instead of swallowing every failure the same way.
    console.error("[ai] call failed:", err instanceof Error ? err.message : err);
    return null; // caller falls back to the menu
  }
}
