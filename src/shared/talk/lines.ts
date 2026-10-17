import { describeConstraints, money, named, questionById } from "./bank.ts";
import { MODELS, modelById, type ModelRec } from "./data.ts";
import type { Ctx, CustomerReply, Line, Option, Pending, StaffAct, Tone } from "./types.ts";

// Wording. Every line is built from the scene's state and the sourced data, so
// nobody can say anything the data does not back: a staff claim is read off a
// model record, a customer line is the label of what they picked. Tone is a
// small wrapper on top. These wrappers are placeholders for wording Ritesh
// reviews and rewrites [TK]; the four tones are fixed, the phrases are not.

// Tone is carried by phrasing, never by a lead-in stuck on the front of
// whatever the menu label happens to be (that is how "Sure." ended up in front
// of "Not sure."). A customer says each pick as a sentence built for it, with
// a variant per tone; staff lead-ins depend on how the customer's last answer
// went. The phrases are placeholders for wording Ritesh rewrites [TK]; the
// four tones are fixed.

// What a customer's answer sounded like, so staff do not say "Great." to "Not sure."
const NEGATIVE = new Set(["notsure", "unsure", "no", "notforme", "expensive", "keep", "decline", "think", "avg", "notyet"]);

// The ways a customer can turn something down, as against merely not being sure.
const REJECT = new Set(["notforme", "expensive", "no", "others", "keep", "decline", "think"]);

const staffLead = (tone: Tone, turn: number, prev: Line | undefined, badNews: boolean): string => {
  if (turn <= 1) return ""; // the first line is a plain hello, whatever the tone
  // Bad news carries its own apology; nothing goes in front of it.
  if (badNews) return tone === "unsure" ? "Um, " : "";
  const picks = prev?.who === "customer" ? (prev.picks ?? []) : [];
  // They asked to change something: acknowledge it, don't just ask the next question.
  if (picks.some((p) => p === "colour" || p === "storage" || p === "model" || p === "another" || p === "others") && tone === "friendly") return "Of course. ";
  const rejected = picks.some((p) => REJECT.has(p));
  const hesitant = !rejected && picks.some((p) => NEGATIVE.has(p));
  const pool: Record<Tone, string[]> = {
    friendly: rejected ? ["Understood. ", "No problem. "] : hesitant ? ["That's fine. ", "No problem. "] : ["", "Great. ", "Lovely. ", "Sure thing. "],
    neutral: [""],
    impatient: rejected || hesitant ? ["Right. "] : ["Right. ", "OK. "],
    unsure: ["Um, ", "Hmm, "],
  };
  return pool[tone][turn % pool[tone].length]!;
};

