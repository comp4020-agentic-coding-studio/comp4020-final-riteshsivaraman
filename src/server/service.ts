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
import { NPC_DESIGNATION, NPC_LABEL, NPC_NAME, npcsOffDuty, scriptFor, waitSpotFor } from "../shared/duty.ts";
import { NPCS, npcPose } from "../shared/npcs.ts";
import type { CustomerView, Engagement, Inspection, IntentView, ServerMessage, StaffTurnView, TurnView } from "../shared/protocol.ts";
import { engagedMoment } from "../shared/engage.ts";
import { designationOf, type EmployeeKind, type Specialty } from "../shared/profile.ts";
import { defaultStorage, productById } from "../shared/catalogue.ts";
import { DEVICE_SLOT_BY_ID, DEVICE_SLOTS } from "../shared/slots.ts";
import { TABLE_ASSIGNMENTS } from "../shared/assignments.ts";
import { clampToWalkable, COUNTER } from "../shared/world.ts";
import { nearestStaffSpot } from "../shared/storeday.ts";
import { modelById } from "../shared/talk/data.ts";
import { takeOne } from "./stock.ts";
import { emitEvent } from "./eventlog.ts";
import { beginTalk, currentTurn, stepTalk, talkChoices, talkEnded, type TalkTurn } from "./talkWire.ts";
import type { Scene } from "../shared/talk/types.ts";

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
  emitEvent(ctx.now, visitorId, type, data);
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
  eng?: Engagement; // how the NPC is currently drawn, so a walk can start from where it stands
  saleOf?: string; // a till conversation: the sale conversation being paid for
}

// The new talk engine's state for a "phones" conversation held with an NPC
// (coexisting with ConvData above — Ritesh, 2026-10-19: phone-only, coexist
// not replace, docs/conversation-model/server-wiring-proposal.md axes 4/5).
// Same conversations.data JSON column, a different shape inside it,
// distinguished by `engine: "talk"` so a row from before this change (or a
// human-staffed "phones" row, still on the old engine) is never misread as
// one of these.
interface TalkConvData {
  engine: "talk";
  scene: Scene;
  at?: { x: number; z: number };
  eng?: Engagement;
}

type AnyConvData = ConvData | TalkConvData;
const isTalkData = (d: AnyConvData): d is TalkConvData => (d as TalkConvData).engine === "talk";

const getConv = (db: Database.Database, id: string): ConvRow | undefined => db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConvRow | undefined;
const dataOf = (row: ConvRow): ConvData => JSON.parse(row.data ?? "{}") as ConvData;
const anyDataOf = (row: ConvRow): AnyConvData => JSON.parse(row.data ?? "{}") as AnyConvData;

function saveConv(ctx: Ctx, row: ConvRow, data: ConvData, ended: boolean): void {
  ctx.db.prepare("UPDATE conversations SET node = ?, data = ?, ended_at = ? WHERE id = ?").run(data.conv.node, JSON.stringify(data), ended ? ctx.now : null, row.id);
}

// node stays "talk" for every row driven by the new engine — the column is
// NOT NULL and the old engine's reads of it (choicesFor/step) never run for
// these rows, so there is nothing meaningful to put there; the real state
// lives in data.scene.
function saveTalkConv(ctx: Ctx, row: ConvRow, data: TalkConvData, ended: boolean): void {
  ctx.db.prepare("UPDATE conversations SET node = ?, data = ?, ended_at = ? WHERE id = ?").run("talk", JSON.stringify(data), ended ? ctx.now : null, row.id);
}

const nameOf = (ctx: Ctx, id: string): string => {
  const e = ctx.employees.find((x) => x.id === id);
  if (e) return e.name;
  const row = ctx.db.prepare("SELECT name FROM visitors WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? NPC_NAME[id] ?? NPC_LABEL[id] ?? id;
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
  const live = rows.map((r) => ({ npcId: r.with_id, visitorId: r.customer_id, since: r.started_at, at: dataOf(r).at ?? { x: 0, z: 0 } }));
  // an NPC that has walked over to show intent (not yet accepted) stands there too
  const pending = (db.prepare("SELECT * FROM intents WHERE status = 'open' AND staff_kind = 'npc'").all() as IntentRow[]).map(
    intentEngagement,
  );
  return [...live, ...pending];
}

export function dutyMessage(ctx: Ctx): Outgoing {
  return { to: "all", message: { type: "duty", offDuty: offDuty(ctx) } };
}

// ---- inspecting a device (D39, extended 2026-10-12 to every tabled device, stays on the table) ----

// Genuinely within arm's reach, not just "somewhere near the table" (Ritesh,
// 2026-10-12: "especially not on the other end of the table", then "a bit of
// a larger distance threshold") — the client's own DEVICE_HINT_RANGE is
// tighter still, so this is the hard server-side gate, with a little slack
// for latency between the two.
export const INSPECT_RANGE = 1.4;

interface InspectionRow {
  id: string;
  slot_id: string;
  visitor_id: string;
  started_at: number;
  ended_at: number | null;
}

export function inspections(db: Database.Database): Inspection[] {
  const rows = db.prepare("SELECT * FROM inspections WHERE ended_at IS NULL").all() as InspectionRow[];
  return rows.map((r) => ({ slotId: r.slot_id, visitorId: r.visitor_id, since: r.started_at }));
}

function openInspectionOf(db: Database.Database, visitorId: string): InspectionRow | undefined {
  return db.prepare("SELECT * FROM inspections WHERE ended_at IS NULL AND visitor_id = ?").get(visitorId) as InspectionRow | undefined;
}

// Ends whatever the visitor is currently inspecting, if anything. Used both
// for an explicit `inspect_end` and as cleanup (switching devices, starting a
// conversation, leaving the store) — always the same close-and-log path, so
// there is one place that can leave a row open by mistake, not several.
export function endInspect(ctx: Ctx, visitorId: string, why: string): Outgoing[] {
  const row = openInspectionOf(ctx.db, visitorId);
  if (!row) return [];
  ctx.db.prepare("UPDATE inspections SET ended_at = ? WHERE id = ?").run(ctx.now, row.id);
  log(ctx, visitorId, "inspect_end", { slotId: row.slot_id, why });
  const out: Outgoing[] = [{ to: "all", message: { type: "inspect_ended", slotId: row.slot_id } }];
  // putting down the device they were walked to carries the conversation on
  const esc = liveEscortOf(ctx.db, visitorId);
  if (esc && esc.status === "inspecting" && esc.slot_id === row.slot_id) out.push(...finishEscort(ctx, esc, "done"));
  return out;
}

export function startInspect(ctx: Ctx, visitorId: string, slotId: string): Outgoing[] {
  const slot = DEVICE_SLOT_BY_ID.get(slotId);
  if (!slot) return [notice(visitorId, "There is nothing there to look at.")];
  const here = ctx.position(visitorId);
  if (!here) return [];
  if (dist(here, slot) > INSPECT_RANGE) return [notice(visitorId, "Walk a little closer first.")];
  const busy = ctx.db.prepare("SELECT 1 FROM inspections WHERE ended_at IS NULL AND slot_id = ? AND visitor_id != ?").get(slotId, visitorId);
  if (busy) return [notice(visitorId, "Someone else is already looking at that.")];
  const already = openInspectionOf(ctx.db, visitorId);
  if (already && already.slot_id === slotId) return []; // already inspecting this one

  const out: Outgoing[] = [...endInspect(ctx, visitorId, "switched device")];
  ctx.db.prepare("INSERT INTO inspections (id, slot_id, visitor_id, started_at) VALUES (?, ?, ?, ?)").run(randomUUID(), slotId, visitorId, ctx.now);
  log(ctx, visitorId, "inspect_start", { slotId });
  out.push({ to: "all", message: { type: "inspecting", slotId, visitorId, since: ctx.now } });
  return out;
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
  if (open) out.push(...finishEither(ctx, open, visitorId, `${nameOf(ctx, visitorId)} left`, "left"));
  out.push(...closeTalk(ctx, visitorId, false));
  out.push(...cancelIntentsOf(ctx, visitorId));
  const leaving = liveEscortOf(ctx.db, visitorId);
  if (leaving) out.push(...finishEscort(ctx, leaving, "cancelled"));
  out.push(...endInspect(ctx, visitorId, "left the store"));
  releaseReservationsOf(ctx, visitorId, "left the store");
  if (stateOf(ctx.db, visitorId)) {
    setState(ctx, visitorId, { state: "leaving", with_id: null });
    log(ctx, visitorId, "state", { state: "leaving" });
  }
  out.push(staffViewMessage(ctx), dutyMessage(ctx));
  return out;
}

// ---- starting a conversation ----

interface TalkTarget {
  withKind: "npc" | "visitor";
  script: ScriptId;
  here: { x: number; z: number };
}

// Whether `customerId` may open a conversation with `withId` right now (state,
// who and where they are, range), as the refusal to send or the target.
function resolveTalk(ctx: Ctx, customerId: string, withId: string): { fail: Outgoing[] } | { ok: TalkTarget } {
  const st = stateOf(ctx.db, customerId);
  if (!st) return { fail: [notice(customerId, "Only customers can start a conversation.")] };
  if (!(["arriving", "browsing", "waiting_for_help"] as PlayerStateName[]).includes(st.state)) {
    return { fail: [notice(customerId, "Finish what you are doing first.")] };
  }
  const here = ctx.position(customerId);
  if (!here) return { fail: [] };

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
    if (!npc) return { fail: [notice(customerId, "There is nobody there to talk to.")] };
    withKind = "npc";
    designation = NPC_DESIGNATION[withId];
    if (offDuty(ctx).includes(withId)) return { fail: [notice(customerId, `${NPC_LABEL[withId] ?? "They"} is not on today; ask the person standing in for them.`)] };
    const pose = npcPose(npc, ctx.now);
    if (!pose.present) return { fail: [notice(customerId, "They are not in the store right now.")] };
    target = pose;
  }
  const script = designation ? scriptFor(designation) : null;
  if (!script) return { fail: [notice(customerId, `${nameOf(ctx, withId)} has nothing to talk about yet.`)] };
  if (!target || dist(here, target) > TALK_RANGE) return { fail: [notice(customerId, "Walk a little closer first.")] };
  return { ok: { withKind, script, here } };
}

