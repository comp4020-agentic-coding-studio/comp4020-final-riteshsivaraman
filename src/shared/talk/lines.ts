import { describeConstraints, money, questionById } from "./bank.ts";
import { modelById, type ModelRec } from "./data.ts";
import { cheapest } from "./pool.ts";
import type { Ctx, CustomerReply, Option, StaffAct, Tone } from "./types.ts";

// Wording. Every line is built from the scene's state and the sourced data, so
// nobody can say anything the data does not back: a staff claim is read off a
// model record, a customer line is the label of what they picked. Tone is a
// small wrapper on top. These wrappers are placeholders for wording Ritesh
// reviews and rewrites [TK]; the four tones are fixed, the phrases are not.

const STAFF_TONE: Record<Tone, string[]> = {
  friendly: ["", "Great. ", "Lovely. ", "Sure thing. "],
  neutral: [""],
  impatient: ["Right. ", "OK. ", "Next, "],
  unsure: ["Um, ", "So, I think... ", "Let me see... "],
};
const CUSTOMER_TONE: Record<Tone, string[]> = {
  friendly: ["", "Sure. ", "Happy to say: "],
  neutral: [""],
  impatient: ["Look, ", "Just: ", "Quick answer: "],
  unsure: ["Um, ", "I guess ", "Hmm. "],
};
const wrap = (table: Record<Tone, string[]>, tone: Tone, turn: number, text: string): string => {
  // The very first line of a conversation is a plain hello, whatever the tone.
  const lead = turn <= 1 ? "" : table[tone][turn % table[tone].length]!;
  if (lead === "" || text === "") return lead === "" ? text : lead + text;
  // A lead that ends mid-sentence ("Um, ") runs on into a lower-case start.
  return /(,|\.\.\.) $/.test(lead) ? lead + text.charAt(0).toLowerCase() + text.slice(1) : lead + text;
};

const names = (ids: string[]): string => ids.map((i) => modelById(i).name).join(", ");

// ---- facts a staff member may read out about a model ----

export function highlights(m: ModelRec, ctx: Ctx): string[] {
  const out: string[] = [];
  const noSignals = !ctx.s.photos && !ctx.s.video && !ctx.s.battery && !ctx.s.light;
  if (ctx.s.photos || noSignals) out.push(`${m.lenses} rear camera ${m.lenses === 1 ? "line" : "lines"}${m.separateTelephoto ? ", including a separate telephoto lens" : ""}`);
  if (ctx.s.video && m.fourK120) out.push("4K Dolby Vision video at up to 120 fps");
  if (ctx.s.video && m.prores) out.push("ProRes recording");
  if (ctx.s.battery && m.batteryHours) out.push(`up to ${m.batteryHours} hours of video playback`);
  if (ctx.s.light && m.weightG) out.push(`${m.weightG}g`);
  out.push(`a ${m.screenIn}" screen`);
  if (m.frame) out.push(`${/^[aeiou]/.test(m.frame) ? "an" : "a"} ${m.frame} frame`);
  out.push(`from ${money(Math.min(...m.tiers.map((t) => t.price)))}`);
  return out.slice(0, 4);
}

// ---- the answers to the things a customer can throw back ----

export interface ThrowbackDef {
  id: string;
  label: string;
}

export function throwbacks(ctx: Ctx): ThrowbackDef[] {
  const top = ctx.ranked.slice(0, 3);
  const out: ThrowbackDef[] = [];
  if (top.length >= 2) {
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) out.push({ id: `compare:${top[i]!.id}:${top[j]!.id}`, label: `How do the ${top[i]!.name} and the ${top[j]!.name} compare?` });
    out.push({ id: "attr:tele", label: "Do any of them have a separate telephoto lens?" });
    out.push({ id: "attr:battery", label: "Which has the longest battery?" });
    out.push({ id: "attr:weight", label: "Which is the lightest?" });
    out.push({ id: "attr:screen", label: "Which has the biggest screen?" });
    out.push({ id: "attr:price", label: "Which is the cheapest?" });
  }
  if (ctx.pool.length > 0) out.push({ id: "haggle", label: "Is there any room on the price?" });
  return out;
}

const best = (ms: ModelRec[], by: (m: ModelRec) => number | null, dir: 1 | -1): ModelRec[] => {
  const known = ms.filter((m) => by(m) !== null);
  if (known.length === 0) return [];
  const top = dir * Math.max(...known.map((m) => dir * (by(m) as number)));
  return known.filter((m) => by(m) === top);
};

