import type Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
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
import { isStaff, NPCS, npcPose } from "../shared/npcs.ts";
import { FLOOR, type ChatPair, type CustomerView, type Engagement, type HeldCpu, type HoldView, type Inspection, type OrderView, type ServerMessage, type StaffMenuView, type TurnView } from "../shared/protocol.ts";
import { engagedArrival, engagedMoment } from "../shared/engage.ts";
import { heldDone } from "../shared/heldCpu.ts";
import { designationOf, type EmployeeKind, type Specialty } from "../shared/profile.ts";
import { defaultStorage, productById } from "../shared/catalogue.ts";
import { DEVICE_SLOT_BY_ID, DEVICE_SLOTS } from "../shared/slots.ts";
import { TABLE_ASSIGNMENTS } from "../shared/assignments.ts";
import { ENTRANCE_ZONE, clampToWalkable, COUNTER, zoneOf } from "../shared/world.ts";
import { CAST, castOf, CYCLE, momentOf, nearestStaffSpot, TABLE_SEATS, timelineOf } from "../shared/storeday.ts";
import { modelById } from "../shared/talk/data.ts";
import { stockOf, takeOne } from "./stock.ts";
import { emitEvent } from "./eventlog.ts";
import { advanceStaff, beginHumanTalk, payScene, beginTalk, currentTurn, staffActList, staffLog, staffStats, STAFF_TONES, stepStaffMove, standInAnswer, stepTalk, talkChoices, talkEnded, type TalkTurn } from "./talkWire.ts";
import { offerSoldOut } from "../shared/talk/scene.ts";
import type { Scene } from "../shared/talk/types.ts";
import { CPU_PAY_MS, cpuPayChoice, cpuReply, startCpuTalk, type CpuTalk } from "./cpuCustomer.ts";

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
  // a new state is a new wait: who already let an offer of them pass, the claim
  // that put them in a conversation and the place they held on the waiting list
  // belong to the old one. A live offer is not dropped here: settleOffers
  // withdraws it, so the withdrawal is logged.
  if (cur && cur.state !== state) {
    delete data.offered;
    delete data.claim;
    delete data.waitingSince;
  }
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
  // sitting down to talk it through (Ritesh, 2026-10-19)
  stage?: "seat_offer"; // the opening question: shall we sit down?
  seat?: { tableId: string }; // seated at this table now
  sat?: boolean; // has sat once already, so "sit back down" is offered after a demo
  checkout?: Checkout; // the sale is made: stock is being fetched, then they pay here
  // the customer has left and an NPC customer stands in for them, answering from the engine's own customer model
  standIn?: { npcId: string; name: string; eng: Engagement };
  // a promoted timetable customer answers by rule, not by click (issue #39, cpuCustomer.ts)
  cpu?: CpuTalk;
}

// Paying (Ritesh, 2026-10-19, reworked 2026-10-21): the sale is made in one chat,
// which ends; an order then carries it (orders below) until the specialist,
// holding the bag, finds the customer and a short payment conversation opens.
// Issue #2: the payment itself is a three-beat handheld state machine --
// scanned -> total_shown -> tapped -- each beat a stored field advanced only
// by an explicit request (CLAUDE.md: no timers). `paid` is not a `beat` value:
// it is the order reaching stage `done`, which only `handleCheckoutChoice`
// may do, and only once `beat` has reached "tapped".
type PaymentBeat = "scanned" | "total_shown" | "tapped";
interface Checkout {
  stage: "pay";
  sale: { name: string; colour: string; storage: string; price: number };
  beat: PaymentBeat;
  // Issue #49: when `beat` was last reached, so the client can read the beat
  // and its timestamp off OrderView instead of trusting a timer of its own.
  // Set once in openPay (the "scanned" beat) and again every time advanceBeat
  // moves the beat forward.
  beatAt: number;
}

const NEXT_BEAT: Record<PaymentBeat, PaymentBeat | undefined> = {
  scanned: "total_shown",
  total_shown: "tapped",
  tapped: undefined,
};

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
  const live = rows.map((r): Engagement => {
    const d = anyDataOf(r);
    return d.eng ?? { npcId: r.with_id, visitorId: r.customer_id, since: r.started_at, at: d.at ?? { x: 0, z: 0 } };
  });
  // an NPC customer standing in for one who left, with a real specialist
  for (const r of db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor'").all() as ConvRow[]) {
    const d = anyDataOf(r);
    if (isTalkData(d) && d.standIn) live.push(d.standIn.eng);
  }
  // an NPC that has walked over to take payment stands there too
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

// The talk engine's model id of a device slot, if the slot is a phone table
// with an assigned model (assignments.ts's TABLE_ASSIGNMENTS doesn't cover
// every slot D28 gives a stable id to). Same mapping startDemoEscort's
// demoSpot uses in reverse (talkModelId -> "iphone-${talkModelId}").
function talkModelOfSlot(slotId: string): string | undefined {
  const slot = DEVICE_SLOT_BY_ID.get(slotId);
  if (!slot) return undefined;
  const assigned = TABLE_ASSIGNMENTS[slot.tableId]?.[slot.side];
  return assigned?.startsWith("iphone-") ? assigned.slice("iphone-".length) : undefined;
}

// Phone models physically inspected at a table this visit (D39, issue #35):
// the specialist's demo offer must agree with the inspection table, which it
// has no other way to see (demoCandidates only knows sc.demoed/declinedDemo,
// src/shared/talk/types.ts). "This visit" is found the same way
// greeterCanTake already finds it — the last `profile` event, written once
// per enter()/rejoin() — matching declinedDemo/demoed's own this-visit-only
// scope (CLAUDE.md: the event log is what a "did this happen" read uses).
function inspectedModelsOf(ctx: Ctx, visitorId: string): string[] {
  const visitStart = (ctx.db.prepare("SELECT MAX(ts) AS t FROM events WHERE visitor_id = ? AND type = 'profile'").get(visitorId) as { t: number | null }).t ?? 0;
  const rows = ctx.db.prepare("SELECT data FROM events WHERE visitor_id = ? AND type = 'inspect_start' AND ts >= ?").all(visitorId, visitStart) as Array<{ data: string | null }>;
  const models = new Set<string>();
  for (const r of rows) {
    const slotId = r.data ? (JSON.parse(r.data) as { slotId?: string }).slotId : undefined;
    const model = slotId ? talkModelOfSlot(slotId) : undefined;
    if (model) models.add(model);
  }
  return [...models];
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
      ...offerView(r.data),
      ...(CPU_CUSTOMER_IDS.has(r.id) && ctx.position(r.id) ? { at: ctx.position(r.id) } : {}),
    }))
    .sort((a, b) => b.sinceMs - a.sinceMs);
}

const offerView = (data: string | null): { offeredTo?: string; offerUntil?: number } => {
  const o = data ? (JSON.parse(data) as { offer?: { to: string; at: number } }).offer : undefined;
  return o ? { offeredTo: o.to, offerUntil: o.at + OFFER_MS } : {};
};

const staffViewMessage = (ctx: Ctx): Outgoing => ({ to: "staff", message: { type: "staff_view", customers: customersView(ctx) } });
const notice = (to: string, text: string): Outgoing => ({ to, message: { type: "notice", text } });
const stateMessage = (ctx: Ctx, id: string): Outgoing | null => {
  const s = stateOf(ctx.db, id);
  return s ? { to: id, message: { type: "state", state: s.state, want: s.want, needs: s.needs } } : null;
};

// ---- entering and leaving ----

// Someone joins (or comes back, or reloads, or the server restarted under them): whatever
// they left half done is cleaned up first, so they are never stuck behind "finish what you
// are doing first" for a chat nobody can see any more, then their visit begins afresh.
export function rejoin(ctx: Ctx, visitorId: string, profile: { kind: string; specialty?: string; look?: unknown }, name?: string): Outgoing[] {
  // a staff user coming back (a reconnect, or the server restarted under them) with a
  // customer they had claimed still open: that customer goes back on the waiting list
  // at their place, as when they leave (issue #1 criterion 6), not out to browsing
  const out = [...releaseClaimsOf(ctx, visitorId), ...retireStandIn(ctx, visitorId), ...leaveStore(ctx, visitorId)];
  enter(ctx, visitorId, profile, name);
  return out;
}

export function enter(ctx: Ctx, visitorId: string, profile: { kind: string; specialty?: string; look?: unknown }, name?: string): void {
  ctx.db.prepare("UPDATE visitors SET role = ?, specialty = ?, look = ? WHERE id = ?").run(profile.kind, profile.specialty ?? null, profile.look ? JSON.stringify(profile.look) : null, visitorId);
  if (name) ctx.db.prepare("UPDATE visitors SET name = ? WHERE id = ?").run(name, visitorId);
  log(ctx, visitorId, "profile", { kind: profile.kind, specialty: profile.specialty ?? null });
  // a customer's visit begins; an employee has no visit, only a post
  if (profile.kind === "customer") setState(ctx, visitorId, { state: "arriving", want: null, needs: null, with_id: null });
  else ctx.db.prepare("DELETE FROM player_state WHERE visitor_id = ?").run(visitorId);
}

const standInReplies = (scene: Scene, conversationId: string): Scene => {
  let cur = scene;
  for (let i = 0; i < 5 && !cur.ended && cur.toMove === "customer"; i++) {
    const next = standInAnswer(cur, conversationId);
    if (next === cur) break;
    cur = next;
  }
  return cur;
};

// A real customer is leaving a conversation with a real specialist: an NPC
// customer takes their place where they stood (or sat) and the conversation
// carries on, so the specialist is not left talking to nobody. Call it while
// they still count as present, before `leaveStore`.
export function handOverCustomer(ctx: Ctx, leaverId: string): Outgoing[] {
  const row = ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor' AND customer_id = ?").get(leaverId) as ConvRow | undefined;
  const d = row ? anyDataOf(row) : null;
  if (!row || !d || !isTalkData(d) || d.scene.ended || d.checkout || d.standIn) return [];
  const used = new Set<string>();
  for (const r of ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor'").all() as ConvRow[]) {
    const o = anyDataOf(r);
    if (isTalkData(o) && o.standIn) used.add(o.standIn.npcId);
  }
  // one who is in the store now if there is one; otherwise one who is due later steps in early
  const free = NPCS.filter((n) => !isStaff(n) && !used.has(n.id));
  const npc = free.find((n) => npcPose(n, ctx.now).present) ?? free[0];
  const cpos = ctx.position(leaverId);
  const spos = ctx.position(row.with_id);
  if (!npc || !cpos || !spos) return [];
  // walking with the specialist stops here
  const out: Outgoing[] = [];
  const walking = liveEscortOf(ctx.db, leaverId);
  if (walking) out.push(...finishEscort(ctx, walking, "cancelled"));
  const cur = getConv(ctx.db, row.id) ?? row;
  const d1 = anyDataOf(cur) as TalkConvData;
  const table = d1.seat ? TABLE_SEATS.find((x) => x.id === d1.seat!.tableId) : undefined;
  const base = { npcId: npc.id, visitorId: row.with_id, since: ctx.now };
  const eng: Engagement = table
    ? { ...base, at: table.host.at, from: table.guest.at, lead: { x: table.guest.at.x, z: table.guest.at.z, fx: table.guest.face.x, fz: table.guest.face.z }, seated: true }
    : { ...base, at: spos, from: cpos, lead: { x: cpos.x, z: cpos.z, fx: spos.x, fz: spos.z } };
  const name = nameOf(ctx, npc.id);
  const scene = standInReplies(d1.scene, row.id);
  const next: TalkConvData = { ...d1, scene, standIn: { npcId: npc.id, name, eng } };
  saveTalkConv(ctx, cur, next, false);
  log(ctx, leaverId, "customer_stood_in_for", { conversationId: row.id, npcId: npc.id });
  out.push({ to: "all", message: { type: "notice", text: `${nameOf(ctx, leaverId)} left. ${name} (NPC) is standing in for them.` } });
  if (table) out.push({ to: "all", message: { type: "unseated", visitorId: leaverId } });
  out.push({ to: "all", message: { type: "engaged", ...eng } });
  const now = getConv(ctx.db, row.id)!;
  if (scene.ended) return [...out, ...finishTalk(ctx, now, scene)];
  out.push(staffMenu(ctx, now, next), staffViewMessage(ctx));
  return out;
}

// ---- a promoted timetable customer answering a real specialist (issue #39) ----
//
// The rules themselves are in cpuCustomer.ts; this is where they meet the
// conversation row. A timetable customer is promoted with a `cpu` mark on its
// player_state (issue #20), and a real staff user who opens the phones
// conversation with it gets a conversation that carries its seed and purpose.

function cpuTalkFor(ctx: Ctx, customerId: string): CpuTalk | undefined {
  if (!CPU_CUSTOMER_IDS.has(customerId)) return undefined;
  const st = stateOf(ctx.db, customerId);
  const mark = st ? cpuMarkOf(st.data) : undefined;
  if (!mark) return undefined;
  return startCpuTalk(customerId, mark.visit, castOf(customerId).purpose ?? null);
}

// The specialist has moved: the customer answers at once, by rule, through the
// same engine step a real customer's click takes, one events row per answer.
function cpuAnswers(ctx: Ctx, row: ConvRow, d: TalkConvData): Outgoing[] {
  const before = d.scene;
  const r = d.cpu ? cpuReply(before, d.cpu) : null;
  if (!r) return [staffMenu(ctx, row, d), staffViewMessage(ctx)];
  logTalkTurn(ctx, row, before, r.choice, r.scene);
  const next: TalkConvData = { ...d, scene: r.scene, cpu: r.talk };
  saveTalkConv(ctx, row, next, !!r.scene.ended);
  if (r.scene.ended?.how === "bought") return startCheckout(ctx, row, next, r.scene.ended.sku, r.scene.log[r.scene.log.length - 1]?.text ?? "");
  if (r.scene.ended) return finishTalk(ctx, row, r.scene);
  return [staffMenu(ctx, row, next), staffViewMessage(ctx)];
}

// A timetable customer at the payment taps a beat after the latest beat it was
// shown, the way a real visitor's tap does: the tap catches up any beat the
// specialist has not shown yet (handleCheckoutChoice). A stored column (beatAt)
// compared on the next request, never a timer.
function settleCpuPayments(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  const rows = ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor'").all() as ConvRow[];
  for (const row of rows) {
    if (!CPU_CUSTOMER_IDS.has(row.customer_id)) continue;
    const d = anyDataOf(row);
    if (!isTalkData(d) || !d.checkout || ctx.now - d.checkout.beatAt < CPU_PAY_MS) continue;
    const st = stateOf(ctx.db, row.customer_id);
    const mark = st ? cpuMarkOf(st.data) : undefined;
    if (!mark) continue;
    out.push(...handleCheckoutChoice(ctx, row, d, cpuPayChoice(row.customer_id, mark.visit)));
  }
  return out;
}

// The customer who left has come back (same visitor): the stand-in steps aside.
export function retireStandIn(ctx: Ctx, visitorId: string): Outgoing[] {
  const row = ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor' AND customer_id = ?").get(visitorId) as ConvRow | undefined;
  const d = row ? anyDataOf(row) : null;
  if (!row || !d || !isTalkData(d) || !d.standIn) return [];
  return finishTalk(ctx, row, { ...d.scene, ended: { how: "left", why: "the customer came back" } });
}