// Opens a conversation at once. Kept as the primitive that accepting an
// intent ends in; the live game goes through `requestTalk` (intent first).
export function startTalk(ctx: Ctx, customerId: string, withId: string): Outgoing[] {
  releaseExpired(ctx);
  const closed = closeTalk(ctx, customerId); // never leave an NPC held by the last conversation
  // trying to talk to someone puts down whatever device you were looking at,
  // whether or not the conversation actually starts
  const putDown = [...closed, ...endInspect(ctx, customerId, "started a conversation")];
  const r = resolveTalk(ctx, customerId, withId);
  if ("fail" in r) return [...putDown, ...r.fail];
  const busy = ctx.db.prepare("SELECT 1 FROM conversations WHERE ended_at IS NULL AND with_id = ?").get(withId);
  if (busy) return [...putDown, notice(customerId, `${nameOf(ctx, withId)} is with someone else. Please wait a moment.`)];
  return [...putDown, ...open(ctx, customerId, withId, r.ok.withKind, r.ok.script, r.ok.here)];
}

// Script "phones" against an NPC uses the new talk engine; everything else
// (including a human-staffed "phones" conversation, which would need the
// richer staff-side UI noted in server-wiring-proposal.md axis 3 option B)
// keeps the old engine. Ritesh, 2026-10-19: phone-only, coexist, smallest
// real slice.
const usesTalkEngine = (script: ScriptId, withKind: "npc" | "visitor"): boolean => script === "phones" && withKind === "npc";

function open(ctx: Ctx, customerId: string, withId: string, withKind: "npc" | "visitor", script: ScriptId, at: { x: number; z: number }, engagedSince: number = ctx.now): Outgoing[] {
  const id = randomUUID();
  // whatever intent led here is over (a path that skipped the handshake, such
  // as a staff member's claim, still clears it so nothing is left dangling)
  const cleared = endLiveIntents(ctx, (r) => r.customer_id === customerId && r.staff_id === withId, "accepted");
  if (usesTalkEngine(script, withKind)) {
    const { scene, turn } = beginTalk(id);
    const row: ConvRow = { id, customer_id: customerId, with_id: withId, with_kind: withKind, script, node: "talk", data: null, started_at: ctx.now, ended_at: null };
    const data: TalkConvData = { engine: "talk", scene, at, ...(withKind === "npc" ? { eng: { npcId: withId, visitorId: customerId, since: engagedSince, at } } : {}) };
    ctx.db
      .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, customerId, withId, withKind, script, row.node, JSON.stringify(data), ctx.now);
    setState(ctx, customerId, { state: "in_conversation", with_id: withId });
    log(ctx, customerId, "conversation_started", { conversationId: row.id, with: withId, kind: withKind, script });
    const out: Outgoing[] = [...cleared, { to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, withId), turn.say, turn.choices, turn.ended, "customer") } }];
    const sm = stateMessage(ctx, customerId);
    if (sm) out.push(sm);
    out.push({ to: "all", message: { type: "engaged", npcId: withId, visitorId: customerId, since: engagedSince, at } });
    out.push(staffViewMessage(ctx));
    if (turn.ended) return [...out, ...finishTalk(ctx, { ...row, data: JSON.stringify(data) }, scene)];
    return out;
  }

  const world = stockWorld(ctx.db);
  const unpaid = script === "till" ? unpaidSale(ctx, customerId) : null;
  const first = begin(script, world, unpaid?.sale);
  const row: ConvRow = { id, customer_id: customerId, with_id: withId, with_kind: withKind, script, node: first.state.node, data: null, started_at: ctx.now, ended_at: null };
  const eng: Engagement = tillEng(ctx, script, withId, customerId, engagedSince, at);
  const data: ConvData = { conv: first.state, awaiting: "customer", at, ...(withKind === "npc" ? { eng } : {}), ...(unpaid ? { saleOf: unpaid.convId } : {}) };
  ctx.db
    .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, customerId, withId, withKind, script, row.node, JSON.stringify(data), ctx.now);
  setState(ctx, customerId, { state: "in_conversation", with_id: withId });
  log(ctx, customerId, "conversation_started", { conversationId: row.id, with: withId, kind: withKind, script });
  const out: Outgoing[] = [...cleared, { to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, withId), first.turn.say, first.turn.choices, false, "customer") } }];
  const sm = stateMessage(ctx, customerId);
  if (sm) out.push(sm);
  if (withKind === "npc") out.push({ to: "all", message: { type: "engaged", ...eng } });
  out.push(staffViewMessage(ctx));
  return out;
}

// How an NPC is drawn while it talks. At the till it does not leave the bar.
function tillEng(ctx: Ctx, script: ScriptId, npcId: string, customerId: string, since: number, at: { x: number; z: number }): Engagement {
  const e: Engagement = { npcId, visitorId: customerId, since, at };
  if (script !== "till") return e;
  const def = NPCS.find((n) => n.id === npcId);
  const p = def ? npcPose(def, since) : at;
  return { ...e, from: { x: p.x, z: p.z }, lead: { x: p.x, z: p.z, fx: at.x, fz: at.z } };
}

// ---- intent to talk (Ritesh, 2026-10-19) ----
//
// A conversation never opens because one side decided to: one side shows
// intent and the other accepts. A greeter walks over and you press E; you
// press E at a specialist and they accept a beat later; a person who is
// already busy accepts only once they are done (the intent waits, 'queued').
// Nothing here is a timer: the beat, the give-up and the queue are all
// decided by whichever request arrives next (a move, or the client's
// intent_poll while an intent involving it is open).

