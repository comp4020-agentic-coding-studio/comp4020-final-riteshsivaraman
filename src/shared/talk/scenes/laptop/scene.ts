import { askable, derive, gain, money, newScene, optionsFor, questionById, reopenable, rowsIf, withoutAnswer, type Contribution } from "./bank.ts";
import { MODELS, modelById } from "./data.ts";
import { closingLine, customerLine, staffLine, throwbacks } from "./lines.ts";
import { ceil100, poolOf, type Constraints, type Sku } from "./pool.ts";
import { TONE_EXPRESSION, type Ctx, type CustomerAction, type CustomerReply, type Line, type Option, type Pending, type Scene, type StaffAct, type Tone } from "./types.ts";

// The laptop scene's turn engine. This file is close to a line-for-line port
// of src/shared/talk/scene.ts (phones): the turn protocol -- staffActs,
// applyStaff, customerMenu, applyCustomer, relaxMoves, demoCandidates -- does
// not depend on what the pool holds, only on Constraints/Ctx/Scene having the
// shape bank.ts's derive() produces. The only real differences from the phone
// version are the KEY_TEXT labels (laptop constraint names instead of phone
// ones) and keepPreferences (memory/storage instead of storage/colour nuance
// -- a laptop has no "exact tier becomes a floor" subtlety around a resolve
// question the way a phone's storage does, because budget and storage are
// already separate axes here).

export { newScene, derive };

const MOOD = { friendly: 1, neutral: 0, impatient: -2, unsure: -1 } as const;
const ASK_COST = 1;
const MAX_PATIENCE = 8;

const same = (a: StaffAct, b: StaffAct): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = (sc: Scene): Scene => structuredClone(sc);

const ASK_LABEL: Record<string, string> = {
  opening_intent: "Ask what brings them in",
  known_model: "Ask if they have a laptop in mind",
  model_family: "Ask Air or Pro",
  use_case: "Ask what it is for",
  portability_pref: "Ask if portability matters",
  screen_size_pref: "Ask about screen size",
  performance_pref: "Ask how much power they need",
  battery_priority: "Ask how long the battery must last",
  longevity_pref: "Ask how long it needs to last them",
  ports_need: "Ask if they need the fastest ports",
  storage_need: "Ask how much storage",
  budget_ceiling: "Ask about budget",
  colour_prefs: "Ask about colours",
  memory_tier_for_model: "Ask which memory",
  storage_tier_for_model: "Ask which storage",
  colour_pick: "Ask which colour",
};

export interface ActView {
  act: StaffAct;
  label: string;
  gain: number;
  hint: string;
}

export function demoCandidates(ctx: Ctx): string[] {
  return ctx.ranked.filter((m) => !ctx.sc.declinedDemo.includes(m.id) && !ctx.sc.demoed.includes(m.id)).slice(0, 4).map((m) => m.id);
}

export interface RelaxMove {
  id: string;
  label: string;
}

const KEY_TEXT: Partial<Record<keyof Constraints, string>> = {
  family: "the Air or Pro restriction",
  maxWeightG: "the weight limit",
  minBattery: "the battery length",
  minStorageGb: "the storage floor",
  storage: "that storage",
  colours: "the colour",
  minScreenIn: "the screen size",
  maxScreenIn: "the smaller screen",
  minThunderboltGen: "the fastest ports",
};

export function relaxMoves(ctx: Ctx): RelaxMove[] {
  const moves: RelaxMove[] = [];
  for (const key of Object.keys(KEY_TEXT) as (keyof Constraints)[]) {
    if (ctx.c[key] === undefined) continue;
    const without = { ...ctx.c };
    delete without[key];
    if (poolOf(without).length > 0) moves.push({ id: `drop:${key}`, label: `Give up ${KEY_TEXT[key]}` });
  }
  if (moves.length === 0) {
    const keys = (Object.keys(KEY_TEXT) as (keyof Constraints)[]).filter((k) => ctx.c[k] !== undefined);
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const without = { ...ctx.c };
        delete without[keys[i]!];
        delete without[keys[j]!];
        if (poolOf(without).length > 0) moves.push({ id: `drop:${keys[i]}+${keys[j]}`, label: `Give up ${KEY_TEXT[keys[i]!]} and ${KEY_TEXT[keys[j]!]}` });
      }
  }
  if (ctx.c.maxPrice !== undefined) {
    const looser = { ...ctx.c };
    delete looser.maxPrice;
    const next = [...new Set(poolOf(looser).map((r) => ceil100(r.price)))].filter((p) => p > ctx.c.maxPrice!).sort((a, b) => a - b);
    for (const p of next.slice(0, 2)) moves.push({ id: `raise:${p}`, label: `Raise my budget to ${money(p)}` });
  }
  return moves;
}

