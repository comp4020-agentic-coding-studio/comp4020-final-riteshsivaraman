import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  begin,
  canMove,
  choicesFor,
  step,
  type ConvState,
  type Effect,
  type PlayerStateName,
  type ScriptId,
  type StepResult,
  type World,
} from "../shared/conversation.ts";
import { NPC_DESIGNATION, NPC_LABEL, npcsOffDuty, scriptFor } from "../shared/duty.ts";
import { NPCS, npcPose } from "../shared/npcs.ts";
import type { CustomerView, Engagement, ServerMessage, StaffTurnView, TurnView } from "../shared/protocol.ts";
import { designationOf, type EmployeeKind, type Specialty } from "../shared/profile.ts";
import { defaultStorage, productById } from "../shared/catalogue.ts";
import { takeOne } from "./stock.ts";

// The conversation script (shared/conversation.ts) only ever asks for a
// colour — no storage picker exists yet (ADR 5) — so the server sells
// whichever storage `defaultStorage` names for that product. A product this
// store doesn't catalogue yet (nothing to sell) gets "" and simply never has
// stock.
const storageOf = (product: string): string => {
  const p = productById(product);
  return p ? defaultStorage(p) : "";
};

// The store's rules about visitors: who they are in it, where they are in their
// visit, who is dealing with them, what they have put aside. It takes a
// database and returns the messages to send, and touches no socket, so every
// rule here is a spec. The WebSocket glue (presence.ts) only delivers.
//
// Every change of state writes an events row first (CLAUDE.md), and nothing
// here relies on a timer: a deadline is a column, caught up by the next call.

export type Target = { to: string } | { to: "staff" } | { to: "all" };
export type Outgoing = Target & { message: ServerMessage };

export interface Employee {
  id: string;
  name: string;
  kind: EmployeeKind;
  specialty?: Specialty;
}

export interface Ctx {
  db: Database.Database;
  now: number;
  employees: Employee[]; // the employees online
  present: string[]; // everyone online
  position: (id: string) => { x: number; z: number } | undefined;
}

export const TALK_RANGE = 3.2; // metres: "about 2.5 m" plus a step of slack
export const HOLD_MS = 5 * 60 * 1000; // a reserved unit is held for 5 minutes

const designationOfEmployee = (e: Employee): string => designationOf({ kind: e.kind, specialty: e.specialty })!;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

// ---- small database helpers ----

function log(ctx: Ctx, visitorId: string | null, type: string, data?: unknown): void {
  ctx.db.prepare("INSERT INTO events (ts, visitor_id, type, data) VALUES (?, ?, ?, ?)").run(ctx.now, visitorId, type, data === undefined ? null : JSON.stringify(data));
}

interface StateRow {
  visitor_id: string;
  state: PlayerStateName;
  since: number;
  want: string | null;
  needs: string | null;
  with_id: string | null;
  data: string | null;
}

export function stateOf(db: Database.Database, id: string): StateRow | undefined {
  return db.prepare("SELECT * FROM player_state WHERE visitor_id = ?").get(id) as StateRow | undefined;
}

interface StatePatch {
  state?: PlayerStateName;
  want?: string | null;
  needs?: string | null;
  with_id?: string | null;
  note?: string | null;
}

// Sets a visitor's state, keeping "since" unless the state itself changed.
function setState(ctx: Ctx, id: string, patch: StatePatch): void {
  const cur = stateOf(ctx.db, id);
  const state = patch.state ?? cur?.state ?? "arriving";
  const since = cur && cur.state === state ? cur.since : ctx.now;
  const data = cur?.data ? (JSON.parse(cur.data) as Record<string, unknown>) : {};
  if (patch.note !== undefined) {
    if (patch.note === null) delete data.note;
    else data.note = patch.note;
  }
  ctx.db
    .prepare(
      `INSERT INTO player_state (visitor_id, state, since, want, needs, with_id, data) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(visitor_id) DO UPDATE SET state = excluded.state, since = excluded.since, want = excluded.want,
         needs = excluded.needs, with_id = excluded.with_id, data = excluded.data`,
    )
    .run(
      id,
      state,
      since,
      patch.want !== undefined ? patch.want : (cur?.want ?? null),
      patch.needs !== undefined ? patch.needs : (cur?.needs ?? null),
      patch.with_id !== undefined ? patch.with_id : (cur?.with_id ?? null),
      Object.keys(data).length > 0 ? JSON.stringify(data) : null,
    );
}