export const INTENT_BEAT_MS = 1000; // an NPC accepts this long after it arrives
export const INTENT_GIVE_UP_MS = 30_000; // staff who showed intent leave after this long ignored
const INTENT_CANCEL_DIST = 9; // metres the customer may wander from where they asked
const WAIT_RADIUS = 2.0; // metres: "at" the spot they were told to wait at
const WAIT_LEAVE_DIST = 3.2; // beyond this the wait starts again

interface IntentRow {
  id: string;
  from_id: string;
  to_id: string;
  customer_id: string;
  staff_id: string;
  staff_kind: "npc" | "visitor";
  reason: IntentView["reason"];
  status: "held" | "queued" | "open" | "accepted" | "expired" | "cancelled";
  created_at: number;
  opened_at: number | null;
  arrived_at: number | null;
  at_x: number | null;
  at_z: number | null;
  ended_at: number | null;
  wait_x: number | null;
  wait_z: number | null;
  wait_label: string | null;
  delay_ms: number | null;
  wait_since: number | null;
}

const liveIntentOf = (db: Database.Database, customerId: string, staffId: string): IntentRow | undefined =>
  db.prepare("SELECT * FROM intents WHERE customer_id = ? AND staff_id = ? AND status IN ('held','queued','open') LIMIT 1").get(customerId, staffId) as IntentRow | undefined;

function intentView(ctx: Ctx, r: IntentRow): IntentView {
  return {
    id: r.id,
    fromId: r.from_id,
    fromName: nameOf(ctx, r.from_id),
    toId: r.to_id,
    toName: nameOf(ctx, r.to_id),
    reason: r.reason,
    state: r.status === "held" ? "held" : r.status === "queued" ? "queued" : "open",
    ...(r.wait_x !== null && r.wait_z !== null ? { wait: { x: r.wait_x, z: r.wait_z, label: r.wait_label ?? "there" } } : {}),
    ...(r.staff_kind === "visitor" ? { human: true } : {}),
    since: r.opened_at ?? r.created_at,
  };
}

export function intentViews(ctx: Ctx): IntentView[] {
  return (ctx.db.prepare("SELECT * FROM intents WHERE status IN ('held','queued','open') ORDER BY created_at, rowid").all() as IntentRow[]).map((r) => intentView(ctx, r));
}

const intentMessage = (ctx: Ctx, r: IntentRow): Outgoing => ({ to: "all", message: { type: "intent", ...intentView(ctx, r) } });

// An NPC is taken (and further intents to it wait) from the moment it walks
// over to show intent. A human is only taken while actually in a conversation:
// they can hold several missions and pick the order themselves.
function staffBusy(ctx: Ctx, staffId: string, kind: "npc" | "visitor"): boolean {
  if (kind === "visitor") return !!openConversationOf(ctx.db, staffId);
  if (npcBusy(ctx, staffId)) return true;
  if (pendingCloseWhere(ctx, "with_id", staffId)) return true; // still standing with someone on their last turn
  if (ctx.db.prepare("SELECT 1 FROM escorts WHERE staff_id = ? AND status IN ('walking','inspecting')").get(staffId)) return true;
  return !!ctx.db.prepare("SELECT 1 FROM intents WHERE staff_id = ? AND status = 'open'").get(staffId);
}

const FREE_STATES: PlayerStateName[] = ["arriving", "browsing", "waiting_for_help"];
function customerFree(ctx: Ctx, customerId: string): boolean {
  const st = stateOf(ctx.db, customerId);
  if (!st || !FREE_STATES.includes(st.state)) return false;
  return !openConversationOf(ctx.db, customerId) && !pendingCloseRow(ctx, customerId);
}

function endIntent(ctx: Ctx, r: IntentRow, why: "accepted" | "expired" | "cancelled", detail: string): Outgoing[] {
  const wasOpen = r.status === "open";
  ctx.db.prepare("UPDATE intents SET status = ?, ended_at = ? WHERE id = ?").run(why, ctx.now, r.id);
  log(ctx, r.customer_id, why === "accepted" ? "intent_accepted" : "intent_ended", { intentId: r.id, from: r.from_id, to: r.to_id, why, detail });
  const out: Outgoing[] = [{ to: "all", message: { type: "intent_end", id: r.id, why } }];
  // an NPC that walked over and was not accepted walks back to its day
  if (why !== "accepted" && wasOpen && r.staff_kind === "npc") out.push({ to: "all", message: { type: "released", npcId: r.staff_id } });
  return out;
}

function endLiveIntents(ctx: Ctx, match: (r: IntentRow) => boolean, why: "accepted" | "cancelled"): Outgoing[] {
  const rows = (ctx.db.prepare("SELECT * FROM intents WHERE status IN ('held','queued','open')").all() as IntentRow[]).filter(match);
  return rows.flatMap((r) => endIntent(ctx, r, why, "superseded"));
}

