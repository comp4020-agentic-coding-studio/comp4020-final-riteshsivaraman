import { askable, derive, gain, money, newScene, optionsFor, questionById, reopenable, rowsIf, withoutAnswer, type Contribution } from "./bank.ts";
import { MODELS, modelById } from "./data.ts";
import { closingLine, customerLine, staffLine, throwbacks } from "./lines.ts";
import { ceil100, poolOf, type Constraints, type Sku } from "./pool.ts";
import { TONE_EXPRESSION, type Ctx, type CustomerAction, type CustomerReply, type Line, type Option, type Pending, type Scene, type StaffAct, type Tone } from "./types.ts";

// The turn engine. A scene alternates: staff make one move, then the customer
// replies from a menu. Both menus are computed here, so a human at a keyboard
// and an NPC choose from exactly the same list, and anything not on the list
// is refused. The scene is plain data (cloneable, serialisable), so the two
// browser tabs of the proof of concept can pass it back and forth.

export { newScene, derive };

// How staff tone moves the customer's patience, and what a question costs.
const MOOD = { friendly: 1, neutral: 0, impatient: -2, unsure: -1 } as const;
const ASK_COST = 1;
const MAX_PATIENCE = 8;

const same = (a: StaffAct, b: StaffAct): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = (sc: Scene): Scene => structuredClone(sc);

export interface ActView {
  act: StaffAct;
  label: string;
  gain: number; // how much it would narrow the pool (staff-side hint)
  hint: string; // e.g. "6 → 3 / 3"
}

// ---- demos ----

// A phone the customer has already seen is not offered again (they can still
// ask for it), and one they said no to is not offered either.
export function demoCandidates(ctx: Ctx): string[] {
  return ctx.ranked.filter((m) => !ctx.sc.declinedDemo.includes(m.id) && !ctx.sc.demoed.includes(m.id)).slice(0, 4).map((m) => m.id);
}

// ---- relaxing a requirement that left nothing ----

export interface RelaxMove {
  id: string; // "drop:<key>" or "raise:<amount>"
  label: string;
}

const KEY_TEXT: Partial<Record<keyof Constraints, string>> = {
  separateTelephoto: "the separate telephoto lens",
  foldable: "the foldable",
  screen: "the screen size",
  maxScreenIn: "the smaller screen",
  minBattery: "the battery length",
  minGB: "the storage floor",
  storage: "that storage",
  colours: "the colour",
  lines: "the model line",
};

export function relaxMoves(ctx: Ctx): RelaxMove[] {
  const moves: RelaxMove[] = [];
  for (const key of Object.keys(KEY_TEXT) as (keyof Constraints)[]) {
    if (ctx.c[key] === undefined) continue;
    const without = { ...ctx.c };
    delete without[key];
    if (poolOf(without).length > 0) moves.push({ id: `drop:${key}`, label: `Give up ${KEY_TEXT[key]}` });
  }
  if (ctx.c.maxPrice !== undefined) {
    const looser = { ...ctx.c };
    delete looser.maxPrice;
    const next = [...new Set(poolOf(looser).map((r) => ceil100(r.price)))].filter((p) => p > ctx.c.maxPrice!).sort((a, b) => a - b);
    for (const p of next.slice(0, 2)) moves.push({ id: `raise:${p}`, label: `Raise my budget to ${money(p)}` });
  }
  return moves;
}

// ---- the staff's menu ----

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
      out.push(view({ t: "ask", qid: q.id }, `Ask: ${q.id.replace(/_/g, " ")}`, g, hintFor(ctx, q.id)));
    }
    if (demoCandidates(ctx).length > 0 && (ctx.ranked.length <= 4 || open.length === 0)) out.push(view({ t: "offer_demo" }, "Offer a demo"));
    if (ctx.pool.length === 1) out.push(view({ t: "confirm" }, "Confirm the choice"));
    // Recommending something before learning anything about them would just be the cheapest phone.
    const informed = sc.order.some((q) => questionById(q).kind !== "route");
    if (ctx.model === null && (informed || open.length === 0)) for (const m of ctx.ranked.slice(0, 3)) out.push(view({ t: "recommend", model: m.id }, `Recommend the ${m.name}`));
  }
  for (const q of reopenable(ctx)) out.push(view({ t: "ask", qid: q.id, reopen: true }, `Reopen: ${q.id.replace(/_/g, " ")}`));
  // Every conversation starts with a greeting and an introduction: before anything else
  // is said, the only moves are the two that open the visit.
  if (sc.log.length === 0) return out.filter((v) => v.act.t === "ask" && (v.act.qid === "opening_intent" || v.act.qid === "known_model"));
  if (sc.owed) out.push(view({ t: "answer" }, "Answer their question and leave it with them"));
  return out;
}

function describeForced(act: StaffAct): ActView {
  const label = act.t === "demo" ? `Show the ${modelById(act.model).name}` : act.t === "recommend" ? `Recommend the ${modelById(act.model).name}` : act.t === "ask" ? `Reopen: ${act.qid.replace(/_/g, " ")}` : act.t;
  return { act, label, gain: 0, hint: "the customer asked for this" };
}