function stockWorld(db: Database.Database): World {
  const get = db.prepare("SELECT qty FROM stock WHERE product = ? AND colour = ? AND storage = ?");
  return { stock: (p, c) => ((get.get(p, c, storageOf(p)) as { qty: number } | undefined)?.qty ?? 0) };
}

// Gives back every reservation whose time is up.
export function releaseExpired(ctx: Ctx): number {
  const rows = ctx.db.prepare("SELECT id, visitor_id, product, colour, storage FROM reservations WHERE status = 'held' AND expires_at <= ?").all(ctx.now) as Array<{
    id: string;
    visitor_id: string;
    product: string;
    colour: string;
    storage: string;
  }>;
  for (const r of rows) {
    ctx.db.transaction(() => {
      ctx.db.prepare("UPDATE reservations SET status = 'expired' WHERE id = ?").run(r.id);
      ctx.db.prepare("UPDATE stock SET qty = qty + 1 WHERE product = ? AND colour = ? AND storage = ?").run(r.product, r.colour, r.storage);
    })();
    log(ctx, r.visitor_id, "reservation_expired", { product: r.product, colour: r.colour });
  }
  return rows.length;
}

function releaseReservationsOf(ctx: Ctx, visitorId: string, why: string): void {
  const rows = ctx.db.prepare("SELECT id, product, colour, storage FROM reservations WHERE visitor_id = ? AND status = 'held'").all(visitorId) as Array<{
    id: string;
    product: string;
    colour: string;
    storage: string;
  }>;
  for (const r of rows) {
    ctx.db.transaction(() => {
      ctx.db.prepare("UPDATE reservations SET status = 'released' WHERE id = ?").run(r.id);
      ctx.db.prepare("UPDATE stock SET qty = qty + 1 WHERE product = ? AND colour = ? AND storage = ?").run(r.product, r.colour, r.storage);
    })();
    log(ctx, visitorId, "reservation_released", { product: r.product, colour: r.colour, why });
  }
}

// ---- conversations ----

interface ConvRow {
  id: string;
  customer_id: string;
  with_id: string;
  with_kind: "npc" | "visitor";
  script: ScriptId;
  node: string;
  data: string | null;
  started_at: number;
  ended_at: number | null;
}

interface ConvData {
  conv: ConvState;
  awaiting: "customer" | "staff";
  pending?: { choiceId: string; label: string }; // what the customer picked, waiting for the employee
  at?: { x: number; z: number };
}

const getConv = (db: Database.Database, id: string): ConvRow | undefined => db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConvRow | undefined;
const dataOf = (row: ConvRow): ConvData => JSON.parse(row.data ?? "{}") as ConvData;

function saveConv(ctx: Ctx, row: ConvRow, data: ConvData, ended: boolean): void {
  ctx.db.prepare("UPDATE conversations SET node = ?, data = ?, ended_at = ? WHERE id = ?").run(data.conv.node, JSON.stringify(data), ended ? ctx.now : null, row.id);
}