export function answerThrowback(id: string, ctx: Ctx): string {
  const ms = ctx.ranked;
  if (id.startsWith("compare:")) {
    const [, a, b] = id.split(":");
    const [x, y] = [modelById(a!), modelById(b!)];
    const px = Math.min(...x.tiers.map((t) => t.price));
    const py = Math.min(...y.tiers.map((t) => t.price));
    const bits = [`The ${x.name} has a ${x.screenIn}" screen from ${money(px)}; the ${y.name} has a ${y.screenIn}" screen from ${money(py)}.`];
    if (x.separateTelephoto !== y.separateTelephoto) bits.push(`Only the ${x.separateTelephoto ? x.name : y.name} has a separate telephoto lens.`);
    if (x.batteryHours && y.batteryHours && x.batteryHours !== y.batteryHours) bits.push(`Video playback is up to ${x.batteryHours} hours on the ${x.name} and ${y.batteryHours} on the ${y.name}.`);
    return bits.join(" ");
  }
  if (id === "attr:tele") {
    const withLens = ms.filter((m) => m.separateTelephoto);
    return withLens.length === 0 ? "None of these has a separate telephoto lens; they get 2x by cropping the main camera." : `Only the ${names(withLens.map((m) => m.id))} ${withLens.length === 1 ? "has" : "have"} a separate telephoto lens; the rest get 2x by cropping the main camera.`;
  }
  if (id === "attr:battery") {
    const b = best(ms, (m) => m.batteryHours, 1);
    return b.length ? `The ${names(b.map((m) => m.id))} ${b.length === 1 ? "has" : "have"} the longest video playback of these, up to ${b[0]!.batteryHours} hours.` : "I'd have to check the battery figures.";
  }
  if (id === "attr:weight") {
    const b = best(ms, (m) => m.weightG, -1);
    return b.length ? `The ${names(b.map((m) => m.id))} ${b.length === 1 ? "is" : "are"} the lightest of these at ${b[0]!.weightG}g.` : "I'd have to check the weights.";
  }
  if (id === "attr:screen") {
    const b = best(ms, (m) => m.screenIn, 1);
    return `The ${names(b.map((m) => m.id))} ${b.length === 1 ? "has" : "have"} the biggest screen of these at ${b[0]!.screenIn}".`;
  }
  if (id === "attr:price") {
    const b = best(ms, (m) => cheapest(ctx.pool, m.id), -1);
    return `The ${names(b.map((m) => m.id))} ${b.length === 1 ? "is" : "are"} the cheapest of these, from ${money(cheapest(ctx.pool, b[0]!.id))}.`;
  }
  if (id === "haggle") return "That's the listed price, I'm afraid. I'd have to check on any deals, and I can't promise one.";
  if (id.startsWith("not_carried:")) {
    const lead = ms[0] ?? ctx.ranked[0];
    return `We don't carry the ${id.slice("not_carried:".length)}.${lead ? ` The closest we have is the ${lead.name}.` : ""}`;
  }
  return "";
}

export const throwbackLabel = (id: string, ctx: Ctx): string => throwbacks(ctx).find((t) => t.id === id)?.label ?? id;

// ---- staff lines ----

export function staffBase(act: StaffAct, ctx: Ctx, models: string[]): string {
  switch (act.t) {
    case "ask":
      return questionById(act.qid).ask(ctx, act.reopen === true);
    case "offer_demo":
      return `${models.length === 1 ? "One phone fits" : `${models.length} phones fit`}: ${names(models)}. Want to try ${models.length === 1 ? "it" : "any"}?`;
    case "demo": {
      const m = modelById(act.model);
      return `Here's the ${m.name}: ${highlights(m, ctx).join("; ")}. The demo unit might not be the colour we'd get you, and I'd have to check what's in stock. What do you think?`;
    }
    case "recommend": {
      const m = modelById(act.model);
      return `I'd suggest the ${m.name}: ${highlights(m, ctx).join("; ")}. Does that sound right?`;
    }
    case "nudge":
      return `Nothing fits ${describeConstraints(ctx.c).join(", ") || "that"}. How do you want to go?`;
    case "rescue":
      return "I can't promise a perfect match. Is there something close you'd like to see?";
    case "confirm": {
      const r = ctx.pool[0]!;
      return `So that's the ${modelById(r.model).name}, ${r.storage}, ${r.colour}, ${money(r.price)}. I'll check we have it in stock. Is that right?`;
    }
    case "answer":
      return "";
  }
}

export function staffLine(act: StaffAct, ctx: Ctx, tone: Tone, models: string[], owed: string | null, turn: number): string {
  const answer = owed ? answerThrowback(owed, ctx) : "";
  const base = staffBase(act, ctx, models);
  const body = answer && base ? `${answer} ${base}` : answer || base;
  return wrap(STAFF_TONE, tone, turn, body);
}

// ---- customer lines ----

const labelOf = (opts: Option[], pick: string): string => {
  const o = opts.find((x) => x.id === pick);
  if (o) return o.label;
  const p = opts.find((x) => x.param && pick.startsWith(x.param.prefix));
  if (p?.param) return `Up to ${money(Number(pick.slice(p.param.prefix.length)))}`;
  return pick;
};

export function customerLine(reply: CustomerReply, opts: Option[], ctx: Ctx, turn: number): string {
  let body = "";
  if (reply.action) {
    const a = reply.action;
    body =
      a.t === "demo" ? `Can I try the ${modelById(a.model).name}?` :
      a.t === "pick" ? `I'll go with the ${modelById(a.model).name}.` :
      a.t === "change" ? `Can I change my answer about ${questionById(a.qid).id.replace(/_/g, " ")}?` :
      a.t === "leave" ? "I'll leave it there, thanks." :
      "Go on.";
  } else if (reply.picks) {
    body = reply.picks.map((p) => labelOf(opts, p)).join("; ");
  }
  if (reply.throwback) body = `${body ? body.replace(/[.?!]$/, "") + ". " : ""}${throwbackLabel(reply.throwback, ctx)}`;
  return wrap(CUSTOMER_TONE, reply.tone, turn, body);
}