// Lower-case the first letter when a lead-in runs on, except for "I", "I'd" and the like.
const lcFirst = (t: string): string => (/^I(\b|')/.test(t) || /^iPhone/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const capFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const stop = (t: string): string => (/[.?!]$/.test(t) ? t : t + ".");
const names = (ids: string[]): string => ids.map((i) => modelById(i).name).join(", ");
// The sign-off staff give when a scene ends. Payment is a different scene (and
// likely a different person), so a sale hands over to the till.
export function closingLine(ended: { how: "bought" } | { how: "left"; why: string }): string {
  if (ended.how === "bought") return "Great choice. I'll take you across to the till so someone there can sort the payment.";
  if (ended.why.includes("another desk")) return "No problem, the team on that desk will look after you.";
  return "No worries at all. I'm here if you want another look.";
}

const list = (xs: string[], word = "and"): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`);

// ---- facts a staff member may read out about a model ----

// The Duo's figures depend on which screen: say so.
const screenPhrase = (m: ModelRec): string => (m.foldable && m.outerIn ? `a ${m.screenIn}" screen inside and a ${m.outerIn}" screen outside` : `a ${m.screenIn}" screen`);
const startingPrice = (m: ModelRec): number => Math.min(...m.tiers.map((t) => t.price));

// What to say about a phone, as noun phrases that read after "It has", chosen by what the customer cares about.
export function highlights(m: ModelRec, ctx: Ctx): string[] {
  const out: string[] = [];
  const noSignals = !ctx.s.photos && !ctx.s.video && !ctx.s.battery && !ctx.s.light;
  if (ctx.s.photos || noSignals) out.push(`${m.lenses} rear camera ${m.lenses === 1 ? "line" : "lines"}${m.separateTelephoto ? ", including a separate telephoto lens" : ""}`);
  if (ctx.s.video && m.fourK120) out.push("4K Dolby Vision video at up to 120 fps");
  if (ctx.s.video && m.prores) out.push("ProRes recording");
  if (ctx.s.battery && m.batteryHours) out.push(`up to ${m.batteryHours} hours of video playback${m.batteryOuter ? " on the outer screen" : ""}`);
  if (ctx.s.light && m.weightG) out.push(`a weight of ${m.weightG}g`);
  out.push(screenPhrase(m));
  if (m.frame) out.push(`${/^[aeiou]/.test(m.frame) ? "an" : "a"} ${m.frame} frame`);
  return out.slice(0, 4);
}

const describe = (m: ModelRec, ctx: Ctx): string => `It has ${list(highlights(m, ctx))} and starts from ${money(startingPrice(m))}.`;

// ---- the answers to the things a customer can throw back ----

export interface ThrowbackDef {
  id: string;
  label: string; // what the menu says: the move
  said: string; // what the customer says out loud
}

export function throwbacks(ctx: Ctx): ThrowbackDef[] {
  const top = ctx.ranked.slice(0, 3);
  const out: ThrowbackDef[] = [];
  if (top.length >= 2) {
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++)
        out.push({ id: `compare:${top[i]!.id}:${top[j]!.id}`, label: `Ask how the ${top[i]!.name} and the ${top[j]!.name} compare`, said: `How do the ${top[i]!.name} and the ${top[j]!.name} compare?` });
    out.push({ id: "attr:tele", label: "Ask which have a separate telephoto lens", said: "Do any of these have a proper telephoto lens?" });
    out.push({ id: "attr:battery", label: "Ask which has the longest battery", said: "Which one lasts longest on a charge?" });
    out.push({ id: "attr:weight", label: "Ask which is the lightest", said: "Which of these is the lightest?" });
    out.push({ id: "attr:screen", label: "Ask which has the biggest screen", said: "Which one has the biggest screen?" });
    out.push({ id: "attr:price", label: "Ask which is the cheapest", said: "Which is the cheapest?" });
  }
  if (ctx.pool.length > 0) out.push({ id: "haggle", label: "Ask whether there is room on the price", said: "Is there any room on the price?" });
  return out;
}

const best = (ms: ModelRec[], by: (m: ModelRec) => number | null, dir: 1 | -1): ModelRec[] => {
  const known = ms.filter((m) => by(m) !== null);
  if (known.length === 0) return [];
  const top = dir * Math.max(...known.map((m) => dir * (by(m) as number)));
  return known.filter((m) => by(m) === top);
};

// "Of these" means the phones they were looking at when they asked, even if the
// answer they gave in the same breath has since narrowed the pool.
const SCOPE = "of the ones we've been looking at";

export function answerThrowback(id: string, ctx: Ctx, scope: string[] | null = null): string {
  const ms = scope ? scope.map(modelById) : ctx.ranked;
  if (id === "overview") {
    const byStart = [...MODELS].sort((a, b) => startingPrice(a) - startingPrice(b));
    return `We've got ${MODELS.length} iPhones, starting from ${money(startingPrice(byStart[0]!))} for the ${byStart[0]!.name} up to ${money(startingPrice(byStart[byStart.length - 1]!))} for the ${byStart[byStart.length - 1]!.name}.`;
  }
  if (id.startsWith("compare:")) {
    const [, a, b] = id.split(":");
    const [x, y] = [modelById(a!), modelById(b!)];
    const bits = [`The ${x.name} has ${screenPhrase(x)} and starts from ${money(startingPrice(x))}; the ${y.name} has ${screenPhrase(y)} and starts from ${money(startingPrice(y))}.`];
    if (x.separateTelephoto !== y.separateTelephoto) bits.push(`Only the ${x.separateTelephoto ? x.name : y.name} of the two has a separate telephoto lens.`);
    if (x.batteryHours && y.batteryHours && x.batteryHours !== y.batteryHours) bits.push(`Video playback is up to ${x.batteryHours} hours on the ${x.name}${x.batteryOuter ? " (outer screen)" : ""} and ${y.batteryHours} on the ${y.name}${y.batteryOuter ? " (outer screen)" : ""}.`);
    return bits.join(" ");
  }
  if (id === "attr:tele") {
    const withLens = ms.filter((m) => m.separateTelephoto);
    return withLens.length === 0
      ? `None ${SCOPE} has a separate telephoto lens; their main cameras give a 2x zoom.`
      : `Of the ones we've been looking at, only the ${list(withLens.map((m) => m.name), "and")} ${withLens.length === 1 ? "has" : "have"} a separate telephoto lens; the others' main cameras give a 2x zoom.`;
  }
  if (id === "attr:battery") {
    const b = best(ms, (m) => m.batteryHours, 1);
    return b.length ? `${capFirst(SCOPE)}, the ${names(b.map((m) => m.id))} ${b.length === 1 ? "has" : "have"} the longest video playback, up to ${b[0]!.batteryHours} hours${b[0]!.batteryOuter ? " on the outer screen" : ""}.` : "I'd have to check the battery figures.";
  }
  if (id === "attr:weight") {
    const b = best(ms, (m) => m.weightG, -1);
    return b.length ? `${capFirst(SCOPE)}, the ${names(b.map((m) => m.id))} ${b.length === 1 ? "is" : "are"} the lightest at ${b[0]!.weightG}g.` : "I'd have to check the weights.";
  }
  if (id === "attr:screen") {
    const b = best(ms, (m) => m.screenIn, 1);
    return `${capFirst(SCOPE)}, the ${names(b.map((m) => m.id))} ${b.length === 1 ? "has" : "have"} the biggest screen at ${b[0]!.screenIn}"${b[0]!.foldable ? " when open" : ""}.`;
  }
  if (id === "attr:price") {
    const b = best(ms, (m) => startingPrice(m), -1);
    return `${capFirst(SCOPE)}, the ${names(b.map((m) => m.id))} ${b.length === 1 ? "is" : "are"} the cheapest, from ${money(startingPrice(b[0]!))}.`;
  }
  // Price talk is for the till, and nothing is promised.
  if (id === "haggle") return "That's the listed price, I'm afraid. Anything beyond that is for the till to sort out.";
  // We have no data on a phone we don't sell, so nothing is claimed about how close anything else is to it.
  if (id.startsWith("not_carried:")) return `Sorry, we don't carry the ${id.slice("not_carried:".length)}. I can show you what we do have.`;
  return "";
}

export const throwbackSaid = (id: string, ctx: Ctx): string => throwbacks(ctx).find((t) => t.id === id)?.said ?? id;

// ---- staff lines ----

export function staffBase(act: StaffAct, ctx: Ctx, models: string[]): string {
  switch (act.t) {
    case "ask":
      return questionById(act.qid).ask(ctx, act.reopen === true);
    case "offer_demo": {
      if (models.length === 1) {
        const m = modelById(models[0]!).name;
        // Told which phone, not narrowed down to one: acknowledge it without saying its name back.
        if (ctx.sc.answers["known_model"]?.picks.includes(`model:${models[0]}`)) return "Good choice. Would you like to have a look at it?";
        if (named(ctx, models[0]!)) return "Would you like to have a look at it?";
        // After showing others, the last one is "also", not what is "left".
        if (ctx.sc.demoed.length > 0 || ctx.sc.declinedDemo.length > 0) return `I could also show you the ${m}. Would you like to have a look at it?`;
        return `That leaves the ${m}. Would you like to have a look at it?`;
      }
      // Some have been shown already: the others are "also", not "the ones that fit".
      if (ctx.sc.demoed.length > 0 || ctx.sc.declinedDemo.length > 0) return `I could also show you the ${list(models.map((id) => modelById(id).name), "or")}. Want to try one?`;
      return `${models.length} phones fit: ${names(models)}. Want to try any?`;
    }
    case "demo": {
      const m = modelById(act.model);
      // The note about the demo unit's colour is said once, not on every demo.
      const note = ctx.sc.demoed.length === 0 ? " The demo unit might not be the colour we'd get you, and I'd have to check what's in stock." : "";
      return `${named(ctx, m.id) ? "Here it is." : `Here's the ${m.name}.`} ${describe(m, ctx)}${note} What do you think?`;
    }
    case "recommend": {
      const m = modelById(act.model);
      return `I'd suggest the ${m.name}. ${describe(m, ctx)} Does that sound right?`;
    }
    case "reconfirm": {
      const c = ctx.sc.carried ?? {};
      const parts = [...(c.colours?.length ? [list(c.colours, "or")] : []), ...(c.minGB ? [`at least ${GB(c.minGB)}`] : [])];
      return `Earlier you mentioned ${list(parts)}. Is that still what you want?`;
    }
    case "nudge":
      return `Sorry, nothing fits ${describeConstraints(ctx.c).join(", ") || "that"}. How do you want to go?`;
    case "rescue":
      return "Sorry, I can't promise a perfect match. Is there something close you'd like to see?";
    case "confirm": {
      const r = ctx.pool[0]!;
      return `So that's the ${modelById(r.model).name}, ${r.storage}, ${r.colour}, ${money(r.price)}. I'll check we have it in stock. Is that right?`;
    }
    case "answer":
      return "";
  }
}

export function staffLine(act: StaffAct, ctx: Ctx, tone: Tone, models: string[], owed: string | null, turn: number): string {
  const answer = owed ? answerThrowback(owed, ctx, ctx.sc.owedPool) : "";
  const base = staffBase(act, ctx, models);
  const body = answer && base ? `${answer} ${base}` : answer || base;
  // No cheerful lead-in when the answer they are about to hear is bad news (no deals, not carried).
  const badNews = owed === "haggle" || (owed?.startsWith("not_carried:") ?? false) || act.t === "nudge" || act.t === "rescue";
  // A line that opens with its own acknowledgement ("Good choice.") or its own apology needs no lead-in in front.
  const lead = /^(Good choice|Great choice|Sorry,)/.test(body) || owed === "haggle" ? "" : staffLead(tone, turn, ctx.sc.log[ctx.sc.log.length - 1], badNews);
  if (lead === "" || body === "") return lead + body;
  // A lead that ends mid-sentence ("Um, ") runs on into a lower-case start.
  return /(,|\.\.\.) $/.test(lead) ? lead + lcFirst(body) : lead + body;
}

// ---- customer lines ----

// "Not sure" in each tone: the one line every question can get.
const NOT_SURE: Record<Tone, string> = {
  friendly: "Hmm, I'm not sure, sorry.",
  neutral: "I'm not sure.",
  impatient: "I don't know, honestly.",
  unsure: "Um... I'm really not sure.",
};

const optionLabel = (opts: Option[], pick: string): string => {
  const o = opts.find((x) => x.id === pick);
  if (o) return o.label;
  const p = opts.find((x) => x.param && pick.startsWith(x.param.prefix));
  if (p?.param) return `Budget: up to ${money(Number(pick.slice(p.param.prefix.length)))}`;
  return pick;
};

const noParen = (t: string): string => t.replace(/\s*\(.*\)$/, "");

// What a customer says for the picks whose option is the same wherever it turns up.
// The menu says the move ("Say it's too expensive"); this is the line, which is
// never the menu text. A string is the same in every tone.
type Said = string | Partial<Record<Tone, string>>;
const SAID: Record<string, Said> = {
  "opening_intent/know": { friendly: "I've actually got a phone in mind already.", neutral: "I've got a phone in mind already.", impatient: "I know which one I want.", unsure: "I think I know which one I want?" },
  "opening_intent/line": { neutral: "I know roughly which range I want.", unsure: "I know the range, I think, but not the exact model." },
  "opening_intent/help": { friendly: "I'm after a new phone and could do with some help.", neutral: "I need a new phone but I don't know which.", impatient: "I need a phone. Help me pick one.", unsure: "I'm not really sure what I need, to be honest." },
  "opening_intent/browse": { neutral: "I'm just having a look, really.", impatient: "Just looking, thanks.", unsure: "I'm only looking, I think." },
  "opening_intent/other": "Actually, I'm here about something else.",
  "known_model/gift": "It's actually a gift for someone.",
  "known_model/notyet": { neutral: "Not yet, no. What have you got?", impatient: "No, not yet. What's available?", unsure: "No, not really. What do you have?" },
  "form_factor/standard": { friendly: "A normal phone is fine, nothing folding.", neutral: "A standard phone.", impatient: "Standard. No foldable.", unsure: "A normal one, I think?" },
  "form_factor/fold": { friendly: "I'd love a foldable, if you've got one.", neutral: "I want a foldable.", impatient: "A foldable.", unsure: "I'd like a foldable, I think?" },
  "form_factor/open": "I'd be open to a foldable.",
  "screen_size_pref/screen:compact": { friendly: "Something compact, I think.", neutral: "I'd like it compact.", impatient: "Compact.", unsure: "Maybe something compact?" },
  "screen_size_pref/screen:medium": { friendly: "A middling size is fine for me.", neutral: "A medium size.", impatient: "Medium.", unsure: "Maybe a medium size?" },
  "screen_size_pref/screen:large": { friendly: "I'd love a big screen.", neutral: "I want a big screen.", impatient: "Big screen.", unsure: "A big screen, maybe?" },
  "telephoto_need/yes": { friendly: "I do want a proper telephoto lens, not just a crop.", neutral: "I want a separate telephoto lens.", impatient: "A real telephoto lens.", unsure: "A proper telephoto lens would be good, I think?" },
  "telephoto_need/no": "The zoom from the main camera is enough for me.",
  "battery_priority/min:40": { neutral: "As long as you can get.", friendly: "The longest battery you've got, please.", impatient: "Longest battery.", unsure: "A long battery, maybe?" },
  "battery_priority/min:30": { neutral: "A long battery matters to me.", unsure: "A fairly long battery, I think?" },
  "battery_priority/avg": "An average battery is fine.",
  "weight_pref/max": { friendly: "I'd like it as light as it gets.", neutral: "As light as possible.", impatient: "Lightest you've got.", unsure: "As light as possible, maybe?" },
  "weight_pref/some": "A bit lighter would be nice.",
  "weight_pref/no": "Weight doesn't bother me.",
  "budget_ceiling/nolimit": { neutral: "I don't really have a limit.", impatient: "No limit.", unsure: "I don't think I have a limit?" },
  "size_fit_check/fine": "Yes, that size suits me.",
  "offer_demo/decline": { neutral: "I'm fine without a demo for now, thanks.", impatient: "No demo, thanks." },
  "demo_reaction/happy": { friendly: "I really like this one, actually.", neutral: "This could be the one.", impatient: "This one will do.", unsure: "Maybe this is the one?" },
  "demo_reaction/another": "Could I see another one of those?",
  "demo_reaction/others": { neutral: "Actually, what else do you have?", friendly: "Do you have anything else I could look at?", impatient: "What else have you got?", unsure: "Is there anything else, maybe?" },
  "demo_reaction/expensive": "That's more than I wanted to spend.",
  "demo_reaction/notforme": "It's not really for me, sorry.",
  "reconfirm/keep": { friendly: "Yes, that's still what I want.", neutral: "Yes, that still stands.", impatient: "Yes, same as before.", unsure: "I think so, yes." },
  "reconfirm/colour": "Actually, I'd like a different colour.",
  "reconfirm/storage": "Actually, I'd like a different amount of storage.",
  "recommend/yes": { friendly: "Yes, that sounds right to me.", neutral: "That sounds right.", impatient: "Fine, that one.", unsure: "I think that sounds right?" },
  "recommend/no": "Not that one, I think.",
  "nudge/keep": { neutral: "I'd rather keep it as it is.", impatient: "No, I want what I asked for.", unsure: "I'd rather not change it, I think." },
  "rescue/think": "I'll go away and think about it, thanks.",
  "confirm/yes": { friendly: "Yes, that's the one!", neutral: "Yes, that's the one.", impatient: "Yes, that's it.", unsure: "Yes, I think that's right." },
  "confirm/colour": "Actually, can I change the colour?",
  "confirm/storage": "Can I change the storage?",
  "confirm/model": "Actually, I'd like to look at a different model.",
  "confirm/leave": "I think I'll leave it, thanks.",
};
const saidFor = (key: string, tone: Tone): string | undefined => {
  const e = SAID[key];
  if (e === undefined) return undefined;
  return typeof e === "string" ? e : (e[tone] ?? e.neutral ?? Object.values(e)[0]);
};

const GB = (n: number): string => (n >= 1024 ? `${n / 1024}TB` : `${n}GB`);

// The pick as a customer would say it: a sentence of their own, never the menu text.
function say(pick: string, picks: string[], label: string, qid: string | undefined, kind: string, tone: Tone, lab: (p: string) => string, onlyOne = false): string {
  if (pick === "notsure" || (kind !== "question" && pick === "unsure")) return NOT_SURE[tone];
  const t = (v: Record<Tone, string>): string => v[tone];
  const scope = qid ?? kind;
  const key = pick.startsWith("smaller:") ? `${scope}/smaller` : `${scope}/${pick}`;
  const fixed = saidFor(key, tone);
  if (fixed) return fixed;
  if (key === "size_fit_check/smaller") return "That's too big for me. Have you got anything smaller?";
  // One phone on offer and everyone knows which: the answer is yes, not its name again.
  if (kind === "offer_demo" && pick.startsWith("demo:") && onlyOne) return t({ friendly: "Yes please, I'd love to.", neutral: "Yes, please.", impatient: "Yes, go on.", unsure: "Um, OK, I suppose so?" });
  if (kind === "offer_demo" && pick.startsWith("demo:")) return t({ friendly: `Yes please, I'd love to see the ${modelById(pick.slice(5)).name}.`, neutral: `Let's see the ${modelById(pick.slice(5)).name}.`, impatient: `The ${modelById(pick.slice(5)).name}.`, unsure: `Maybe the ${modelById(pick.slice(5)).name}?` });
  if (kind === "rescue" && pick.startsWith("demo:")) return `Alright, let me see the ${modelById(pick.slice(5)).name}.`;
  if (kind === "nudge" && pick.startsWith("drop:")) return `OK, I can do without ${label.replace(/^Give up /, "")}.`;
  if (kind === "nudge" && pick.startsWith("raise:")) return `I could stretch to ${money(Number(pick.slice(6)))}.`;
  if (kind !== "question") return stop(label);
  if (qid === "known_model" && pick.startsWith("model:")) return t({ friendly: `The ${modelById(pick.slice(6)).name}, please.`, neutral: `The ${modelById(pick.slice(6)).name}.`, impatient: `The ${modelById(pick.slice(6)).name}.`, unsure: `I think the ${modelById(pick.slice(6)).name}?` });
  if (qid === "known_model" && pick.startsWith("unlisted:")) return `I was after the ${pick.slice(9)}.`;
  if (qid === "model_family") {
    const line = noParen(label).replace(/^Pick the /, "");
    return t({ friendly: `I was thinking of the ${line}.`, neutral: `The ${line}.`, impatient: `The ${line}.`, unsure: `Maybe the ${line}?` });
  }
  if (qid === "colour_prefs" || qid === "colour_pick") {
    const cols = picks.filter((p) => p.startsWith("colour:")).map((p) => p.slice(7));
    return t({ friendly: `I'd love ${list(cols, "or")}.`, neutral: `${capFirst(list(cols, "or"))}, please.`, impatient: `${capFirst(list(cols, "or"))}.`, unsure: `Maybe ${list(cols, "or")}?` });
  }
  if (qid === "storage_tier_for_model") {
    const st = pick.slice("storage:".length);
    return t({ friendly: `The ${st}, please.`, neutral: `The ${st}.`, impatient: `${st}.`, unsure: `Maybe the ${st}?` });
  }
  if (qid === "storage_need") {
    const gb = GB(Number(pick.slice(4)));
    return t({ friendly: `I'd want ${gb} or more, I think.`, neutral: `${gb} or more.`, impatient: `${gb} at least.`, unsure: `Maybe ${gb} or more?` });
  }
  if (qid === "budget_ceiling" && label.startsWith("Keep my budget")) return "Yes, that's still right.";
  if (qid === "budget_ceiling" && pick.startsWith("ceiling:")) {
    const n = money(Number(pick.slice(8)));
    return t({ friendly: `My budget is around ${n}.`, neutral: `No more than ${n}.`, impatient: `${n} at the most.`, unsure: `Maybe around ${n}?` });
  }
  if (qid === "use_case") {
    const uses = picks.filter((p) => p !== "notsure").map((p) => lcFirst(noParen(lab(p))));
    return t({ friendly: `Mostly ${list(uses)}.`, neutral: `Mainly ${list(uses)}.`, impatient: `${capFirst(list(uses))}, that's all.`, unsure: `Probably ${list(uses)}, I think.` });
  }
  if (qid === "hardware_features") {
    const fs = picks.filter((p) => p !== "notsure" && p !== "none").map((p) => lcFirst(noParen(lab(p))));
    return fs.length ? t({ friendly: `${capFirst(list(fs))} would be nice.`, neutral: `${capFirst(list(fs))}, please.`, impatient: `${capFirst(list(fs))}, that's all I care about.`, unsure: `Maybe ${list(fs)}?` }) : "None of those really matter to me.";
  }
  return stop(label);
}

export function customerLine(reply: CustomerReply, opts: Option[], ctx: Ctx, turn: number, pending: Pending): string {
  const lab = (p: string): string => optionLabel(opts, p);
  let body = "";
  if (reply.action) {
    const a = reply.action;
    body =
      a.t === "demo" ? `Can I try the ${modelById(a.model).name}?` :
      a.t === "pick" ? `I'll go with the ${modelById(a.model).name}.` :
      a.t === "change" ? `Can I change my answer about ${questionById(a.qid).id.replace(/_/g, " ")}?` :
      a.t === "leave" ? "I'll leave it there, thanks." :
      "Go on.";
  }
  if (reply.picks?.length) {
    const qid = pending.kind === "question" ? pending.qid : undefined;
    const onlyOne = pending.kind === "offer_demo" && pending.models.length === 1;
    const sentences = qid === "use_case" || qid === "colour_prefs" || qid === "colour_pick" || qid === "hardware_features" ? [say(reply.picks[0]!, reply.picks, optionLabel(opts, reply.picks[0]!), qid, pending.kind, reply.tone, lab, onlyOne)] : reply.picks.map((p) => say(p, reply.picks!, optionLabel(opts, p), qid, pending.kind, reply.tone, lab, onlyOne));
    body = body ? `${sentences.join(" ")} ${body}` : sentences.join(" ");
  }
  // A little tone on the end of a plain answer: always grammatical, never after an action (a leave) or a refusal.
  const sureAnswer = reply.picks?.every((p) => !NEGATIVE.has(p) && !REJECT.has(p)) ?? false;
  if (body && /\.$/.test(body) && !reply.throwback && !reply.action && reply.picks?.length) {
    if (reply.tone === "friendly" && sureAnswer && turn % 3 === 0) body += " Thanks!";
    if (reply.tone === "impatient" && sureAnswer && turn % 3 === 0) body += turn % 2 === 0 ? " What's next?" : " Can we move on?";
  }
  if (reply.throwback) body = `${body ? stop(body) + " " : ""}${throwbackSaid(reply.throwback, ctx)}`;
  // Their first words back are a hello.
  if (turn === 2 && body) return `Hi. ${body}`;
  return body;
}