const nameOf = (ctx: Ctx, id: string): string => {
  const e = ctx.employees.find((x) => x.id === id);
  if (e) return e.name;
  const row = ctx.db.prepare("SELECT name FROM visitors WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? NPC_LABEL[id] ?? id;
};

const turnView = (row: ConvRow, withName: string, say: string, choices: TurnView["choices"], ended: boolean, awaiting: "customer" | "staff"): TurnView => ({
  conversationId: row.id,
  withId: row.with_id,
  withName,
  say,
  choices,
  ended,
  awaiting,
});

export function openConversationOf(db: Database.Database, visitorId: string): ConvRow | undefined {
  return db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND (customer_id = ? OR (with_id = ? AND with_kind = 'visitor')) LIMIT 1").get(visitorId, visitorId) as ConvRow | undefined;
}

const offDuty = (ctx: Ctx): string[] => npcsOffDuty(ctx.employees.map(designationOfEmployee));

export function engagements(db: Database.Database): Engagement[] {
  const rows = db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'npc'").all() as ConvRow[];
  return rows.map((r) => ({ npcId: r.with_id, visitorId: r.customer_id, since: r.started_at, at: dataOf(r).at ?? { x: 0, z: 0 } }));
}

export function dutyMessage(ctx: Ctx): Outgoing {
  return { to: "all", message: { type: "duty", offDuty: offDuty(ctx) } };
}

// ---- the staff's view of the customers ----

export function customersView(ctx: Ctx): CustomerView[] {
  const rows = ctx.db
    .prepare(
      `SELECT v.id, v.name, ps.state, ps.want, ps.needs, ps.since, ps.with_id, ps.data
       FROM player_state ps JOIN visitors v ON v.id = ps.visitor_id`,
    )
    .all() as Array<{ id: string; name: string; state: PlayerStateName; want: string | null; needs: string | null; since: number; with_id: string | null; data: string | null }>;
  const here = new Set(ctx.present);
  const employeeIds = new Set(ctx.employees.map((e) => e.id));
  return rows
    .filter((r) => here.has(r.id) && !employeeIds.has(r.id) && r.state !== "leaving")
    .map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      want: r.want,
      needs: r.needs,
      sinceMs: Math.max(0, ctx.now - r.since),
      withName: r.with_id ? nameOf(ctx, r.with_id) : null,
      note: r.data ? ((JSON.parse(r.data) as { note?: string }).note ?? null) : null,
    }))
    .sort((a, b) => b.sinceMs - a.sinceMs);
}

const staffViewMessage = (ctx: Ctx): Outgoing => ({ to: "staff", message: { type: "staff_view", customers: customersView(ctx) } });
const notice = (to: string, text: string): Outgoing => ({ to, message: { type: "notice", text } });
const stateMessage = (ctx: Ctx, id: string): Outgoing | null => {
  const s = stateOf(ctx.db, id);
  return s ? { to: id, message: { type: "state", state: s.state, want: s.want, needs: s.needs } } : null;
};

// ---- entering and leaving ----

export function enter(ctx: Ctx, visitorId: string, profile: { kind: string; specialty?: string; look?: unknown }, name?: string): void {
  ctx.db.prepare("UPDATE visitors SET role = ?, specialty = ?, look = ? WHERE id = ?").run(profile.kind, profile.specialty ?? null, profile.look ? JSON.stringify(profile.look) : null, visitorId);
  if (name) ctx.db.prepare("UPDATE visitors SET name = ? WHERE id = ?").run(name, visitorId);
  log(ctx, visitorId, "profile", { kind: profile.kind, specialty: profile.specialty ?? null });
  // a customer's visit begins; an employee has no visit, only a post
  if (profile.kind === "customer") setState(ctx, visitorId, { state: "arriving", want: null, needs: null, with_id: null });
  else ctx.db.prepare("DELETE FROM player_state WHERE visitor_id = ?").run(visitorId);
}

export function leaveStore(ctx: Ctx, visitorId: string): Outgoing[] {
  const out: Outgoing[] = [];
  const open = openConversationOf(ctx.db, visitorId);
  if (open) out.push(...finish(ctx, open, `${nameOf(ctx, visitorId)} left`, "left"));
  releaseReservationsOf(ctx, visitorId, "left the store");
  if (stateOf(ctx.db, visitorId)) {
    setState(ctx, visitorId, { state: "leaving", with_id: null });
    log(ctx, visitorId, "state", { state: "leaving" });
  }
  out.push(staffViewMessage(ctx), dutyMessage(ctx));
  return out;
}

// ---- starting a conversation ----