export function staffActs(sc: Scene): ActView[] {
  if (sc.ended || sc.toMove !== "staff") return [];
  const ctx = derive(sc);
  const view = (act: StaffAct, label: string, g = 0, hint = ""): ActView => ({ act, label, gain: g, hint });
  if (sc.forced) return [describeForced(sc.forced)];

  const out: ActView[] = [];
  if (ctx.pool.length === 0) {
    if (sc.relaxDeclined < 2) out.push(view({ t: "nudge" }, "Nudge: nothing fits, ask what to give up"));
    if (sc.relaxDeclined >= 1) out.push(view({ t: "rescue" }, "Offer something close, or let them think"));
  } else {
    const open = askable(ctx);
    for (const q of open) {
      const g = gain(ctx, q);
      out.push(view({ t: "ask", qid: q.id }, ASK_LABEL[q.id] ?? `Ask: ${q.id.replace(/_/g, " ")}`, g, hintFor(ctx, q.id)));
    }
    const hold = sc.wantsMore && open.length > 0;
    if (!hold && demoCandidates(ctx).length > 0 && (ctx.ranked.length <= 4 || open.length === 0)) out.push(view({ t: "offer_demo" }, "Offer a demo"));
    if (ctx.pool.length === 1 && sc.fixed !== undefined) out.push(view({ t: "confirm" }, "Confirm the choice"));
    if (sc.carried) out.push(view({ t: "reconfirm" }, "Check their earlier wishes still stand"));
    const informed = !!(sc.answers["use_case"] || sc.answers["budget_ceiling"]);
    if (!hold && sc.fixed === undefined && (informed || open.length === 0)) for (const m of ctx.ranked.slice(0, 3)) out.push(view({ t: "recommend", model: m.id }, `Recommend the ${m.name}`));
  }
  for (const q of reopenable(ctx)) out.push(view({ t: "ask", qid: q.id, reopen: true }, `Reopen: ${q.id.replace(/_/g, " ")}`));
  if (sc.log.length === 0) return out.filter((v) => v.act.t === "ask" && (v.act.qid === "opening_intent" || v.act.qid === "known_model"));
  if (sc.owed) out.push(view({ t: "answer" }, "Answer their question and leave it with them"));
  return out;
}

function describeForced(act: StaffAct): ActView {
  const label = act.t === "demo" ? `Show the ${modelById(act.model).name}` : act.t === "recommend" ? `Recommend the ${modelById(act.model).name}` : act.t === "ask" ? `Reopen: ${act.qid.replace(/_/g, " ")}` : act.t;
  return { act, label, gain: 0, hint: "the customer asked for this" };
}

function hintFor(ctx: Ctx, qid: string): string {
  const q = questionById(qid);
  if (q.kind !== "hard" && q.kind !== "resolve") return "adds a signal, keeps the pool";
  const opts = optionsFor(ctx, q).filter((o) => !o.neutral && !o.param);
  const models = opts.map((o) => modelCountIf(ctx, qid, o.id));
  if (models.every((n) => n === ctx.ranked.length)) {
    const rows = opts.map((o) => rowsIf(ctx, qid, [o.id]));
    return `${ctx.pool.length} options → ${rows.length > 6 ? rows.slice(0, 6).join(" / ") + " …" : rows.join(" / ")}`;
  }
  const shown = models.length > 6 ? `${models.slice(0, 6).join(" / ")} …` : models.join(" / ");
  return `${ctx.ranked.length} models → ${shown}`;
}

function modelCountIf(ctx: Ctx, qid: string, pick: string): number {
  const sc: Scene = { ...ctx.sc, answers: { ...ctx.sc.answers, [qid]: { picks: [pick], turn: ctx.sc.turn } }, order: ctx.sc.order.includes(qid) ? ctx.sc.order : [...ctx.sc.order, qid] };
  return derive(sc).ranked.length;
}