// A real employee is leaving: an NPC of the same post takes their place on the
// spot, where they stood (or sat), so it looks as if nothing happened. Any
// conversation they were in carries on with the NPC. Call it while they are
// still counted as present, before `leaveStore`.
export function handOverPost(ctx: Ctx, leaverId: string): Outgoing[] {
  const emp = ctx.employees.find((e) => e.id === leaverId);
  const pos = ctx.position(leaverId);
  if (!emp || !pos) return [];
  const post = designationOfEmployee(emp);
  const off = offDuty(ctx);
  const npcId = Object.keys(NPC_DESIGNATION).find((id) => {
    const n = NPCS.find((x) => x.id === id);
    return NPC_DESIGNATION[id] === post && !off.includes(id) && !!n && npcPose(n, ctx.now).present && staffAvailable(ctx, id, "npc");
  });
  if (!npcId) return [];
  const out: Outgoing[] = [{ to: "all", message: { type: "notice", text: `${emp.name} left. ${nameOf(ctx, npcId)} (NPC) has taken their place.` } }];
  log(ctx, leaverId, "post_handed_over", { npcId });
  out.push(...transferOrders(ctx, leaverId, npcId, pos));
  const row = ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor' AND with_id = ?").get(leaverId) as ConvRow | undefined;
  const d0 = row ? anyDataOf(row) : null;
  // a timetable customer's chat is not carried on by an NPC (nothing would answer
  // the NPC's moves for it): releaseClaimsOf puts it back on the waiting list instead
  if (!row || !d0 || !isTalkData(d0) || d0.scene.ended || d0.cpu) {
    // nobody to carry on with: the NPC appears where they stood, then goes back to its day
    const eng: Engagement = { npcId, visitorId: leaverId, since: ctx.now, at: pos, from: pos, lead: { x: pos.x, z: pos.z, fx: pos.x, fz: pos.z } };
    return [...out, { to: "all", message: { type: "engaged", ...eng } }, { to: "all", message: { type: "released", npcId } }];
  }
  // a walk with the customer stops where it is
  const walking = liveEscortOf(ctx.db, row.customer_id);
  if (walking) out.push(...finishEscort(ctx, walking, "cancelled"));
  const cur = getConv(ctx.db, row.id) ?? row;
  const d = anyDataOf(cur) as TalkConvData;
  const table = d.seat ? TABLE_SEATS.find((x) => x.id === d.seat!.tableId) : undefined;
  const cpos = ctx.position(row.customer_id) ?? pos;
  const base = { npcId, visitorId: row.customer_id, since: ctx.now };
  const eng: Engagement = table
    ? { ...base, at: table.guest.at, from: table.host.at, lead: { x: table.host.at.x, z: table.host.at.z, fx: table.host.face.x, fz: table.host.face.z }, seated: true }
    : { ...base, at: cpos, from: pos, lead: { x: pos.x, z: pos.z, fx: cpos.x, fz: cpos.z } };
  // it is their move, if it was the specialist's
  const waitingOnStaff = d.scene.toMove === "staff" && !d.checkout && d.stage !== "seat_offer";
  const scene = waitingOnStaff ? advanceStaff(d.scene, row.id) : d.scene;
  const next: TalkConvData = { ...d, scene, eng };
  ctx.db.prepare("UPDATE conversations SET with_id = ?, with_kind = 'npc', data = ? WHERE id = ?").run(npcId, JSON.stringify(next), row.id);
  log(ctx, row.customer_id, "conversation_handed_to_npc", { conversationId: row.id, from: leaverId, to: npcId });
  if (table) out.push({ to: "all", message: { type: "unseated", visitorId: leaverId } });
  out.push({ to: "all", message: { type: "engaged", ...eng } });
  const now = getConv(ctx.db, row.id)!;
  if (scene.ended) return [...out, ...finishTalk(ctx, now, scene)];
  if (d.checkout) {
    const t = payTurn(d.checkout);
    out.push({ to: row.customer_id, message: { type: "turn", ...turnView(now, nameOf(ctx, npcId), t.say, t.choices, false, "customer") } });
  } else out.push(showTurn(ctx, now, next));
  out.push(staffViewMessage(ctx));
  return out;
}

export function leaveStore(ctx: Ctx, visitorId: string): Outgoing[] {
  const out: Outgoing[] = [];
  withdrawOfferOf(ctx, visitorId, "customer left");
  const open = openConversationOf(ctx.db, visitorId);
  const carriedOn = open && isTalkData(anyDataOf(open)) && !!(anyDataOf(open) as TalkConvData).standIn; // an NPC is already standing in
  if (open && !carriedOn) out.push(...finishEither(ctx, open, visitorId, `${nameOf(ctx, visitorId)} left`, "left"));
  out.push(...closeTalk(ctx, visitorId));
  out.push(...cancelIntentsOf(ctx, visitorId));
  const leaving = liveEscortOf(ctx.db, visitorId);
  if (leaving) out.push(...finishEscort(ctx, leaving, "cancelled"));
  out.push(...endInspect(ctx, visitorId, "left the store"));
  const leftOrder = orderOfCustomer(ctx.db, visitorId);
  if (leftOrder) out.push(...cancelOrder(ctx, leftOrder, "customer_left"));
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
    // one who has walked over to you is where it is now, not at its post
    const walked = engagements(ctx.db).find((e) => e.npcId === withId);
    target = walked ? npcPlace(ctx, walked, withId) : pose;
  }
  const script = designation ? scriptFor(designation) : null;
  if (!script) return { fail: [notice(customerId, `${nameOf(ctx, withId)} has nothing to talk about yet.`)] };
  if (!target || dist(here, target) > TALK_RANGE) return { fail: [notice(customerId, "Walk a little closer first.")] };
  return { ok: { withKind, script, here } };
}

// Opens a conversation at once, or says the other person is busy. A customer
// pressing E goes through `requestTalk`, which lands here.
export function startTalk(ctx: Ctx, customerId: string, withId: string): Outgoing[] {
  releaseExpired(ctx);
  const closed = closeTalk(ctx, customerId); // never leave an NPC held by the last conversation
  // trying to talk to someone puts down whatever device you were looking at,
  // whether or not the conversation actually starts
  const putDown = [...closed, ...endInspect(ctx, customerId, "started a conversation")];
  const r = resolveTalk(ctx, customerId, withId);
  if ("fail" in r) return [...putDown, ...r.fail];
  // the one bringing this customer's bag comes to them and starts the payment
  // themselves (issue #52): the customer's E never opens it, nor a new chat
  const bringing = liveIntentOf(ctx.db, customerId, withId);
  if (bringing) return [...putDown, notice(customerId, `${nameOf(ctx, withId)} has your order and will come to you to take payment.`)];
  // busy: in a conversation, still standing with someone on their last turn, walking someone somewhere, or on their way to take payment
  if (staffBusy(ctx, withId, r.ok.withKind)) return [...putDown, notice(customerId, `${nameOf(ctx, withId)} is with someone else. Please wait a moment.`)];
  // a real staff user claimed with E directly, no offer required (D54): tracked the
  // same way an offer-claimed customer is (issue #30), so a disconnect with no NPC
  // of the post free puts them back on the waiting list instead of out to browsing.
  // One transaction, as the claim-while-offered path (`staffTalk`) does: the
  // conversation and the claim land together or not at all.
  const before = r.ok.withKind === "visitor" ? stateOf(ctx.db, customerId) : undefined;
  const opened = ctx.db.transaction(() => {
    const opened = open(ctx, customerId, withId, r.ok.withKind, r.ok.script, r.ok.here);
    if (before) recordClaim(ctx, customerId, withId, before);
    return opened;
  })();
  // a real staff user being offered this customer is told the offer is off
  return [...putDown, ...opened, ...settleOffers(ctx)];
}

// Script "phones" against an NPC uses the new talk engine; everything else
// (including a human-staffed "phones" conversation, which would need the
// richer staff-side UI noted in server-wiring-proposal.md axis 3 option B)
// keeps the old engine. Ritesh, 2026-10-19: phone-only, coexist, smallest
// real slice.
const usesTalkEngine = (script: ScriptId, _withKind: "npc" | "visitor"): boolean => script === "phones";

// The greeter's hello is personalised from stored visit and order history
// only -- a visitor's name (never anything a client sent: nameOf reads the
// visitors row) and, if they have a prior paid order, what they bought
// (issue #10). A token on its first ever visit (one "profile" event so far:
// this visit's own, written by enter()) keeps the plain hello; null here
// means "use the script's own line".
function greeterHello(ctx: Ctx, customerId: string): string | null {
  const visits = (ctx.db.prepare("SELECT COUNT(*) AS n FROM events WHERE visitor_id = ? AND type = 'profile'").get(customerId) as { n: number }).n;
  if (visits <= 1) return null;
  const name = nameOf(ctx, customerId);
  const last = ctx.db.prepare("SELECT sale FROM orders WHERE customer_id = ? AND stage = 'done' ORDER BY created_at DESC LIMIT 1").get(customerId) as { sale: string } | undefined;
  if (!last) return `Welcome back, ${name}! What brings you here today?`;
  const sale = JSON.parse(last.sale) as { name: string; colour: string };
  return `Welcome back, ${name}! How's the ${sale.colour} ${sale.name} treating you? What brings you here today?`;
}

function open(ctx: Ctx, customerId: string, withId: string, withKind: "npc" | "visitor", script: ScriptId, at: { x: number; z: number }, engagedSince: number = ctx.now): Outgoing[] {
  const id = randomUUID();
  const cleared: Outgoing[] = [];
  if (usesTalkEngine(script, withKind)) {
    const humanStaff = withKind === "visitor";
    // whatever this customer already physically inspected at a table this
    // visit (issue #35) goes in before the first line is spoken, so the
    // specialist's opening demo offer already excludes it
    const inspected = inspectedModelsOf(ctx, customerId);
    // a real specialist moves first: the customer waits for them
    const begun = humanStaff ? { scene: beginHumanTalk(inspected), turn: { say: `${nameOf(ctx, withId)} is with you now.`, choices: [], ended: false } as TalkTurn } : beginTalk(id, inspected);
    const scene = begun.scene;
    const row: ConvRow = { id, customer_id: customerId, with_id: withId, with_kind: withKind, script, node: "talk", data: null, started_at: ctx.now, ended_at: null };
    // the specialist's first question is whether to sit down, if a table is free
    const offerSeat = !humanStaff && !begun.turn.ended && freeTableFor(ctx, customerId) !== null;
    const cpu = humanStaff ? cpuTalkFor(ctx, customerId) : undefined;
    const data: TalkConvData = { engine: "talk", scene, at, ...(offerSeat ? { stage: "seat_offer" as const } : {}), ...(withKind === "npc" ? { eng: { npcId: withId, visitorId: customerId, since: engagedSince, at } } : {}), ...(cpu ? { cpu } : {}) };
    const turn = seatChoices(ctx, row, data, begun.turn);
    ctx.db
      .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, customerId, withId, withKind, script, row.node, JSON.stringify(data), ctx.now);
    setState(ctx, customerId, { state: "in_conversation", with_id: withId });
    log(ctx, customerId, "conversation_started", { conversationId: row.id, with: withId, kind: withKind, script });
    const out: Outgoing[] = [...cleared, { to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, withId), turn.say, turn.choices, turn.ended, humanStaff ? "staff" : "customer") } }];
    const sm = stateMessage(ctx, customerId);
    if (sm) out.push(sm);
    if (withKind === "npc") out.push({ to: "all", message: { type: "engaged", npcId: withId, visitorId: customerId, since: engagedSince, at } });
    else out.push(staffMenu(ctx, row, data));
    out.push(staffViewMessage(ctx));
    if (turn.ended) return [...out, ...finishTalk(ctx, { ...row, data: JSON.stringify(data) }, scene)];
    return out;
  }

  const world = stockWorld(ctx.db);
  const first = begin(script, world);
  const row: ConvRow = { id, customer_id: customerId, with_id: withId, with_kind: withKind, script, node: first.state.node, data: null, started_at: ctx.now, ended_at: null };
  const eng: Engagement = { npcId: withId, visitorId: customerId, since: engagedSince, at };
  const data: ConvData = { conv: first.state, awaiting: "customer", at, ...(withKind === "npc" ? { eng } : {}) };
  ctx.db
    .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, customerId, withId, withKind, script, row.node, JSON.stringify(data), ctx.now);
  setState(ctx, customerId, { state: "in_conversation", with_id: withId });
  log(ctx, customerId, "conversation_started", { conversationId: row.id, with: withId, kind: withKind, script });
  // the greeter's hello is the one line personalised from stored history (issue #10)
  const say = script === "greeter" && first.state.node === "hello" ? (greeterHello(ctx, customerId) ?? first.turn.say) : first.turn.say;
  const out: Outgoing[] = [...cleared, { to: customerId, message: { type: "turn", ...turnView(row, nameOf(ctx, withId), say, first.turn.choices, false, "customer") } }];
  const sm = stateMessage(ctx, customerId);
  if (sm) out.push(sm);
  if (withKind === "npc") out.push({ to: "all", message: { type: "engaged", ...eng } });
  out.push(staffViewMessage(ctx));
  return out;
}


// ---- talking, and the payment visit ----
//
// Talking has no handshake. E at someone who is free opens the conversation at
// once (`startTalk`); E at someone who is busy is refused with "with someone
// else". The greeter works the same way: she opens a conversation with whoever
// is first inside the entrance while she is free (`tryGreeterApproach`), and
// anyone she misses is simply left for E.
//
// The one thing that still travels between people is the payment. Once a phone
// has been agreed and brought out, the specialist walks to the customer and the
// payment conversation opens when they get there and the customer is free. That
// visit is a row in `intents` (the table's old name; it now holds only these).
// Nothing here is a timer: the beat, the queue and the cancelling are all
// decided by whichever request arrives next (a move, or the client's `settle`).

export const VISIT_BEAT_MS = 1000; // the payment opens this long after the specialist arrives

interface IntentRow {
  id: string;
  from_id: string;
  to_id: string;
  customer_id: string;
  staff_id: string;
  staff_kind: "npc" | "visitor";
  reason: string;
  status: "queued" | "open" | "accepted" | "expired" | "cancelled";
  created_at: number;
  opened_at: number | null;
  arrived_at: number | null;
  at_x: number | null;
  at_z: number | null;
  ended_at: number | null;
  from_x: number | null;
  from_z: number | null;
}

const liveIntentOf = (db: Database.Database, customerId: string, staffId: string): IntentRow | undefined =>
  db.prepare("SELECT * FROM intents WHERE customer_id = ? AND staff_id = ? AND status IN ('queued','open') LIMIT 1").get(customerId, staffId) as IntentRow | undefined;

// An NPC is taken from the moment it walks over to take payment. A human is
// only taken while actually in a conversation.
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
  log(ctx, r.customer_id, "pay_visit_ended", { visitId: r.id, by: r.staff_id, why, detail });
  const out: Outgoing[] = [];
  // an NPC that walked over and did not get to take payment walks back to its day
  if (why !== "accepted" && wasOpen && r.staff_kind === "npc") out.push({ to: "all", message: { type: "released", npcId: r.staff_id } });
  return out;
}

function endLiveIntents(ctx: Ctx, match: (r: IntentRow) => boolean, why: "accepted" | "cancelled"): Outgoing[] {
  const rows = (ctx.db.prepare("SELECT * FROM intents WHERE status IN ('queued','open')").all() as IntentRow[]).filter(match);
  return rows.flatMap((r) => endIntent(ctx, r, why, "superseded"));
}