export function startTalk(ctx: Ctx, customerId: string, withId: string): Outgoing[] {
  releaseExpired(ctx);
  const st = stateOf(ctx.db, customerId);
  if (!st) return [notice(customerId, "Only customers can start a conversation.")];
  if (!(["arriving", "browsing", "waiting_for_help"] as PlayerStateName[]).includes(st.state)) {
    return [notice(customerId, "Finish what you are doing first.")];
  }
  const here = ctx.position(customerId);
  if (!here) return [];

  let designation: string | undefined;
  let withKind: "npc" | "visitor";
  let target: { x: number; z: number } | undefined;
  const employee = ctx.employees.find((e) => e.id === withId);
  if (employee) {
    withKind = "visitor";
    designation = designationOfEmployee(employee);
    target = ctx.position(employee.id);
  } else {
    const npc = NPCS.find((n) => n.id === withId);
    if (!npc) return [notice(customerId, "There is nobody there to talk to.")];
    withKind = "npc";
    designation = NPC_DESIGNATION[withId];
    if (offDuty(ctx).includes(withId)) return [notice(customerId, `${NPC_LABEL[withId] ?? "They"} is not on today; ask the person standing in for them.`)];
    const pose = npcPose(npc, ctx.now);
    if (!pose.present) return [notice(customerId, "They are not in the store right now.")];
    target = pose;
  }
  const script = designation ? scriptFor(designation) : null;
  if (!script) return [notice(customerId, `${nameOf(ctx, withId)} has nothing to talk about yet.`)];
  if (!target || dist(here, target) > TALK_RANGE) return [notice(customerId, "Walk a little closer first.")];
  const busy = ctx.db.prepare("SELECT 1 FROM conversations WHERE ended_at IS NULL AND with_id = ?").get(withId);
  if (busy) return [notice(customerId, `${nameOf(ctx, withId)} is with someone else. Please wait a moment.`)];

  return open(ctx, customerId, withId, withKind, script, here);
}

function open(ctx: Ctx, customerId: string, withId: string, withKind: "npc" | "visitor", script: ScriptId, at: { x: number; z: number }): Outgoing[] {
  const world = stockWorld(ctx.db);
  const first = begin(script, world);
  const row: ConvRow = { id: randomUUID(), customer_id: customerId, with_id: withId, with_kind: withKind, script, node: first.state.node, data: null, started_at: ctx.now, ended_at: null };
  const data: ConvData = { conv: first.state, awaiting: "customer", at };
  ctx.db
    .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, customerId, withId, withKind, script, row.node, JSON.stringify(data), ctx.now);
  setState(ctx, customerId, { state: "in_conversation", with_id: withId });
  log(ctx, customerId, "conversation_started", { conversationId: row.id, with: withId, kind: withKind, script });
  const out: Outgoing[] = [{ to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, withId), first.turn.say, first.turn.choices, false, "customer") } }];
  const sm = stateMessage(ctx, customerId);
  if (sm) out.push(sm);
  if (withKind === "npc") out.push({ to: "all", message: { type: "engaged", npcId: withId, visitorId: customerId, since: ctx.now, at } });
  out.push(staffViewMessage(ctx));
  return out;
}

// ---- taking turns ----

