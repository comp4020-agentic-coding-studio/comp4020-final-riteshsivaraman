import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultStorage, productById } from "../src/shared/catalogue.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import {
  beginSale,
  chooseTurn,
  closeTalk,
  enter,
  leaveStore,
  orderViews,
  ORDER_MS,
  settleVisits,
  startTalk,
  type Ctx,
  type Employee,
  type Outgoing,
} from "../src/server/service.ts";
import { seedStock } from "../src/server/stock.ts";

// Issue #2 ("Payment happens on the staff handheld: scan, total, tap"), server half.
//
// Today `openPay` moves an order straight to `paying` and opens a single
// three-choice menu (pay:card / pay:phone / pay:cancel): one request, one
// reply, done. The issue asks for a three-beat machine instead -- scanned,
// total shown, tapped -- each beat its own stored state advanced only by an
// explicit request (CLAUDE.md: no timers, a beat is a stored column caught up
// on the next request that touches it), with its own `events` row naming
// staff and customer, and the order reaching `done` only after the explicit
// tap for THAT exact order.
//
// This file is deliberately red: no beat state machine exists yet, so every
// "beat" test below either finds no such state to advance, or finds the old
// single-menu shape where the new one is expected. The client-rendering
// acceptance criteria (every staff avatar shows a handheld, the 3D
// choreography of the beats) are out of scope here: this is a server state
// machine check, not a rendering one.

const NOW = 1000; // 1 s into the day: staff are at their posts
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
const eventTypes = (): string[] => (db.prepare("SELECT type FROM events ORDER BY id").all() as Array<{ type: string }>).map((r) => r.type);
const eventRows = (type: string): Array<{ data: string | null }> => db.prepare("SELECT data FROM events WHERE type = ? ORDER BY id").all(type) as Array<{ data: string | null }>;

function addVisitor(id: string, name: string, at: { x: number; z: number }, kind: string = "customer", specialty?: string): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind, specialty });
  if (kind !== "customer") employees.push({ id, name, kind: kind as Employee["kind"], specialty: specialty as Employee["specialty"] });
}

const orderStage = (): string | undefined => (db.prepare("SELECT stage FROM orders ORDER BY created_at DESC").get() as { stage: string } | undefined)?.stage;

// Reused verbatim from spec/service.test.ts:85-96: drives a conversation
// through fetching -> with_spec -> paying with a fake clock, and returns the
// payment conversation id and the server time it opened at.
function payFor(customer: string): { id: string; t: number } {
  closeTalk(ctx(NOW + 1000), customer);
  let t = NOW + 2000;
  while (t < NOW + ORDER_MS && orderStage() === "fetching") {
    settleVisits(ctx(t));
    t += 1000;
  }
  for (let i = 0; i < 150; i++, t += 1000) {
    const turn = last(settleVisits(ctx(t)), customer, "turn");
    if (turn) return { id: turn.conversationId, t };
  }
  throw new Error(`no payment conversation: stage=${orderStage()} intents=${JSON.stringify(db.prepare("SELECT reason,status,from_id FROM intents").all())}`);
}

// Full setup for one sale: a customer talks to a phones specialist, agrees
// to buy, and the order is carried through to the `paying` stage. Two
// customers in the same test use the two distinct phones specialists
// (spec-phones, spec-phones-2) so one isn't still busy with the other.
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

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
});