// Sends the specialist to the customer to take payment. A specialist who is
// still with someone waits in line until they are free.
function sendForPayment(ctx: Ctx, p: { customerId: string; staffId: string; staffKind: "npc" | "visitor"; from?: { x: number; z: number } }): Outgoing[] {
  if (liveIntentOf(ctx.db, p.customerId, p.staffId)) return [];
  const at = ctx.position(p.customerId) ?? { x: 0, z: 0 };
  const busy = staffBusy(ctx, p.staffId, p.staffKind);
  const id = randomUUID();
  ctx.db
    .prepare("INSERT INTO intents (id, from_id, to_id, customer_id, staff_id, staff_kind, reason, status, created_at, opened_at, at_x, at_z, from_x, from_z) VALUES (?, ?, ?, ?, ?, ?, 'pay', ?, ?, ?, ?, ?, ?, ?)")
    .run(id, p.staffId, p.customerId, p.customerId, p.staffId, p.staffKind, busy ? "queued" : "open", ctx.now, busy ? null : ctx.now, at.x, at.z, p.from?.x ?? null, p.from?.z ?? null);
  const row = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(id) as IntentRow;
  log(ctx, p.customerId, "pay_visit_started", { visitId: id, by: p.staffId, queued: busy });
  return busy ? [] : beginApproach(row);
}

// How an NPC walking over to take payment is drawn: it comes to the customer
// and waves, then stands there.
function intentEngagement(r: IntentRow): Engagement {
  return {
    npcId: r.staff_id,
    visitorId: r.customer_id,
    since: r.opened_at ?? r.created_at,
    at: { x: r.at_x ?? 0, z: r.at_z ?? 0 },
    pending: true,
    waving: true,
    // an NPC that was told to find someone who has moved starts from where it stands, not from its post
    ...(r.from_x !== null && r.from_z !== null ? { from: { x: r.from_x, z: r.from_z } } : {}),
  };
}

const beginApproach = (r: IntentRow): Outgoing[] => (r.staff_kind === "npc" ? [{ to: "all", message: { type: "engaged", ...intentEngagement(r) } }] : []);

// Whether an NPC specialist has got to the customer: its position is the same
// pure function the clients draw. A real specialist never "arrives" on their
// own: they open the payment by pressing E at the customer (`staffTalk`), so
// the customer walking up to them cannot start it (issue #52).
function staffArrived(ctx: Ctx, r: IntentRow): boolean {
  return r.staff_kind === "npc" && !engagedMoment(r.staff_id, intentEngagement(r), ctx.now).walking;
}

// Runs whatever has become due: a specialist who was waiting in line starts
// walking, the payment opens a beat after they arrive, a specialist who has
// gone or a customer who has left cancels the visit.
export function settleVisits(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  const rows = ctx.db.prepare("SELECT * FROM intents WHERE status IN ('queued','open') ORDER BY created_at, rowid").all() as IntentRow[];
  for (const r0 of rows) {
    let r = r0;
    const cpos = ctx.position(r.customer_id);
    const staffGone = r.staff_kind === "visitor" && !ctx.employees.some((e) => e.id === r.staff_id);
    if (!cpos || !ctx.present.includes(r.customer_id) || staffGone) {
      out.push(...endIntent(ctx, r, "cancelled", staffGone ? "staff left" : "customer left"));
      continue;
    }
    if (r.status === "queued") {
      if (staffBusy(ctx, r.staff_id, r.staff_kind)) continue;
      ctx.db.prepare("UPDATE intents SET status = 'open', opened_at = ?, at_x = ?, at_z = ? WHERE id = ?").run(ctx.now, cpos.x, cpos.z, r.id);
      r = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(r.id) as IntentRow;
      out.push(...beginApproach(r));
    }
    const arrived = staffArrived(ctx, r);
    // someone coming to take payment follows a customer who wanders off, from where they stand now
    if (r.staff_kind === "npc" && arrived && dist(cpos, { x: r.at_x ?? cpos.x, z: r.at_z ?? cpos.z }) > 1.5) {
      const here = engagedMoment(r.staff_id, intentEngagement(r), ctx.now);
      ctx.db.prepare("UPDATE intents SET at_x = ?, at_z = ?, from_x = ?, from_z = ?, opened_at = ?, arrived_at = NULL WHERE id = ?").run(cpos.x, cpos.z, here.x, here.z, ctx.now, r.id);
      r = ctx.db.prepare("SELECT * FROM intents WHERE id = ?").get(r.id) as IntentRow;
      out.push(...beginApproach(r));
      continue;
    }
    if (!arrived) continue;
    // the beat starts when they are there and the customer is free to answer
    if (!customerFree(ctx, r.customer_id)) {
      if (r.arrived_at !== null) ctx.db.prepare("UPDATE intents SET arrived_at = NULL WHERE id = ?").run(r.id);
      continue;
    }
    if (r.arrived_at === null) {
      ctx.db.prepare("UPDATE intents SET arrived_at = ? WHERE id = ?").run(ctx.now, r.id);
      continue;
    }
    if (ctx.now - r.arrived_at >= VISIT_BEAT_MS) out.push(...openPay(ctx, r));
  }
  return [...out, ...settleEscorts(ctx), ...settleOrders(ctx)];
}

// A person presses E at someone. A customer reaches an NPC or an employee; an
// employee reaches a customer. Either way the conversation opens at once, or
// they are told the other person is busy.
export function requestTalk(ctx: Ctx, actorId: string, withId: string): Outgoing[] {
  if (ctx.employees.some((e) => e.id === actorId)) return staffTalk(ctx, actorId, withId);
  return startTalk(ctx, actorId, withId);
}

// An employee walks up to a customer and presses E.
function staffTalk(ctx: Ctx, staffId: string, customerId: string): Outgoing[] {
  releaseExpired(ctx);
  const emp = ctx.employees.find((e) => e.id === staffId);
  const st = stateOf(ctx.db, customerId);
  const script = emp ? scriptFor(designationOfEmployee(emp)) : null;
  if (!emp || !st || !ctx.present.includes(customerId)) return [notice(staffId, "There is nobody there to talk to.")];
  if (!script) return [notice(staffId, "You have nothing to talk about yet.")];
  if (openConversationOf(ctx.db, staffId)) return [notice(staffId, "Finish your current conversation first.")];
  const cpos = ctx.position(customerId);
  const spos = ctx.position(staffId);
  if (!cpos || !spos || dist(cpos, spos) > TALK_RANGE) return [notice(staffId, "Walk a little closer first.")];
  if (!customerFree(ctx, customerId)) return [notice(staffId, `${nameOf(ctx, customerId)} is busy right now.`)];
  // carrying this customer's bag: their E is what opens the payment (issue #52)
  const visit = liveIntentOf(ctx.db, customerId, staffId);
  if (visit) {
    const opened = ctx.db.transaction(() => {
      log(ctx, customerId, "staff_approached", { staffId, for: "payment", visitId: visit.id });
      return openPay(ctx, visit);
    })();
    return [...opened, ...settleOffers(ctx)];
  }
  // the claim (D48): single-threaded, so the check above and the open below
  // cannot interleave with another E press; whoever comes second finds the
  // customer busy. Any free real staff user may claim, offered or not: the
  // offer only decides who is told, and holds the CPUs back.
  const before = st;
  const offer = offerData(before).offer;
  // one transaction: the conversation, the claim and their rows land together or
  // not at all, so a throw midway never leaves a conversation no release can find
  const { putDown, opened } = ctx.db.transaction(() => {
    log(ctx, customerId, "staff_approached", { staffId, offer: offer ? (offer.to === staffId ? "theirs" : "another's") : "none", ...(offer && offer.to !== staffId ? { offeredTo: offer.to } : {}) });
    // a rival's offer ends with its own row, so the offer lifecycle reads whole by type
    if (offer && offer.to !== staffId) log(ctx, customerId, "offer_withdrawn", { staffId: offer.to, why: "claimed by another", by: staffId });
    const putDown = endInspect(ctx, customerId, "an employee started a conversation");
    const opened = open(ctx, customerId, staffId, "visitor", script, cpos);
    recordClaim(ctx, customerId, staffId, before);
    return { putDown, opened };
  })();
  // someone else who was being offered this customer is told it is taken
  const told = offer && offer.to !== staffId ? [notice(offer.to, `${nameOf(ctx, customerId)} is being looked after by ${nameOf(ctx, staffId)}.`)] : [];
  return [...putDown, ...opened, ...told, ...settleOffers(ctx)];
}

// Someone left the store: any payment visit they were part of is cancelled.
function cancelIntentsOf(ctx: Ctx, visitorId: string): Outgoing[] {
  return endLiveIntents(ctx, (r) => r.customer_id === visitorId || r.staff_id === visitorId, "cancelled");
}

// Who can take a new customer right now: not in a conversation, not walking
// someone somewhere, not on their way to take payment.
const staffAvailable = (ctx: Ctx, id: string, kind: "npc" | "visitor"): boolean => !staffBusy(ctx, id, kind);

// The staff member to name for a customer who needs `post`: a real user who is
// free first, else a free NPC. Null when everyone is taken.
function pickHelper(ctx: Ctx, post: string): { id: string; kind: "npc" | "visitor" } | null {
  const off = offDuty(ctx);
  const humans = ctx.employees.filter((e) => designationOfEmployee(e) === post).map((e) => ({ id: e.id, kind: "visitor" as const }));
  const npcs = Object.keys(NPC_DESIGNATION)
    .filter((id) => NPC_DESIGNATION[id] === post && !off.includes(id))
    .filter((id) => {
      const n = NPCS.find((x) => x.id === id);
      return !!n && npcPose(n, ctx.now).present;
    })
    .map((id) => ({ id, kind: "npc" as const }));
  return humans.find((h) => staffAvailable(ctx, h.id, h.kind)) ?? npcs.find((n) => staffAvailable(ctx, n.id, n.kind)) ?? null;
}

// The customer needs `post`: they are told where to go and who is free, and
// every free real employee of that post is told a customer is waiting. Nobody
// is sent: the customer walks over and presses E.
export function pointToHelper(ctx: Ctx, customerId: string, post: string): { out: Outgoing[]; helperName: string | null; waitLabel?: string | null; queued?: boolean } {
  if (!scriptFor(post)) return { out: [], helperName: null };
  const spot = waitSpotFor(post);
  const helper = pickHelper(ctx, post);
  if (!helper) {
    log(ctx, customerId, "help_queued", { post });
    return { out: [], helperName: null, waitLabel: spot?.label ?? null, queued: true };
  }
  const out: Outgoing[] = ctx.employees
    .filter((e) => designationOfEmployee(e) === post && staffAvailable(ctx, e.id, "visitor"))
    .map((e) => notice(e.id, `New customer: ${nameOf(ctx, customerId)} is waiting${spot ? ` near ${spot.label}` : ""}. Go and meet them.`));
  return { out, helperName: nameOf(ctx, helper.id), waitLabel: spot?.label ?? null };
}

// ---- a real specialist serving a customer (Ritesh, 2026-10-20) ----
//
// The same conversation model as the NPCs use: the engine lists the moves that
// are legal now, the specialist picks one (in a tone), the customer answers
// from their own menu, and so on. The specialist is shown the chat, those
// moves, and beside them what the customer has said and which phones are
// still in play. Both are locked into the conversation (the client freezes
// movement and zooms in) except while walking to a table or a device.

const isHuman = (ctx: Ctx, id: string): boolean => ctx.employees.some((e) => e.id === id);

// Every conversation between two real people, for the scene: both are drawn
// talking and listening. Whoever has the move is the one talking.
export function chatPairs(db: Database.Database): ChatPair[] {
  const rows = db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor' ORDER BY started_at").all() as ConvRow[];
  return rows.map((r) => {
    const d = anyDataOf(r);
    const log = isTalkData(d) && !d.scene.ended && !d.checkout ? staffLog(d.scene) : [];
    const lastLine = log.at(-1);
    return {
      customerId: r.customer_id,
      staffId: r.with_id,
      lines: log.length,
      ...(lastLine ? { speaker: lastLine.who === "staff" ? r.with_id : r.customer_id, chars: lastLine.text.length } : {}),
    };
  });
}

// What is going on when it is not the specialist's move.
const customerName = (ctx: Ctx, row: ConvRow, d: TalkConvData): string => d.standIn?.name ?? nameOf(ctx, row.customer_id);

function staffStatus(ctx: Ctx, row: ConvRow, d: TalkConvData): string {
  const name = customerName(ctx, row, d);
  if (d.checkout) return `Taking payment from ${name}…`;
  if (d.stage === "seat_offer") return `Waiting for ${name} to say whether to sit down…`;
  if (liveEscortOf(ctx.db, row.customer_id)) return `Walking with ${name}…`;
  return d.scene.ended ? "That is over." : d.scene.toMove === "staff" ? "Your move." : `Waiting for ${name}…`;
}

// What the specialist sees now, as a message to them.
function staffMenu(ctx: Ctx, row: ConvRow, d: TalkConvData): Outgoing {
  const blocked = !!d.checkout || d.stage === "seat_offer" || !!liveEscortOf(ctx.db, row.customer_id) || !!d.scene.ended;
  const myMove = d.scene.toMove === "staff" && !blocked;
  const acts = myMove ? staffActList(d.scene) : [];
  if (myMove && !d.scene.forced && !d.seat && !d.standIn && !d.cpu && freeTableFor(ctx, row.customer_id)) acts.push({ id: "seat", label: "Offer to sit down at a table", hint: "talk it through seated" });
  const view: StaffMenuView = {
    conversationId: row.id,
    customerId: row.customer_id,
    customerName: customerName(ctx, row, d),
    log: staffLog(d.scene),
    awaiting: myMove ? "staff" : "customer",
    acts,
    tones: STAFF_TONES,
    stats: staffStats(d.scene),
    status: staffStatus(ctx, row, d),
  };
  return { to: row.with_id, message: { type: "staff_menu", ...view } };
}

const waitingTurn = (ctx: Ctx, row: ConvRow, say?: string): Outgoing => ({
  to: row.customer_id,
  message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say ?? `${nameOf(ctx, row.with_id)} is thinking…`, [], false, "staff") },
});

// The specialist makes a move: one of the engine's, or offering a table.
export function staffMove(ctx: Ctx, staffId: string, conversationId: string, actId: string, toneId: string): Outgoing[] {
  const row = getConv(ctx.db, conversationId);
  if (!row || row.with_id !== staffId || row.with_kind !== "visitor" || row.ended_at !== null) return [notice(staffId, "That conversation is over.")];
  const d0 = anyDataOf(row);
  if (!isTalkData(d0)) return [notice(staffId, "That conversation is over.")];
  if (d0.checkout || d0.stage === "seat_offer" || liveEscortOf(ctx.db, row.customer_id)) return [notice(staffId, "Not yet: wait for this to finish.")];
  if (actId === "seat") {
    if (d0.seat || d0.standIn || d0.cpu || d0.scene.toMove !== "staff") return [notice(staffId, "Not now.")];
    if (!freeTableFor(ctx, row.customer_id)) return [notice(staffId, "Every table is taken right now."), staffMenu(ctx, row, d0)];
    const next: TalkConvData = { ...d0, stage: "seat_offer" };
    saveTalkData(ctx, row, next);
    log(ctx, row.customer_id, "seat_offered", { conversationId: row.id, by: staffId });
    return [showTurn(ctx, row, next, `${nameOf(ctx, staffId)}: would you like to sit down at one of the tables and talk it through?`), staffMenu(ctx, row, next)];
  }
  const r = stepStaffMove(d0.scene, actId, toneId);
  if ("error" in r) return [notice(staffId, "That is not one of the moves.")];
  log(ctx, row.customer_id, "talk_staff_move", { conversationId: row.id, by: staffId, move: r.label, tone: toneId });
  // a stand-in customer answers at once, and never walks off to a device or a table
  const scene = d0.standIn ? standInReplies(r.scene, row.id) : r.scene;
  const next: TalkConvData = { ...d0, scene };
  saveTalkConv(ctx, row, next, false);
  if (d0.standIn) return scene.ended ? finishTalk(ctx, row, scene) : [staffMenu(ctx, row, next), staffViewMessage(ctx)];
  if (d0.cpu) return cpuAnswers(ctx, row, next);
  const out: Outgoing[] = [];
  // a demo: the two of them walk to a real device of that model
  if (r.scene.demoed.length > d0.scene.demoed.length) return [...out, ...startDemoEscort(ctx, row, r.scene.demoed[r.scene.demoed.length - 1]!), staffMenu(ctx, row, next)];
  out.push(showTurn(ctx, row, next), staffMenu(ctx, row, next));
  return out;
}