// Applies a step's effects, then tells the customer. Reserving stock is
// atomic: if someone else took the last unit first, the step is taken again
// with that colour sold out, so the customer is told the truth.
function apply(ctx: Ctx, row: ConvRow, data: ConvData, from: ConvState, choiceId: string, result: StepResult, world: World): Outgoing[] {
  let r = result;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reserve = r.effects.find((e): e is Extract<Effect, { type: "reserve" }> => e.type === "reserve");
    if (!reserve) break;
    if (takeOne(ctx.db, reserve.product, reserve.colour, storageOf(reserve.product))) {
      ctx.db
        .prepare("INSERT INTO reservations (id, visitor_id, product, colour, storage, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'held', ?, ?)")
        .run(randomUUID(), row.customer_id, reserve.product, reserve.colour, storageOf(reserve.product), ctx.now, ctx.now + HOLD_MS);
      log(ctx, row.customer_id, "reserved", { product: reserve.product, colour: reserve.colour, expiresAt: ctx.now + HOLD_MS });
      break;
    }
    // lost the race: the same choice, with that colour gone
    const sold: World = { stock: (p, c) => (p === reserve.product && c === reserve.colour ? 0 : world.stock(p, c)) };
    const again = step(from, choiceId, sold);
    if ("error" in again) break;
    r = again;
    log(ctx, row.customer_id, "reserve_lost", { product: reserve.product, colour: reserve.colour });
  }

  const out: Outgoing[] = [];
  for (const e of r.effects) {
    if (e.type === "player_state") {
      const cur = stateOf(ctx.db, row.customer_id);
      const to = e.state;
      // a state the machine asks for that is not a legal move is a bug in a script
      if (cur && !canMove(cur.state, to)) throw new Error(`illegal state move ${cur.state} -> ${to}`);
      setState(ctx, row.customer_id, {
        state: to,
        want: e.want !== undefined ? e.want : undefined,
        needs: e.needs !== undefined ? e.needs : undefined,
        with_id: r.turn.ended ? null : row.with_id,
      });
      log(ctx, row.customer_id, "state", { state: to, want: e.want ?? null, needs: e.needs ?? null });
    } else if (e.type === "request_help") {
      log(ctx, row.customer_id, "help_requested", { needs: e.needs });
    }
  }
  log(ctx, row.customer_id, "turn", { conversationId: row.id, from: from.node, choice: choiceId, to: r.state.node });

  const next: ConvData = { ...data, conv: r.state, awaiting: "customer", pending: undefined };
  saveConv(ctx, row, next, r.turn.ended);
  out.push({ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), r.turn.say, r.turn.choices, r.turn.ended, "customer") } });
  if (r.turn.ended) {
    if (row.with_kind === "npc") out.push({ to: "all", message: { type: "released", npcId: row.with_id } });
    if (row.with_kind === "visitor") out.push({ to: row.with_id, message: { type: "notice", text: `${nameOf(ctx, row.customer_id)} is done with you.` } });
  }
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

export function chooseTurn(ctx: Ctx, customerId: string, conversationId: string, choiceId: string): Outgoing[] {
  releaseExpired(ctx);
  const row = getConv(ctx.db, conversationId);
  if (!row || row.customer_id !== customerId || row.ended_at !== null) return [notice(customerId, "That conversation is over.")];
  const data = dataOf(row);
  if (data.awaiting !== "customer") return [notice(customerId, `Waiting for ${nameOf(ctx, row.with_id)}.`)];
  const world = stockWorld(ctx.db);
  const result = step(data.conv, choiceId, world);
  if ("error" in result) return [notice(customerId, "That is not one of the options.")];
  if (row.with_kind === "npc") return apply(ctx, row, data, data.conv, choiceId, result, world);

  // a person is serving: the reply waits for them (menus on both sides)
  const label = choicesFor(data.conv, world).find((c) => c.id === choiceId)?.label ?? choiceId;
  const next: ConvData = { ...data, awaiting: "staff", pending: { choiceId, label } };
  saveConv(ctx, row, next, false);
  log(ctx, customerId, "turn_waiting_for_staff", { conversationId, choice: choiceId });
  const staffTurn: StaffTurnView = {
    conversationId,
    customerId,
    customerName: nameOf(ctx, customerId),
    customerPicked: label,
    scripted: result.turn.say,
    actions: [
      { id: "reply", label: "Reply as the script goes" },
      { id: "hand_to_genius", label: "Send them to the Genius Bar" },
      { id: "end", label: "End politely" },
    ],
  };
  return [
    { to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), `${nameOf(ctx, row.with_id)} will be right with you.`, [], false, "staff") } },
    { to: row.with_id, message: { type: "staff_turn", ...staffTurn } },
    staffViewMessage(ctx),
  ];
}