describe("the handheld payment beats (issue #2): scanned -> total_shown -> tapped -> paid", () => {
  it("does not jump straight from paying to done on one choice: a scan beat happens first", () => {
    const { conversationId, t } = openAPaymentOrder();
    // Today: a single chooseTurn("pay:card"/"pay:phone") both pays AND ends
    // the order in one call, with no earlier beat recorded anywhere. The spec
    // requires that items be scanned before the total is shown or a tap is
    // accepted for this order: there must be some stored, queryable beat
    // state the order passes through before `paid`/`done`, and it must not
    // already be past "scanned" the instant `paying` begins.
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(conversationId) as { data: string };
    const checkout = JSON.parse(row.data).checkout;
    expect(checkout?.beat).toBeDefined(); // RED: no `beat` field exists on checkout today
    expect(checkout.beat).toBe("scanned");
    expect(orderStage()).toBe("paying");
    // paying must not already be payable before the scan beat is recorded
    expect(eventTypes()).not.toContain("purchase_paid");
  });

  it("advances scanned -> total_shown -> tapped -> paid only one step per explicit request, never automatically", async () => {
    const { conversationId, t } = openAPaymentOrder();
    // Each beat should be a server function invoked by a request, not a side
    // effect of time passing. Simulate "the next request" the way payFor does
    // (settleVisits), and confirm NO beat advances purely because server time
    // moved forward with nothing touching this order.
    const before = (): string | undefined => {
      const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(conversationId) as { data: string } | undefined;
      return row ? JSON.parse(row.data).checkout?.beat : undefined;
    };
    const beatBefore = before();
    settleVisits(ctx(t + 60_000)); // a full minute of "next requests" with nobody touching this order
    expect(before()).toBe(beatBefore); // RED today: `checkout.beat` is undefined, so this is vacuous until the field exists
    // Explicit beat-advancing calls (names are the builder's to choose, but
    // *some* exported function must exist to drive scanned -> total_shown ->
    // tapped, distinct from the final chooseTurn("pay:card"|"pay:phone")).
    // None exist today, so referencing it is the red failure itself.
    const svc = (await import("../src/server/service.ts")) as Record<string, unknown>;
    expect(typeof svc.advancePaymentBeat).toBe("function"); // RED: not exported, doesn't exist
  });

  it("only reaches done after an explicit customer tap for THAT exact order, not another customer's order", () => {
    const orderA = openAPaymentOrder("c1", "spec-phones");
    const orderB = openAPaymentOrder("c2", "spec-phones-2");
    // Tapping/paying order B must never finish order A.
    chooseTurn(ctx(orderB.t + 1000), "c2", orderB.conversationId, "pay:card");
    const aRow = db.prepare("SELECT stage FROM orders WHERE customer_id = 'c1'").get() as { stage: string } | undefined;
    expect(aRow?.stage).not.toBe("done"); // A must still be `paying`, untouched by B's tap
    expect(aRow?.stage).toBe("paying");
    // And without a tap at all on order A, it must never become `done` merely
    // because time passed (no timer may complete a sale).
    settleVisits(ctx(orderA.t + 120_000));
    const aRowLater = db.prepare("SELECT stage FROM orders WHERE customer_id = 'c1'").get() as { stage: string } | undefined;
    expect(aRowLater?.stage).toBe("paying");
  });

  it("charges exactly the server's stored sale price, and the choice message can carry no price of its own", () => {
    const { conversationId, t } = openAPaymentOrder();
    const order = db.prepare("SELECT sale FROM orders ORDER BY created_at DESC LIMIT 1").get() as { sale: string };
    const serverSale = JSON.parse(order.sale) as { price: number };
    expect(serverSale.price).toBe(1999);
    // handleCheckoutChoice (service.ts:1409-1424) takes only a choiceId string
    // today, never a client-supplied price -- that part already holds. What
    // the beat machine must add: the "total_shown" beat itself must read and
    // log the stored sale, not something recomputed or passed in by the
    // tap request. There is no API today to inspect "the total that was
    // shown" independent of the final choice, because there is no
    // total_shown beat -- assert its event exists and carries the server price.
    chooseTurn(ctx(t + 1000), "c1", conversationId, "pay:card");
    const totalShown = eventRows("total_shown"); // RED: this event type is never logged today
    expect(totalShown.length).toBeGreaterThan(0);
    const data = JSON.parse(totalShown[0]!.data ?? "{}");
    expect(data.sale?.price).toBe(1999);
  });

  it("leaving mid-payment cancels the order and releases the reservation immediately, not after the hold expires", () => {
    const { conversationId, t } = openAPaymentOrder();
    const before = db.prepare("SELECT status FROM reservations WHERE visitor_id = 'c1'").get();
    expect(before).toEqual({ status: "held" });
    expect(orderStage()).toBe("paying");
    leaveStore(ctx(t + 1000), "c1");
    // Existing behaviour (finishTalk -> cancelOrder("changed_mind"),
    // service.ts:1832-1857): a customer leaving during checkout releases the
    // held unit at once. The beat machine must not change this: it is not
    // asked to invent a new hold, only to not break the existing one.
    const after = db.prepare("SELECT status FROM reservations WHERE visitor_id = 'c1'").get();
    expect(after).toEqual({ status: "released" });
    expect(orderViews(ctx())).toEqual([]);
    expect(eventTypes()).toContain("order_cancelled");
    expect(eventTypes()).toContain("reservation_released");
    expect(eventTypes()).not.toContain("purchase_paid");
    // and no tapped/paid beat should have fired for an order nobody tapped
    expect(eventTypes()).not.toContain("tapped");
  });

  it("logs one events row per beat (scanned, total_shown, tapped, paid), each naming the staff and customer", () => {
    const { conversationId, t } = openAPaymentOrder();
    chooseTurn(ctx(t + 1000), "c1", conversationId, "pay:card");
    for (const beatType of ["scanned", "total_shown", "tapped", "paid"]) {
      const rows = eventRows(beatType); // RED: none of these four event types exist today (only "payment_started" and "purchase_paid" do)
      expect(rows.length, `expected a "${beatType}" event`).toBeGreaterThan(0);
      const data = JSON.parse(rows[0]!.data ?? "{}");
      expect(data.by ?? data.staff, `"${beatType}" event should name the staff member`).toBe("spec-phones");
      const row = db.prepare("SELECT visitor_id FROM events WHERE type = ?").get(beatType) as { visitor_id: string };
      expect(row.visitor_id, `"${beatType}" event should name the customer as visitor_id`).toBe("c1");
    }
  });
});
