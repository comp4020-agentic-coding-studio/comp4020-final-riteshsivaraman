import { describeConstraints, money, named, questionById } from "./bank.ts";
import { MODELS, modelById, type ModelRec } from "./data.ts";
import type { Ctx, CustomerReply, Line, Option, Pending, StaffAct, Tone } from "./types.ts";

// Wording for the laptop scene. Same discipline as src/shared/talk/lines.ts:
// every line is built from the scene's state and laptops.json, nothing is
// free text, and every phrase is a placeholder [TK] for Ritesh to rewrite.

const NEGATIVE = new Set(["notsure", "unsure", "no", "notforme", "expensive", "keep", "decline", "think", "avg", "notyet"]);
const REJECT = new Set(["notforme", "expensive", "no", "others", "keep", "decline", "think"]);

const staffLead = (tone: Tone, turn: number, prev: Line | undefined, badNews: boolean, isQuestion: boolean): string => {
  if (turn <= 1) return "";
  if (badNews) return tone === "unsure" ? "Um, " : "";
  const picks = prev?.who === "customer" ? (prev.picks ?? []) : [];
  if (picks.some((p) => p === "colour" || p === "storage" || p === "model" || p === "another" || p === "others") && tone === "friendly") return "Of course. ";
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

export function highlights(m: ModelRec, ctx: Ctx): string[] {
  const out: string[] = [];
  const noSignals = !ctx.s.portability && !ctx.s.performance && !ctx.s.battery && !ctx.s.screen;
  if (ctx.s.performance || noSignals) out.push(`a ${m.chip} chip (${m.cpuCores}-core CPU, ${m.gpuCores}-core GPU)`);
  if (ctx.s.portability) out.push(`a weight of ${(m.weightG / 1000).toFixed(2)}kg`);
  if (ctx.s.battery) out.push(`up to ${m.batteryHours} hours of video playback`);
  if (ctx.s.screen) out.push(`a ${m.screenIn}" screen`);
  out.push(`a ${m.screenIn}" display`);
  if (m.thunderboltGen === 5) out.push("Thunderbolt 5 ports");
  return out.slice(0, 4);
}

const describe = (m: ModelRec, ctx: Ctx): string => `It has ${list(highlights(m, ctx))} and starts from ${money(startingPrice(m))}.`;

// ---- the staff line for each move ----

export function staffBase(act: StaffAct, ctx: Ctx, models: string[], tone: Tone): string {
  if (act.t === "ask") {
    const q = questionById(act.qid);
    return q.ask(ctx, act.reopen === true);
  }
  if (act.t === "offer_demo") return models.length === 1 ? `Would you like to see the ${nameOf(models[0]!)}?` : `I can show you ${list(models.map(nameOf))}. Want a look at one?`;
  if (act.t === "demo") {
    const m = modelById(act.model);
    return `Here's the ${m.name}. ${describe(m, ctx)}`;
  }
  if (act.t === "recommend") return `Based on what you've told me, I'd suggest the ${nameOf(act.model)}. ${describe(modelById(act.model), ctx)}`;
  if (act.t === "reconfirm") {
    const bits: string[] = [];
    if (ctx.sc.carried?.colours) bits.push(`${list(ctx.sc.carried.colours)}`);
    if (ctx.sc.carried?.minMemoryGb) bits.push(`at least ${ctx.sc.carried.minMemoryGb}GB of memory`);
    if (ctx.sc.carried?.minStorageGb) bits.push(`at least ${ctx.sc.carried.minStorageGb}GB of storage`);
    return `Earlier you mentioned ${list(bits)}. Is that still what you want?`;
  }
  if (act.t === "nudge") return "Nothing fits exactly what you've asked for. Is there anything you'd be willing to give up?";
  if (act.t === "rescue") return "Would you like to look at something close, or take some time to think it over?";
  if (act.t === "confirm") return "So that's everything set. Shall I lock that in?";
  return ""; // answer: the throw-back answer is prepended by staffLine below
}

const nameOf = (id: string): string => modelById(id).name;

export function staffLine(act: StaffAct, ctx: Ctx, tone: Tone, models: string[], owed: string | null, turn: number): string {
  const prev = ctx.sc.log[ctx.sc.log.length - 1];
  const base = staffBase(act, ctx, models, tone);
  const badNews = act.t === "nudge" || (act.t === "ask" && base.startsWith("Sorry"));
  const lead = staffLead(tone, turn, prev, badNews, act.t === "ask");
  const answer = owed ? answerThrowback(owed, ctx) + " " : "";
  const body = lead + lcFirst(answer ? lcFirst(base) : base);
  return stop(capFirst(answer ? answer + lcFirst(body.slice(answer.length)) : body));
}

export function answerThrowback(owed: string, ctx: Ctx): string {
  if (owed === "overview") return `We carry ${list(MODELS.map((m) => m.name))}.`;
  if (owed.startsWith("not_carried:")) return `We don't carry ${owed.slice("not_carried:".length)} here.`;
  if (owed.startsWith("compare:")) {
    const ids = owed.slice("compare:".length).split(",");
    const ms = ids.map(modelById);
    return `Comparing ${list(ms.map((m) => m.name))}: ${ms.map((m) => `the ${m.name} has ${list(highlights(m, ctx).slice(0, 2))}`).join("; ")}.`;
  }
  if (owed.startsWith("attr:")) {
    const [, id] = owed.split(":");
    const m = modelById(id!);
    return `${m.name}: ${describe(m, ctx)}`;
  }
  return "";
}

export function throwbacks(ctx: Ctx): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  if (ctx.ranked.length >= 2) out.push({ id: `compare:${ctx.ranked[0]!.id},${ctx.ranked[1]!.id}`, label: `Compare ${ctx.ranked[0]!.name} and ${ctx.ranked[1]!.name}` });
  if (ctx.ranked.length >= 1) out.push({ id: `attr:${ctx.ranked[0]!.id}`, label: `Ask more about the ${ctx.ranked[0]!.name}` });
  if (ctx.ranked.length === 0) out.push({ id: "overview", label: "Ask what we carry" });
  return out;
}

