import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultStorage, productById } from "../src/shared/catalogue.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import {
  advancePaymentBeat,
  beginSale,
  chooseTurn,
  closeTalk,
  enter,
  orderViews,
  ORDER_MS,
  requestTalk,
  settleVisits,
  startTalk,
  takeOrder,
  type Ctx,
  type Employee,
  type Outgoing,
} from "../src/server/service.ts";
import { seedStock } from "../src/server/stock.ts";

// Issue #49 ("Expose payment beat/price to clients"): #2 built the server-side
// beat state machine (scanned -> total_shown -> tapped, each a stored
// Checkout.beat, advanced by advancePaymentBeat) but never put it on the wire.
// OrderView had only stage/what -- no beat, no price, no timestamp -- so #42
// (handheld visuals) had nothing server-authoritative to render off. This file
// is red until OrderView carries `pay` during `paying`, and a synthetic
// `stage: "paid"` window after the order completes.

const NOW = 1000;
let db: Database.Database;
const positions = new Map<string, { x: number; z: number }>();
const employees: Employee[] = [];
const present: string[] = [];

const ctx = (now = NOW): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
const npc = (id: string): { x: number; z: number } => {
  const def = NPCS.find((n) => n.id === id)!;
  return npcPose(def, NOW);
};
const messagesTo = (out: Outgoing[], to: string, type: ServerMessage["type"]): ServerMessage[] => out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message);
const last = <T extends ServerMessage["type"]>(out: Outgoing[], to: string, type: T): Extract<ServerMessage, { type: T }> | undefined =>
  messagesTo(out, to, type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
const talkAt = (out: Outgoing[], customer = "c1"): Extract<ServerMessage, { type: "turn" }> => {
  const t = last(out, customer, "turn")!;
  if (!t.choices.some((c) => c.id === "seat:stand")) return t;
  return last(chooseTurn(ctx(), customer, t.conversationId, "seat:stand"), customer, "turn")!;
};

function addVisitor(id: string, name: string, at: { x: number; z: number }, kind: string = "customer", specialty?: string): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind, specialty });
  if (kind !== "customer") employees.push({ id, name, kind: kind as Employee["kind"], specialty: specialty as Employee["specialty"] });
}

const orderStage = (): string | undefined => (db.prepare("SELECT stage FROM orders ORDER BY created_at DESC").get() as { stage: string } | undefined)?.stage;

// Reused verbatim from spec/2-handheld-payment-beats.test.ts: drives a
// conversation through fetching -> with_spec -> paying with a fake clock, and
// returns the payment conversation id and the server time it opened at. A
// real (visitor) specialist never auto-catches-up to "with_spec" the way an
// NPC's does (catchUpRunner only advances the runner leg; a real specialist
// presses E -- takeOrder -- to actually take the bag), so `staffId` lets a
// human-staffed order press it on every tick, same as a specialist standing
// there the whole time would. Holding the bag, a real specialist opens the
// payment by pressing E at the customer (issue #52), never by proximity alone.
function payFor(customer: string, staffId?: string): { id: string; t: number } {
  closeTalk(ctx(NOW + 1000), customer);
  let t = NOW + 2000;
  while (t < NOW + ORDER_MS && orderStage() === "fetching") {
    settleVisits(ctx(t));
    if (staffId) takeOrder(ctx(t), staffId);
    t += 1000;
  }
  for (let i = 0; i < 150; i++, t += 1000) {
    const turn = last([...settleVisits(ctx(t)), ...(staffId ? requestTalk(ctx(t), staffId, customer) : [])], customer, "turn");
    if (turn) return { id: turn.conversationId, t };
  }
  throw new Error(`no payment conversation: stage=${orderStage()}`);
}

function openAPaymentOrder(customer = "c1", specialist = "spec-phones"): { conversationId: string; t: number } {
  const storageOf18Pro = defaultStorage(productById("iphone-18-pro")!);
  const glacier = { model: "18-pro", storage: storageOf18Pro, colour: "Glacier", price: 1999 };
  const p = npc(specialist);
  addVisitor(customer, customer === "c1" ? "Pebble" : customer, { x: p.x + 1, z: p.z });
  const hello = talkAt(startTalk(ctx(), customer, specialist), customer);
  beginSale(ctx(), hello.conversationId, glacier);
  const pay = payFor(customer);
  return { conversationId: pay.id, t: pay.t };
}