// ---- sitting down together (Ritesh, 2026-10-19) ----
//
// The specialist offers to sit at a table to talk a phone through (only if one
// is free), both walk there, sit on the same side, and stay until they get up
// for a demo, after which they may sit back down. A table is free when no one
// is sitting at it now or about to (an NPC's own timetable counts), and no one
// else from this server is seated there.

const SEAT_LOOKAHEAD = 240; // seconds of the timetable that must also be clear (a chat can run long)

type TableSeat = (typeof TABLE_SEATS)[number];

function tableTakenByTimetable(ctx: Ctx, t: TableSeat): boolean {
  const tau = (((ctx.now / 1000) % 480) + 480) % 480;
  const spots = [t.guest.at, t.host.at];
  for (const c of CAST) {
    for (const seg of timelineOf(c.id)) {
      if (!seg.seated || seg.kind === "walk" || seg.t1 < tau || seg.t0 > tau + SEAT_LOOKAHEAD) continue;
      const p = seg.at;
      if (p && spots.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.9)) return true;
    }
    // someone walking to those stools now is about to sit
    const m = momentOf(c.id, ctx.now);
    if (m.present && m.seated && spots.some((s) => Math.hypot(s.x - m.x, s.z - m.z) < 0.9)) return true;
  }
  return false;
}

function freeTableFor(ctx: Ctx, customerId: string): TableSeat | null {
  const taken = new Set<string>();
  // a table is held by every conversation sitting at it, with an NPC or a real specialist
  for (const r of ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL").all() as ConvRow[]) {
    const d = anyDataOf(r);
    if (isTalkData(d) && d.seat) taken.add(d.seat.tableId);
  }
  // a seat walk in progress holds its table too
  for (const e of ctx.db.prepare("SELECT * FROM escorts WHERE kind = 'seat' AND status = 'walking'").all() as EscortRow[]) {
    const t = TABLE_SEATS.find((x) => Math.hypot(x.host.at.x - e.goal_x, x.host.at.z - e.goal_z) < 0.5);
    if (t) taken.add(t.id);
  }
  const here = ctx.position(customerId) ?? { x: 0, z: 0 };
  return (
    TABLE_SEATS.filter((t) => !taken.has(t.id) && !tableTakenByTimetable(ctx, t)).sort((a, b) => dist(here, a.guest.at) - dist(here, b.guest.at))[0] ?? null
  );
}

const seatedMessage = (customerId: string, t: TableSeat): Outgoing => ({ to: "all", message: { type: "seated", visitorId: customerId, at: t.guest.at, face: t.guest.face } });

export function seatedList(db: Database.Database): Array<{ visitorId: string; at: { x: number; z: number }; face: { x: number; z: number } }> {
  const out: Array<{ visitorId: string; at: { x: number; z: number }; face: { x: number; z: number } }> = [];
  for (const r of db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL").all() as ConvRow[]) {
    const d = anyDataOf(r);
    const t = isTalkData(d) && d.seat ? TABLE_SEATS.find((x) => x.id === d.seat!.tableId) : undefined;
    if (!t) continue;
    if (!(isTalkData(d) && d.standIn)) out.push({ visitorId: r.customer_id, at: t.guest.at, face: t.guest.face });
    // a real specialist sits too (an NPC's seat is drawn from its engagement)
    if (r.with_kind === "visitor") out.push({ visitorId: r.with_id, at: t.host.at, face: t.host.face });
  }
  return out;
}

// The menu to show now, with what belongs to sitting: before the scene's own
// menu, the opening question; after a demo, a way to sit back down.
function seatChoices(ctx: Ctx, row: ConvRow, d: TalkConvData, base: TalkTurn): TalkTurn {
  if (d.stage === "seat_offer") {
    return {
      say: `${base.say} Would you like to sit down at one of the tables and talk it through?`,
      choices: [
        { id: "seat:sit", label: "Yes, let's sit down" },
        { id: "seat:stand", label: "No thanks, I'm happy standing" },
      ],
      ended: false,
    };
  }
  if (!d.seat && d.sat && !base.ended && freeTableFor(ctx, row.customer_id)) {
    return { ...base, choices: [...base.choices, { id: "seat:sit", label: "Let's sit back down at a table" }] };
  }
  return base;
}

function showTurn(ctx: Ctx, row: ConvRow, d: TalkConvData, sayOverride?: string): Outgoing {
  const t = seatChoices(ctx, row, d, currentTurn(d.scene));
  return { to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), sayOverride ?? t.say, t.choices, false, t.choices.length === 0 ? "staff" : "customer") } };
}

function saveTalkData(ctx: Ctx, row: ConvRow, d: TalkConvData): void {
  ctx.db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(d), row.id);
}

function handleSeatChoice(ctx: Ctx, row: ConvRow, d: TalkConvData, choiceId: string): Outgoing[] {
  if (choiceId === "seat:stand") {
    if (d.stage !== "seat_offer") return [notice(row.customer_id, "That is not one of the options.")];
    const next: TalkConvData = { ...d, stage: undefined };
    saveTalkData(ctx, row, next);
    log(ctx, row.customer_id, "seat_declined", { conversationId: row.id });
    return [showTurn(ctx, row, next), ...(row.with_kind === "visitor" ? [staffMenu(ctx, row, next)] : [])];
  }
  if (choiceId !== "seat:sit") return [notice(row.customer_id, "That is not one of the options.")];
  const next: TalkConvData = { ...d, stage: undefined };
  saveTalkData(ctx, row, next);
  const table = d.seat ? null : freeTableFor(ctx, row.customer_id);
  if (!table) return [notice(row.customer_id, "Every table is taken right now."), showTurn(ctx, row, next), ...(row.with_kind === "visitor" ? [staffMenu(ctx, row, next)] : [])];
  log(ctx, row.customer_id, "seat_accepted", { conversationId: row.id, tableId: table.id });
  const from = row.with_kind === "visitor" ? (ctx.position(row.with_id) ?? table.host.at) : npcPlace(ctx, next.eng, row.with_id);
  return beginEscort(ctx, {
    customerId: row.customer_id,
    staffId: row.with_id,
    kind: "seat",
    conversationId: row.id,
    from,
    goal: table.host.at,
    face: table.host.face,
    stand: table.guest.at,
    text: row.with_kind === "visitor" ? "Go to your seat at the table" : `Follow ${nameOf(ctx, row.with_id)} to a table`,
    staffText: `Go to your seat at the table with ${nameOf(ctx, row.customer_id)}`,
  });
}

// Both have reached the table: they sit, on the same side, and talk goes on.
function sitDown(ctx: Ctx, e: EscortRow): Outgoing[] {
  const conv = e.conversation_id ? getConv(ctx.db, e.conversation_id) : undefined;
  const t = TABLE_SEATS.find((x) => Math.hypot(x.host.at.x - e.goal_x, x.host.at.z - e.goal_z) < 0.5);
  if (!conv || conv.ended_at !== null || !t) return [];
  const d = anyDataOf(conv);
  if (!isTalkData(d)) return [];
  if (isHuman(ctx, e.staff_id)) {
    // two real people on the two stools of one side, each turned a little to the other
    const next: TalkConvData = { ...d, seat: { tableId: t.id }, sat: true };
    saveTalkData(ctx, conv, next);
    log(ctx, e.customer_id, "seated", { conversationId: conv.id, tableId: t.id });
    return [
      seatedMessage(e.customer_id, t),
      { to: "all", message: { type: "seated", visitorId: e.staff_id, at: t.host.at, face: t.host.face } },
      showTurn(ctx, conv, next),
      staffMenu(ctx, conv, next),
    ];
  }
  const eng: Engagement = {
    npcId: e.staff_id,
    visitorId: e.customer_id,
    since: ctx.now,
    at: t.guest.at,
    from: t.host.at,
    lead: { x: t.host.at.x, z: t.host.at.z, fx: t.host.face.x, fz: t.host.face.z },
    seated: true,
  };
  const next: TalkConvData = { ...d, seat: { tableId: t.id }, sat: true, eng };
  saveTalkData(ctx, conv, next);
  log(ctx, e.customer_id, "seated", { conversationId: conv.id, tableId: t.id });
  return [{ to: "all", message: { type: "engaged", ...eng } }, seatedMessage(e.customer_id, t), showTurn(ctx, conv, next)];
}

// Up from the table (for a demo, or because the conversation is over): the
// NPC stands and comes back to the customer where they are.
function standUp(ctx: Ctx, row: ConvRow): Outgoing[] {
  const d = anyDataOf(row);
  if (!isTalkData(d) || !d.seat) return [];
  const t = TABLE_SEATS.find((x) => x.id === d.seat!.tableId);
  const cpos = ctx.position(row.customer_id) ?? t?.guest.at;
  const next: TalkConvData = { ...d, seat: undefined };
  const out: Outgoing[] = [{ to: "all", message: { type: "unseated", visitorId: row.customer_id } }];
  if (row.with_kind === "visitor") {
    out.push({ to: "all", message: { type: "unseated", visitorId: row.with_id } });
    saveTalkData(ctx, row, next);
    log(ctx, row.customer_id, "stood_up", { conversationId: row.id });
    return out;
  }
  if (t && cpos) {
    const eng: Engagement = { npcId: row.with_id, visitorId: row.customer_id, since: ctx.now, at: cpos, from: t.host.at };
    next.eng = eng;
    out.push({ to: "all", message: { type: "engaged", ...eng } });
  }
  saveTalkData(ctx, row, next);
  log(ctx, row.customer_id, "stood_up", { conversationId: row.id });
  return out;
}

// ---- paying on the spot ----

const CHECKOUT_BEAT_MS = 1500; // the hand-over of the bag, once the stock person is there
export const ORDER_MS = 3 * 60 * 1000; // an order that takes longer than this is called off
const STOCK_STAFF = ["stock-runner", "stock-1", "stock-2"];

const payTurn = (c: Checkout): TalkTurn => ({
  say: `Here it is: the ${c.sale.name} in ${c.sale.colour}, ${c.sale.storage}. That's A$${c.sale.price.toLocaleString("en-AU")}. How would you like to pay?`,
  choices: [
    { id: "pay:card", label: "Pay by card" },
    { id: "pay:phone", label: "Tap with my phone" },
    { id: "pay:cancel", label: "I've changed my mind" },
  ],
  ended: false,
});


// ---- an order: the sale after the chat (Ritesh, 2026-10-21) ----
//
// The chat that makes the sale ends. A stock runner (always an NPC) brings the
// phone out in a bag with the logo and finds the specialist wherever they are,
// waves, and hands it over (a real specialist presses E; an NPC accepts after a
// beat). The specialist then finds the customer, and a short payment
// conversation opens when they get there. Everyone is free to roam meanwhile.
// Nothing is a timer: each step is settled by whichever request arrives next.

interface OrderRow {
  id: string;
  customer_id: string;
  spec_id: string;
  spec_kind: "npc" | "visitor";
  stock_id: string;
  stage: "fetching" | "with_spec" | "paying" | "done" | "cancelled";
  sale: string;
  runner: string | null;
  created_at: number;
  expires_at: number;
  arrived_at: number | null;
  ended_at: number | null;
}

type Sale = Checkout["sale"];
const saleOf = (o: OrderRow): Sale => JSON.parse(o.sale) as Sale;
const runnerOf = (o: OrderRow): Engagement => JSON.parse(o.runner ?? "{}") as Engagement;
const liveOrders = (db: Database.Database): OrderRow[] => db.prepare("SELECT * FROM orders WHERE stage IN ('fetching','with_spec','paying') ORDER BY created_at, rowid").all() as OrderRow[];
const orderOfCustomer = (db: Database.Database, customerId: string): OrderRow | undefined =>
  db.prepare("SELECT * FROM orders WHERE customer_id = ? AND stage IN ('fetching','with_spec','paying') LIMIT 1").get(customerId) as OrderRow | undefined;
const saveRunner = (ctx: Ctx, o: OrderRow, eng: Engagement, arrivedAt: number | null): void => {
  ctx.db.prepare("UPDATE orders SET runner = ?, arrived_at = ? WHERE id = ?").run(JSON.stringify(eng), arrivedAt, o.id);
};

// Issue #49: how long a just-completed order still shows as the synthetic
// "paid" stage (the final tap/checkmark beat), purely a window compared
// against the order's own stored `ended_at` -- never a timer.
const PAID_WINDOW_MS = 4000;

// The payment conversation for an order: same customer, same specialist, by
// kind. Looked up by identity rather than a stored id because the order row
// never carries a conversation id of its own, and the conversation may
// already be ended (its `checkout` wiped by handleCheckoutChoice) by the time
// a "paid" view is read for it.
function paymentConvOf(ctx: Ctx, o: Pick<OrderRow, "customer_id" | "spec_id" | "spec_kind">): ConvRow | undefined {
  return ctx.db
    .prepare("SELECT * FROM conversations WHERE customer_id = ? AND with_id = ? AND with_kind = ? ORDER BY started_at DESC LIMIT 1")
    .get(o.customer_id, o.spec_id, o.spec_kind) as ConvRow | undefined;
}

const recentlyPaidOrders = (db: Database.Database, now: number): OrderRow[] =>
  db.prepare("SELECT * FROM orders WHERE stage = 'done' AND ended_at IS NOT NULL AND ended_at <= ? AND (? - ended_at) < ?").all(now, now, PAID_WINDOW_MS) as OrderRow[];

export function orderViews(ctx: Ctx): OrderView[] {
  const live = liveOrders(ctx.db).map((o): OrderView => {
    const sale = saleOf(o);
    const base: OrderView = {
      id: o.id,
      customerId: o.customer_id,
      customerName: nameOf(ctx, o.customer_id),
      specId: o.spec_id,
      specName: nameOf(ctx, o.spec_id),
      stockId: o.stock_id,
      stockName: nameOf(ctx, o.stock_id),
      stage: o.stage as OrderView["stage"],
      what: `${sale.colour} ${sale.name}`,
    };
    if (o.stage !== "paying") return base;
    const conv = paymentConvOf(ctx, o);
    const d = conv ? anyDataOf(conv) : undefined;
    const checkout = d && isTalkData(d) ? d.checkout : undefined;
    if (!conv || !checkout) return base;
    // price/name/colour/storage always come from the order's own stored
    // `sale`, never recomputed off the conversation, so a client can never be
    // shown a total the server didn't itself charge.
    return { ...base, pay: { conversationId: conv.id, beat: checkout.beat, beatAt: checkout.beatAt, name: sale.name, colour: sale.colour, storage: sale.storage, price: sale.price } };
  });
  // The synthetic "paid" window: the order has already reached `done`, so it
  // is not in liveOrders, but everyone in the room should still see the
  // tapped/checkmark beat briefly. Read-only and derived purely from
  // `ended_at` vs `ctx.now` -- no new write, no timer.
  const justPaid = recentlyPaidOrders(ctx.db, ctx.now).map((o): OrderView => {
    const sale = saleOf(o);
    const conv = paymentConvOf(ctx, o);
    return {
      id: o.id,
      customerId: o.customer_id,
      customerName: nameOf(ctx, o.customer_id),
      specId: o.spec_id,
      specName: nameOf(ctx, o.spec_id),
      stockId: o.stock_id,
      stockName: nameOf(ctx, o.stock_id),
      stage: "paid",
      what: `${sale.colour} ${sale.name}`,
      pay: { conversationId: conv?.id ?? o.id, beat: "tapped", beatAt: o.ended_at!, name: sale.name, colour: sale.colour, storage: sale.storage, price: sale.price },
      paidAt: o.ended_at!,
    };
  });
  return [...live, ...justPaid];
}

