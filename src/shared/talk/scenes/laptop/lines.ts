import { describeConstraints, money, named, questionById } from "./bank.ts";
import { MODELS, modelById, type ModelRec } from "./data.ts";
import type { Ctx, CustomerReply, Line, Option, Pending, StaffAct, Tone } from "./types.ts";

// Wording for the laptop scene. Same architecture as src/shared/talk/lines.ts
// (phones) -- staffBase/staffLine split, say()/SAID for customer picks,
// answerThrowback for throw-backs -- with laptop facts and questions in place
// of phone ones. All phrases are placeholders [TK] for Ritesh to rewrite.

const NEGATIVE = new Set(["notsure", "unsure", "no", "notforme", "expensive", "keep", "decline", "think", "avg", "notyet"]);
const REJECT = new Set(["notforme", "expensive", "no", "others", "keep", "decline", "think"]);

const staffLead = (tone: Tone, turn: number, prev: Line | undefined, badNews: boolean, isQuestion: boolean): string => {
  if (turn <= 1) return "";
  if (badNews) return tone === "unsure" ? "Um, " : "";
  const picks = prev?.who === "customer" ? (prev.picks ?? []) : [];
  if (picks.some((p) => p === "colour" || p === "memory" || p === "storage" || p === "model" || p === "another" || p === "others") && tone === "friendly") return "Of course. ";
  const rejected = picks.some((p) => REJECT.has(p));
  const hesitant = !rejected && picks.some((p) => NEGATIVE.has(p));
  const pool: Record<Tone, string[]> = {
    friendly: rejected ? ["Understood. ", "No problem. "] : hesitant ? ["That's fine. ", "No problem. "] : ["", "", "Great. ", "Lovely. ", "Sure thing. "],
    neutral: [""],
    impatient: rejected || hesitant ? ["Right. "] : ["Right. ", "OK. "],
    unsure: isQuestion ? ["Um, "] : [""],
  };
  return pool[tone][turn % pool[tone].length]!;
};