// Same setup, but staffed by a real employee ("e1") instead of the NPC
// specialist, because advancePaymentBeat is the handheld's own "scan"/"show
// total" action and only a real staff member (with_kind "visitor") drives it
// explicitly (service.ts advancePaymentBeat: `row.with_kind !== "visitor"` is
// rejected) -- an NPC-staffed sale instead catches up all three beats in the
// customer's own tap, covered separately below.
function openAPaymentOrderWithHumanStaff(customer = "c1", staffId = "e1", at = { x: -4, z: -3 }): { conversationId: string; t: number } {
  const storageOf18Pro = defaultStorage(productById("iphone-18-pro")!);
  const glacier = { model: "18-pro", storage: storageOf18Pro, colour: "Glacier", price: 1999 };
  addVisitor(customer, customer === "c1" ? "Pebble" : customer, { x: at.x + 1, z: at.z });
  addVisitor(staffId, staffId, at, "specialist", "phones");
  const hello = talkAt(startTalk(ctx(), customer, staffId), customer);
  beginSale(ctx(), hello.conversationId, glacier);
  const pay = payFor(customer, staffId);
  return { conversationId: pay.id, t: pay.t };
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
});

describe("issue #49: OrderView exposes the payment beat and price", () => {
  it("carries pay.beat/price/beatAt for an order in the paying stage, matching the server's stored sale exactly", () => {
    const { conversationId, t } = openAPaymentOrder();
    const views = orderViews(ctx(t));
    const view = views.find((v) => v.stage === "paying");
    expect(view).toBeDefined(); // RED today: stage is still "paying" with no `pay` field
    expect(view!.pay).toBeDefined();
    expect(view!.pay!.conversationId).toBe(conversationId);
    expect(view!.pay!.beat).toBe("scanned"); // the first beat, set in openPay
    expect(view!.pay!.beatAt).toBeTypeOf("number");
    expect(view!.pay!.price).toBe(1999); // the stored sale price, never recomputed
    expect(view!.pay!.name).toBe("iPhone 18 Pro");
    expect(view!.pay!.colour).toBe("Glacier");
  });

  it("advances pay.beat and bumps pay.beatAt when a staff member drives the handheld explicitly", () => {
    const { conversationId, t } = openAPaymentOrderWithHumanStaff();
    const before = orderViews(ctx(t)).find((v) => v.stage === "paying")!;
    advancePaymentBeat(ctx(t + 500), "e1", conversationId);
    const after = orderViews(ctx(t + 500)).find((v) => v.stage === "paying")!;
    expect(after.pay!.beat).toBe("total_shown");
    expect(after.pay!.beatAt).toBeGreaterThanOrEqual(before.pay!.beatAt);
    expect(after.pay!.beatAt).toBe(t + 500);
  });

  it("never advances pay.beat merely because server time passed with nobody touching the order", () => {
    const { t } = openAPaymentOrder();
    const before = orderViews(ctx(t)).find((v) => v.stage === "paying")!;
    settleVisits(ctx(t + 60_000));
    const after = orderViews(ctx(t + 60_000)).find((v) => v.stage === "paying")!;
    expect(after.pay!.beat).toBe(before.pay!.beat);
    expect(after.pay!.beatAt).toBe(before.pay!.beatAt);
  });

  it("surfaces a just-completed order as a synthetic stage 'paid' with beat 'tapped', then stops after ~4s, purely as a function of ended_at vs ctx.now", () => {
    const { conversationId, t } = openAPaymentOrder();
    chooseTurn(ctx(t + 1000), "c1", conversationId, "pay:card");
    const paidAt = t + 1000;

    const justAfter = orderViews(ctx(paidAt + 500));
    const paidView = justAfter.find((v) => v.customerId === "c1");
    expect(paidView).toBeDefined(); // RED today: "done" orders aren't in liveOrders at all
    expect(paidView!.stage).toBe("paid");
    expect(paidView!.pay!.beat).toBe("tapped");
    expect(paidView!.paidAt).toBe(paidAt);
    expect(paidView!.pay!.price).toBe(1999);

    // Still visible just under 4s later (no timer: a pure comparison against ctx.now).
    const stillThere = orderViews(ctx(paidAt + 3900)).find((v) => v.customerId === "c1");
    expect(stillThere).toBeDefined();
    expect(stillThere!.stage).toBe("paid");

    // Gone once ctx.now moves well past the 4s window -- the same stored
    // ended_at, just read at a later moment, with nothing re-run on a timer.
    const longAfter = orderViews(ctx(paidAt + 10_000)).find((v) => v.customerId === "c1");
    expect(longAfter).toBeUndefined();
  });

  it("never fabricates a price: pay.price always matches orders.sale, even across the scanned->total_shown->tapped sequence", () => {
    const { conversationId, t } = openAPaymentOrderWithHumanStaff();
    const beat1 = orderViews(ctx(t)).find((v) => v.stage === "paying")!;
    expect(beat1.pay!.price).toBe(1999);
    advancePaymentBeat(ctx(t + 100), "e1", conversationId);
    const beat2 = orderViews(ctx(t + 100)).find((v) => v.stage === "paying")!;
    expect(beat2.pay!.price).toBe(1999);
    advancePaymentBeat(ctx(t + 200), "e1", conversationId);
    const beat3 = orderViews(ctx(t + 200)).find((v) => v.stage === "paying")!;
    expect(beat3.pay!.beat).toBe("tapped");
    expect(beat3.pay!.price).toBe(1999);
  });
});