export interface CustomerMenu {
  pending: Pending;
  prompt: string;
  options: Option[];
  multi: boolean;
  throwbacks: { id: string; label: string }[];
  actions: { action: CustomerAction; label: string }[];
}

const reactions = (ctx: Ctx, shown: string): Option[] => [
  { id: "happy", label: "Leaning towards this one" },
  ...(demoCandidates(ctx).filter((m) => m !== shown).length > 0 ? [{ id: "another", label: "Ask to see another one you offered" }] : []),
  { id: "others", label: "Ask about other laptops" },
  { id: "expensive", label: "Say it's too expensive" },
  { id: "notforme", label: "Say it's not for me" },
  { id: "unsure", label: "Undecided", neutral: true },
];

export function customerMenu(sc: Scene): CustomerMenu | null {
  if (sc.ended || sc.toMove !== "customer" || !sc.pending) return null;
  const ctx = derive(sc);
  const p = sc.pending;
  let options: Option[] = [];
  let multi = false;
  if (p.kind === "question") {
    const q = questionById(p.qid);
    options = optionsFor(p.reopen ? withoutAnswer(ctx, q.id) : ctx, q);
    multi = q.multi === true;
  } else if (p.kind === "offer_demo") {
    options = [...p.models.map((m) => ({ id: `demo:${m}`, label: `Ask to see the ${modelById(m).name}` })), { id: "decline", label: "No demo for now", neutral: true }];
  } else if (p.kind === "demo_reaction") {
    options = reactions(ctx, p.model);
  } else if (p.kind === "reconfirm") {
    options = [{ id: "keep", label: "Yes, keep what I said" }, ...(ctx.sc.carried?.colours ? [{ id: "colour", label: "Change the colour" }] : []), ...(ctx.sc.carried?.minStorageGb ? [{ id: "storage", label: "Change the storage" }] : []), { id: "unsure", label: "Undecided", neutral: true }];
  } else if (p.kind === "recommend") {
    options = [{ id: "yes", label: "Agree with the suggestion" }, { id: "no", label: "Turn the suggestion down" }, { id: "unsure", label: "Undecided", neutral: true }];
  } else if (p.kind === "nudge") {
    options = [...relaxMoves(ctx).map((m) => ({ id: m.id, label: m.label })), { id: "keep", label: "Hold firm", neutral: true }, { id: "unsure", label: "Undecided", neutral: true }];
  } else if (p.kind === "rescue") {
    const near = nearestModels(ctx);
    options = [...near.map((m) => ({ id: `demo:${m}`, label: `Look at the ${modelById(m).name}` })), { id: "think", label: "Go away and think about it", neutral: true }];
  } else if (p.kind === "confirm") {
    const m = modelById(ctx.pool[0]!.model);
    const memoryVaries = new Set(m.tiers.map((t) => t.memoryGb)).size > 1;
    const storageVaries = new Set(m.tiers.map((t) => t.storageGb)).size > 1;
    options = [
      { id: "yes", label: "Confirm this laptop" },
      ...(m.colours.length > 1 ? [{ id: "colour", label: "Change the colour" }] : []),
      ...(memoryVaries ? [{ id: "memory", label: "Change the memory" }] : []),
      ...(storageVaries ? [{ id: "storage", label: "Change the storage" }] : []),
      { id: "model", label: "Change the model" },
      { id: "leave", label: "Leave without a laptop" },
    ];
  }
  const actions: CustomerMenu["actions"] = [];
  if (ctx.pool.length > 0 || p.kind === "nudge" || p.kind === "rescue") {
    for (const m of MODELS) {
      actions.push({ action: { t: "demo", model: m.id }, label: `Ask for a demo of the ${m.name}` });
      actions.push({ action: { t: "pick", model: m.id }, label: `Go with the ${m.name}` });
    }
  }
  for (const q of reopenable(ctx)) actions.push({ action: { t: "change", qid: q.id }, label: `Change an earlier answer: ${q.id.replace(/_/g, " ")}` });
  actions.push({ action: { t: "leave" }, label: "Leave" });
  if (p.kind === "free") actions.push({ action: { t: "ok" }, label: "Carry on" });
  const prompt = sc.log[sc.log.length - 1]?.text ?? "";
  const tb = p.kind === "confirm" || p.kind === "nudge" || p.kind === "rescue" ? [] : throwbacks(ctx);
  return { pending: p, prompt, options, multi, throwbacks: tb, actions };
}