// Every unit currently held (reservations, status 'held', not yet expired at
// ctx.now), for everyone to see (issue #3): who holds it, the reservation's
// own `expires_at` (never a relative countdown — a client computes its own
// time-left from this absolute server time) and how many of that exact SKU
// are still on the shelf. Read-only: showing a hold is not a state change, so
// this writes no `events` row (CLAUDE.md); appearance and clearance are read
// off the `reserved` / `reservation_expired` / `reservation_released` / sale
// events that already exist.
export function holdViews(ctx: Ctx): HoldView[] {
  const rows = ctx.db
    .prepare("SELECT visitor_id, product, colour, storage, expires_at FROM reservations WHERE status = 'held' AND expires_at > ? ORDER BY created_at, rowid")
    .all(ctx.now) as Array<{ visitor_id: string; product: string; colour: string; storage: string; expires_at: number }>;
  return rows.map((r) => ({
    product: r.product,
    colour: r.colour,
    storage: r.storage,
    holderId: r.visitor_id,
    holderName: nameOf(ctx, r.visitor_id),
    expiresAt: r.expires_at,
    free: stockOf(ctx.db, r.product, r.colour, r.storage),
  }));
}

// Where someone is right now: a real user where they stand; an NPC where it is
// drawn (with a visitor, or at its place in the day).
function placeOf(ctx: Ctx, id: string, kind: "npc" | "visitor"): { x: number; z: number } {
  if (kind === "visitor") return ctx.position(id) ?? { x: 0, z: 0 };
  const eng = engagements(ctx.db).find((e) => e.npcId === id);
  return npcPlace(ctx, eng, id);
}

// Who holds the one unit of this SKU right now, for the "on hold for <name>"
// line told to a customer who just lost the race for it (issue #3): the truth,
// read off the reservation itself, not an invented "someone else".
function holderNameOf(ctx: Ctx, product: string, colour: string, storage: string): string | null {
  const row = ctx.db
    .prepare("SELECT visitor_id FROM reservations WHERE product = ? AND colour = ? AND storage = ? AND status = 'held' AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
    .get(product, colour, storage, ctx.now) as { visitor_id: string } | undefined;
  return row ? nameOf(ctx, row.visitor_id) : null;
}

// Turns the engine's "yes" into an order: the unit is held for them, a runner is
// sent, and the chat ends with the specialist saying someone will fetch it.
function startCheckout(ctx: Ctx, row: ConvRow, d: TalkConvData, sku: { model: string; storage: string; colour: string; price: number }, line: string): Outgoing[] {
  const sale: Sale = { name: modelById(sku.model).name, colour: sku.colour, storage: sku.storage, price: sku.price };
  // checking stock is real: a unit the shop tracks is taken off the shelf and
  // held for them (one customer wins the last unit, S11); a phone the stock
  // table does not list is not tracked yet, so it is simply available
  const product = `iphone-${sku.model}`;
  const tracked = ctx.db.prepare("SELECT 1 FROM stock WHERE product = ? AND colour = ? AND storage = ?").get(product, sku.colour, sku.storage);
  if (tracked) {
    if (!takeOne(ctx.db, product, sku.colour, sku.storage)) {
      log(ctx, row.customer_id, "reserve_lost", { product, colour: sku.colour });
      const holder = holderNameOf(ctx, product, sku.colour, sku.storage);
      // Issue #36: the unit went between confirming and this check. The
      // "on hold for X" / "gone" wording (#21/#3) is unchanged -- only the
      // scene no longer ends here: offerSoldOut hands the customer a real
      // choice (continue looking, or leave) instead of a dead end.
      const sorry = holder
        ? `Sorry, I've just checked and the ${sku.colour} ${sale.name} is on hold for ${holder}.`
        : `Sorry, I've just checked and the ${sku.colour} ${sale.name} has gone: someone else has the last one.`;
      const scene = offerSoldOut(d.scene, sku.model, sorry);
      const next: TalkConvData = { ...d, scene };
      saveTalkData(ctx, row, next);
      const turn = currentTurn(scene);
      const humanStaff = row.with_kind === "visitor";
      const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), turn.say, turn.choices, false, "customer") } }];
      if (humanStaff) out.push(staffMenu(ctx, row, next));
      return out;
    }
    ctx.db
      .prepare("INSERT INTO reservations (id, visitor_id, product, colour, storage, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'held', ?, ?)")
      .run(randomUUID(), row.customer_id, product, sku.colour, sku.storage, ctx.now, ctx.now + ORDER_MS);
    log(ctx, row.customer_id, "reserved", { product, colour: sku.colour, expiresAt: ctx.now + ORDER_MS });
  }
  // the stock person who is free (the runner first), sent from wherever they are in the back
  const busyRunners = new Set(liveOrders(ctx.db).map((o) => o.stock_id));
  const stockId = STOCK_STAFF.find((id) => !busyRunners.has(id) && !npcBusy(ctx, id)) ?? STOCK_STAFF.find((id) => !busyRunners.has(id)) ?? STOCK_STAFF[0]!;
  const specKind = row.with_kind;
  const specAt = placeOf(ctx, row.with_id, specKind);
  const from = placeOf(ctx, stockId, "npc");
  const runner: Engagement = { npcId: stockId, visitorId: row.with_id, since: ctx.now, at: specAt, from, pending: true, waving: true };
  const orderId = randomUUID();
  ctx.db
    .prepare("INSERT INTO orders (id, customer_id, spec_id, spec_kind, stock_id, stage, sale, runner, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'fetching', ?, ?, ?, ?)")
    .run(orderId, row.customer_id, row.with_id, specKind, stockId, JSON.stringify(sale), JSON.stringify(runner), ctx.now, ctx.now + ORDER_MS);
  log(ctx, row.customer_id, "stock_checked", { conversationId: row.id, by: row.with_id, sale });
  log(ctx, row.customer_id, "order_placed", { orderId, conversationId: row.id, spec: row.with_id, stockId, sale, expiresAt: ctx.now + ORDER_MS });
  log(ctx, row.customer_id, "stock_ordered", { conversationId: row.id, stockId, sale });
  // the chat ends here: the engine's closing line sent them to a till, and it now says what really happens
  // issue reported live (Ritesh, 2026-11-08): the specialist referred to
  // themselves in the third person ("Priya will come and find you"). This
  // line is spoken by the specialist themselves, so it's first person.
  const say = line.replace(/I'll take you across to the till.*$/s, "Let me check we have it and get it brought out.") + " Have a look around: I'll come and find you when it's here.";
  const scene: Scene = d.scene.ended ? d.scene : { ...d.scene, ended: { how: "bought", sku: sku as never } };
  return [
    { to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, [], true, "customer") } },
    { to: "all", message: { type: "engaged", ...runner } },
    ...finishTalk(ctx, getConv(ctx.db, row.id) ?? row, scene),
  ];
}

function releaseOrderStock(ctx: Ctx, o: OrderRow, why: string): void {
  releaseReservationsOf(ctx, o.customer_id, why);
}

// The order is called off: the unit goes back, the runner goes back to work,
// and both people are told why.
function cancelOrder(ctx: Ctx, o: OrderRow, why: "customer_left" | "timeout" | "specialist_left" | "changed_mind"): Outgoing[] {
  ctx.db.prepare("UPDATE orders SET stage = 'cancelled', ended_at = ? WHERE id = ?").run(ctx.now, o.id);
  releaseOrderStock(ctx, o, `order called off: ${why}`);
  log(ctx, o.customer_id, "order_cancelled", { orderId: o.id, why, stage: o.stage, sale: saleOf(o) });
  const out: Outgoing[] = [];
  if (o.stage === "fetching") out.push({ to: "all", message: { type: "released", npcId: o.stock_id } });
  out.push(...endLiveIntents(ctx, (r) => r.customer_id === o.customer_id && r.reason === "pay", "cancelled"));
  const what = `${saleOf(o).colour} ${saleOf(o).name}`;
  const sorry =
    why === "timeout"
      ? `Sorry, we could not get your ${what} to you in time, so it has gone back on the shelf. Ask again any time.`
      : why === "specialist_left"
        ? `Sorry, the person getting your ${what} has had to go, so it has gone back on the shelf. Ask again any time.`
        : `Your ${what} has gone back on the shelf.`;
  if (why !== "customer_left" && ctx.present.includes(o.customer_id)) out.push(notice(o.customer_id, sorry));
  if (o.spec_kind === "visitor" && ctx.present.includes(o.spec_id)) {
    const text = why === "customer_left" ? `${nameOf(ctx, o.customer_id)} left before paying: the ${what} went back on the shelf.` : why === "timeout" ? `${nameOf(ctx, o.customer_id)}'s order took too long: the ${what} went back on the shelf.` : `The order for ${nameOf(ctx, o.customer_id)} was called off.`;
    out.push({ to: o.spec_id, message: { type: "update", text } });
  }
  out.push(staffViewMessage(ctx));
  return out;
}

// The stock person hands the bag to the specialist, who now goes to the customer.
function handOverBag(ctx: Ctx, o: OrderRow): Outgoing[] {
  ctx.db.prepare("UPDATE orders SET stage = 'with_spec', arrived_at = NULL WHERE id = ?").run(o.id);
  const sale = saleOf(o);
  const what = `${sale.colour} ${sale.name}`;
  log(ctx, o.customer_id, "stock_handed_over", { orderId: o.id, stockId: o.stock_id, to: o.spec_id });
  const out: Outgoing[] = [{ to: "all", message: { type: "released", npcId: o.stock_id } }];
  if (o.spec_kind === "visitor") {
    // one line each way
    out.push(notice(o.spec_id, `${nameOf(ctx, o.stock_id)}: "Here you go, ${nameOf(ctx, o.customer_id)}'s ${what}, in the bag."  You: "Thanks, I'll take it over."`));
    out.push({ to: o.spec_id, message: { type: "update", text: `You have ${nameOf(ctx, o.customer_id)}'s ${what}: find them to take payment.` } });
  }
  out.push(...sendForPayment(ctx, { customerId: o.customer_id, staffId: o.spec_id, staffKind: o.spec_kind }));
  return out;
}

// A real specialist takes the bag from the stock person who has come to them (E).
export function takeOrder(ctx: Ctx, staffId: string): Outgoing[] {
  const o = ctx.db.prepare("SELECT * FROM orders WHERE spec_id = ? AND spec_kind = 'visitor' AND stage = 'fetching' LIMIT 1").get(staffId) as OrderRow | undefined;
  if (!o) return [notice(staffId, "There is nothing to take right now.")];
  const eng = runnerOf(o);
  const m = engagedMoment(o.stock_id, eng, ctx.now);
  if (m.walking) return [notice(staffId, `${nameOf(ctx, o.stock_id)} is still on the way out with it.`)];
  const spos = ctx.position(staffId);
  if (!spos || dist(spos, m) > TALK_RANGE) return [notice(staffId, `Go over to ${nameOf(ctx, o.stock_id)} first.`)];
  return [...handOverBag(ctx, o), staffViewMessage(ctx)];
}

// The runner is close enough to hand over when it stands within this of the specialist.
const HANDOVER_RANGE = TALK_RANGE - 0.2;
const MAX_RUNNER_LEGS = 32; // a bound on one catch-up, never reached in a normal chase

// Where an NPC specialist was at server time `t`, which may be in the past: with
// whoever it is serving now if that began by then, else where its day put it.
function npcPlaceAt(ctx: Ctx, npcId: string, eng: Engagement | undefined, t: number): { x: number; z: number } {
  if (eng && t >= eng.since) {
    const m = engagedMoment(npcId, eng, t);
    return { x: m.x, z: m.z };
  }
  const n = NPCS.find((x) => x.id === npcId);
  const p = n ? npcPose(n, t) : { x: 0, z: 0 };
  return { x: p.x, z: p.z };
}

// The runner chasing the specialist, caught up to ctx.now (issue #25). Each leg
// is judged at the moment the runner really got to the end of it, not whenever
// the next request happens to arrive: did it find the specialist there, and
// was the specialist still there a beat later to take the bag? If not, the
// next leg starts at that same moment, towards where the specialist was then.
// So the result is a pure function of the order row and server time, the same
// whether the server is asked every 500 ms or every 20 s (an NPC specialist
// keeps to its own day meanwhile, D1). A real specialist's position is only
// known now, so their legs start now and they take the bag with E (takeOrder).
function catchUpRunner(ctx: Ctx, o: OrderRow): Outgoing[] {
  const npc = o.spec_kind === "npc";
  const specEng = npc ? engagements(ctx.db).find((e) => e.npcId === o.spec_id) : undefined;
  const specAt = (t: number) => (npc ? npcPlaceAt(ctx, o.spec_id, specEng, t) : (ctx.position(o.spec_id) ?? { x: 0, z: 0 }));
  const original = o.runner;
  let eng = runnerOf(o);
  let arrivedAt = o.arrived_at;
  const legFrom = (t: number, here: { x: number; z: number }): void => {
    eng = { ...eng, since: t, from: here, at: specAt(t) };
    arrivedAt = null;
  };
  const save = (): Outgoing[] => {
    const moved = JSON.stringify(eng) !== original;
    if (moved || arrivedAt !== o.arrived_at) saveRunner(ctx, o, eng, arrivedAt);
    return moved ? [{ to: "all", message: { type: "engaged", ...eng } }] : [];
  };
  for (let leg = 0; leg < MAX_RUNNER_LEGS; leg++) {
    const end = engagedArrival(o.stock_id, eng);
    if (end.at > ctx.now) break; // still on the way
    const here = { x: end.x, z: end.z };
    if (arrivedAt === null) {
      const t = npc ? end.at : ctx.now;
      // the specialist has moved on: the runner follows from where it stopped
      if (dist(specAt(t), here) > HANDOVER_RANGE) {
        legFrom(t, here);
        if (!npc) break;
        continue;
      }
      arrivedAt = t;
    }
    if (!npc) {
      // a real one presses E; if they wander off first, the runner follows
      if (dist(specAt(ctx.now), here) > HANDOVER_RANGE) legFrom(ctx.now, here);
      break;
    }
    // an NPC specialist takes the bag a beat after the runner arrives, once they are free
    const beat = arrivedAt + CHECKOUT_BEAT_MS;
    if (beat > ctx.now) break;
    if (staffBusy(ctx, o.spec_id, "npc")) {
      // busy with someone else: wait, or follow if they have walked off to them
      if (dist(specAt(ctx.now), here) > HANDOVER_RANGE) legFrom(ctx.now, here);
      break;
    }
    if (dist(specAt(beat), here) > HANDOVER_RANGE) {
      legFrom(beat, here);
      continue;
    }
    return [...save(), ...handOverBag(ctx, o)];
  }
  return save();
}

// Whatever has become due for an order: called off if the customer has gone or
// it has taken too long, the runner following the specialist, the hand-over.
function settleOrders(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  for (const o of liveOrders(ctx.db)) {
    if (!ctx.present.includes(o.customer_id)) {
      out.push(...cancelOrder(ctx, o, "customer_left"));
      continue;
    }
    if (o.stage !== "paying" && ctx.now > o.expires_at) {
      out.push(...cancelOrder(ctx, o, "timeout"));
      continue;
    }
    if (o.spec_kind === "visitor" && !ctx.employees.some((e) => e.id === o.spec_id) && o.stage !== "paying") {
      out.push(...cancelOrder(ctx, o, "specialist_left"));
      continue;
    }
    if (o.stage === "fetching") out.push(...catchUpRunner(ctx, o));
  }
  return out;
}