const lcFirst = (t: string): string => (/^I(\b|')/.test(t) || /^MacBook/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const capFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const stop = (t: string): string => (/[.?!]$/.test(t) ? t : t + ".");
const names = (ids: string[]): string => ids.map((i) => modelById(i).name).join(", ");

export function closingLine(ended: { how: "bought" } | { how: "left"; why: string }): string {
  if (ended.how === "bought") return "Great choice. I'll take you across to the till so someone there can sort the payment.";
  if (ended.why.includes("another desk")) return "No problem, the team on that desk will look after you.";
  return "Thanks for coming in. I'm here if you want another look.";
}

const list = (xs: string[], word = "and"): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`);

const startingPrice = (m: ModelRec): number => Math.min(...m.tiers.map((t) => t.price));
// Chip names are read as letters ("M-five"), not words, so "M5" and "A19"
// take "an" the way "an MRI" does, not the "a" a written M would suggest.
const anChip = (chip: string): string => (/^[MA]\d/.test(chip) ? "an" : "a");

export function highlights(m: ModelRec, ctx: Ctx): string[] {
  const out: string[] = [];
  const noSignals = !ctx.s.portability && !ctx.s.performance && !ctx.s.battery && !ctx.s.screen;
  if (ctx.s.performance || noSignals) out.push(`${anChip(m.chip)} ${m.chip} chip (${m.cpuCores}-core CPU, ${m.gpuCores}-core GPU)`);
  if (ctx.s.portability) out.push(`a weight of ${(m.weightG / 1000).toFixed(2)}kg`);
  if (ctx.s.battery) out.push(`up to ${m.batteryHours} hours of video playback`);
  out.push(`a ${m.screenIn}" display`);
  if (m.thunderboltGen === 5) out.push("Thunderbolt 5 ports");
  return out.slice(0, 4);
}

const describe = (m: ModelRec, ctx: Ctx): string => `It has ${list(highlights(m, ctx))} and starts from ${money(startingPrice(m))}.`;

// ---- throw-backs ----

export interface ThrowbackDef {
  id: string;
  label: string;
  said: string;
}

export function throwbacks(ctx: Ctx): ThrowbackDef[] {
  const top = ctx.ranked.slice(0, 3);
  const out: ThrowbackDef[] = [];
  if (top.length >= 2) {
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++)
        out.push({ id: `compare:${top[i]!.id}:${top[j]!.id}`, label: `Ask how the ${top[i]!.name} and the ${top[j]!.name} compare`, said: `How do the ${top[i]!.name} and the ${top[j]!.name} compare?` });
    out.push({ id: "attr:performance", label: "Ask which has the most processing power", said: "Which of these has the most processing power?" });
    out.push({ id: "attr:battery", label: "Ask which has the longest battery", said: "Which one lasts longest on a charge?" });
    out.push({ id: "attr:weight", label: "Ask which is the lightest", said: "Which of these is the lightest?" });
    out.push({ id: "attr:screen", label: "Ask which has the biggest screen", said: "Which one has the biggest screen?" });
    out.push({ id: "attr:price", label: "Ask which is the cheapest", said: "Which is the cheapest?" });
  }
  for (const id of ctx.sc.excluded.slice(-2)) {
    const name = modelById(id).name;
    out.push({ id: `about:${id}`, label: `Ask about the ${name} again`, said: `Could you tell me about the ${name} again?` });
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

const whoHas = (ms: ModelRec[], one: string, many: string, both = true): string => (ms.length === 1 ? `the ${ms[0]!.name} ${one}` : `the ${list(ms.map((m) => m.name), "and")} ${both && ms.length === 2 ? "both " : ""}${many}`);

export function answerThrowback(id: string, ctx: Ctx, scope: string[] | null = null): string {
  const ms = scope ? scope.map(modelById) : ctx.ranked;
  const basis = ms.length < MODELS.length ? "Of the laptops that fit what you've said so far" : "Of our laptops";
  if (id === "overview") {
    const byStart = [...MODELS].sort((a, b) => startingPrice(a) - startingPrice(b));
    const lo = byStart[0]!;
    const hi = byStart[byStart.length - 1]!;
    return `We've got ${MODELS.length} laptops. Prices start at ${money(startingPrice(lo))} for the ${lo.name}, and the ${hi.name} starts at ${money(startingPrice(hi))}.`;
  }
  if (id.startsWith("about:")) {
    const m = modelById(id.slice("about:".length));
    return `Here's the ${m.name} again. ${describe(m, ctx)}`;
  }
  if (id.startsWith("compare:")) {
    const [, a, b] = id.split(":");
    const [x, y] = [modelById(a!), modelById(b!)];
    const bits = [`The ${x.name} has ${anChip(x.chip)} ${x.chip} chip and starts from ${money(startingPrice(x))}; the ${y.name} has ${anChip(y.chip)} ${y.chip} chip and starts from ${money(startingPrice(y))}.`];
    if (x.batteryHours !== y.batteryHours) bits.push(`Battery is up to ${x.batteryHours} hours on the ${x.name} and ${y.batteryHours} on the ${y.name}.`);
    return bits.join(" ");
  }
  if (id === "attr:performance") {
    const b = best(ms, (m) => m.cpuCores, 1);
    return b.length ? `${basis}, ${whoHas(b, "has", "have")} the most processing power, ${anChip(b[0]!.chip)} ${b[0]!.chip} chip.` : "I'd have to check the chip specs.";
  }
  if (id === "attr:battery") {
    const b = best(ms, (m) => m.batteryHours, 1);
    return b.length ? `${basis}, ${whoHas(b, "has", "have")} the longest battery, up to ${b[0]!.batteryHours} hours.` : "I'd have to check the battery figures.";
  }
  if (id === "attr:weight") {
    const b = best(ms, (m) => m.weightG, -1);
    return b.length ? `${basis}, ${whoHas(b, "is", "are")} the lightest at ${(b[0]!.weightG / 1000).toFixed(2)}kg.` : "I'd have to check the weights.";
  }
  if (id === "attr:screen") {
    const b = best(ms, (m) => m.screenIn, 1);
    return b.length ? `${basis}, ${whoHas(b, "has", "have")} the biggest screen at ${b[0]!.screenIn}".` : "I'd have to check the screen sizes.";
  }
  if (id === "attr:price") {
    const b = best(ms, (m) => startingPrice(m), -1);
    return `${basis}, ${whoHas(b, "is", "are")} the cheapest, from ${money(startingPrice(b[0]!))}.`;
  }
  if (id === "haggle") return !ctx.model && ctx.ranked.length > 1 ? `That depends on the laptop, but our prices start at ${money(Math.min(...ctx.ranked.map(startingPrice)))}.` : "That's the listed price, I'm afraid.";
  if (id.startsWith("not_carried:")) return `Sorry, we don't carry that here. I can show you what we do have.`;
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
        if (ctx.sc.answers["known_model"]?.picks.includes(`model:${models[0]}`)) return "Good choice. Would you like to have a look at it?";
        if (named(ctx, models[0]!)) return "Would you like to have a look at it?";
        if (ctx.sc.demoed.length > 0 || ctx.sc.declinedDemo.length > 0) return `I could also show you the ${m}. Would you like to have a look at it?`;
        return `That leaves the ${m}. Would you like to have a look at it?`;
      }
      if (ctx.sc.demoed.length > 0 || ctx.sc.declinedDemo.length > 0) return `I could also show you the ${list(models.map((id) => modelById(id).name), "or")}. Want to try one?`;
      return `${models.length} laptops fit: ${names(models)}. Want to try any?`;
    }
    case "demo": {
      const m = modelById(act.model);
      return `${named(ctx, m.id) ? "Here it is." : `Here's the ${m.name}.`} ${describe(m, ctx)} What do you think?`;
    }
    case "recommend": {
      const m = modelById(act.model);
      return `I'd suggest the ${m.name}. ${describe(m, ctx)} Does that sound right?`;
    }
    case "reconfirm": {
      const c = ctx.sc.carried ?? {};
      const parts = [...(c.colours?.length ? [list(c.colours, "or")] : []), ...(c.minStorageGb ? [`at least ${GB(c.minStorageGb)}`] : [])];
      return `Earlier you mentioned ${list(parts)}. Is that still what you want?`;
    }
    case "nudge": {
      if (ctx.sc.relaxDeclined > 0) return "Sorry, nothing fits yet. Is there anything you'd be willing to change?";
      return `Sorry, nothing fits ${describeConstraints(ctx.c).join(", ") || "that"}. How do you want to go?`;
    }
    case "rescue":
      return "Sorry, I can't promise a perfect match. Is there something close you'd like to see?";
    case "confirm": {
      const r = ctx.pool[0]!;
      const m = modelById(r.model);
      return `So that's the ${m.name}, ${GB(r.memoryGb)} memory, ${GB(r.storageGb)} storage, ${r.colour}, ${money(r.price)}. I'll check we have it in stock. Is that right?`;
    }
    case "answer":
      return "";
  }
}