function nearestModels(ctx: Ctx): string[] {
  const found: string[] = [];
  for (const m of relaxMoves(ctx)) {
    const c = { ...ctx.c };
    if (m.id.startsWith("drop:")) for (const key of m.id.slice(5).split("+")) delete c[key as keyof Constraints];
    else c.maxPrice = Number(m.id.slice(6));
    for (const r of poolOf(c)) if (!found.includes(r.model) && !ctx.sc.demoed.includes(r.model)) found.push(r.model);
  }
  return found.slice(0, 2);
}

function validPicks(picks: string[], options: Option[], multi: boolean): string | null {
  if (picks.length === 0) return "pick something";
  if (!multi && picks.length > 1) return "pick one";
  for (const pick of picks) {
    if (options.some((o) => o.id === pick && !o.param)) continue;
    const p = options.find((o) => o.param && pick.startsWith(o.param.prefix));
    if (p?.param) {
      const n = Number(pick.slice(p.param.prefix.length));
      if (Number.isFinite(n) && n >= p.param.min && n <= p.param.max && n % p.param.step === 0) continue;
    }
    return `"${pick}" is not on the menu`;
  }
  return null;
}

export function applyStaff(sc: Scene, act: StaffAct, tone: Tone): Scene | { error: string } {
  const legal = staffActs(sc);
  if (!legal.some((v) => same(v.act, act))) return { error: "that is not a legal move right now" };
  const next = clone(sc);
  const ctx = derive(sc);
  const owed = sc.owed;
  next.owed = null;
  next.owedPool = null;
  next.forced = null;
  if (act.t === "ask" && !act.reopen) next.wantsMore = false;
  next.patience = Math.min(MAX_PATIENCE, next.patience + MOOD[tone] - (act.t === "ask" ? ASK_COST : 0));

  let models: string[] = [];
  if (act.t === "offer_demo") models = demoCandidates(ctx);
  if (act.t === "ask") next.pending = { kind: "question", qid: act.qid, reopen: act.reopen === true };
  else if (act.t === "offer_demo") next.pending = { kind: "offer_demo", models };
  else if (act.t === "demo") {
    next.demoed.push(act.model);
    next.pending = { kind: "demo_reaction", model: act.model };
  } else if (act.t === "reconfirm") next.pending = { kind: "reconfirm" };
  else if (act.t === "recommend") {
    next.recommended.push(act.model);
    next.pending = { kind: "recommend", model: act.model };
  } else if (act.t === "nudge") next.pending = { kind: "nudge" };
  else if (act.t === "rescue") next.pending = { kind: "rescue" };
  else if (act.t === "confirm") next.pending = { kind: "confirm" };
  else next.pending = { kind: "free" };

  const base = act.t === "ask" && act.reopen ? "reopen" : act.t === "demo" ? "demo_highlight" : act.t === "nudge" ? "nudge_relax" : act.t;
  const move = owed && act.t !== "answer" ? `answer_throwback+${base}` : base;
  next.turn++;
  next.toMove = "customer";
  log(next, { who: "staff", tone, move, qid: act.t === "ask" ? act.qid : undefined, text: staffLine(act, ctx, tone, models, owed, next.turn) });
  return next;
}

function log(sc: Scene, l: Omit<Line, "turn" | "after" | "expression">): void {
  const ctx = derive(sc);
  sc.log.push({ ...l, expression: TONE_EXPRESSION[l.tone], turn: sc.turn, after: { rows: ctx.pool.length, models: ctx.ranked.map((m) => m.id) } });
}