// The specialist has got to the customer to take payment: a short
// payment conversation opens (the sale itself was settled in the first chat).
function openPay(ctx: Ctx, r: IntentRow): Outgoing[] {
  const o = ctx.db.prepare("SELECT * FROM orders WHERE customer_id = ? AND spec_id = ? AND stage = 'with_spec' LIMIT 1").get(r.customer_id, r.staff_id) as OrderRow | undefined;
  const cpos = ctx.position(r.customer_id);
  if (!o || !cpos) return endIntent(ctx, r, "cancelled", "no order to pay");
  const out = endIntent(ctx, r, "accepted", "accepted");
  const sale = saleOf(o);
  const id = randomUUID();
  const row: ConvRow = { id, customer_id: r.customer_id, with_id: r.staff_id, with_kind: r.staff_kind, script: "phones", node: "talk", data: null, started_at: ctx.now, ended_at: null };
  // an NPC carries on from exactly where it is drawn now (the end of its walk
  // over): a fresh engagement with no `from` re-plans from its timetable spot
  // and every client would see it jump to a new side of the customer (#54)
  const here = r.staff_kind === "npc" ? engagedMoment(r.staff_id, intentEngagement(r), ctx.now) : null;
  const eng: Engagement = { npcId: r.staff_id, visitorId: r.customer_id, since: ctx.now, at: cpos, ...(here ? { from: { x: here.x, z: here.z } } : {}) };
  const data: TalkConvData = { engine: "talk", scene: payScene(), at: cpos, checkout: { stage: "pay", sale, beat: "scanned", beatAt: ctx.now }, ...(r.staff_kind === "npc" ? { eng } : {}) };
  ctx.db
    .prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, r.customer_id, r.staff_id, r.staff_kind, row.script, row.node, JSON.stringify(data), ctx.now);
  ctx.db.prepare("UPDATE orders SET stage = 'paying' WHERE id = ?").run(o.id);
  setState(ctx, r.customer_id, { state: "in_conversation", with_id: r.staff_id });
  log(ctx, r.customer_id, "conversation_started", { conversationId: row.id, with: r.staff_id, kind: r.staff_kind, script: "payment", orderId: o.id });
  log(ctx, r.customer_id, "payment_started", { orderId: o.id, conversationId: row.id, sale });
  // the first beat: the handheld scans the item, before any total is shown
  log(ctx, r.customer_id, "scanned", { conversationId: row.id, by: r.staff_id, sale });
  const t = payTurn(data.checkout!);
  out.push({ to: r.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, r.staff_id), t.say, t.choices, false, "customer") } });
  const sm = stateMessage(ctx, r.customer_id);
  if (sm) out.push(sm);
  if (r.staff_kind === "npc") out.push({ to: "all", message: { type: "engaged", ...eng } });
  else out.push(staffMenu(ctx, row, data));
  out.push(staffViewMessage(ctx));
  return out;
}

// A real employee has left: an NPC of the same post carries on their orders.
function transferOrders(ctx: Ctx, leaverId: string, npcId: string, at: { x: number; z: number }): Outgoing[] {
  const out: Outgoing[] = [];
  for (const o of liveOrders(ctx.db).filter((x) => x.spec_id === leaverId && x.stage !== "paying")) {
    ctx.db.prepare("UPDATE orders SET spec_id = ?, spec_kind = 'npc' WHERE id = ?").run(npcId, o.id);
    log(ctx, o.customer_id, "order_handed_to_npc", { orderId: o.id, from: leaverId, to: npcId });
    if (o.stage === "fetching") {
      // the runner now heads for where the NPC stands (where the specialist stood)
      const eng = runnerOf(o);
      const m = engagedMoment(o.stock_id, eng, ctx.now);
      const next: Engagement = { ...eng, visitorId: npcId, since: ctx.now, from: { x: m.x, z: m.z }, at };
      saveRunner(ctx, o, next, null);
      out.push({ to: "all", message: { type: "engaged", ...next } });
    } else {
      // it has the bag: it goes to the customer, from where the specialist stood
      out.push(...sendForPayment(ctx, { customerId: o.customer_id, staffId: npcId, staffKind: "npc", from: at }));
    }
  }
  return out;
}

// Advances the checkout exactly one beat (scanned -> total_shown -> tapped),
// logging that beat's own events row (naming the staff member and, via `log`'s
// visitorId, the customer). A no-op once already at "tapped". Never called from
// a timer or from settleVisits ticking on its own -- only from an explicit
// request that names this conversation (CLAUDE.md "no background processes": a
// deadline/beat is a stored column, caught up on the request that touches it).
function advanceBeat(ctx: Ctx, customerId: string, staffId: string, c: Checkout): Checkout {
  const next = NEXT_BEAT[c.beat];
  if (!next) return c;
  if (next === "total_shown") log(ctx, customerId, "total_shown", { by: staffId, sale: c.sale });
  else log(ctx, customerId, "tapped", { by: staffId });
  return { ...c, beat: next, beatAt: ctx.now };
}

// The staff handheld's own "scan" / "show total" action (issue #2): a real
// specialist drives the first two beats explicitly, one request at a time,
// before the customer ever taps to pay. An NPC-staffed sale never needs this --
// the customer's own tap (handleCheckoutChoice below) catches up any beat not
// yet reached, as part of that one explicit request, so a payment with nobody
// pressing a handheld button still completes correctly.
export function advancePaymentBeat(ctx: Ctx, staffId: string, conversationId: string): Outgoing[] {
  const row = getConv(ctx.db, conversationId);
  if (!row || row.with_id !== staffId || row.with_kind !== "visitor" || row.ended_at !== null) return [notice(staffId, "That conversation is over.")];
  const d = anyDataOf(row);
  if (!isTalkData(d) || !d.checkout) return [notice(staffId, "Nothing to scan yet.")];
  if (!NEXT_BEAT[d.checkout.beat]) return [notice(staffId, "Already at the tap.")];
  const checkout = advanceBeat(ctx, row.customer_id, staffId, d.checkout);
  const next: TalkConvData = { ...d, checkout };
  saveTalkData(ctx, row, next);
  return [staffMenu(ctx, row, next)];
}

function handleCheckoutChoice(ctx: Ctx, row: ConvRow, d: TalkConvData, choiceId: string): Outgoing[] {
  let c = d.checkout!;
  if (!["pay:card", "pay:phone", "pay:cancel"].includes(choiceId)) return [notice(row.customer_id, "That is not one of the options.")];
  const paid = choiceId !== "pay:cancel";
  // The tap itself is an explicit request, so it may catch up whichever beats
  // have not yet happened (CLAUDE.md: a deadline is a stored column caught up
  // on the next request that touches it -- this call IS that request, never a
  // bare tick of settleVisits). It can never skip one: each step still reads
  // the previous beat off `c.beat` and writes its own events row before the
  // sale is allowed to complete, so "paid" is reachable only by way of
  // "scanned" -> "total_shown" -> "tapped", in that order, for this exact order.
  if (paid) {
    while (NEXT_BEAT[c.beat]) c = advanceBeat(ctx, row.customer_id, row.with_id, c);
  }
  log(ctx, row.customer_id, paid ? "purchase_paid" : "purchase_cancelled", { conversationId: row.id, by: row.with_id, method: paid ? choiceId.slice(4) : null, sale: c.sale });
  if (paid) log(ctx, row.customer_id, "paid", { by: row.with_id, sale: c.sale }); // the beat machine's own terminal event, alongside purchase_paid
  // paid: the held unit is sold; called off: it goes back on the shelf
  if (paid) ctx.db.prepare("UPDATE reservations SET status = 'sold' WHERE visitor_id = ? AND status = 'held'").run(row.customer_id);
  else releaseReservationsOf(ctx, row.customer_id, "changed their mind at the payment");
  const order = orderOfCustomer(ctx.db, row.customer_id);
  if (order) ctx.db.prepare("UPDATE orders SET stage = ?, ended_at = ? WHERE id = ?").run(paid ? "done" : "cancelled", ctx.now, order.id);
  const scene: Scene = paid ? d.scene : { ...d.scene, ended: { how: "left", why: "changed their mind at the payment" } };
  const say = paid ? "That's gone through. Thanks, enjoy your new phone." : "No problem, I'll put it back. Have a look around if you like.";
  const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, [], true, "customer") } }];
  saveTalkData(ctx, row, { ...d, checkout: undefined, scene });
  return [...out, ...finishTalk(ctx, getConv(ctx.db, row.id) ?? row, scene)];
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