export function staffLine(act: StaffAct, ctx: Ctx, tone: Tone, models: string[], owed: string | null, turn: number): string {
  const ids = owed ? owed.split("|") : [];
  const answer = ids.map((id) => answerThrowback(id, ctx, ctx.sc.owedPool)).filter((a) => a !== "").join(" ");
  const base = staffBase(act, ctx, models);
  const body = answer && base ? `${answer} ${base}` : answer || base;
  const badNews = ids.some((id) => id === "haggle" || id.startsWith("not_carried:")) || act.t === "nudge" || act.t === "rescue";
  const lead = /^(Good choice|Great choice|Sorry,)/.test(body) || ids.includes("haggle") ? "" : staffLead(tone, turn, ctx.sc.log[ctx.sc.log.length - 1], badNews, act.t === "ask" && ids.length === 0);
  if (lead === "" || body === "") return lead + body;
  return /(,|\.\.\.) $/.test(lead) ? lead + lcFirst(body) : lead + body;
}

// ---- customer lines ----

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

type Said = string | Partial<Record<Tone, string>>;
const SAID: Record<string, Said> = {
  "opening_intent/know": { friendly: "I've actually got a laptop in mind already.", neutral: "I've got a laptop in mind already.", impatient: "I know which one I want.", unsure: "I think I know which one I want?" },
  "opening_intent/line": { neutral: "I know roughly Air or Pro.", unsure: "I know Air or Pro, I think, but not the exact model." },
  "opening_intent/help": { friendly: "I'm after a new laptop and could do with some help.", neutral: "I need a new laptop but I don't know which.", impatient: "I need a laptop. Help me pick one.", unsure: "I'm not really sure what I need, to be honest." },
  "opening_intent/browse": { neutral: "I'm just having a look, really.", impatient: "Just looking, thanks.", unsure: "I'm only looking, I think." },
  "opening_intent/other": "Actually, I'm here about something else.",
  "known_model/gift": "It's actually a gift for someone.",
  "known_model/notyet": { neutral: "Not yet, no. What have you got?", impatient: "No, not yet. What's available?", unsure: "No, not really. What do you have?" },
  "portability_pref/yes": { friendly: "Portability really matters to me.", neutral: "Yes, it needs to be portable.", impatient: "Needs to be light.", unsure: "Portability matters, I think?" },
  "portability_pref/no": "It mostly stays in one place.",
  "performance_pref/max": { friendly: "I'd like the most power you've got.", neutral: "I want the most power available.", impatient: "Max power.", unsure: "The most power, maybe?" },
  "performance_pref/some": "A bit more than everyday would help.",
  "performance_pref/no": "Everyday performance is enough for me.",
  "battery_priority/min:22": { neutral: "As long as you can get.", friendly: "The longest battery you've got, please.", impatient: "Longest battery.", unsure: "A long battery, maybe?" },
  "battery_priority/avg": "An average battery is fine.",
  "longevity_pref/years": { friendly: "It needs to last me several years.", neutral: "It needs to last several years.", impatient: "Needs to last years.", unsure: "A few years, I think?" },
  "longevity_pref/short": "It's more of a short-term thing.",
  "ports_need/yes": { friendly: "I do need the fastest ports.", neutral: "I need the fastest Thunderbolt.", impatient: "Fastest ports.", unsure: "The fast ports would help, maybe?" },
  "ports_need/no": "Standard ports are fine for me.",
  "budget_ceiling/nolimit": { neutral: "I don't really have a limit.", impatient: "No limit.", unsure: "I don't think I have a limit?" },
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
  "confirm/memory": "Can I change the memory?",
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

function say(pick: string, picks: string[], label: string, qid: string | undefined, kind: string, tone: Tone, lab: (p: string) => string, onlyOne = false): string {
  if (pick === "notsure" || (kind !== "question" && pick === "unsure")) return NOT_SURE[tone];
  const t = (v: Record<Tone, string>): string => v[tone];
  const scope = qid ?? kind;
  const key = `${scope}/${pick}`;
  const fixed = saidFor(key, tone);
  if (fixed) return fixed;
  if (kind === "offer_demo" && pick.startsWith("demo:") && onlyOne) return t({ friendly: "Yes please, I'd love to.", neutral: "Yes, please.", impatient: "Yes, go on.", unsure: "Um, OK, I suppose so?" });
  if (kind === "offer_demo" && pick.startsWith("demo:")) return t({ friendly: `Yes please, I'd love to see the ${modelById(pick.slice(5)).name}.`, neutral: `Let's see the ${modelById(pick.slice(5)).name}.`, impatient: `The ${modelById(pick.slice(5)).name}.`, unsure: `Maybe the ${modelById(pick.slice(5)).name}?` });
  if (kind === "rescue" && pick.startsWith("demo:")) return `Alright, let me see the ${modelById(pick.slice(5)).name}.`;
  if (kind === "nudge" && pick.startsWith("drop:")) return `OK, I can do without ${label.replace(/^Give up /, "")}.`;
  if (kind === "nudge" && pick.startsWith("raise:")) return `I could stretch to ${money(Number(pick.slice(6)))}.`;
  if (kind !== "question") return stop(label);
  if (qid === "known_model" && pick.startsWith("model:")) return t({ friendly: `The ${modelById(pick.slice(6)).name}, please.`, neutral: `The ${modelById(pick.slice(6)).name}.`, impatient: `The ${modelById(pick.slice(6)).name}.`, unsure: `I think the ${modelById(pick.slice(6)).name}?` });
  if (qid === "screen_size_pref") {
    const inches = pick.slice("screen:".length);
    return t({ friendly: `I'd like about ${inches}" if that's possible.`, neutral: `Around ${inches} inches, please.`, impatient: `${inches} inches.`, unsure: `Maybe around ${inches}"?` });
  }
  if (qid === "model_family") {
    const line = noParen(label);
    return t({ friendly: `I was thinking ${line}.`, neutral: `I'd like a ${line}.`, impatient: `A ${line}.`, unsure: `Maybe a ${line}?` });
  }
  if (qid === "colour_prefs" || qid === "colour_pick") {
    const cols = picks.filter((p) => p.startsWith("colour:")).map((p) => p.slice(7));
    return t({ friendly: `I'd love ${list(cols, "or")}.`, neutral: `${capFirst(list(cols, "or"))}, please.`, impatient: `${capFirst(list(cols, "or"))}.`, unsure: `Maybe ${list(cols, "or")}?` });
  }
  if (qid === "memory_tier_for_model") {
    const gb = GB(Number(pick.slice("memory:".length)));
    return t({ friendly: `${gb}, please.`, neutral: `${gb}.`, impatient: `${gb}.`, unsure: `Maybe ${gb}?` });
  }
  if (qid === "storage_tier_for_model") {
    const gb = GB(Number(pick.slice("storage:".length)));
    return t({ friendly: `The ${gb}, please.`, neutral: `The ${gb}.`, impatient: `${gb}.`, unsure: `Maybe the ${gb}?` });
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
  if (qid === "family") {
    return label === "MacBook Air" ? t({ friendly: "I'm thinking an Air.", neutral: "An Air.", impatient: "Air.", unsure: "Maybe an Air?" }) : t({ friendly: "I'm thinking a Pro.", neutral: "A Pro.", impatient: "Pro.", unsure: "Maybe a Pro?" });
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
    const sentences = qid === "use_case" || qid === "colour_prefs" || qid === "colour_pick" ? [say(reply.picks[0]!, reply.picks, optionLabel(opts, reply.picks[0]!), qid, pending.kind, reply.tone, lab, onlyOne)] : reply.picks.map((p) => say(p, reply.picks!, optionLabel(opts, p), qid, pending.kind, reply.tone, lab, onlyOne));
    body = body ? `${sentences.join(" ")} ${body}` : sentences.join(" ");
  }
  const sureAnswer = reply.picks?.every((p) => !NEGATIVE.has(p) && !REJECT.has(p)) ?? false;
  if (body && /\.$/.test(body) && !reply.throwback && !reply.action && reply.picks?.length) {
    if (reply.tone === "friendly" && sureAnswer && turn % 3 === 0) body += " Thanks!";
    if (reply.tone === "impatient" && sureAnswer && turn % 3 === 0) body += turn % 2 === 0 ? " What's next?" : " Can we move on?";
  }
  if (reply.throwback) body = `${body ? stop(body) + " " : ""}${throwbackSaid(reply.throwback, ctx)}`;
  if (turn === 2 && body) return `Hi. ${body}`;
  return body;
}