export function applyCustomer(sc: Scene, reply: CustomerReply): Scene | { error: string } {
  const menu = customerMenu(sc);
  if (!menu) return { error: "it is not the customer's turn" };
  if (reply.throwback && !menu.throwbacks.some((t) => t.id === reply.throwback)) return { error: `"${reply.throwback}" is not on the throw-back menu` };
  const ctx = derive(sc);
  const next = clone(sc);
  next.forced = null;
  let move = "answer";

  const picks = reply.picks ?? [];
  const answering = picks.length > 0 || !reply.action;
  if (answering) {
    const bad = menu.pending.kind === "free" ? "pick an action" : validPicks(picks, menu.options, menu.multi);
    if (bad) return { error: bad };
    const err = answer(next, ctx, menu, picks);
    if (err) return { error: err };
  }
  if (reply.action && !next.ended) {
    const a = reply.action;
    if (!menu.actions.some((x) => same2(x.action, a))) return { error: "that is not an action on the menu" };
    move = answering ? `answer+action:${a.t}` : `action:${a.t}`;
    next.forced = null;
    if (a.t === "leave") next.ended = { how: "left", why: "the customer left" };
    else if (a.t === "demo") {
      reconsider(next, a.model);
      next.forced = { t: "demo", model: a.model };
    } else if (a.t === "pick") {
      reconsider(next, a.model);
      switchModel(next, a.model);
    }
    else if (a.t === "change") next.forced = { t: "ask", qid: a.qid, reopen: true };
  }
  if (reply.throwback) {
    next.owed = next.owed ? `${next.owed}|${reply.throwback}` : reply.throwback;
    next.owedPool = ctx.ranked.map((m) => m.id);
  }

  next.turn++;
  next.pending = null;
  next.toMove = "staff";
  log(next, { who: "customer", tone: reply.tone, move, picks: reply.picks, throwback: reply.throwback, text: customerLine(reply, menu.options, ctx, next.turn, menu.pending) });
  if (next.ended) {
    next.turn++;
    log(next, { who: "staff", tone: "friendly", move: "close", text: closingLine(next.ended) });
  }
  return next;
}

const same2 = (a: CustomerAction, b: CustomerAction): boolean => JSON.stringify(a) === JSON.stringify(b);

function reconsider(sc: Scene, model: string): void {
  sc.excluded = sc.excluded.filter((m) => m !== model);
}

function setAside(sc: Scene, model: string): void {
  if (!sc.excluded.includes(model)) sc.excluded.push(model);
  if (sc.fixed === model) {
    keepPreferences(sc);
    sc.fixed = undefined;
    sc.answers["known_model"] = { picks: ["notyet"], turn: sc.turn };
    if (!sc.order.includes("known_model")) sc.order.push("known_model");
  }
}

function switchModel(sc: Scene, to: string): void {
  if (sc.fixed && sc.fixed !== to) keepPreferences(sc);
  sc.fixed = to;
}

// What they wanted from the laptop they are moving away from travels with
// them: a colour stays, an exact storage tier becomes a floor. No separate
// "min GB" subtlety is needed beyond that -- the laptop bank only has one
// storage axis per model, not phones' additional "tier for this exact model"
// vs "floor across any model" split layered on top of a single GB field, so
// this is simpler than the phone version it mirrors.
function keepPreferences(sc: Scene): void {
  const colours = ["colour_pick", "colour_prefs"].flatMap((q) => sc.answers[q]?.picks.filter((p) => p.startsWith("colour:")).map((p) => p.slice(7)) ?? []);
  if (colours.length) sc.carried = { ...sc.carried, colours: [...new Set([...(sc.carried?.colours ?? []), ...colours])] };
  const tier = sc.answers["storage_tier_for_model"]?.picks.find((p) => p.startsWith("storage:"));
  if (!tier) return;
  const gb = Number(tier.slice("storage:".length));
  const had = sc.answers["storage_need"]?.picks.find((p) => p.startsWith("min:"));
  if (!had || Number(had.slice(4)) < gb) {
    sc.answers["storage_need"] = { picks: [`min:${gb}`], turn: sc.turn };
    if (!sc.order.includes("storage_need")) sc.order.push("storage_need");
    sc.carried = { ...sc.carried, minStorageGb: gb };
  }
  delete sc.answers["storage_tier_for_model"];
  sc.order = sc.order.filter((q) => q !== "storage_tier_for_model");
}

function forget(sc: Scene, key: keyof Constraints): void {
  for (const qid of [...sc.order]) {
    const a = sc.answers[qid];
    if (a && questionById(qid).apply(a.picks).c?.[key] !== undefined) {
      delete sc.answers[qid];
      sc.order = sc.order.filter((q) => q !== qid);
    }
  }
}