interface EscortRow {
  id: string;
  customer_id: string;
  staff_id: string;
  kind: "demo" | "seat";
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

function beginEscort(ctx: Ctx, p: { customerId: string; staffId: string; kind: "demo" | "seat"; slotId?: string; conversationId?: string; from: { x: number; z: number }; goal: { x: number; z: number }; face: { x: number; z: number }; stand: { x: number; z: number }; text: string; staffText?: string }): Outgoing[] {
  const at = ctx.position(p.customerId) ?? p.stand;
  const id = randomUUID();
  ctx.db
    .prepare(
      "INSERT INTO escorts (id, customer_id, staff_id, kind, slot_id, conversation_id, status, created_at, at_x, at_z, from_x, from_z, goal_x, goal_z, face_x, face_z, stand_x, stand_z) VALUES (?, ?, ?, ?, ?, ?, 'walking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, p.customerId, p.staffId, p.kind, p.slotId ?? null, p.conversationId ?? null, ctx.now, at.x, at.z, p.from.x, p.from.z, p.goal.x, p.goal.z, p.face.x, p.face.z, p.stand.x, p.stand.z);
  const row = ctx.db.prepare("SELECT * FROM escorts WHERE id = ?").get(id) as EscortRow;
  log(ctx, p.customerId, "escort_started", { escortId: id, kind: p.kind, staff: p.staffId, slotId: p.slotId ?? null });
  // two real people: nobody can lead the other, so each is given where to go
  if (isHuman(ctx, p.staffId)) {
    return [
      { to: p.customerId, message: { type: "escort", id, kind: p.kind, npcId: p.staffId, npcName: nameOf(ctx, p.staffId), text: p.text, goal: p.stand } },
      { to: p.staffId, message: { type: "escort", id, kind: p.kind, npcId: p.customerId, npcName: nameOf(ctx, p.customerId), text: p.staffText ?? `Walk with ${nameOf(ctx, p.customerId)}`, goal: p.goal } },
    ];
  }
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
  // up from the table first, if they are sitting
  const upFrom = standUp(ctx, row);
  const eng = (anyDataOf(getConv(ctx.db, row.id) ?? row) as AnyConvData).eng;
  const human = row.with_kind === "visitor";
  const from = human ? (ctx.position(row.with_id) ?? spot.goal) : npcPlace(ctx, eng, row.with_id);
  return [
    ...upFrom,
    ...beginEscort(ctx, {
      customerId: row.customer_id,
      staffId: row.with_id,
      kind: "demo",
      slotId: spot.slotId,
      conversationId: row.id,
      from,
      goal: spot.goal,
      face: spot.face,
      stand: spot.stand,
      text: human ? `Go to the ${modelName}` : `Follow ${nameOf(ctx, row.with_id)} to the ${modelName}`,
      staffText: `Take ${nameOf(ctx, row.customer_id)} to the ${modelName}`,
    }),
  ];
}

function finishEscort(ctx: Ctx, e: EscortRow, why: "done" | "cancelled"): Outgoing[] {
  ctx.db.prepare("UPDATE escorts SET status = ?, ended_at = ? WHERE id = ?").run(why, ctx.now, e.id);
  log(ctx, e.customer_id, "escort_ended", { escortId: e.id, kind: e.kind, why });
  const out: Outgoing[] = [{ to: e.customer_id, message: { type: "escort_end", id: e.id } }];
  const human = isHuman(ctx, e.staff_id);
  if (human) out.push({ to: e.staff_id, message: { type: "escort_end", id: e.id } });
  const cpos = ctx.position(e.customer_id);
  const conv = e.conversation_id ? getConv(ctx.db, e.conversation_id) : undefined;
  if (e.kind === "seat" && conv && conv.ended_at === null) {
    // arrived: sit down (or, if they never came, carry on standing)
    if (why === "done") {
      out.push(...sitDown(ctx, e));
    } else {
      const d = anyDataOf(conv);
      if (isTalkData(d)) {
        if (human) {
          out.push(showTurn(ctx, conv, d), staffMenu(ctx, conv, d));
        } else {
          const eng: Engagement = { npcId: e.staff_id, visitorId: e.customer_id, since: ctx.now, at: cpos ?? { x: e.stand_x, z: e.stand_z }, from: { x: e.goal_x, z: e.goal_z } };
          saveTalkData(ctx, conv, { ...d, eng });
          out.push({ to: "all", message: { type: "engaged", ...eng } }, showTurn(ctx, conv, { ...d, eng }));
        }
      }
    }
    return out;
  }
  if (e.kind === "demo" && conv && conv.ended_at === null && cpos) {
    const d = anyDataOf(conv);
    if (human) {
      // back from the device: both are in the conversation again
      if (isTalkData(d)) {
        const t = currentTurn(d.scene);
        out.push(showTurn(ctx, conv, d, reworded(t.say, "So, that's the one.")), staffMenu(ctx, conv, d));
      }
    } else {
      // back to the customer to carry on talking: walks over from where it waited
      const eng: Engagement = { npcId: e.staff_id, visitorId: e.customer_id, since: ctx.now, at: cpos, from: { x: e.goal_x, z: e.goal_z } };
      setEng(ctx, conv.id, eng);
      out.push({ to: "all", message: { type: "engaged", ...eng } });
      // back from the device: the line about it no longer says "here it is"
      if (isTalkData(d)) {
        const t = currentTurn(d.scene);
        out.push(showTurn(ctx, conv, { ...d, eng }, reworded(t.say, "So, that's the one.")));
      }
    }
  } else if (!human) {
    out.push({ to: "all", message: { type: "released", npcId: e.staff_id } });
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
    const human = isHuman(ctx, e.staff_id);
    const spos = human ? ctx.position(e.staff_id) : undefined;
    if (human && (!spos || !ctx.present.includes(e.staff_id))) {
      out.push(...finishEscort(ctx, e, "cancelled")); // the specialist has gone
      continue;
    }
    if (!human && engagedMoment(e.staff_id, escortEngagement(e), ctx.now).walking) continue; // still leading the way
    if (e.kind === "seat") {
      // each on their own stool, whoever is leading
      const specialistThere = !human || (spos !== undefined && dist(spos, { x: e.goal_x, z: e.goal_z }) <= 1.0);
      if (specialistThere && dist(cpos, { x: e.stand_x, z: e.stand_z }) <= 1.0) out.push(...finishEscort(ctx, e, "done"));
      continue;
    }
    // a real specialist goes to the device with the customer: close by when it opens
    if (human && spos && dist(spos, cpos) > TALK_RANGE + 0.5) continue;
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

// A customer who hasn't asked for anything yet (just arrived, or browsing)
// gets greeted once, as soon as they stand just inside the entrance and the
// greeter is free: she walks up and the conversation opens at once, first come
// first served. If she is busy, or they have walked past the entrance zone,
// nobody waits for her: it is up to the customer to press E. Only the greeter
// does this: every other role waits to be asked, which matches a real store
// (a specialist doesn't stalk the floor; the greeter is the one who says hello).
// ---- real staff users are offered waiting customers first (D47, D48, D53, D54; ADR 9; issue #1) ----
//
// The waiting list is not a table: it is every customer who is here, inside,
// free and in a waiting state (just arrived, or asked for someone), oldest
// wait first. The one thing it adds is the offer, kept on the customer's own
// player_state row (its `data` JSON): who is being offered them and since
// when, and which real staff users already let an offer of them pass. The
// 15 s window is that stored timestamp, caught up by `settleOffers` on the
// next request that touches it (any move, a join or leave, a settle poll);
// nothing waits on a timer. Every offer made, passed on, withdrawn, claimed
// or released writes an events row.

export const OFFER_MS = 15_000; // D48: how long a real staff user has to claim the customer they are offered
const WAITING_STATES: PlayerStateName[] = ["arriving", "waiting_for_help"];
const TIE_M = 0.05; // nearer than this counts as equally near (D53: then whoever became free first)

interface OfferData {
  offer?: { to: string; at: number }; // the live offer
  offered?: string[]; // real staff users who let an offer of this customer pass, this wait
  claim?: { by: string; at: number; from: PlayerStateName; waitingSince: number }; // who has them, and where they stood on the list
  waitingSince?: number; // their place on the list, kept when a claim was released
  cpu?: CpuMark; // a timetable customer: the visit it was promoted on, and where it waits (issue #20)
}

const offerData = (st: StateRow): OfferData => (st.data ? (JSON.parse(st.data) as OfferData) : {});

// Writes the offer fields of a customer's player_state data, leaving the rest (the note) alone.
function patchOfferData(ctx: Ctx, id: string, patch: Partial<Record<keyof OfferData, unknown>>): void {
  const st = stateOf(ctx.db, id);
  if (!st) return;
  const data = (st.data ? JSON.parse(st.data) : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete data[k];
    else data[k] = v;
  }
  ctx.db.prepare("UPDATE player_state SET data = ? WHERE visitor_id = ?").run(Object.keys(data).length > 0 ? JSON.stringify(data) : null, id);
}

// Whose E press would actually open a conversation: D54 asks for no skill or
// duty match, so this is only "has a script at all" (a post without one would
// be offered a customer they cannot claim, holding everyone else back 15 s for
// nothing; orchestrator ruling, 2026-11-07). A no-op once every post has one.
const canServe = (e: Employee): boolean => scriptFor(designationOfEmployee(e)) !== null;

// D53: of two equally near, whoever became free first. Free since they joined,
// or since their last conversation ended, whichever is later.
function freeSince(ctx: Ctx, staffId: string): number {
  const joined = (ctx.db.prepare("SELECT MAX(ts) AS t FROM events WHERE visitor_id = ? AND type = 'join'").get(staffId) as { t: number | null }).t ?? 0;
  const ended = (ctx.db.prepare("SELECT MAX(ended_at) AS t FROM conversations WHERE with_id = ? AND with_kind = 'visitor'").get(staffId) as { t: number | null }).t ?? 0;
  return Math.max(joined, ended);
}

interface Waiting {
  st: StateRow;
  d: OfferData;
  since: number;
  at: { x: number; z: number };
}

// The internal waiting list (D47): oldest wait first.
function waitingList(ctx: Ctx): Waiting[] {
  const staff = new Set(ctx.employees.map((e) => e.id));
  const rows = ctx.db.prepare(`SELECT * FROM player_state WHERE state IN (${WAITING_STATES.map(() => "?").join(",")})`).all(...WAITING_STATES) as StateRow[];
  const out: Waiting[] = [];
  for (const st of rows) {
    if (staff.has(st.visitor_id) || !ctx.present.includes(st.visitor_id)) continue;
    const at = ctx.position(st.visitor_id);
    // someone still on the pavement outside has not come in yet
    if (!at || zoneOf(at.x, at.z) === "outside" || !customerFree(ctx, st.visitor_id)) continue;
    const d = offerData(st);
    out.push({ st, d, since: d.waitingSince ?? st.since, at });
  }
  return out.sort((a, b) => a.since - b.since || (a.st.visitor_id < b.st.visitor_id ? -1 : 1));
}

const areaOf = (ctx: Ctx, st: StateRow, at: { x: number; z: number }): string => {
  const spot = st.state === "waiting_for_help" && st.needs ? waitSpotFor(st.needs) : null;
  if (spot) return spot.label;
  return zoneOf(at.x, at.z) === "entrance" ? "the entrance" : "the shop floor";
};

// Catches the offers up with now: an offer whose customer or staff user is no
// longer free is withdrawn, one whose 15 s ran out passes on, and every
// waiting customer without one is offered to the nearest free real staff user
// who has not already let them pass. Returns what to tell people.
export function settleOffers(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  let changed = false;
  const free = new Map(ctx.employees.filter((e) => canServe(e) && staffAvailable(ctx, e.id, "visitor") && ctx.position(e.id)).map((e) => [e.id, e]));

  // 1. live offers that no longer stand
  const waiting = waitingList(ctx);
  const onList = new Set(waiting.map((w) => w.st.visitor_id));
  const live = ctx.db.prepare("SELECT * FROM player_state WHERE data LIKE '%\"offer\":%'").all() as StateRow[];
  for (const st of live) {
    const d = offerData(st);
    if (!d.offer) continue;
    const customerId = st.visitor_id;
    const { to } = d.offer;
    // each row is written before the change it records (CLAUDE.md: the event log is load-bearing)
    if (!onList.has(customerId)) {
      log(ctx, customerId, "offer_withdrawn", { staffId: to, why: ctx.present.includes(customerId) ? "customer no longer waiting" : "customer left" });
      patchOfferData(ctx, customerId, { offer: undefined });
      changed = true;
    } else if (!free.has(to)) {
      log(ctx, customerId, "offer_withdrawn", { staffId: to, why: ctx.employees.some((e) => e.id === to) ? "staff busy" : "staff left" });
      patchOfferData(ctx, customerId, { offer: undefined });
      changed = true;
    } else if (ctx.now - d.offer.at >= OFFER_MS) {
      const offered = [...new Set([...(d.offered ?? []), to])];
      log(ctx, customerId, "offer_expired", { staffId: to, offeredAt: d.offer.at });
      patchOfferData(ctx, customerId, { offer: undefined, offered });
      changed = true;
    }
  }

  // 2. a free real staff user holds one offer at a time, across requests too:
  // whoever already holds a live one is not free for another
  const fresh = waitingList(ctx);
  for (const w of fresh) if (w.d.offer) free.delete(w.d.offer.to);
  const offer = (w: Waiting, pool: Employee[], again: boolean): void => {
    const candidates = pool.map((e) => ({ e, d: dist(w.at, ctx.position(e.id)!) })).sort((a, b) => a.d - b.d);
    const nearest = candidates.filter((c) => c.d - candidates[0]!.d <= TIE_M);
    const pick = nearest.length === 1 ? nearest[0]!.e : nearest.map((c) => ({ e: c.e, t: freeSince(ctx, c.e.id) })).sort((a, b) => a.t - b.t)[0]!.e;
    free.delete(pick.id);
    const area = areaOf(ctx, w.st, w.at);
    log(ctx, w.st.visitor_id, "offer_made", { staffId: pick.id, area, waitingSince: w.since, ...(again ? { again: true } : {}) });
    patchOfferData(ctx, w.st.visitor_id, { offer: { to: pick.id, at: ctx.now } });
    out.push(notice(pick.id, `Customer waiting at ${area}: ${nameOf(ctx, w.st.visitor_id)}. Walk up and press E.`));
    changed = true;
  };
  // the longest-waiting customer goes to the nearest free staff user who has not let them pass (D48)
  const passedByAll: Waiting[] = [];
  for (const w of fresh) {
    if (w.d.offer || free.size === 0) continue;
    const passed = new Set(w.d.offered ?? []);
    const pool = [...free.values()].filter((e) => !passed.has(e.id));
    if (pool.length > 0) offer(w, pool, false);
    else passedByAll.push(w);
  }
  // D57b (Ritesh, 2026-11-07): someone every free staff user has let pass, whom
  // no CPU can take either (only the greeter takes anyone, and only at the
  // door), is offered again to whoever is free rather than left for good. Only
  // after everyone not yet offered has had their turn above, so a customer
  // being looped back never starves a newcomer.
  for (const w of passedByAll) {
    if (free.size === 0) break;
    if (greeterCanTake(ctx, w.st)) continue; // the greeter may take them: she does, in catchUpOffers
    offer(w, [...free.values()], true);
  }
  if (changed) out.push(staffViewMessage(ctx));
  return out;
}

// A customer who is leaving (or reconnecting, which leaves first) has any live
// offer of them withdrawn, logged, so it never survives into their next visit
// and expires there as if the staff user had let it pass.
function withdrawOfferOf(ctx: Ctx, customerId: string, why: string): void {
  const st = stateOf(ctx.db, customerId);
  const o = st ? offerData(st).offer : undefined;
  if (!o) return;
  log(ctx, customerId, "offer_withdrawn", { staffId: o.to, why });
  patchOfferData(ctx, customerId, { offer: undefined });
}

// A real staff user claimed this customer with E: the offer (theirs or
// someone else's) is done, and the claim keeps the customer's place on the
// list in case it is released. Call after the conversation has opened.
function recordClaim(ctx: Ctx, customerId: string, staffId: string, before: StateRow): void {
  const d = offerData(before);
  patchOfferData(ctx, customerId, {
    offer: undefined,
    claim: { by: staffId, at: ctx.now, from: before.state, waitingSince: d.waitingSince ?? before.since },
  });
}

// A real staff user is leaving with a customer they claimed still in
// conversation, and no NPC of their post took it over (`handOverPost` runs
// first; Ritesh, 2026-11-07, option A): the conversation ends, and the
// customer goes back on the waiting list at the place they held. Call while
// the staff user still counts as present, after `handOverPost`, and settle
// the offers once they are gone.
export function releaseClaimsOf(ctx: Ctx, staffId: string): Outgoing[] {
  const row = ctx.db.prepare("SELECT * FROM conversations WHERE ended_at IS NULL AND with_kind = 'visitor' AND with_id = ?").get(staffId) as ConvRow | undefined;
  if (!row) return [];
  const st = stateOf(ctx.db, row.customer_id);
  const claim = st ? offerData(st).claim : undefined;
  if (!claim || claim.by !== staffId) return [];
  const out = ctx.db.transaction(() => {
    log(ctx, row.customer_id, "claim_released", { staffId, why: "staff left", state: claim.from, waitingSince: claim.waitingSince });
    const ended = finishEither(ctx, row, staffId, `${nameOf(ctx, staffId)} had to step away. Someone will be with you shortly.`, "staff left");
    setState(ctx, row.customer_id, { state: claim.from, with_id: null });
    patchOfferData(ctx, row.customer_id, { waitingSince: claim.waitingSince });
    return ended;
  })();
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  return out;
}

// Whether a free real staff user who can serve, and has not already let an
// offer of this customer pass, is in the room: the greeter gives way to them
// even before the offer is written (D47, criterion 5).
function realStaffFor(ctx: Ctx, st: StateRow): boolean {
  const d = offerData(st);
  if (d.offer) return true;
  // someone browsing (already served once) is never offered, so the greeter does not wait for anyone
  if (!WAITING_STATES.includes(st.state)) return false;
  const passed = new Set(d.offered ?? []);
  return ctx.employees.some((e) => !passed.has(e.id) && canServe(e) && staffAvailable(ctx, e.id, "visitor") && !!ctx.position(e.id));
}

// The offers caught up with now, then the greeter tried for the waiting
// customers no real staff user is offered: `first` (the customer who just
// moved) before the rest, oldest wait first, so a customer standing still
// inside the door is not left past the window for want of a step of their
// own. She takes at most one. Called on every request that could change the
// picture (a move, a join or leave, a settle poll).
export function catchUpOffers(ctx: Ctx, first?: string): Outgoing[] {
  const cpu = [...settleCpuPayments(ctx), ...departCpuCustomers(ctx), ...promoteCpuCustomers(ctx)];
  const out = [...cpu, ...settleOffers(ctx)];
  const order = waitingList(ctx).map((w) => w.st.visitor_id);
  const ids = first ? [first, ...order.filter((id) => id !== first)] : order;
  for (const id of ids) {
    const greeted = tryGreeterApproach(ctx, id);
    if (greeted.length > 0) return [...out, ...greeted];
  }
  return out;
}

// ---- timetable customers join the waiting list (D55, D56; ADR 10 option B; issue #20) ----
//
// A timetable customer (storeday.ts's CAST, "cust-1" and on) is drawn from the
// clock and has no row anywhere, and nearly all of them stay that way. The one
// moment one needs a row is when it would go on the waiting list: it is on the
// floor needing help (`ctx.present` says so; see cpuCustomersOnFloor for the
// live bridge) and a real staff user who could serve it is free. A real user is
// offered a customer before a CPU staff member is (D47), so with nobody free
// the timetable's own specialist serves it, and nothing is written.
//
// Promotion gives it what `enter()` gives a real visitor who picks the customer
// role: a visitors row and a player_state row in a waiting state. From then on
// it is a customer like any other: the same waiting list, offer, claim and
// leaving code reads the same row, with no human-vs-CPU branch in any of it.
// What is different is only who decides, and the decisions made here are the
// ones ADR 10 settles: it waits where it was promoted, and once served (or once
// its visit is over) it leaves through `leaveStore`, and is never handed back
// to the timetable or put on the list again on that visit. The day repeats
// every CYCLE seconds with the same ids, so the next day's visit is a new visit
// and may be promoted again (orchestrator ruling, 2026-11-08), the way a real
// visitor coming back is greeted again. How it answers in a conversation is
// issue #39.

const CPU_CUSTOMER_IDS: ReadonlySet<string> = new Set(CAST.filter((c) => c.role === "customer").map((c) => c.id));
const CPU_SPECIALISTS: ReadonlySet<string> = new Set(CAST.filter((c) => c.role === "specialist").map((c) => c.id));

// Which day of the repeating timetable `now` falls in: one visit per customer per day.
export const visitOf = (now: number): number => Math.floor(now / (CYCLE * 1000));

// What the promotion keeps on the customer's own player_state data (alongside
// the offer fields): which visit it is, and where it waits.
interface CpuMark {
  visit: number;
  at: { x: number; z: number };
  promotedAt: number;
}

const cpuMarkOf = (data: string | null): CpuMark | undefined => (data ? (JSON.parse(data) as { cpu?: CpuMark }).cpu : undefined);

const cpuRows = (db: Database.Database): StateRow[] =>
  (db.prepare("SELECT * FROM player_state WHERE data LIKE '%\"cpu\":%'").all() as StateRow[]).filter((r) => CPU_CUSTOMER_IDS.has(r.visitor_id) && !!cpuMarkOf(r.data));

// Whether this timetable customer may be promoted now: never on this visit yet.
// A row from an earlier visit counts only once that visit has been left.
function promotable(db: Database.Database, id: string, now: number): boolean {
  if (!CPU_CUSTOMER_IDS.has(id)) return false;
  const st = stateOf(db, id);
  if (!st) return true;
  const mark = cpuMarkOf(st.data);
  return !!mark && st.state === "leaving" && mark.visit !== visitOf(now);
}

// Whether a real staff user who could open a conversation is free and in the room.
const realStaffFree = (ctx: Ctx): boolean => ctx.employees.some((e) => canServe(e) && staffAvailable(ctx, e.id, "visitor") && !!ctx.position(e.id));

function promoteCpuCustomers(ctx: Ctx): Outgoing[] {
  const due = ctx.present.filter((id) => {
    if (!promotable(ctx.db, id, ctx.now)) return false;
    const at = ctx.position(id);
    return !!at && zoneOf(at.x, at.z) !== "outside";
  });
  if (due.length === 0 || !realStaffFree(ctx)) return [];
  for (const id of due) {
    const at = { ...ctx.position(id)! };
    const who = castOf(id);
    ctx.db.transaction(() => {
      // the token is what a browser signs in with: a random one nobody holds, so
      // no client can ever connect as a timetable customer
      ctx.db
        .prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen")
        .run(id, `cpu-${randomBytes(24).toString("base64url")}`, NPC_NAME[id] ?? id, who.shirt, ctx.now, ctx.now);
      log(ctx, id, "cpu_customer_promoted", { purpose: who.purpose ?? null, visit: visitOf(ctx.now), at, state: "waiting_for_help" });
      setState(ctx, id, { state: "waiting_for_help", want: who.purpose ?? null, needs: null, with_id: null });
      const mark: CpuMark = { visit: visitOf(ctx.now), at, promotedAt: ctx.now };
      patchOfferData(ctx, id, { cpu: mark });
    })();
  }
  return [staffViewMessage(ctx)];
}

// A promoted timetable customer leaves, through the same `leaveStore` a real
// visitor's departure runs: once its conversation is over and nothing it is part
// of is still under way (served), or once the floor no longer has it (its visit
// is over: the live bridge only keeps it while its timetable day has it in the
// store, or while it is busy).
function departCpuCustomers(ctx: Ctx): Outgoing[] {
  const out: Outgoing[] = [];
  for (const st of cpuRows(ctx.db)) {
    const id = st.visitor_id;
    if (st.state === "leaving") continue;
    const gone = !ctx.present.includes(id);
    const served = st.state === "browsing" && customerFree(ctx, id) && !orderOfCustomer(ctx.db, id);
    if (!gone && !served) continue;
    log(ctx, id, "cpu_customer_departed", { why: gone ? "visit over" : "served" });
    out.push(...leaveStore(ctx, id));
  }
  return out;
}

// The live bridge from the timetable to the store's rules: which timetable
// customers are on the floor now, and where. A pure function of the clock and
// the rows, so nothing needs a timer.
//  - promoted on this visit and not left: held where it was promoted, for as
//    long as its timetable day still has it in the store, and longer while it
//    is in a conversation or has an order under way (nobody is cut off);
//  - not promoted on this visit: only while the timetable has it standing at a
//    table waiting for a specialist to come over, the moment it would go on the
//    waiting list. Every other moment it is ambient and the rules never see it.
export function cpuCustomersOnFloor(db: Database.Database, now: number): Map<string, { x: number; z: number }> {
  const floor = new Map<string, { x: number; z: number }>();
  const visit = visitOf(now);
  for (const st of cpuRows(db)) {
    const mark = cpuMarkOf(st.data)!;
    if (st.state === "leaving") continue;
    const busy = !FREE_STATES.includes(st.state) || !!openConversationOf(db, st.visitor_id) || !!orderOfCustomer(db, st.visitor_id);
    if (busy || (mark.visit === visit && momentOf(st.visitor_id, now).present)) floor.set(st.visitor_id, mark.at);
  }
  for (const id of CPU_CUSTOMER_IDS) {
    if (floor.has(id) || !promotable(db, id, now) || !waitingForSpecialist(id, now)) continue;
    const m = momentOf(id, now);
    floor.set(id, { x: m.x, z: m.z });
  }
  return floor;
}

// The promoted timetable customers every client draws in place of their
// timetable (issue #41): those on the floor now, held where they were
// promoted, and those that left on this visit with when they left (their
// `leaving` state's since), so every client walks them out of the door from
// the same spot at the same moment, and keeps them off their timetable until
// its day has them out of the store (shared/heldCpu.ts). The unpromoted ones
// `cpuCustomersOnFloor` also lists are exactly where their timetable has
// them, so a client needs no word of them.
export function heldCpuCustomers(db: Database.Database, now: number, floor = cpuCustomersOnFloor(db, now)): HeldCpu[] {
  const held: HeldCpu[] = [];
  for (const st of cpuRows(db)) {
    const mark = cpuMarkOf(st.data)!;
    const at = floor.get(st.visitor_id);
    if (st.state !== "leaving") {
      if (at) held.push({ id: st.visitor_id, at, since: mark.promotedAt });
      continue;
    }
    const left: HeldCpu = { id: st.visitor_id, at: mark.at, since: mark.promotedAt, leftAt: st.since };
    if (mark.visit === visitOf(now) && !heldDone(left, now)) held.push(left);
  }
  return held.sort((a, b) => a.id.localeCompare(b.id));
}

// Whether the timetable has this customer standing at a table waiting for a
// specialist: in the run of standing that ends in their chat with one.
export function waitingForSpecialist(id: string, now: number): boolean {
  const segs = timelineOf(id);
  const tau = (((now / 1000) % CYCLE) + CYCLE) % CYCLE;
  const i = segs.findIndex((s) => s.t0 <= tau && tau < s.t1);
  if (i < 0 || segs[i]!.kind !== "stand") return false;
  let j = i;
  while (j < segs.length && segs[j]!.kind === "stand") j++;
  const next = segs[j];
  return !!next && next.kind === "act" && !!next.with && CPU_SPECIALISTS.has(next.with);
}

export function tryGreeterApproach(ctx: Ctx, customerId: string): Outgoing[] {
  const st = stateOf(ctx.db, customerId);
  // a real staff user is (or is about to be) offered them: she gives way (D47); once
  // every free one has let the 15 s pass, she may take them, and the takeover is logged
  if (!st || realStaffFor(ctx, st)) return [];
  const can = greeterCanTake(ctx, st);
  if (!can) return [];
  // she walks up to where they actually stand (the entrance zone is already inside the door), so she faces them;
  // the real staff users who let their offer pass are named, so a takeover reads as one
  const passedOver = offerData(st).offered ?? [];
  log(ctx, customerId, "npc_approached", { npcId: "greeter-1", ...(passedOver.length > 0 ? { passedOver } : {}) });
  return [...endInspect(ctx, customerId, "the greeter came over"), ...open(ctx, customerId, "greeter-1", "npc", can.script, can.here)];
}

// Whether the greeter could walk up to this customer now, setting aside who
// else is free: what `tryGreeterApproach` acts on, and what the lone-staff
// loop-back (D57b) asks before repeating an offer instead.
function greeterCanTake(ctx: Ctx, st: StateRow): { script: ScriptId; here: { x: number; z: number } } | null {
  const customerId = st.visitor_id;
  if ((st.state !== "arriving" && st.state !== "browsing") || st.with_id) return null;
  // greeted already on THIS visit (the same person coming back another day is greeted again)
  const visitStart = (ctx.db.prepare("SELECT MAX(ts) AS t FROM events WHERE visitor_id = ? AND type = 'profile'").get(customerId) as { t: number | null }).t ?? 0;
  if (ctx.db.prepare("SELECT 1 FROM conversations WHERE customer_id = ? AND with_id = 'greeter-1' AND started_at >= ?").get(customerId, visitStart)) return null;
  if (offDuty(ctx).includes("greeter-1")) return null;
  const greeter = NPCS.find((n) => n.id === "greeter-1");
  if (!greeter || !npcPose(greeter, ctx.now).present) return null;
  // only someone standing just inside the entrance
  const here = ctx.position(customerId);
  if (!here || here.x < ENTRANCE_ZONE.minX || here.x > ENTRANCE_ZONE.maxX || here.z < ENTRANCE_ZONE.minZ || here.z > ENTRANCE_ZONE.maxZ) return null;
  const script = scriptFor("greeter");
  if (!script || !customerFree(ctx, customerId)) return null;
  if (staffBusy(ctx, "greeter-1", "npc")) return null; // someone else has her
  return { script, here };
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
    } else if (e.type === "request_help") {
      log(ctx, row.customer_id, "help_requested", { needs: e.needs });
      const a = pointToHelper(ctx, row.customer_id, e.needs);
      out.push(...a.out);
      if (a.helperName || a.queued) helper = `${a.helperName ?? ""}|${a.waitLabel ?? ""}`;
    }
  }
  log(ctx, row.customer_id, "turn", { conversationId: row.id, from: from.node, choice: choiceId, to: r.state.node });

  const next: ConvData = { ...data, conv: r.state, awaiting: "customer", pending: undefined };
  saveConv(ctx, row, next, r.turn.ended);
  const [helperName, waitLabel] = (helper ?? "").split("|");
  // nobody sends for them: they are told where to go, and who is free if anyone is
  const say = helper !== null
    ? helperName
      ? waitLabel
        ? `Of course. Head over to ${waitLabel}: ${helperName} will look after you.`
        : `Of course. ${helperName} will look after you. Have a look around and say hello.`
      : waitLabel
        ? `Of course. Head over to ${waitLabel} and ask whoever is free.`
        : "Of course. Have a look around and ask whoever is free."
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
  const up = standUp(ctx, row);
  row = getConv(ctx.db, row.id) ?? row;
  const prior = anyDataOf(row);
  // leaving at the payment, before paying: the order is called off and the unit goes back
  if (isTalkData(prior) && prior.checkout) {
    const o = orderOfCustomer(ctx.db, row.customer_id);
    if (o) up.push(...cancelOrder(ctx, o, "changed_mind"));
    else releaseReservationsOf(ctx, row.customer_id, "left before paying");
  }
  const data: TalkConvData = { ...(isTalkData(prior) ? prior : {}), engine: "talk", scene, checkout: undefined };
  if (data.standIn) up.push({ to: "all", message: { type: "released", npcId: data.standIn.npcId } });
  saveTalkConv(ctx, row, data, true);
  log(ctx, row.customer_id, "conversation_ended", { conversationId: row.id, why: scene.ended ? `talk:${scene.ended.how}` : "talk:unknown" });
  const cur = stateOf(ctx.db, row.customer_id);
  if (cur && cur.state === "in_conversation") setState(ctx, row.customer_id, { state: "browsing", with_id: null });
  const out: Outgoing[] = [...up];
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  if (row.with_kind === "visitor") {
    // a real specialist is free again: told
    out.push({ to: row.with_id, message: { type: "staff_menu_end", conversationId: row.id, note: scene.ended?.how === "bought" ? (orderOfCustomer(ctx.db, row.customer_id)?.stage === "fetching" ? `Sale agreed: ${nameOf(ctx, row.customer_id)}'s phone is being brought out. Take the bag from the stock person, then find them to take payment.` : "Sale complete.") : "That conversation is over." } });
  }
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
const PENDING_CLOSE_MS = 5 * 60_000; // how long an NPC stays with someone who has not dismissed the last turn
function pendingCloseWhere(ctx: Ctx, column: "customer_id" | "with_id", id: string): ConvRow | undefined {
  const row = ctx.db
    .prepare(`SELECT * FROM conversations WHERE ${column} = ? AND with_kind = 'npc' AND ended_at IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 1`)
    .get(id) as ConvRow | undefined;
  if (!row) return undefined;
  // only someone still here, and only for a while: a conversation nobody dismissed
  // (an old row from before dismissing was recorded, or a visitor whose connection
  // dropped) must never keep an NPC standing busy for good
  if (!ctx.present.includes(row.customer_id) || ctx.now - (row.ended_at ?? 0) > PENDING_CLOSE_MS) return undefined;
  const closed = ctx.db
    .prepare("SELECT 1 FROM events WHERE visitor_id = ? AND type = 'conversation_closed' AND data LIKE ? LIMIT 1")
    .get(row.customer_id, `%"conversationId":"${row.id}"%`);
  return closed ? undefined : row;
}
// the customer's last NPC conversation, ended but not yet dismissed
const pendingCloseRow = (ctx: Ctx, customerId: string): ConvRow | undefined => pendingCloseWhere(ctx, "customer_id", customerId);

export function closeTalk(ctx: Ctx, customerId: string): Outgoing[] {
  const row = pendingCloseRow(ctx, customerId);
  if (!row) return [];
  log(ctx, customerId, "conversation_closed", { conversationId: row.id });
  // the NPC is free again and whoever was waiting for it can come now
  return [{ to: "all", message: { type: "released", npcId: row.with_id } }, ...settleVisits(ctx)];
}

function applyTalk(ctx: Ctx, row: ConvRow, from: Scene, choiceId: string): Outgoing[] {
  const humanStaff = row.with_kind === "visitor";
  const result = stepTalk(from, row.id, choiceId, humanStaff);
  if ("error" in result) return [notice(row.customer_id, "That is not one of the options.")];
  const { scene, turn } = result;
  logTalkTurn(ctx, row, from, choiceId, scene);
  const prior = anyDataOf(row);
  const data: TalkConvData = { ...(isTalkData(prior) ? prior : {}), engine: "talk", scene };
  saveTalkConv(ctx, row, data, turn.ended);
  // they have decided: no trip to the till. The specialist checks stock on
  // their phone, a stock person brings the device out, and they pay right here.
  if (scene.ended?.how === "bought") return startCheckout(ctx, row, data, scene.ended.sku, turn.say);
  // a real specialist: the customer waits and the specialist is shown what they chose
  if (humanStaff && !turn.ended) return [waitingTurn(ctx, row), staffMenu(ctx, row, data)];
  const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), turn.say, turn.choices, turn.ended, "customer") } }];
  if (turn.ended) return [...out, ...finishTalk(ctx, row, scene)];
  const sm = stateMessage(ctx, row.customer_id);
  if (sm) out.push(sm);
  out.push(staffViewMessage(ctx));
  // a demo: the staff member walks you to a real device of that model
  if (scene.demoed.length > from.demoed.length) out.push(...startDemoEscort(ctx, row, scene.demoed[scene.demoed.length - 1]!));
  return out;
}