// Shows intent to talk. `fromId` is whoever initiated (the customer, or the
// staff member coming to find them); the other end is whoever must accept.
function showIntent(ctx: Ctx, p: { fromId: string; customerId: string; staffId: string; staffKind: "npc" | "visitor"; reason: IntentView["reason"]; hold?: { x: number; z: number; label: string }; hint?: { x: number; z: number; label: string } }): Outgoing[] {
  if (liveIntentOf(ctx.db, p.customerId, p.staffId)) return [];
  const at = ctx.position(p.customerId) ?? { x: 0, z: 0 };
  const held = !!p.hold;
  const busy = !held && staffBusy(ctx, p.staffId, p.staffKind);
  const id = randomUUID();
  const toId = p.fromId === p.customerId ? p.staffId : p.customerId;
  const status = held ? "held" : busy ? "queued" : "open";
  // how long they take to come once you are there: a few seconds, not instant
  const delay = held ? 3000 + Math.floor(Math.random() * 5000) : null;
  ctx.db
    .prepare("INSERT INTO intents (id, from_id, to_id, customer_id, staff_id, staff_kind, reason, status, created_at, opened_at, at_x, at_z, wait_x, wait_z, wait_label, delay_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, p.fromId, toId, p.customerId, p.staffId, p.staffKind, p.reason, status, ctx.now, busy || held ? null : ctx.now, at.x, at.z, (p.hold ?? p.hint)?.x ?? null, (p.hold ?? p.hint)?.z ?? null, (p.hold ?? p.hint)?.label ?? null, delay);
  const row = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(id) as IntentRow;
  log(ctx, p.customerId, "intent_shown", { intentId: id, from: p.fromId, to: toId, reason: p.reason, queued: busy, held });
  const out: Outgoing[] = [intentMessage(ctx, row)];
  if (!busy && !held) out.push(...beginApproach(row));
  else if (p.fromId === p.customerId) out.push(notice(p.customerId, `${nameOf(ctx, p.staffId)} is with someone. They will come to you as soon as they are free.`));
  return out;
}

// How an NPC with an open intent is drawn. A person coming to find you walks
// over; the Genius Bar stays behind the bar, facing you, to take payment.
function intentEngagement(r: IntentRow): Engagement {
  const since = r.opened_at ?? r.created_at;
  const at = { x: r.at_x ?? 0, z: r.at_z ?? 0 };
  const base: Engagement = { npcId: r.staff_id, visitorId: r.customer_id, since, at, pending: true };
  if (r.reason !== "pay") return base;
  const def = NPCS.find((n) => n.id === r.staff_id);
  const p = def ? npcPose(def, since) : at;
  return { ...base, from: { x: p.x, z: p.z }, lead: { x: p.x, z: p.z, fx: at.x, fz: at.z } };
}

const beginApproach = (r: IntentRow): Outgoing[] => (r.staff_kind === "npc" ? [{ to: "all", message: { type: "engaged", ...intentEngagement(r) } }] : []);

// Where the staff end of an intent is, and whether they have got to the
// customer. An NPC's position is the same pure function the clients draw.
function staffEnd(ctx: Ctx, r: IntentRow, cpos: { x: number; z: number }): { arrived: boolean } {
  if (r.staff_kind === "npc") {
    return { arrived: !engagedMoment(r.staff_id, intentEngagement(r), ctx.now).walking };
  }
  const spos = ctx.position(r.staff_id);
  return { arrived: !!spos && dist(spos, cpos) <= TALK_RANGE };
}

function acceptIntent(ctx: Ctx, r: IntentRow): Outgoing[] {
  const emp = ctx.employees.find((e) => e.id === r.staff_id);
  const designation = r.staff_kind === "npc" ? NPC_DESIGNATION[r.staff_id] : emp ? designationOfEmployee(emp) : undefined;
  const script: ScriptId | null = r.reason === "pay" ? "till" : designation ? scriptFor(designation) : null;
  const cpos = ctx.position(r.customer_id);
  if (!script || !cpos) return endIntent(ctx, r, "cancelled", "no conversation to have");
  const out = endIntent(ctx, r, "accepted", "accepted");
  return [...out, ...open(ctx, r.customer_id, r.staff_id, r.staff_kind, script, cpos, r.staff_kind === "npc" ? (r.opened_at ?? ctx.now) : ctx.now)];
}

// Runs whatever has become due: queued intents whose person is now free
// start, an NPC accepts a customer one beat after arriving, staff who were
// ignored for long enough give up, and anyone who has left cancels theirs.
export function settleIntents(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  const rows = ctx.db.prepare("SELECT * FROM intents WHERE status IN ('held','queued','open') ORDER BY created_at, rowid").all() as IntentRow[];
  for (const r0 of rows) {
    let r = r0;
    const cpos = ctx.position(r.customer_id);
    const staffGone = r.staff_kind === "visitor" && !ctx.employees.some((e) => e.id === r.staff_id);
    if (!cpos || !ctx.present.includes(r.customer_id) || staffGone) {
      out.push(...endIntent(ctx, r, "cancelled", staffGone ? "staff left" : "customer left"));
      continue;
    }
    if (r.status === "held") {
      // told to wait at a spot: only once they are there, for a few seconds, does help come
      const spot = { x: r.wait_x ?? cpos.x, z: r.wait_z ?? cpos.z };
      const d = dist(cpos, spot);
      if (d > WAIT_LEAVE_DIST) {
        if (r.wait_since !== null) ctx.db.prepare("UPDATE intents SET wait_since = NULL WHERE id = ?").run(r.id); // wandered off: the wait starts again
        continue;
      }
      if (d > WAIT_RADIUS) continue;
      if (r.wait_since === null) {
        ctx.db.prepare("UPDATE intents SET wait_since = ? WHERE id = ?").run(ctx.now, r.id);
        continue;
      }
      if (ctx.now - r.wait_since < (r.delay_ms ?? 0)) continue;
      ctx.db.prepare("UPDATE intents SET status = 'queued' WHERE id = ?").run(r.id);
      r = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(r.id) as IntentRow;
    }
    if (r.status === "queued") {
      if (staffBusy(ctx, r.staff_id, r.staff_kind)) continue;
      ctx.db.prepare("UPDATE intents SET status = 'open', opened_at = ?, at_x = ?, at_z = ? WHERE id = ?").run(ctx.now, cpos.x, cpos.z, r.id);
      r = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(r.id) as IntentRow;
      out.push(intentMessage(ctx, r), ...beginApproach(r));
    }
    if (dist(cpos, { x: r.at_x ?? cpos.x, z: r.at_z ?? cpos.z }) > INTENT_CANCEL_DIST) {
      out.push(...endIntent(ctx, r, "cancelled", "customer walked away"));
      continue;
    }
    const { arrived } = staffEnd(ctx, r, cpos);
    if (!arrived) continue;
    const free = customerFree(ctx, r.customer_id);
    if (r.arrived_at === null || (!free && ctx.now - r.arrived_at > 1000)) {
      // the waiting clock starts when they are there and the customer is free to answer
      ctx.db.prepare("UPDATE intents SET arrived_at = ? WHERE id = ?").run(ctx.now, r.id);
      r = { ...r, arrived_at: ctx.now };
    }
    const waited = ctx.now - (r.arrived_at ?? ctx.now);
    if (r.from_id === r.customer_id && r.staff_kind === "npc") {
      // the customer asked and an NPC has no key to press: it accepts after a beat
      if (free && waited >= INTENT_BEAT_MS) out.push(...acceptIntent(ctx, r));
    } else if (r.from_id !== r.customer_id && r.staff_kind === "npc" && free && waited >= INTENT_GIVE_UP_MS) {
      out.push(...endIntent(ctx, r, "expired", "ignored"));
    }
  }
  return [...out, ...settleEscorts(ctx)];
}

// A customer presses E at someone: shows intent (or accepts theirs).
export function requestTalk(ctx: Ctx, customerId: string, withId: string): Outgoing[] {
  releaseExpired(ctx);
  const putDown = [...closeTalk(ctx, customerId), ...endInspect(ctx, customerId, "started a conversation")];
  const r = resolveTalk(ctx, customerId, withId);
  if ("fail" in r) return [...putDown, ...r.fail];
  const live = liveIntentOf(ctx.db, customerId, withId);
  if (live) {
    if (live.from_id === withId) return [...putDown, ...acceptIncoming(ctx, customerId, live)];
    return [...putDown, notice(customerId, `${nameOf(ctx, withId)} knows you want to talk. They will come to you.`)];
  }
  return [...putDown, ...showIntent(ctx, { fromId: customerId, customerId, staffId: withId, staffKind: r.ok.withKind, reason: "ask" })];
}

// The target of an intent presses E.
function acceptIncoming(ctx: Ctx, acceptorId: string, r: IntentRow): Outgoing[] {
  if (r.status === "held") return [notice(acceptorId, `${nameOf(ctx, r.from_id)} will fetch you once you are waiting at ${r.wait_label ?? "the spot"}.`)];
  if (r.status !== "open") return [notice(acceptorId, "They are with someone else; they will be with you as soon as they are free.")];
  if (r.to_id !== acceptorId) return [];
  const cpos = ctx.position(r.customer_id);
  if (!cpos) return [];
  if (!staffEnd(ctx, r, cpos).arrived) return [notice(acceptorId, `${nameOf(ctx, r.from_id)} is still on the way.`)];
  if (!customerFree(ctx, r.customer_id)) return [notice(acceptorId, "Finish what you are doing first.")];
  if (r.staff_kind === "visitor" && openConversationOf(ctx.db, r.staff_id)) return [notice(acceptorId, "Finish your current conversation first.")];
  const closed = closeTalk(ctx, r.customer_id);
  const still = ctx.db.prepare("SELECT * FROM intents WHERE id = ? AND status = 'open'").get(r.id) as IntentRow | undefined;
  return still ? [...closed, ...acceptIntent(ctx, still)] : closed;
}

export function acceptIntentById(ctx: Ctx, acceptorId: string, intentId: string): Outgoing[] {
  const r = ctx.db.prepare("SELECT * FROM intents WHERE id = ? AND status IN ('held','queued','open')").get(intentId) as IntentRow | undefined;
  if (!r) return [notice(acceptorId, "They are not waiting for you any more.")];
  return acceptIncoming(ctx, acceptorId, r);
}

// Someone left the store: everything they were part of is cancelled.
function cancelIntentsOf(ctx: Ctx, visitorId: string): Outgoing[] {
  return endLiveIntents(ctx, (r) => r.customer_id === visitorId || r.staff_id === visitorId, "cancelled");
}

// The staff member best placed to come and get a customer who needs `post`:
// a person holding that post first (they get a mission), a free one before a
// busy one, the lightest load; an NPC of the post when no one holds it.
function pickHelper(ctx: Ctx, post: string): { id: string; kind: "npc" | "visitor" } | null {
  const off = offDuty(ctx);
  const load = (id: string): number => (ctx.db.prepare("SELECT COUNT(*) AS n FROM intents WHERE staff_id = ? AND status IN ('held','queued','open')").get(id) as { n: number }).n;
  const humans = ctx.employees.filter((e) => designationOfEmployee(e) === post).map((e) => ({ id: e.id, kind: "visitor" as const }));
  const npcs = Object.keys(NPC_DESIGNATION)
    .filter((id) => NPC_DESIGNATION[id] === post && !off.includes(id))
    .filter((id) => {
      const n = NPCS.find((x) => x.id === id);
      return !!n && npcPose(n, ctx.now).present;
    })
    .map((id) => ({ id, kind: "npc" as const }));
  // real users first, even a busy one (they take the next customer when free);
  // only a person already holding two waiting customers is passed over for a
  // free NPC (Ritesh, 2026-10-19: "a priority to be assigned to real user staff")
  const overloaded = (c: { id: string; kind: "npc" | "visitor" }): number => (c.kind === "visitor" && load(c.id) >= 2 ? 1 : 0);
  const ranked = [...humans, ...npcs].sort(
    (a, b) =>
      overloaded(a) - overloaded(b) ||
      Number(a.kind === "npc") - Number(b.kind === "npc") ||
      Number(staffBusy(ctx, a.id, a.kind)) - Number(staffBusy(ctx, b.id, b.kind)) ||
      load(a.id) - load(b.id),
  );
  return ranked[0] ?? null;
}

const pickHelperId = (ctx: Ctx, post: string): string | null => pickHelper(ctx, post)?.id ?? null;

// The customer needs `post`: a particular person is sent for them, who walks
// over and shows intent (a human gets it as a mission).
export function assignHelper(ctx: Ctx, customerId: string, post: string): { out: Outgoing[]; helperName: string | null; waitLabel?: string | null } {
  if (!scriptFor(post)) return { out: [], helperName: null };
  const existing = ctx.db.prepare("SELECT staff_id FROM intents WHERE customer_id = ? AND reason = 'help' AND status IN ('held','queued','open') LIMIT 1").get(customerId) as { staff_id: string } | undefined;
  if (existing) return { out: [], helperName: nameOf(ctx, existing.staff_id) };
  const helper = pickHelper(ctx, post);
  if (!helper) return { out: [], helperName: null };
  // an NPC sent for you does not appear at once: you are told to wait near the
  // area, and they come when you are there. A person walks themselves (a mission).
  const spot = waitSpotFor(post);
  const hold = helper.kind === "npc" ? spot : null;
  const out = showIntent(ctx, { fromId: helper.id, customerId, staffId: helper.id, staffKind: helper.kind, reason: "help", ...(hold ? { hold } : {}), ...(!hold && spot ? { hint: spot } : {}) });
  // a real user is told straight away: this is their customer
  if (helper.kind === "visitor") out.push(notice(helper.id, `New customer: ${nameOf(ctx, customerId)} is waiting${spot ? ` near ${spot.label}` : ""}. Go and meet them.`));
  return { out, helperName: nameOf(ctx, helper.id), waitLabel: spot?.label ?? null };
}

// ---- walking a customer somewhere (Ritesh, 2026-10-19) ----
//
// "Yes, show me the 17" is not a line of text: the staff member walks to a
// real 17 on a table and the customer follows. When they get there the
// device opens by itself (the same inspect as pressing E), and when the
// customer puts it down (Esc) the conversation carries on where it left off.
// After a sale, the same walk goes to the till. The NPC's walk is a pure
// function of the escort's columns (engage.ts); the server only decides when
// the customer has arrived, on the next request that touches it.

const ESCORT_GIVE_UP_MS = 120_000; // the customer never followed
const STAND_OFF_DEVICE = 0.85; // metres in front of a device the customer stands
const TILL_STAND = { x: 0, z: COUNTER.z - COUNTER.d / 2 - 1.0 };

interface EscortRow {
  id: string;
  customer_id: string;
  staff_id: string;
  kind: "demo" | "till";
  slot_id: string | null;
  conversation_id: string | null;
  status: "walking" | "inspecting" | "done" | "cancelled";
  created_at: number;
  ended_at: number | null;
  at_x: number;
  at_z: number;
  from_x: number;
  from_z: number;
  goal_x: number;
  goal_z: number;
  face_x: number;
  face_z: number;
  stand_x: number;
  stand_z: number;
}

const liveEscortOf = (db: Database.Database, customerId: string): EscortRow | undefined =>
  db.prepare("SELECT * FROM escorts WHERE customer_id = ? AND status IN ('walking','inspecting') LIMIT 1").get(customerId) as EscortRow | undefined;

const escortEngagement = (e: EscortRow): Engagement => ({
  npcId: e.staff_id,
  visitorId: e.customer_id,
  since: e.created_at,
  at: { x: e.at_x, z: e.at_z },
  from: { x: e.from_x, z: e.from_z },
  lead: { x: e.goal_x, z: e.goal_z, fx: e.face_x, fz: e.face_z },
});

// Where this NPC is drawn right now, given how its conversation last placed it.
function npcPlace(ctx: Ctx, eng: Engagement | undefined, npcId: string): { x: number; z: number } {
  if (eng) {
    const m = engagedMoment(npcId, eng, ctx.now);
    return { x: m.x, z: m.z };
  }
  const n = NPCS.find((x) => x.id === npcId);
  const p = n ? npcPose(n, ctx.now) : { x: 0, z: 0 };
  return { x: p.x, z: p.z };
}

function setEng(ctx: Ctx, convId: string, eng: Engagement): void {
  const row = getConv(ctx.db, convId);
  if (!row) return;
  const d = anyDataOf(row);
  ctx.db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify({ ...d, eng }), convId);
}

