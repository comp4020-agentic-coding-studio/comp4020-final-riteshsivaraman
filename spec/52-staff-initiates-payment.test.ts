import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultStorage, productById } from "../src/shared/catalogue.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import {
  beginSale,
  chooseTurn,
  closeTalk,
  enter,
  ORDER_MS,
  requestTalk,
  settleVisits,
  stateOf,
  takeOrder,
  VISIT_BEAT_MS,
  type Ctx,
  type Employee,
  type Outgoing,
} from "../src/server/service.ts";
import { seedStock } from "../src/server/stock.ts";

// Issue #52 (Ritesh, live-testing): "when a staff is supposed to fetch a
// customer, the staff must ALWAYS initiate the convo, not the customer."
//
// Once a REAL specialist has taken the bag from the runner (order stage
// `with_spec`, a live pay visit), the payment conversation must open only
// because the specialist walked up and pressed E at the customer (SCOPE D46:
// "the specialist walks the phone to the customer"). Before the fix:
//  - proximity alone opened it: the customer walking up to a standing
//    specialist opened the payment a beat later (settleVisits -> staffArrived
//    is a symmetric distance check for a real specialist);
//  - customer E on the specialist opened a fresh sales chat with them;
//  - specialist E on the customer opened a fresh sales chat too, never the payment.

const NOW = 1000;
const SPEC_AT = { x: -4, z: -3 };
let db: Database.Database;
const positions = new Map<string, { x: number; z: number }>();
const employees: Employee[] = [];
const present: string[] = [];

const ctx = (now = NOW): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
const messagesTo = (out: Outgoing[], to: string, type: ServerMessage["type"]): ServerMessage[] => out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message);
const last = <T extends ServerMessage["type"]>(out: Outgoing[], to: string, type: T): Extract<ServerMessage, { type: T }> | undefined =>
  messagesTo(out, to, type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
const orderStage = (): string | undefined => (db.prepare("SELECT stage FROM orders ORDER BY created_at DESC").get() as { stage: string } | undefined)?.stage;
const openConvs = (): Array<{ customer_id: string; with_id: string; script: string; data: string }> =>
  db.prepare("SELECT customer_id, with_id, script, data FROM conversations WHERE ended_at IS NULL").all() as Array<{ customer_id: string; with_id: string; script: string; data: string }>;
const eventsOf = (type: string): Array<Record<string, unknown>> =>
  (db.prepare("SELECT data FROM events WHERE type = ? ORDER BY id").all(type) as Array<{ data: string | null }>).map((r) => JSON.parse(r.data ?? "{}"));

function addVisitor(id: string, name: string, at: { x: number; z: number }, kind: string = "customer", specialty?: string): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind, specialty });
  if (kind !== "customer") employees.push({ id, name, kind: kind as Employee["kind"], specialty: specialty as Employee["specialty"] });
}

// A real specialist "e1" sells to "c1", the chat is dismissed, the runner brings
// the bag and e1 takes it (E at the runner, takeOrder). Returns the time the
// order reached `with_spec`, with the customer moved well out of talk range.
function specialistHasTheBag(): number {
  addVisitor("c1", "Pebble", { x: SPEC_AT.x + 1, z: SPEC_AT.z });
  addVisitor("e1", "Sam", SPEC_AT, "specialist", "phones");
  const hello = last(requestTalk(ctx(), "c1", "e1"), "c1", "turn")!;
  const storage = defaultStorage(productById("iphone-18-pro")!);
  beginSale(ctx(), hello.conversationId, { model: "18-pro", storage, colour: "Glacier", price: 1999 });
  closeTalk(ctx(NOW + 1000), "c1");
  // the customer wanders off to browse while the runner fetches
  positions.set("c1", { x: SPEC_AT.x + 10, z: SPEC_AT.z });
  let t = NOW + 2000;
  for (; t < NOW + ORDER_MS && orderStage() === "fetching"; t += 1000) {
    settleVisits(ctx(t));
    takeOrder(ctx(t), "e1");
  }
  expect(orderStage(), "the specialist should be holding the bag").toBe("with_spec");
  return t;
}

const paymentOpen = (): boolean => openConvs().some((c) => c.customer_id === "c1" && JSON.parse(c.data).checkout);

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
});

describe("issue #52: a real specialist bringing the bag initiates the payment, never the customer", () => {
  it("does not open the payment just because the customer walked up to the specialist", () => {
    let t = specialistHasTheBag();
    // the customer comes to the specialist, who has not moved or pressed anything
    positions.set("c1", { x: SPEC_AT.x + 1, z: SPEC_AT.z });
    for (let i = 0; i < 10; i++, t += VISIT_BEAT_MS) settleVisits(ctx(t));
    expect(paymentOpen(), "proximity alone opened the payment: the customer initiated it").toBe(false);
    expect(orderStage()).toBe("with_spec");
    expect(stateOf(db, "c1")?.state).not.toBe("in_conversation");
  });

  it("refuses the customer's E at the specialist holding their bag, and tells them to wait", () => {
    let t = specialistHasTheBag();
    positions.set("c1", { x: SPEC_AT.x + 1, z: SPEC_AT.z });
    const out = requestTalk(ctx(t), "c1", "e1");
    expect(openConvs(), "customer E opened a conversation with the specialist bringing their bag").toEqual([]);
    expect(last(out, "c1", "notice")?.text).toMatch(/Sam .*will come to you/);
    expect(stateOf(db, "c1")?.state).not.toBe("in_conversation");
    // and nothing it did lets the payment open on its own afterwards
    for (let i = 0; i < 5; i++, t += VISIT_BEAT_MS) settleVisits(ctx(t));
    expect(paymentOpen()).toBe(false);
  });

  it("opens the payment when the specialist walks up to the customer and presses E", () => {
    const t = specialistHasTheBag();
    const cAt = positions.get("c1")!;
    // not from across the floor
    expect(last(requestTalk(ctx(t), "e1", "c1"), "e1", "notice")?.text).toMatch(/Walk a little closer/);
    expect(paymentOpen()).toBe(false);
    // the specialist walks over and presses E
    positions.set("e1", { x: cAt.x - 1, z: cAt.z });
    const out = requestTalk(ctx(t + 1000), "e1", "c1");
    const turn = last(out, "c1", "turn");
    expect(turn, "the specialist's E did not open the payment").toBeDefined();
    const conv = openConvs().find((c) => c.customer_id === "c1")!;
    expect(conv.with_id).toBe("e1");
    expect(JSON.parse(conv.data).checkout, "the specialist's E opened a sales chat instead of the payment").toMatchObject({ stage: "pay", beat: "scanned" });
    expect(orderStage()).toBe("paying");
    expect(last(out, "e1", "staff_menu")).toBeDefined();
    // the event log says the specialist started it
    expect(eventsOf("staff_approached").at(-1)).toMatchObject({ staffId: "e1", for: "payment" });
    expect(eventsOf("payment_started")).toHaveLength(1);
    expect(eventsOf("pay_visit_ended").at(-1)).toMatchObject({ by: "e1", why: "accepted" });
  });
});