function answer(sc: Scene, ctx: Ctx, menu: CustomerMenu, picks: string[]): string | null {
  const p = menu.pending;
  if (p.kind === "question") {
    const q = questionById(p.qid);
    const k: Contribution = q.apply(picks);
    sc.answers[q.id] = { picks, turn: sc.turn };
    if (!sc.order.includes(q.id)) sc.order.push(q.id);
    if (k.fix) switchModel(sc, k.fix);
    if (k.wanted) {
      sc.wanted = k.wanted;
      sc.owed = `not_carried:${k.wanted}`;
    }
    if (k.gift) sc.gift = true;
    if (k.end) sc.ended = { how: "left", why: "went to another desk" };
    if (q.id === "opening_intent" && picks[0] === "know") sc.forced = { t: "ask", qid: "known_model" };
    if (q.id === "opening_intent" && picks[0] === "line") sc.forced = { t: "ask", qid: "model_family" };
    if (q.id === "known_model" && picks.includes("notyet")) sc.owed = "overview";
    return null;
  }
  const pick = picks[0]!;
  if (p.kind === "offer_demo") {
    if (pick === "decline") sc.declinedDemo.push(...p.models);
    else sc.forced = { t: "demo", model: pick.slice(5) };
  } else if (p.kind === "demo_reaction") {
    if (pick === "happy") switchModel(sc, p.model);
    else if (pick === "expensive" || pick === "notforme") setAside(sc, p.model);
    else if (pick === "others") {
      setAside(sc, p.model);
      sc.wantsMore = true;
    }
    else if (pick === "another" && demoCandidates(derive(sc)).length > 0) sc.forced = { t: "offer_demo" };
  } else if (p.kind === "reconfirm") {
    const had = sc.carried;
    sc.carried = null;
    if (pick === "colour") {
      for (const q of ["colour_pick", "colour_prefs"]) delete sc.answers[q];
      sc.order = sc.order.filter((q) => q !== "colour_pick" && q !== "colour_prefs");
      sc.forced = { t: "ask", qid: derive(sc).model ? "colour_pick" : "colour_prefs" };
    } else if (pick === "storage" && had?.minStorageGb) {
      delete sc.answers["storage_need"];
      sc.order = sc.order.filter((q) => q !== "storage_need");
      sc.forced = { t: "ask", qid: derive(sc).model ? "storage_tier_for_model" : "storage_need" };
    }
  } else if (p.kind === "recommend") {
    if (pick === "yes") switchModel(sc, p.model);
    else if (pick === "no") setAside(sc, p.model);
  } else if (p.kind === "nudge") {
    if (pick.startsWith("drop:")) for (const key of pick.slice(5).split("+")) forget(sc, key as keyof Constraints);
    else if (pick.startsWith("raise:")) {
      sc.answers["budget_ceiling"] = { picks: [`ceiling:${pick.slice(6)}`], turn: sc.turn };
      if (!sc.order.includes("budget_ceiling")) sc.order.push("budget_ceiling");
    } else if (pick === "keep") sc.relaxDeclined++;
  } else if (p.kind === "rescue") {
    if (pick === "think") sc.ended = { how: "left", why: "went away to think about it" };
    else sc.forced = { t: "demo", model: pick.slice(5) };
  } else if (p.kind === "confirm") {
    if (pick === "yes") sc.ended = { how: "bought", sku: ctx.pool[0] as Sku };
    else if (pick === "leave") sc.ended = { how: "left", why: "left without a laptop" };
    else if (pick === "colour") {
      delete sc.answers["colour_pick"];
      delete sc.answers["colour_prefs"];
      sc.order = sc.order.filter((q) => q !== "colour_pick" && q !== "colour_prefs");
      sc.forced = { t: "ask", qid: "colour_pick", reopen: true };
    } else if (pick === "memory") {
      delete sc.answers["memory_tier_for_model"];
      sc.order = sc.order.filter((q) => q !== "memory_tier_for_model");
      sc.forced = { t: "ask", qid: "memory_tier_for_model", reopen: true };
    } else if (pick === "storage") {
      delete sc.answers["storage_tier_for_model"];
      sc.order = sc.order.filter((q) => q !== "storage_tier_for_model");
      sc.forced = { t: "ask", qid: "storage_tier_for_model", reopen: true };
    } else if (pick === "model") {
      keepPreferences(sc);
      delete sc.answers["known_model"];
      sc.order = sc.order.filter((q) => q !== "known_model");
      sc.fixed = undefined;
    }
  }
  return null;
}