// Makes a sale in a conversation: the stock check, the hold on the unit and the
// stock person sent out. What the engine does when the customer says yes, for
// specs that need a particular phone rather than whatever the pool gives.
export function beginSale(ctx: Ctx, conversationId: string, sku: { model: string; storage: string; colour: string; price: number }): Outgoing[] {
  const row = getConv(ctx.db, conversationId);
  if (!row) return [];
  const d = anyDataOf(row);
  if (!isTalkData(d)) return [];
  return startCheckout(ctx, row, d, sku, "Great choice. I'll take you across to the till so someone there can sort the payment.");
}

export function chooseTurn(ctx: Ctx, customerId: string, conversationId: string, choiceId: string): Outgoing[] {
  releaseExpired(ctx);
  const row = getConv(ctx.db, conversationId);
  if (!row || row.customer_id !== customerId || row.ended_at !== null) return [notice(customerId, "That conversation is over.")];
  const walking = liveEscortOf(ctx.db, customerId);
  if (walking) return [notice(customerId, `Follow ${nameOf(ctx, walking.staff_id)} first.`)];
  const anyData = anyDataOf(row);
  if (isTalkData(anyData)) {
    if (anyData.checkout) return handleCheckoutChoice(ctx, row, anyData, choiceId);
    if (talkEnded(anyData.scene)) return [notice(customerId, "That conversation is over.")];
    if (choiceId.startsWith("seat:")) return handleSeatChoice(ctx, row, anyData, choiceId);
    if (anyData.stage === "seat_offer") return [notice(customerId, "Sit down or stay standing first.")];
    if (!talkChoices(anyData.scene).some((c) => c.id === choiceId)) return [notice(customerId, "That is not one of the options.")];
    return applyTalk(ctx, row, anyData.scene, choiceId);
  }
  const data = anyData;
  if (data.awaiting !== "customer") return [notice(customerId, `Waiting for ${nameOf(ctx, row.with_id)}.`)];
  const world = stockWorld(ctx.db);
  const result = step(data.conv, choiceId, world);
  if ("error" in result) return [notice(customerId, "That is not one of the options.")];
  return apply(ctx, row, data, data.conv, choiceId, result, world);
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
    if (row.customer_id !== visitorId && row.with_id !== visitorId) return [];
    // leaving before paying is leaving, not buying: the engine already marked the sale
    const scene: Scene = { ...anyData.scene, ended: anyData.checkout ? { how: "left", why } : (anyData.scene.ended ?? { how: "left", why }) };
    // the customer is told it is over whichever of them left
    const out: Outgoing[] = [{ to: row.customer_id, message: { type: "turn", ...turnView(row, nameOf(ctx, row.with_id), say, [], true, "customer") } }];
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