export function staffRespond(ctx: Ctx, staffId: string, conversationId: string, action: "reply" | "hand_to_genius" | "end"): Outgoing[] {
  releaseExpired(ctx);
  const row = getConv(ctx.db, conversationId);
  if (!row || row.with_id !== staffId || row.with_kind !== "visitor" || row.ended_at !== null) return [notice(staffId, "That conversation is over.")];
  const data = dataOf(row);
  if (data.awaiting !== "staff" || !data.pending) return [notice(staffId, "It is not your turn.")];
  const world = stockWorld(ctx.db);
  if (action === "reply") {
    // taken again from the stored state, so the stock is checked now, not when
    // the customer picked
    const from = data.conv;
    const result = step(from, data.pending.choiceId, world);
    if ("error" in result) return [notice(staffId, "That choice is no longer available.")];
    log(ctx, staffId, "staff_replied", { conversationId, action });
    return apply(ctx, row, data, from, data.pending.choiceId, result, world);
  }
  if (action === "hand_to_genius") {
    log(ctx, staffId, "staff_handed_to_genius", { conversationId });
    setState(ctx, row.customer_id, { state: "waiting_for_help", needs: "genius", want: stateOf(ctx.db, row.customer_id)?.want ?? null, with_id: null });
    return finish(ctx, row, `${nameOf(ctx, staffId)} has sent you to the Genius Bar.`, "handed to genius");
  }
  log(ctx, staffId, "staff_ended", { conversationId });
  setState(ctx, row.customer_id, { state: "browsing", with_id: null });
  return finish(ctx, row, `${nameOf(ctx, staffId)} had to step away. Ask again if you need anything.`, "ended by staff");
}

// Ends a conversation and tells the customer why.
function finish(ctx: Ctx, row: ConvRow, say: string, why: string): Outgoing[] {
  const data = dataOf(row);
  ctx.db.prepare("UPDATE conversations SET ended_at = ?, data = ? WHERE id = ?").run(ctx.now, JSON.stringify({ ...data, awaiting: "customer", pending: undefined }), row.id);
  log(ctx, row.customer_id, "conversation_ended", { conversationId: row.id, why });
  const cur = stateOf(ctx.db, row.customer_id);
  if (cur && cur.state === "in_conversation") setState(ctx, row.customer_id, { state: "browsing", with_id: null });
  const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, [], true, "customer") } }];
  if (row.with_kind === "npc") out.push({ to: "all", message: { type: "released", npcId: row.with_id } });
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

// ---- employees coordinating ----

export function claim(ctx: Ctx, staffId: string, customerId: string): Outgoing[] {
  releaseExpired(ctx);
  const e = ctx.employees.find((x) => x.id === staffId);
  if (!e) return [notice(staffId, "Only employees can do that.")];
  const st = stateOf(ctx.db, customerId);
  if (!st || st.state !== "waiting_for_help") return [notice(staffId, "They are not waiting for help.")];
  const mine = designationOfEmployee(e);
  if (st.needs !== mine) return [notice(staffId, `They are waiting for ${st.needs}; you are ${mine}.`)];
  const script = scriptFor(mine);
  if (!script) return [notice(staffId, "There is no conversation for your post yet.")];
  if (openConversationOf(ctx.db, staffId)) return [notice(staffId, "Finish your current conversation first.")];
  const at = ctx.position(customerId) ?? { x: 0, z: 0 };
  log(ctx, staffId, "claimed", { customerId, designation: mine });
  return open(ctx, customerId, staffId, "visitor", script, at);
}

export function handOn(ctx: Ctx, staffId: string, customerId: string, to: string, note?: string): Outgoing[] {
  const e = ctx.employees.find((x) => x.id === staffId);
  if (!e) return [notice(staffId, "Only employees can do that.")];
  const st = stateOf(ctx.db, customerId);
  if (!st || st.state !== "waiting_for_help") return [notice(staffId, "They are not waiting for help.")];
  const valid = new Set(Object.values(NPC_DESIGNATION));
  if (!valid.has(to)) return [notice(staffId, "There is no such post.")];
  const text = typeof note === "string" ? note.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 140) : "";
  setState(ctx, customerId, { needs: to, note: text.length > 0 ? `${e.name}: ${text}` : null });
  log(ctx, staffId, "handed_on", { customerId, to, note: text || null });
  const sm = stateMessage(ctx, customerId);
  return [...(sm ? [sm] : []), staffViewMessage(ctx)];
}
