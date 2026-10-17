import { describeConstraints, money, questionById } from "./bank.ts";
import { modelById, type ModelRec } from "./data.ts";
import { cheapest } from "./pool.ts";
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
const NEGATIVE = new Set(["notsure", "unsure", "no", "notforme", "expensive", "keep", "decline", "think", "another", "avg", "notyet"]);

const staffLead = (tone: Tone, turn: number, prev: Line | undefined, badNews: boolean): string => {
  if (turn <= 1) return ""; // the first line is a plain hello, whatever the tone
  const downbeat = badNews || (prev?.who === "customer" && (prev.picks?.some((p) => NEGATIVE.has(p)) ?? false));
  const pool: Record<Tone, string[]> = {
    friendly: downbeat ? ["No problem. ", "That's fine. "] : ["", "Great. ", "Lovely. ", "Sure thing. "],
    neutral: [""],
    impatient: ["Right. ", "OK. "],
    unsure: ["Um, ", "Let me see... "],
  };
  const lead = pool[tone][turn % pool[tone].length]!;
  return lead;
};

const lcFirst = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);
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
  // The answer they gave in the same turn can have emptied the pool.
  if (id.startsWith("attr:") && ms.length === 0) return "Right now nothing fits what you've told me, so there's nothing to compare.";
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
  // No cheerful lead-in when the answer they are about to hear is bad news (no deals, not carried).
  const badNews = owed === "haggle" || (owed?.startsWith("not_carried:") ?? false);
  const lead = staffLead(tone, turn, ctx.sc.log[ctx.sc.log.length - 1], badNews);
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
  if (p?.param) return `Up to ${money(Number(pick.slice(p.param.prefix.length)))}`;
  return pick;
};

const noParen = (t: string): string => t.replace(/\s*\(.*\)$/, "");

// The pick as a customer would say it, as a full sentence. Picks whose label is
// already a sentence ("Yes, a separate telephoto lens") are said as is.
function say(pick: string, picks: string[], label: string, qid: string | undefined, kind: string, tone: Tone, lab: (p: string) => string): string {
  if (pick === "notsure" || (kind !== "question" && pick === "unsure")) return NOT_SURE[tone];
  const t = (v: Record<Tone, string>): string => v[tone];
  if (kind === "offer_demo" && pick.startsWith("demo:")) return t({ friendly: `Yes please, I'd love to see the ${modelById(pick.slice(5)).name}.`, neutral: `Let's see the ${modelById(pick.slice(5)).name}.`, impatient: `The ${modelById(pick.slice(5)).name}.`, unsure: `Maybe the ${modelById(pick.slice(5)).name}?` });
  if (kind === "rescue" && pick.startsWith("demo:")) return `Let me see the ${modelById(pick.slice(5)).name}.`;
  if (kind === "nudge" && pick.startsWith("drop:")) return `Let's drop ${label.replace(/^Drop /, "")}.`;
  if (kind !== "question") return stop(label);
  if (qid === "known_model" && pick.startsWith("model:")) return t({ friendly: `The ${label}, please.`, neutral: `The ${label}.`, impatient: `The ${label}.`, unsure: `I think the ${label}?` });
  if (qid === "known_model" && pick.startsWith("unlisted:")) return `I was after the ${pick.slice(9)}.`;
  if (qid === "model_family") return t({ friendly: `I was thinking of the ${noParen(label)}.`, neutral: `The ${noParen(label)}.`, impatient: `The ${noParen(label)}.`, unsure: `Maybe the ${noParen(label)}?` });
  if (qid === "colour_prefs" || qid === "colour_pick") {
    const cols = picks.filter((p) => p.startsWith("colour:")).map((p) => p.slice(7));
    return t({ friendly: `I'd love ${list(cols, "or")}.`, neutral: `${capFirst(list(cols, "or"))}, please.`, impatient: `${capFirst(list(cols, "or"))}.`, unsure: `Maybe ${list(cols, "or")}?` });
  }
  if (qid === "storage_tier_for_model") return t({ friendly: `The ${noParen(label)}, please.`, neutral: `The ${noParen(label)}.`, impatient: `${noParen(label)}.`, unsure: `Maybe the ${noParen(label)}?` });
  if (qid === "storage_need") return t({ friendly: `At least ${label}, I think.`, neutral: `At least ${label}.`, impatient: `${label} at least.`, unsure: `Maybe ${label} at least?` });
  if (qid === "budget_ceiling" && (pick.startsWith("ceiling:") || label.startsWith("Up to"))) return t({ friendly: `${label.replace(/^Yes, /, "")}.`.replace(/^up/, "Up"), neutral: `${label}.`, impatient: `${label}, that's it.`, unsure: `Maybe ${lcFirst(label)}?` });
  if (qid === "use_case") {
    const uses = picks.filter((p) => p !== "notsure").map((p) => lcFirst(noParen(lab(p))));
    return t({ friendly: `Mostly ${list(uses)}.`, neutral: `${capFirst(list(uses))}.`, impatient: `${capFirst(list(uses))}, that's all.`, unsure: `Probably ${list(uses)}, I think.` });
  }
  if (qid === "hardware_features") {
    const fs = picks.filter((p) => p !== "notsure" && p !== "none").map((p) => lcFirst(noParen(lab(p))));
    return fs.length ? t({ friendly: `${capFirst(list(fs))} would be nice.`, neutral: `${capFirst(list(fs))}.`, impatient: `${capFirst(list(fs))}.`, unsure: `Maybe ${list(fs)}?` }) : "None of those matter to me.";
  }
  if (qid === "screen_size_pref") return t({ friendly: `${noParen(label)}, I think.`, neutral: `${noParen(label)}.`, impatient: `${noParen(label)}.`, unsure: `Maybe ${lcFirst(noParen(label))}?` });
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
    const sentences = qid === "use_case" || qid === "colour_prefs" || qid === "colour_pick" || qid === "hardware_features" ? [say(reply.picks[0]!, reply.picks, optionLabel(opts, reply.picks[0]!), qid, pending.kind, reply.tone, lab)] : reply.picks.map((p) => say(p, reply.picks!, optionLabel(opts, p), qid, pending.kind, reply.tone, lab));
    body = body ? `${sentences.join(" ")} ${body}` : sentences.join(" ");
  }
  // A little tone on the end of a statement: always grammatical, never a clash.
  const sureAnswer = reply.picks?.every((p) => !NEGATIVE.has(p)) ?? false;
  if (body && /\.$/.test(body) && !reply.throwback) {
    if (reply.tone === "friendly" && sureAnswer && turn % 3 === 0) body += " Thanks!";
    if (reply.tone === "impatient" && turn % 3 === 0) body += " Can we keep going?";
  }
  if (reply.throwback) body = `${body ? stop(body) + " " : ""}${throwbackLabel(reply.throwback, ctx)}`;
  // Their first words back are a hello.
  if (turn === 2 && body) return `Hi. ${body}`;
  return body;
}
