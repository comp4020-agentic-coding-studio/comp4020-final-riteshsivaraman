import { askable, derive, gain, newScene, questionById, reopenable, type Contribution } from "./bank.ts";
import { faultById, runCheck } from "./data.ts";
import { greetLine, closingLine, customerLine, dataLossLine, outcomeLine, staffLine } from "./lines.ts";
import type { Constraints } from "./pool.ts";
import { TONE_EXPRESSION, type CustomerAction, type CustomerReply, type Ctx, type Line, type Option, type Outcome, type Pending, type Scene, type StaffAct, type Tone } from "./types.ts";

export { newScene, derive };

// The turn protocol, scene-owned per the core-extraction proposal's finding:
// this scene's Pending/StaffAct have no purchase-shaped moves at all (no
// demo/pick/recommend), so core/npc.ts's staffMove (which pattern-matches the
// purchase StaffAct union) is not reused -- this scene has its own in npc.ts.
// What IS reused from core/engine.ts: the question-bank fold (derive/
// askable/gain, via bank.ts), validatePicks and hintText (both proved
// scene-agnostic in phase 2 step 2, re-verified against this scene's shapes
// below).
import { hintText, validatePicks } from "../../core/engine.ts";

const same = (a: StaffAct, b: StaffAct): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = (sc: Scene): Scene => structuredClone(sc);

const ASK_LABEL: Record<string, string> = {
  which_model: "Ask which phone it is",
  symptom: "Ask what's wrong",
  wet_exposure: "Ask about water exposure",
  data_matters: "Ask whether data matters and if there's a backup",
  prior_repair: "Ask about any prior repair",
};

export interface ActView {
  act: StaffAct;
  label: string;
  gain: number;
  hint: string;
}

// A destructive fault (data.ts: destructive === true) can only be reached by
// present_outcome once the mandatory warning has been given -- the gate
// found missing from the purchase-shaped engine in the core-extraction
// proposal (section 1c): a precondition on reaching an outcome, not on
// which question is asked next, so it cannot be expressed as `forced`.
const confirmedFaultIsDestructive = (ctx: Ctx): boolean => {
  const id = ctx.c.confirmedFault;
  return id !== undefined && faultById(id).destructive;
};

function hintFor(ctx: Ctx, qid: string): string {
  const q = questionById(qid);
  if (q.kind !== "hard") return "adds a signal, keeps the pool";
  const opts = q.options(ctx).filter((o) => !o.neutral);
  // This scene's pool never grows past the symptom's own fault list (at most
  // 4 rows), so a plain "how many left per option" is enough -- no need for
  // the model/row distinction core/engine.ts's hintText makes for a
  // catalogue-shaped pool with many rows per model.
  const counts = opts.map((o) => {
    const trial: Ctx = derive({ ...ctx.sc, answers: { ...ctx.sc.answers, [qid]: { picks: [o.id], turn: ctx.sc.turn } }, order: ctx.sc.order.includes(qid) ? ctx.sc.order : [...ctx.sc.order, qid] });
    return trial.pool.length;
  });
  return hintText(ctx.pool.length, ctx.ranked.length, counts, counts);
}

export function staffActs(sc: Scene): ActView[] {
  if (sc.ended || sc.toMove !== "staff") return [];
  const ctx = derive(sc);
  const view = (act: StaffAct, label: string, g = 0, hint = ""): ActView => ({ act, label, gain: g, hint });
  if (sc.forced) return [{ act: sc.forced, label: describeForced(sc.forced), gain: 0, hint: "the customer asked for this" }];

  const out: ActView[] = [];
  if (sc.log.length === 0) return [view({ t: "ask", qid: "which_model" }, ASK_LABEL["which_model"]!)];

  const open = askable(ctx);
  for (const q of open) out.push(view({ t: "ask", qid: q.id }, ASK_LABEL[q.id] ?? `Ask: ${q.id}`, gain(ctx, q), hintFor(ctx, q.id)));

  if (ctx.c.symptom && open.length === 0 && ctx.c.confirmedFault === undefined) {
    if (ctx.pool.length === 0) out.push(view({ t: "cannot_diagnose" }, "Say nothing in the system matches this"));
    else out.push(view({ t: "run_check" }, "Run a diagnostic check", 1));
  }
  if (ctx.c.confirmedFault !== undefined) {
    if (confirmedFaultIsDestructive(ctx) && !sc.dataLossWarned) out.push(view({ t: "warn_data_loss" }, "Warn that this repair could lose their data"));
    else out.push(view({ t: "present_outcome" }, "Explain the outcome and options"));
  }
  for (const q of reopenable(ctx)) out.push(view({ t: "ask", qid: q.id, reopen: true }, `Reopen: ${q.id}`));
  return out;
}