function beginEscort(ctx: Ctx, p: { customerId: string; staffId: string; kind: "demo" | "till"; slotId?: string; conversationId?: string; from: { x: number; z: number }; goal: { x: number; z: number }; face: { x: number; z: number }; stand: { x: number; z: number }; text: string }): Outgoing[] {
  const at = ctx.position(p.customerId) ?? p.stand;
  const id = randomUUID();
  ctx.db
    .prepare(
      "INSERT INTO escorts (id, customer_id, staff_id, kind, slot_id, conversation_id, status, created_at, at_x, at_z, from_x, from_z, goal_x, goal_z, face_x, face_z, stand_x, stand_z) VALUES (?, ?, ?, ?, ?, ?, 'walking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, p.customerId, p.staffId, p.kind, p.slotId ?? null, p.conversationId ?? null, ctx.now, at.x, at.z, p.from.x, p.from.z, p.goal.x, p.goal.z, p.face.x, p.face.z, p.stand.x, p.stand.z);
  const row = ctx.db.prepare("SELECT * FROM escorts WHERE id = ?").get(id) as EscortRow;
  log(ctx, p.customerId, "escort_started", { escortId: id, kind: p.kind, staff: p.staffId, slotId: p.slotId ?? null });
  const eng = escortEngagement(row);
  if (p.conversationId) setEng(ctx, p.conversationId, eng);
  return [
    { to: "all", message: { type: "engaged", ...eng } },
    { to: p.customerId, message: { type: "escort", id, kind: p.kind, npcId: p.staffId, npcName: nameOf(ctx, p.staffId), text: p.text, goal: p.stand } },
  ];
}

// The nearest free device of this model on the floor, and where to stand.
function demoSpot(ctx: Ctx, customerId: string, talkModelId: string): { slotId: string; stand: { x: number; z: number }; goal: { x: number; z: number }; face: { x: number; z: number } } | null {
  const tableModel = `iphone-${talkModelId}`;
  const here = ctx.position(customerId) ?? { x: 0, z: 0 };
  const taken = new Set((ctx.db.prepare("SELECT slot_id FROM inspections WHERE ended_at IS NULL").all() as Array<{ slot_id: string }>).map((r) => r.slot_id));
  const slots = DEVICE_SLOTS.filter((s) => TABLE_ASSIGNMENTS[s.tableId]?.[s.side] === tableModel && !taken.has(s.id)).sort((a, b) => dist(here, a) - dist(here, b));
  const s = slots[0];
  if (!s) return null;
  const sx = s.x + (s.side === "-x" ? -STAND_OFF_DEVICE : STAND_OFF_DEVICE);
  const stand = clampToWalkable("customer", sx, s.z);
  const goal = nearestStaffSpot(clampToWalkable("staff", sx, s.z + 0.9)); // never in a table
  return { slotId: s.id, stand, goal, face: { x: s.x, z: s.z } };
}

// The demo line is written as if you are already at the device ("Here it is.").
// Said before you get there, or with nothing to show, it reads wrong, so the
// opening is swapped for one that fits.
const reworded = (say: string, opening: string): string => say.replace(/^(?:[A-Z][a-z']+[.!] ){0,2}(?:Here it is\.|Here's the [^.]+\.)/, opening);

function startDemoEscort(ctx: Ctx, row: ConvRow, talkModelId: string): Outgoing[] {
  const modelName = modelById(talkModelId).name;
  const spot = demoSpot(ctx, row.customer_id, talkModelId);
  if (!spot) {
    // nothing to walk to (someone is already looking at the last one): the line
    // should not say "here it is" over an empty table
    const d = anyDataOf(row);
    const base = isTalkData(d) ? currentTurn(d.scene) : null;
    const out: Outgoing[] = [notice(row.customer_id, `${nameOf(ctx, row.with_id)}: the ${modelName} is not out to try right now.`)];
    if (base) out.push({ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), reworded(base.say, `I can't show you one right now, but here's the ${modelName}.`), base.choices, false, "customer") } });
    return out;
  }
  const eng = (anyDataOf(row) as AnyConvData).eng;
  const from = npcPlace(ctx, eng, row.with_id);
  return beginEscort(ctx, { customerId: row.customer_id, staffId: row.with_id, kind: "demo", slotId: spot.slotId, conversationId: row.id, from, goal: spot.goal, face: spot.face, stand: spot.stand, text: `Follow ${nameOf(ctx, row.with_id)} to the ${modelName}` });
}