// "6 -> 3 / 3": how each answer would split the rows.
function hintFor(ctx: Ctx, qid: string): string {
  const q = questionById(qid);
  if (q.kind !== "hard" && q.kind !== "resolve") return "adds a signal, keeps the pool";
  const opts = optionsFor(ctx, q).filter((o) => !o.neutral && !o.param);
  const models = opts.map((o) => modelCountIf(ctx, qid, o.id));
  // When the models don't change, the question is still narrowing storage or colour rows.
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

// ---- the customer's menu ----

export interface CustomerMenu {
  pending: Pending;
  prompt: string; // what staff just said
  options: Option[];
  multi: boolean;
  throwbacks: { id: string; label: string }[];
  actions: { action: CustomerAction; label: string }[];
}

const REACTIONS: Option[] = [
  { id: "happy", label: "Leaning towards this one" },
  { id: "another", label: "Ask to see another" },
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
    options = REACTIONS;
  } else if (p.kind === "recommend") {
    options = [{ id: "yes", label: "Agree with the suggestion" }, { id: "no", label: "Turn the suggestion down" }, { id: "unsure", label: "Undecided", neutral: true }];
  } else if (p.kind === "nudge") {
    options = [...relaxMoves(ctx).map((m) => ({ id: m.id, label: m.label })), { id: "keep", label: "Hold firm", neutral: true }, { id: "unsure", label: "Undecided", neutral: true }];
  } else if (p.kind === "rescue") {
    const near = nearestModels(ctx);
    options = [...near.map((m) => ({ id: `demo:${m}`, label: `Look at the ${modelById(m).name}` })), { id: "think", label: "Go away and think about it", neutral: true }];
  } else if (p.kind === "confirm") {
    const m = modelById(ctx.pool[0]!.model);
    options = [
      { id: "yes", label: "Confirm this phone" },
      ...(m.colours.length > 1 ? [{ id: "colour", label: "Change the colour" }] : []),
      ...(m.tiers.length > 1 ? [{ id: "storage", label: "Change the storage" }] : []),
      { id: "model", label: "Change the model" },
      { id: "leave", label: "Leave without a phone" },
    ];
  }
  const actions: CustomerMenu["actions"] = [];
  if (ctx.pool.length > 0 || p.kind === "nudge" || p.kind === "rescue") {
    // Any phone we carry, not only the ones still in the pool: naming a model
    // does not stop the customer wanting to see its neighbour.
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

// When nothing fits and the customer won't relax, the nearest models are the
// ones the pool would hold with the fewest constraints dropped.
function nearestModels(ctx: Ctx): string[] {
  const found: string[] = [];
  for (const m of relaxMoves(ctx)) {
    const c = { ...ctx.c };
    if (m.id.startsWith("drop:")) delete c[m.id.slice(5) as keyof Constraints];
    else c.maxPrice = Number(m.id.slice(6));
    for (const r of poolOf(c)) if (!found.includes(r.model) && !ctx.sc.demoed.includes(r.model)) found.push(r.model);
  }
  return found.slice(0, 2);
}

// ---- validation of a pick against a menu ----

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

// ---- staff move ----

export function applyStaff(sc: Scene, act: StaffAct, tone: Tone): Scene | { error: string } {
  const legal = staffActs(sc);
  if (!legal.some((v) => same(v.act, act))) return { error: "that is not a legal move right now" };
  const next = clone(sc);
  const ctx = derive(sc);
  const owed = sc.owed;
  next.owed = null;
  next.forced = null;
  next.patience = Math.min(MAX_PATIENCE, next.patience + MOOD[tone] - (act.t === "ask" ? ASK_COST : 0));

  let models: string[] = [];
  if (act.t === "offer_demo") models = demoCandidates(ctx);
  if (act.t === "ask") next.pending = { kind: "question", qid: act.qid, reopen: act.reopen === true };
  else if (act.t === "offer_demo") next.pending = { kind: "offer_demo", models };
  else if (act.t === "demo") {
    next.demoed.push(act.model);
    next.pending = { kind: "demo_reaction", model: act.model };
  } else if (act.t === "recommend") {
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
  // The line is spoken in the scene as it stood, so the state it quotes is what staff saw.
  log(next, { who: "staff", tone, move, qid: act.t === "ask" ? act.qid : undefined, text: staffLine(act, ctx, tone, models, owed, next.turn) });
  return next;
}

function log(sc: Scene, l: Omit<Line, "turn" | "after" | "expression">): void {
  const ctx = derive(sc);
  sc.log.push({ ...l, expression: TONE_EXPRESSION[l.tone], turn: sc.turn, after: { rows: ctx.pool.length, models: ctx.ranked.map((m) => m.id) } });
}

// ---- customer reply ----

export function applyCustomer(sc: Scene, reply: CustomerReply): Scene | { error: string } {
  const menu = customerMenu(sc);
  if (!menu) return { error: "it is not the customer's turn" };
  if (reply.throwback && !menu.throwbacks.some((t) => t.id === reply.throwback)) return { error: `"${reply.throwback}" is not on the throw-back menu` };
  const ctx = derive(sc);
  const next = clone(sc);
  next.forced = null;
  let move = "answer";

  // A reply can answer the question and also do something ("Lavender, and can I try the 17?"):
  // the answer is applied first.
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
    next.forced = null; // the action replaces whatever the answer forced
    if (a.t === "leave") next.ended = { how: "left", why: "the customer left" };
    else if (a.t === "demo") next.forced = { t: "demo", model: a.model };
    else if (a.t === "pick") next.fixed = a.model;
    else if (a.t === "change") next.forced = { t: "ask", qid: a.qid, reopen: true };
  }
  // Staff owe an answer to whatever was thrown back, before or alongside their next move.
  if (reply.throwback) next.owed = reply.throwback;

  next.turn++;
  next.pending = null;
  next.toMove = "staff";
  log(next, { who: "customer", tone: reply.tone, move, picks: reply.picks, throwback: reply.throwback, text: customerLine(reply, menu.options, ctx, next.turn, menu.pending) });
  // No scene ends in silence: staff sign off.
  if (next.ended) {
    next.turn++;
    log(next, { who: "staff", tone: "friendly", move: "close", text: closingLine(next.ended) });
  }
  return next;
}

const same2 = (a: CustomerAction, b: CustomerAction): boolean => JSON.stringify(a) === JSON.stringify(b);

// Giving up a requirement forgets the answers that set it, so those questions can be asked afresh.
function forget(sc: Scene, key: keyof Constraints): void {
  for (const qid of [...sc.order]) {
    const a = sc.answers[qid];
    if (a && questionById(qid).apply(a.picks).c?.[key] !== undefined) {
      delete sc.answers[qid];
      sc.order = sc.order.filter((q) => q !== qid);
    }
  }
}

// Applies a menu answer to the scene. Returns an error string if the pick is not allowed.
function answer(sc: Scene, ctx: Ctx, menu: CustomerMenu, picks: string[]): string | null {
  const p = menu.pending;
  if (p.kind === "question") {
    const q = questionById(p.qid);
    const k: Contribution = q.apply(picks);
    sc.answers[q.id] = { picks, turn: sc.turn };
    if (!sc.order.includes(q.id)) sc.order.push(q.id);
    if (k.fix) sc.fixed = k.fix;
    if (k.wanted) {
      sc.wanted = k.wanted;
      sc.owed = `not_carried:${k.wanted}`;
    }
    if (k.gift) sc.gift = true;
    if (k.end) sc.ended = { how: "left", why: "went to another desk" };
    return null;
  }
  const pick = picks[0]!;
  if (p.kind === "offer_demo") {
    if (pick === "decline") sc.declinedDemo.push(...p.models);
    else sc.forced = { t: "demo", model: pick.slice(5) };
  } else if (p.kind === "demo_reaction") {
    if (pick === "happy") sc.fixed = p.model;
    else if (pick === "expensive" || pick === "notforme") sc.excluded.push(p.model);
  } else if (p.kind === "recommend") {
    if (pick === "yes") sc.fixed = p.model;
    else if (pick === "no") sc.excluded.push(p.model);
  } else if (p.kind === "nudge") {
    if (pick.startsWith("drop:")) forget(sc, pick.slice(5) as keyof Constraints);
    else if (pick.startsWith("raise:")) {
      sc.answers["budget_ceiling"] = { picks: [`ceiling:${pick.slice(6)}`], turn: sc.turn };
      if (!sc.order.includes("budget_ceiling")) sc.order.push("budget_ceiling");
    } else if (pick === "keep") sc.relaxDeclined++;
  } else if (p.kind === "rescue") {
    if (pick === "think") sc.ended = { how: "left", why: "went away to think about it" };
    else sc.forced = { t: "demo", model: pick.slice(5) };
  } else if (p.kind === "confirm") {
    if (pick === "yes") sc.ended = { how: "bought", sku: ctx.pool[0] as Sku };
    else if (pick === "leave") sc.ended = { how: "left", why: "left without a phone" };
    else if (pick === "colour") {
      delete sc.answers["colour_pick"];
      delete sc.answers["colour_prefs"];
      sc.order = sc.order.filter((q) => q !== "colour_pick" && q !== "colour_prefs");
      sc.forced = { t: "ask", qid: "colour_pick", reopen: true };
    } else if (pick === "storage") {
      delete sc.answers["storage_tier_for_model"];
      sc.order = sc.order.filter((q) => q !== "storage_tier_for_model");
      sc.forced = { t: "ask", qid: "storage_tier_for_model", reopen: true };
    } else if (pick === "model") {
      // Only the model-specific answers go; budget and the rest stay.
      for (const q of ["known_model", "colour_pick", "colour_prefs", "storage_tier_for_model"]) delete sc.answers[q];
      sc.order = sc.order.filter((q) => !["known_model", "colour_pick", "colour_prefs", "storage_tier_for_model"].includes(q));
      sc.fixed = undefined;
    }
  }
  return null;
}