function describeForced(act: StaffAct): string {
  if (act.t === "ask") return `Reopen: ${act.qid}`;
  return act.t;
}

export interface CustomerMenu {
  pending: Pending;
  prompt: string;
  options: Option[];
  multi: boolean;
  actions: { action: CustomerAction; label: string }[];
}

export function customerMenu(sc: Scene): CustomerMenu | null {
  if (sc.ended || sc.toMove !== "customer" || !sc.pending) return null;
  const ctx = derive(sc);
  const p = sc.pending;
  let options: Option[] = [];
  let multi = false;
  if (p.kind === "question") {
    const q = questionById(p.qid);
    options = q.options(ctx);
    multi = q.multi === true;
  } else if (p.kind === "data_loss_ack") {
    options = [{ id: "ack", label: "I understand" }, { id: "decline", label: "I'd rather not risk it" }];
  } else if (p.kind === "outcome_choice") {
    const fault = ctx.c.confirmedFault ? faultById(ctx.c.confirmedFault) : undefined;
    options = fault
      ? [
          ...(fault.location === "in_store" && fault.fixable ? [{ id: "fix_now", label: "Go ahead, fix it now" }] : []),
          ...(fault.fixable ? [{ id: "book", label: fault.location === "in_store" ? "Book it in" : "Send it away for repair" }] : []),
          { id: "decline", label: "Not right now" },
        ]
      : [{ id: "decline", label: "Not right now" }];
  }
  const actions: CustomerMenu["actions"] = [];
  for (const q of reopenable(ctx)) actions.push({ action: { t: "change", qid: q.id }, label: `Change an earlier answer: ${q.id}` });
  actions.push({ action: { t: "leave" }, label: "Leave" });
  if (p.kind === "free") actions.push({ action: { t: "ok" }, label: "Carry on" });
  const prompt = sc.log[sc.log.length - 1]?.text ?? "";
  return { pending: p, prompt, options, multi, actions };
}

const validPicks = validatePicks;