// The customer's last sale that has not been paid for or called off: the talk
// engine ends a conversation as 'bought' with the chosen phone, and the till
// picks it up from there. Stock is not touched here: the talk engine's phones
// are not yet tied to the shop's stock table [TK].
function unpaidSale(ctx: Ctx, customerId: string): { convId: string; sale: NonNullable<ConvState["sale"]> } | null {
  const rows = ctx.db
    .prepare("SELECT * FROM conversations WHERE customer_id = ? AND with_kind = 'npc' AND ended_at IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 5")
    .all(customerId) as ConvRow[];
  for (const r of rows) {
    const d = anyDataOf(r);
    if (!isTalkData(d) || d.scene.ended?.how !== "bought") continue;
    const settled = ctx.db
      .prepare("SELECT 1 FROM events WHERE visitor_id = ? AND type IN ('purchase_paid','purchase_cancelled') AND data LIKE ? LIMIT 1")
      .get(customerId, `%"saleOf":"${r.id}"%`);
    if (settled) continue;
    const sku = d.scene.ended.sku;
    return { convId: r.id, sale: { name: modelById(sku.model).name, colour: sku.colour, storage: sku.storage, price: sku.price } };
  }
  return null;
}

function startTillEscort(ctx: Ctx, row: ConvRow): Outgoing[] {
  const eng = (anyDataOf(row) as AnyConvData).eng;
  const from = npcPlace(ctx, eng, row.with_id);
  const helper = pickHelper(ctx, "genius");
  const genius = nameOf(ctx, helper?.id ?? "genius-1");
  // stand at the till in front of whoever will take payment
  const def = helper?.kind === "npc" ? NPCS.find((n) => n.id === helper.id) : undefined;
  const stand = { x: def ? npcPose(def, ctx.now).x : TILL_STAND.x, z: TILL_STAND.z };
  return beginEscort(ctx, {
    customerId: row.customer_id,
    staffId: row.with_id,
    kind: "till",
    from,
    goal: nearestStaffSpot({ x: stand.x - 1.0, z: stand.z }),
    face: stand,
    stand,
    text: `Follow ${nameOf(ctx, row.with_id)} to the Genius Bar, where ${genius} will take your payment`,
  });
}

// At the Genius Bar: whoever takes payment shows intent, and the customer
// accepts (E) to pay. Nothing is offered if there is nothing to pay for.
function startPayment(ctx: Ctx, customerId: string, stand: { x: number; z: number }): Outgoing[] {
  if (!unpaidSale(ctx, customerId)) return [];
  const helper = pickHelper(ctx, "genius");
  if (!helper) return [notice(customerId, "There is nobody at the Genius Bar right now.")];
  // like any referral, they do not pounce: you wait at the till and they come
  // over after a few seconds (a person taking payment just walks over)
  const hold = helper.kind === "npc" ? { x: stand.x, z: stand.z, label: "the Genius Bar" } : undefined;
  return showIntent(ctx, { fromId: helper.id, customerId, staffId: helper.id, staffKind: helper.kind, reason: "pay", ...(hold ? { hold } : {}) });
}

function finishEscort(ctx: Ctx, e: EscortRow, why: "done" | "cancelled"): Outgoing[] {
  ctx.db.prepare("UPDATE escorts SET status = ?, ended_at = ? WHERE id = ?").run(why, ctx.now, e.id);
  log(ctx, e.customer_id, "escort_ended", { escortId: e.id, kind: e.kind, why });
  const out: Outgoing[] = [{ to: e.customer_id, message: { type: "escort_end", id: e.id } }];
  const cpos = ctx.position(e.customer_id);
  const conv = e.conversation_id ? getConv(ctx.db, e.conversation_id) : undefined;
  if (e.kind === "demo" && conv && conv.ended_at === null && cpos) {
    // back to the customer to carry on talking: walks over from where it waited
    const eng: Engagement = { npcId: e.staff_id, visitorId: e.customer_id, since: ctx.now, at: cpos, from: { x: e.goal_x, z: e.goal_z } };
    setEng(ctx, conv.id, eng);
    out.push({ to: "all", message: { type: "engaged", ...eng } });
    // back from the device: the line about it no longer says "here it is"
    const d = anyDataOf(conv);
    if (isTalkData(d)) {
      const t = currentTurn(d.scene);
      out.push({ to: e.customer_id, message: { type: "turn", ...turnView(conv, nameOf(ctx, conv.with_id), reworded(t.say, "So, that's the one."), t.choices, false, "customer") } });
    }
  } else {
    out.push({ to: "all", message: { type: "released", npcId: e.staff_id } });
    if (e.kind === "till" && why === "done") out.push(...startPayment(ctx, e.customer_id, { x: e.stand_x, z: e.stand_z }));
  }
  return out;
}