// ---- the customer line for a reply ----

const SAID: Record<string, Record<Tone, string>> = {
  know: { friendly: "Yes, I've got one in mind!", neutral: "Yes, I know which one.", impatient: "Yes.", unsure: "I think so?" },
  line: { friendly: "I know roughly which range.", neutral: "I know the range.", impatient: "The range, not the model.", unsure: "Air or Pro, I think." },
  help: { friendly: "I could use a hand choosing!", neutral: "I need some help choosing.", impatient: "I need help.", unsure: "Not really sure, could use help." },
  browse: { friendly: "Just having a look, thanks!", neutral: "Just browsing.", impatient: "Just looking.", unsure: "Just browsing, I suppose." },
  other: { friendly: "Actually, something else!", neutral: "I'm here about something else.", impatient: "Something else.", unsure: "Um, something else actually." },
  notyet: { friendly: "No model in mind yet!", neutral: "No model in mind yet.", impatient: "No model yet.", unsure: "Not yet, no." },
  gift: { friendly: "It's a gift, actually!", neutral: "It's a gift.", impatient: "It's a gift.", unsure: "It's... a gift." },
  nolimit: { friendly: "No real limit!", neutral: "No real limit.", impatient: "No limit.", unsure: "No limit, I think." },
  avg: { friendly: "Average is fine!", neutral: "Average is fine.", impatient: "Average's fine.", unsure: "Average, I guess." },
  keep: { friendly: "I'd rather hold firm on that.", neutral: "I'll hold firm.", impatient: "No, I'll hold firm.", unsure: "I think I'll hold firm?" },
  happy: { friendly: "I really like this one!", neutral: "I like this one.", impatient: "This one's fine.", unsure: "I think I like this one?" },
  notforme: { friendly: "Hmm, not quite for me.", neutral: "Not for me.", impatient: "Not for me.", unsure: "Not sure it's for me." },
  expensive: { friendly: "That's a bit much for me!", neutral: "That's too expensive.", impatient: "Too expensive.", unsure: "That seems like a lot?" },
  another: { friendly: "Could I see another one?", neutral: "Show me another.", impatient: "Show me another one.", unsure: "Maybe another one?" },
  others: { friendly: "Could we look at other laptops?", neutral: "I'd like to see other laptops.", impatient: "Something else, please.", unsure: "Maybe something else?" },
  think: { friendly: "I'll have a think and come back!", neutral: "I'll think about it.", impatient: "I need to think.", unsure: "I might just think about it." },
  yes: { friendly: "Yes, that sounds great!", neutral: "Yes.", impatient: "Yes.", unsure: "I think so, yes." },
  no: { friendly: "Not quite, thanks.", neutral: "No.", impatient: "No.", unsure: "I don't think so." },
  leave: { friendly: "Thanks, but I'll leave it for now.", neutral: "I'll leave it for now.", impatient: "I'll leave it.", unsure: "I'll just leave it, I think." },
  colour: { friendly: "Could I change the colour?", neutral: "I'd like to change the colour.", impatient: "Change the colour.", unsure: "Could I maybe change the colour?" },
  storage: { friendly: "Could I change the storage?", neutral: "I'd like to change the storage.", impatient: "Change the storage.", unsure: "Could I change the storage maybe?" },
  model: { friendly: "Actually, could we look at a different model?", neutral: "I'd like a different model.", impatient: "A different model.", unsure: "Maybe a different model?" },
  decline: { friendly: "No demo for now, thanks.", neutral: "No demo for now.", impatient: "No demo.", unsure: "Maybe not right now." },
};