export function applyStaff(sc: Scene, act: StaffAct, tone: Tone): Scene | { error: string } {
  const legal = staffActs(sc);
  if (!legal.some((v) => same(v.act, act))) return { error: "that is not a legal move right now" };
  const next = clone(sc);
  const ctx = derive(sc);
  next.forced = null;

  if (act.t === "ask") {
    next.pending = { kind: "question", qid: act.qid, reopen: act.reopen === true };
    next.turn++;
    next.toMove = "customer";
    log(next, { who: "staff", tone, move: act.reopen ? "reopen" : "ask", qid: act.qid, text: staffLine(act, ctx, tone, next.turn, sc.log.length === 0) });
    return next;
  }
  if (act.t === "run_check") {
    // Deterministic: reads the fault table given symptom + water exposure, a
    // fact entering state the way a customer answer would (core/engine.ts's
    // derive() does not care who wrote sc.answers["confirmed_fault"] -- the
    // mechanism the core-extraction proposal's phase-2-step-1 re-verification
    // confirmed needs zero core changes). Written via the same answers/order
    // channel so it folds into the pool exactly like a customer pick.
    const fault = runCheck(ctx.c.symptom!, ctx.c.wetExposure);
    next.answers["confirmed_fault"] = { picks: [`fault:${fault.id}`], turn: sc.turn };
    next.order = [...next.order, "confirmed_fault"];
    next.pending = { kind: "free" };
    next.turn++;
    next.toMove = "customer";
    log(next, { who: "staff", tone, move: "run_check", text: staffLine(act, ctx, tone, next.turn, false, fault.id) });
    return next;
  }
  if (act.t === "warn_data_loss") {
    next.dataLossWarned = true;
    next.pending = { kind: "data_loss_ack" };
    next.turn++;
    next.toMove = "customer";
    log(next, { who: "staff", tone, move: "warn_data_loss", text: dataLossLine() });
    return next;
  }
  if (act.t === "present_outcome") {
    next.pending = { kind: "outcome_choice" };
    next.turn++;
    next.toMove = "customer";
    log(next, { who: "staff", tone, move: "present_outcome", text: outcomeLine(ctx) });
    return next;
  }
  if (act.t === "cannot_diagnose") {
    next.ended = { how: "cannot_fix" };
    next.turn++;
    log(next, { who: "staff", tone, move: "cannot_diagnose", text: "I'm not able to narrow this down from what you've told me. I'd like to send it to a specialist to have a closer look." });
    return endScene(next);
  }
  next.pending = { kind: "free" };
  next.turn++;
  next.toMove = "customer";
  log(next, { who: "staff", tone, move: "answer", text: "" });
  return next;
}

function endScene(sc: Scene): Scene {
  if (sc.ended) log(sc, { who: "staff", tone: "friendly", move: "close", text: closingLine(sc.ended) });
  return sc;
}

function log(sc: Scene, l: Omit<Line, "turn" | "after" | "expression">): void {
  const ctx = derive(sc);
  sc.log.push({ ...l, expression: TONE_EXPRESSION[l.tone], turn: sc.turn, after: { rows: ctx.pool.length, models: ctx.ranked.map((m) => m.id) } });
}

export function applyCustomer(sc: Scene, reply: CustomerReply): Scene | { error: string } {
  const menu = customerMenu(sc);
  if (!menu) return { error: "it is not the customer's turn" };
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
    if (!menu.actions.some((x) => sameAction(x.action, a))) return { error: "that is not an action on the menu" };
    move = answering ? `answer+action:${a.t}` : `action:${a.t}`;
    if (a.t === "leave") next.ended = { how: "left", why: "the customer left" };
    else if (a.t === "change") next.forced = { t: "ask", qid: a.qid, reopen: true };
  }

  next.turn++;
  next.pending = null;
  next.toMove = "staff";
  log(next, { who: "customer", tone: reply.tone, move, picks: reply.picks, text: customerLine(reply, menu.options, menu.pending) });
  return next.ended ? endScene(next) : next;
}

const sameAction = (a: CustomerAction, b: CustomerAction): boolean => JSON.stringify(a) === JSON.stringify(b);

function forget(sc: Scene, key: keyof Constraints): void {
  for (const qid of [...sc.order]) {
    const a = sc.answers[qid];
    if (a && qid !== "confirmed_fault" && questionById(qid).apply(a.picks).c?.[key] !== undefined) {
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
    if (p.qid === "symptom" && picks[0] === "symptom:other") sc.ended = { how: "cannot_fix" };
    return null;
  }
  const pick = picks[0]!;
  if (p.kind === "data_loss_ack") {
    if (pick === "decline") sc.ended = { how: "declines" };
    // "ack" just lets the next staff turn offer present_outcome (staffActs
    // re-checks dataLossWarned, already true); nothing else to record.
    return null;
  }
  if (p.kind === "outcome_choice") {
    const fault = ctx.c.confirmedFault ? faultById(ctx.c.confirmedFault) : undefined;
    if (pick === "fix_now" && fault) sc.ended = { how: "fixed_now" };
    else if (pick === "book" && fault) sc.ended = { how: "booked", location: fault.location, etaDays: fault.etaDays };
    else if (pick === "decline") sc.ended = { how: "declines" };
    return null;
  }
  return null;
}