// Called on whatever request arrives next (a move, the client's poll).
function settleEscorts(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  const rows = ctx.db.prepare("SELECT * FROM escorts WHERE status = 'walking'").all() as EscortRow[];
  for (const e of rows) {
    const cpos = ctx.position(e.customer_id);
    if (!cpos || !ctx.present.includes(e.customer_id)) {
      out.push(...finishEscort(ctx, e, "cancelled"));
      continue;
    }
    if (ctx.now - e.created_at > ESCORT_GIVE_UP_MS) {
      out.push(...finishEscort(ctx, e, "cancelled"));
      continue;
    }
    if (engagedMoment(e.staff_id, escortEngagement(e), ctx.now).walking) continue; // still leading the way
    if (e.kind === "till") {
      if (dist(cpos, { x: e.stand_x, z: e.stand_z }) <= 1.8) out.push(...finishEscort(ctx, e, "done"));
      continue;
    }
    const slot = e.slot_id ? DEVICE_SLOT_BY_ID.get(e.slot_id) : undefined;
    if (!slot || dist(cpos, slot) > INSPECT_RANGE - 0.1) continue;
    // arrived: the device opens by itself, as if they had pressed E
    const opened = startInspect(ctx, e.customer_id, e.slot_id!);
    if (opened.some((o) => o.message.type === "inspecting")) {
      ctx.db.prepare("UPDATE escorts SET status = 'inspecting' WHERE id = ?").run(e.id);
      out.push(...opened);
    } else {
      out.push(...opened, ...finishEscort(ctx, e, "cancelled"));
    }
  }
  return out;
}

export function cancelEscort(ctx: Ctx, customerId: string): Outgoing[] {
  const e = liveEscortOf(ctx.db, customerId);
  return e && e.status === "walking" ? finishEscort(ctx, e, "cancelled") : [];
}

// ---- NPCs acting on their own (D32/D40, first pass) ----
//
// Neither of the two functions below is a timer — both are checked only
// inside a request that was already happening (a conversation step, a move),
// per the no-background-processes rule. The walk-over itself needs no new
// code: `open()`'s "npc" branch already broadcasts an `engaged` Engagement,
// and the client already animates an NPC walking from wherever it is to the
// visitor for that (shared/engage.ts, built for human-claim and customer-
// initiated talk). Full per-role reactive state machines are explicitly out
// of scope for this pass (Ritesh, 2026-10-12: "later we can try giving npc a
// type of state machine... for now" this lighter layer).
//
// `tryNpcAutoClaim` is written and unit-tested but deliberately NOT wired
// into the live request paths yet: with today's scripts, the only designation
// it would ever actually act on is "specialist:phones" (genius/stock/
// technician have no script, D34, so it's a no-op for them regardless), and
// that's the one post this project's own tests and D35 treat as a deliberate
// human-staff interaction showcase (claim/hand-on/staff-reply). Having an
// idle NPC beat a human to every waiting customer, every time, would make
// that showcase unplayable rather than fix an idle-staff complaint — a
// multi-user behaviour tradeoff CLAUDE.md wants Ritesh's call on, not a
// default I pick. `tryGreeterApproach` has no such conflict (nothing today
// ever greets a new customer unprompted) and is wired into "move" below.

const npcBusy = (ctx: Ctx, npcId: string): boolean =>
  !!ctx.db.prepare("SELECT 1 FROM conversations WHERE ended_at IS NULL AND with_id = ? AND with_kind = 'npc'").get(npcId);

// If this customer is waiting for help and an on-duty NPC for that post is
// free, that NPC claims them now — the same thing a human's `claim()` does,
// just automatic. See the note above on why this isn't called yet.
export function tryNpcAutoClaim(ctx: Ctx, customerId: string): Outgoing[] {
  const st = stateOf(ctx.db, customerId);
  if (!st || st.state !== "waiting_for_help" || !st.needs) return [];
  const script = scriptFor(st.needs);
  if (!script) return [];
  const offDutyIds = offDuty(ctx);
  const npcId = Object.keys(NPC_DESIGNATION).find((id) => NPC_DESIGNATION[id] === st.needs && !offDutyIds.includes(id) && !npcBusy(ctx, id));
  if (!npcId) return [];
  const npc = NPCS.find((n) => n.id === npcId);
  if (!npc || !npcPose(npc, ctx.now).present) return [];
  const at = ctx.position(customerId);
  if (!at) return [];
  // logged under the customer, like every other conversation event — an NPC
  // id is not a row in `visitors`, so it cannot be the events table's own
  // visitor_id (foreign key)
  log(ctx, customerId, "npc_claimed", { npcId, designation: st.needs });
  return open(ctx, customerId, npcId, "npc", script, at);
}

const GREETER_APPROACH_RANGE = 4.0; // metres: generous, since the NPC closes the distance itself

// A customer who hasn't asked for anything yet (just arrived, or browsing)
// gets approached by the greeter once, if the greeter is free and nearby —
// so the first contact in the store doesn't depend on the visitor pressing E
// first (Ritesh, 2026-10-12, "the biggest thing"). Only the greeter: every
// other role waits to be asked, which matches a real store (a specialist
// doesn't stalk the floor; the greeter is the one who says hello).
export function tryGreeterApproach(ctx: Ctx, customerId: string): Outgoing[] {
  const st = stateOf(ctx.db, customerId);
  if (!st || (st.state !== "arriving" && st.state !== "browsing") || st.with_id) return [];
  const greeted =
    ctx.db.prepare("SELECT 1 FROM conversations WHERE customer_id = ? AND with_id = 'greeter-1'").get(customerId) ||
    ctx.db.prepare("SELECT 1 FROM intents WHERE customer_id = ? AND staff_id = 'greeter-1'").get(customerId);
  if (greeted) return []; // asked or approached before: up to the customer now
  if (offDuty(ctx).includes("greeter-1")) return [];
  const greeter = NPCS.find((n) => n.id === "greeter-1");
  if (!greeter) return [];
  const pose = npcPose(greeter, ctx.now);
  if (!pose.present) return [];
  const here = ctx.position(customerId);
  if (!here || dist(here, pose) > GREETER_APPROACH_RANGE) return [];
  if (!scriptFor("greeter")) return [];
  log(ctx, customerId, "npc_approached", { npcId: "greeter-1" });
  return showIntent(ctx, { fromId: "greeter-1", customerId, staffId: "greeter-1", staffKind: "npc", reason: "greet" });
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
  let helper: string | null = null; // who was sent for the customer, if anyone
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
    } else if (e.type === "paid" || e.type === "payment_cancelled") {
      // the sale at the till: recorded, so it is never offered for payment twice
      log(ctx, row.customer_id, e.type === "paid" ? "purchase_paid" : "purchase_cancelled", {
        conversationId: row.id,
        saleOf: data.saleOf ?? null,
        by: row.with_id,
        method: e.type === "paid" ? e.method : null,
        sale: from.sale ?? null,
      });
    } else if (e.type === "request_help") {
      log(ctx, row.customer_id, "help_requested", { needs: e.needs });
      const a = assignHelper(ctx, row.customer_id, e.needs);
      out.push(...a.out);
      if (a.helperName) helper = a.waitLabel ? `${a.helperName}|${a.waitLabel}` : a.helperName;
    }
  }
  log(ctx, row.customer_id, "turn", { conversationId: row.id, from: from.node, choice: choiceId, to: r.state.node });

  const next: ConvData = { ...data, conv: r.state, awaiting: "customer", pending: undefined };
  saveConv(ctx, row, next, r.turn.ended);
  const [helperName, waitLabel] = (helper ?? "").split("|");
  const say = helper
    ? waitLabel
      ? `Of course. Wait near ${waitLabel} and ${helperName} will come and find you.`
      : `Of course. ${helperName} will come and find you. Have a look around while you wait.`
    : r.turn.say;
  out.push({ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, r.turn.choices, r.turn.ended, "customer") } });
  if (r.turn.ended) {
    if (row.with_kind === "visitor") out.push({ to: row.with_id, message: { type: "notice", text: `${nameOf(ctx, row.customer_id)} is done with you.` } });
  }
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