const NOT_SURE: Record<Tone, string> = { friendly: "Not sure, sorry!", neutral: "Not sure.", impatient: "Not sure.", unsure: "I'm not really sure." };

function pickLabel(pick: string, options: Option[]): string {
  return options.find((o) => o.id === pick)?.label ?? pick;
}

export function customerLine(reply: CustomerReply, options: Option[], ctx: Ctx, turn: number, pending: Pending): string {
  const tone = reply.tone;
  const picks = reply.picks ?? [];
  if (reply.action) {
    const a = reply.action;
    if (a.t === "leave") return SAID["leave"]![tone];
    if (a.t === "demo") return `${SAID["another"] ? "" : ""}Could I see the ${modelById(a.model).name}?`;
    if (a.t === "pick") return `I'll go with the ${modelById(a.model).name}.`;
    if (a.t === "change") return SAID["model"]![tone];
    if (a.t === "ok") return tone === "friendly" ? "Sounds good!" : "OK.";
  }
  if (picks.length === 0) return "";
  if (picks.length === 1 && SAID[picks[0]!]) return SAID[picks[0]!]![tone];
  if (picks[0] === "notsure" || picks[0] === "unsure") return NOT_SURE[tone];
  if (pending.kind === "question" && questionById(pending.qid).id === "known_model") {
    const id = picks.find((p) => p.startsWith("model:"))?.slice(6);
    if (id) return `I'd like the ${modelById(id).name}.`;
  }
  if (pending.kind === "offer_demo") {
    const id = picks[0]!.startsWith("demo:") ? picks[0]!.slice(5) : undefined;
    if (id) return `Yes, could I see the ${modelById(id).name}?`;
  }
  if (pending.kind === "rescue" && picks[0]!.startsWith("demo:")) return `I'll have a look at the ${modelById(picks[0]!.slice(5)).name}.`;
  if (picks[0]?.startsWith("ceiling:")) {
    const n = Number(picks[0].slice(8));
    return Number.isFinite(n) ? `Up to ${money(n)}, I think.` : picks[0];
  }
  if (picks[0]?.startsWith("colour:")) return `${picks.map((p) => p.slice(7)).join(" or ")} would be nice.`;
  if (picks[0]?.startsWith("storage:")) return `I'll take ${picks[0].slice(8)}GB.`;
  if (picks[0]?.startsWith("min:")) return `At least ${picks[0].slice(4)}.`;
  if (picks[0]?.startsWith("family:")) return `${picks[0].slice(7) === "air" ? "MacBook Air" : "MacBook Pro"}, please.`;
  return list(picks.map((p) => pickLabel(p, options).toLowerCase()));
}

export { describeConstraints, money, named };
