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
// of it, not just our own 20/min) within seconds of real use.
// liquid/lfm-2.5-2.6b:free (2.6B active params) isn't Google-backed, but
// tested live against interpretTurn's multi-item extraction and failed
// badly: it would narrate "confirmed black, no trade-in" while returning
// an EMPTY "answers" object (nothing actually recorded), and separately
// fabricated a storage answer out of a question that was never a
// decision. nvidia/nemotron-3-super-120b-a12b:free (120B, 12B active) got
// both right in the same test -- bigger, but still free and not
// Google-routed. Multi-item structured extraction needs the headroom.
const MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
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

// Shared call machinery: pacing, timeout, and JSON extraction. Nothing
// about *what* is being asked lives here -- that's each function below.
async function callModel(prompt: string): Promise<Record<string, unknown> | null> {
  if (!aiAvailable()) return null;
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 500) console.error(`[ai] pacing to stay under the free tier's rate limit -- waiting ${(wait / 1000).toFixed(1)}s`);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
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
    return JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    // Printed to stderr, not the game's own output, and never the key
    // itself -- just enough to tell quota/auth/model-name apart from an
    // actual network stall, instead of swallowing every failure the same way.
    console.error("[ai] call failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface Interpretation {
  type: "answer" | "not_sure" | "question" | "unclear";
  value?: string; // the option this answers, OR -- for "not_sure" -- Dan's own recommended option
  reply?: string; // a short in-character line. Always include one, even for "answer" -- a real conversation acknowledges what was said instead of silently moving on
  extra?: Record<string, string>; // other, not-yet-asked facts volunteered unprompted (T7: stating everything upfront)
}

// Reads a free-text reply against ONE specific question and the real
// options on offer. Used only where there genuinely is one fixed question
// at this point (chooseProduct's "do you have a model in mind?" / "which of
// these two?") -- the open-ended, any-order part of a conversation is
// interpretTurn below, not this.
export async function interpret(args: {
  question: string;
  options: readonly string[];
  utterance: string;
  context: string;
}): Promise<Interpretation | null> {
  const prompt = `${PERSONA}

Question just asked: "${args.question}"
Options actually on offer for this question: ${args.options.join(" | ")}
Context -- facts already known to be true about this case; never invent beyond this: ${args.context}
The customer just said: "${args.utterance}"

Classify as exactly one of:
- "answer": they answered this question. Match generously and by intent, not just keywords -- "set it up" for a now-vs-home question means "now, while I'm here". Always fill "value" with the exact option text, and "reply" with a short acknowledgment.
- "not_sure": they don't know, or want help deciding. Still fill "value" with the option you'd recommend, and "reply" with why.
- "question": they're asking something back -- "reply" answers it using only real options/context above.
- "unclear": genuinely none of the above fit -- "reply" asks them to restate it.

Reply with ONLY compact JSON, no markdown fence:
{"type": "...", "value": "<exact option text, for answer or not_sure>", "reply": "<one short in-character Dan sentence>"}`;

  const parsed = await callModel(prompt);
  if (!parsed || !["answer", "not_sure", "question", "unclear"].includes(parsed.type as string)) return null;
  return parsed as unknown as Interpretation;
}

export interface OpenSlot {
  key: string;
  question: string;
  options: readonly string[];
}

export interface TurnResult {
  answers: Record<string, string>; // zero or more open questions this turn settled, each caller-validated against its own real options before being trusted
  reply: string; // Dan's actual next line -- acknowledges what was said, answers any question inline, and naturally raises one open thing if nothing else is driving the conversation. Never a fixed script.
}

// The actual fix for "this isn't non-linear": one turn, every currently
// open question on the table at once, in no particular order. The
// customer can answer any of them, several at once, revisit nothing in
// particular, ask a real question, or say they're not sure about one --
// what happens next comes out of this single call, not a for-loop over a
// fixed slot list. The ordering policy (SLOT_ORDER) still decides which
// slot the *engine* treats as most pressing when nothing else is driving
// things, but it's a fallback the model can route around, not the shape
// of the conversation.
export async function interpretTurn(args: { openSlots: OpenSlot[]; context: string; utterance: string }): Promise<TurnResult | null> {
  const slotsBlock = args.openSlots.map((s) => `- "${s.key}": ${s.question} (options: ${s.options.join(" | ")})`).join("\n");
  const prompt = `${PERSONA}

Facts already settled on this case; never invent beyond this: ${args.context}

Still open -- anything on this list can be answered in any order, more than one at once, or not at all this turn:
${slotsBlock}

The customer just said: "${args.utterance}"

Your job this turn:
1. For every open item this utterance clearly answers (there may be several, or none), put the exact option text in "answers" keyed by that item's key. Match generously by intent, not keywords.
2. If they said they're not sure about one, or asked you to just pick, decide the best fit yourself from context and still put it in "answers" -- explain why in "reply".
3. If they asked a question, answer it in "reply" using only the facts above and hedged, tier/price-only trade-off language -- never invent a spec or number.
4. Write "reply": acknowledge whatever was just settled, then -- only if nothing else is already driving the conversation -- naturally bring up ONE of the still-open items, your pick of which fits best. Don't march through the list in order, and don't ask about something already settled. 1-3 short sentences, Dan's real voice, never a list.

Reply with ONLY compact JSON, no markdown fence:
{"answers": {"<item key>": "<exact option text>", ...}, "reply": "<Dan's next line>"}
Omit "answers" entirely if nothing was settled this turn.`;

  const parsed = await callModel(prompt);
  if (!parsed) return null;
  return { answers: (parsed.answers as Record<string, string>) ?? {}, reply: (parsed.reply as string) ?? "" };
}