// One `events` row per turn, matching the old engine's own granularity at
// `log(ctx, ..., "turn", ...)` above (CLAUDE.md: every state-changing action
// writes an events row; server-wiring-proposal.md axis 2 chose to match this
// existing precedent rather than a coarser milestone-only grain). The row's
// `conversationId` field lets eventlog.ts's stdout formatter tag every line
// of one conversation together, same as the old engine's rows already do.
function logTalkTurn(ctx: Ctx, row: ConvRow, from: Scene, choiceId: string, after: Scene): void {
  log(ctx, row.customer_id, "talk_turn", { conversationId: row.id, scene: row.script, fromTurn: from.turn, choice: choiceId, say: after.log[after.log.length - 1]?.text ?? "" });
}

// Ends a talk-engine conversation the same way `finish()` ends an old-engine
// one: releases the NPC, returns the customer to browsing, logs it, saves
// the ended row. Also called from open() for the (currently unreachable, but
// not impossible once a persona can end immediately) case of a scene ending
// on its opening line.
function finishTalk(ctx: Ctx, row: ConvRow, scene: Scene): Outgoing[] {
  const prior = anyDataOf(row);
  const data: TalkConvData = { ...(isTalkData(prior) ? prior : {}), engine: "talk", scene };
  saveTalkConv(ctx, row, data, true);
  log(ctx, row.customer_id, "conversation_ended", { conversationId: row.id, why: scene.ended ? `talk:${scene.ended.how}` : "talk:unknown" });
  const cur = stateOf(ctx.db, row.customer_id);
  if (cur && cur.state === "in_conversation") setState(ctx, row.customer_id, { state: "browsing", with_id: null });
  const out: Outgoing[] = [];
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

// The NPC is NOT released when the conversation ends: it stays standing with
// the visitor until they dismiss the final turn (Space/Enter/Esc), which the
// client reports as talk_close (Ritesh, 2026-10-19). The conversation row is
// already ended by then; "released" is the only thing deferred. Pending =
// the visitor's latest ended NPC conversation with no conversation_closed
// event yet, so it survives a restart and needs no timer. Also run when the
// visitor leaves the store or starts another talk, so an NPC is never stuck.
function pendingCloseWhere(ctx: Ctx, column: "customer_id" | "with_id", id: string): ConvRow | undefined {
  const row = ctx.db
    .prepare(`SELECT * FROM conversations WHERE ${column} = ? AND with_kind = 'npc' AND ended_at IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 1`)
    .get(id) as ConvRow | undefined;
  if (!row) return undefined;
  const closed = ctx.db
    .prepare("SELECT 1 FROM events WHERE visitor_id = ? AND type = 'conversation_closed' AND data LIKE ? LIMIT 1")
    .get(row.customer_id, `%"conversationId":"${row.id}"%`);
  return closed ? undefined : row;
}
// the customer's last NPC conversation, ended but not yet dismissed
const pendingCloseRow = (ctx: Ctx, customerId: string): ConvRow | undefined => pendingCloseWhere(ctx, "customer_id", customerId);

export function closeTalk(ctx: Ctx, customerId: string, walkToTill = true): Outgoing[] {
  const row = pendingCloseRow(ctx, customerId);
  if (!row) return [];
  log(ctx, customerId, "conversation_closed", { conversationId: row.id });
  const data = anyDataOf(row);
  // after a sale the staff member walks you to the till; otherwise the NPC is
  // free again and whoever was waiting for it can come now
  if (walkToTill && isTalkData(data) && data.scene.ended?.how === "bought") return startTillEscort(ctx, row);
  return [{ to: "all", message: { type: "released", npcId: row.with_id } }, ...settleIntents(ctx)];
}

function applyTalk(ctx: Ctx, row: ConvRow, from: Scene, choiceId: string): Outgoing[] {
  const result = stepTalk(from, row.id, choiceId);
  if ("error" in result) return [notice(row.customer_id, "That is not one of the options.")];
  const { scene, turn } = result;
  logTalkTurn(ctx, row, from, choiceId, scene);
  const prior = anyDataOf(row);
  const data: TalkConvData = { ...(isTalkData(prior) ? prior : {}), engine: "talk", scene };
  saveTalkConv(ctx, row, data, turn.ended);
  // "someone there can sort the payment" names the person at the Genius Bar
  const say = scene.ended?.how === "bought" ? turn.say.replace(/someone there/, nameOf(ctx, pickHelperId(ctx, "genius") ?? "genius-1")) : turn.say;
  const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, turn.choices, turn.ended, "customer") } }];
  if (turn.ended) return [...out, ...finishTalk(ctx, row, scene)];
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  // a demo: the staff member walks you to a real device of that model
  if (scene.demoed.length > from.demoed.length) out.push(...startDemoEscort(ctx, row, scene.demoed[scene.demoed.length - 1]!));
  return out;
}

export function chooseTurn(ctx: Ctx, customerId: string, conversationId: string, choiceId: string): Outgoing[] {
  releaseExpired(ctx);
  const row = getConv(ctx.db, conversationId);
  if (!row || row.customer_id !== customerId || row.ended_at !== null) return [notice(customerId, "That conversation is over.")];
  const walking = liveEscortOf(ctx.db, customerId);
  if (walking) return [notice(customerId, `Follow ${nameOf(ctx, walking.staff_id)} first.`)];
  const anyData = anyDataOf(row);
  if (isTalkData(anyData)) {
    if (talkEnded(anyData.scene)) return [notice(customerId, "That conversation is over.")];
    if (!talkChoices(anyData.scene).some((c) => c.id === choiceId)) return [notice(customerId, "That is not one of the options.")];
    return applyTalk(ctx, row, anyData.scene, choiceId);
  }
  const data = anyData;
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
    // a no-op today (no genius script yet, D34), but takes effect the moment
    // one exists without this call site needing to change
    return [...finish(ctx, row, `${nameOf(ctx, staffId)} has sent you to the Genius Bar.`, "handed to genius"), ...tryNpcAutoClaim(ctx, row.customer_id)];
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
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

// Either side can walk away mid-conversation (Ritesh, 2026-10-12: "whether
// you're a customer or employee, nobody can ever walk away from a
// conversation without ending it" — Talk.tsx's own Escape only worked once a
// conversation had already ended some other way). Reuses the same `finish()`
// every other way of ending one already goes through.
// Either engine's row can be force-ended this way: the customer walking away
// (any engine) or a human staff member stepping away (old engine only — a
// talk-engine row is always NPC-staffed, usesTalkEngine's own condition, so
// there is no visitor-staff leave path for it). Routes to finishTalk/finish
// so the two engines' own ending bookkeeping (player_state, the events row,
// releasing the NPC) each run correctly rather than one trying to read the
// other's data shape.
function finishEither(ctx: Ctx, row: ConvRow, visitorId: string, say: string, why: string): Outgoing[] {
  const anyData = anyDataOf(row);
  if (isTalkData(anyData)) {
    if (row.customer_id !== visitorId) return []; // no visitor-staff leave path for a talk-engine row
    const scene: Scene = { ...anyData.scene, ended: anyData.scene.ended ?? { how: "left", why } };
    const out: Outgoing[] = [{ to: visitorId, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, [], true, "customer") } }];
    return [...out, ...finishTalk(ctx, row, scene)];
  }
  return finish(ctx, row, say, why);
}

export function leaveConversation(ctx: Ctx, visitorId: string): Outgoing[] {
  const row = openConversationOf(ctx.db, visitorId);
  if (!row) return [];
  if (row.customer_id === visitorId) return finishEither(ctx, row, visitorId, "You stepped away.", "customer left");
  if (row.with_kind === "visitor" && row.with_id === visitorId) {
    return finishEither(ctx, row, visitorId, `${nameOf(ctx, visitorId)} had to step away. Ask again if you need anything.`, "staff left");
  }
  return [];
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
  // not auto-claimed here even for a no-op-today post: `to` is any post a
  // human can type, including "specialist:phones" (see the note above
  // tryNpcAutoClaim) — unlike hand_to_genius this isn't safely hardcoded
  return [...(sm ? [sm] : []), staffViewMessage(ctx)];
}
