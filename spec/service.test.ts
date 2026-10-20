import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultStorage, productById, START_STOCK } from "../src/shared/catalogue.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import { TABLE_SEATS } from "../src/shared/storeday.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import {
  beginSale,
  chatPairs,
  handOverCustomer,
  handOverPost,
  retireStandIn,
  seatedList,
  chooseTurn,
  customersView,
  enter,
  rejoin,
  HOLD_MS,
  ORDER_MS,
  takeOrder,
  orderViews,
  leaveConversation,
  closeTalk,
  endInspect,
  acceptIntentById,
  showIntentById,
  requestTalk,
  settleIntents,
  assignHelper,
  INTENT_BEAT_MS,
  INTENT_GIVE_UP_MS,
  leaveStore,
  tryGreeterApproach,
  tryNpcAutoClaim,
  releaseExpired,
  startTalk,
  staffMove,
  stateOf,
  type Ctx,
  type Employee,
  type Outgoing,
} from "../src/server/service.ts";
import { seedStock, stockOf } from "../src/server/stock.ts";

// Promise: the store's rules about visitors hold, with nothing but a database
// (no sockets, no clock): who may talk to whom, that only one visitor is with a
// character at a time, that a reserved unit is held and given back, that the
// employee side works, and that every change of state wrote an event first.

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
// The specialist opens by asking whether to sit down; most tests carry on standing.
const talkAt = (out: Outgoing[], customer = "c1"): Extract<ServerMessage, { type: "turn" }> => {
  const t = last(out, customer, "turn")!;
  if (!t.choices.some((c) => c.id === "seat:stand")) return t;
  return last(chooseTurn(ctx(), customer, t.conversationId, "seat:stand"), customer, "turn")!;
};
const eventCount = (): number => (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
const eventTypes = (): string[] => (db.prepare("SELECT type FROM events ORDER BY id").all() as Array<{ type: string }>).map((r) => r.type);

function addVisitor(id: string, name: string, at: { x: number; z: number }, kind: string = "customer", specialty?: string): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind, specialty });
  if (kind !== "customer") employees.push({ id, name, kind: kind as Employee["kind"], specialty: specialty as Employee["specialty"] });
}

// An NPC specialist's sale carried through to the payment conversation: the chat is dismissed,
// the runner arrives (following the specialist if they have moved) and hands over the bag, the
// specialist comes to the customer, who accepts. Time moves on a second at a time, as polling does.
const orderStage = (): string | undefined => (db.prepare("SELECT stage FROM orders ORDER BY created_at DESC").get() as { stage: string } | undefined)?.stage;
function payFor(customer: string, spec = "spec-phones"): { id: string; t: number } {
  closeTalk(ctx(NOW + 1000), customer);
  let t = NOW + 2000;
  while (t < NOW + ORDER_MS && orderStage() === "fetching") {
    settleIntents(ctx(t));
    t += 1000;
  }
  for (let i = 0; i < 150; i++, t += 1000) {
    const out = requestTalk(ctx(t), customer, spec);
    const turn = last(out, customer, "turn");
    if (turn) return { id: turn.conversationId, t };
    settleIntents(ctx(t));
  }
  throw new Error(`no payment conversation: stage=${orderStage()} intents=${JSON.stringify(db.prepare("SELECT reason,status,from_id FROM intents").all())}`);
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

describe("entering", () => {
  it("starts a customer's visit and leaves an employee without one", () => {
    addVisitor("c1", "Pebble", { x: 0, z: -8 });
    addVisitor("e1", "Sam", { x: 1, z: -8 }, "greeter");
    expect(stateOf(db, "c1")?.state).toBe("arriving");
    expect(stateOf(db, "e1")).toBeUndefined();
    expect(eventTypes().filter((t) => t === "profile")).toHaveLength(2);
  });
});

describe("starting a conversation", () => {
  it("opens the greeter's menu when you are next to them, and tells everyone the NPC is busy", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const out = startTalk(ctx(), "c1", "greeter-1");
    const turn = last(out, "c1", "turn")!;
    expect(turn.choices.length).toBeGreaterThan(0);
    expect(turn.awaiting).toBe("customer");
    expect(last(out, "all", "engaged")).toMatchObject({ npcId: "greeter-1", visitorId: "c1" });
    expect(stateOf(db, "c1")?.state).toBe("in_conversation");
    expect(eventTypes()).toContain("conversation_started");
  });

  it("asks you to come closer when you are too far", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 8, z: g.z });
    const out = startTalk(ctx(), "c1", "greeter-1");
    expect(last(out, "c1", "notice")?.text).toMatch(/closer/);
    expect(stateOf(db, "c1")?.state).toBe("arriving");
  });

  it("serves one visitor at a time: the next is asked to wait", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    addVisitor("c2", "Biscuit", { x: g.x - 1, z: g.z });
    startTalk(ctx(), "c1", "greeter-1");
    const out = startTalk(ctx(), "c2", "greeter-1");
    expect(last(out, "c2", "notice")?.text).toMatch(/someone else/);
    expect(stateOf(db, "c2")?.state).toBe("arriving");
  });

  it("will not start a conversation with a character that has nothing to say yet", () => {
    const t = npc("tech-1");
    addVisitor("c1", "Pebble", { x: t.x, z: t.z + 1 });
    expect(last(startTalk(ctx(), "c1", "tech-1"), "c1", "notice")?.text).toMatch(/nothing to talk about/);
  });

  it("will not let an employee start one as a customer", () => {
    const g = npc("greeter-1");
    addVisitor("e1", "Sam", { x: g.x + 1, z: g.z }, "genius");
    expect(last(startTalk(ctx(), "e1", "greeter-1"), "e1", "notice")?.text).toMatch(/Only customers/);
  });
});

describe("the greeter, end to end", () => {
  it("asks for the phones specialist, records why, and lets the NPC go", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const open = startTalk(ctx(), "c1", "greeter-1");
    const id = last(open, "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "phone");
    const done = chooseTurn(ctx(), "c1", id, "help");
    expect(last(done, "c1", "turn")?.ended).toBe(true);
    expect(last(done, "all", "released")).toBeUndefined(); // held until the final turn is closed
    expect(last(closeTalk(ctx(), "c1"), "all", "released")).toMatchObject({ npcId: "greeter-1" });
    const s = stateOf(db, "c1")!;
    expect(s.state).toBe("waiting_for_help");
    expect(s.needs).toBe("specialist:phones");
    expect(s.want).toBe("phone");
    expect(eventTypes()).toEqual(expect.arrayContaining(["conversation_started", "turn", "help_requested", "state"]));
  });

  it("rejects a choice that is not on the menu and a conversation that is not yours", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    addVisitor("c2", "Biscuit", { x: 5, z: 5 });
    const id = last(startTalk(ctx(), "c1", "greeter-1"), "c1", "turn")!.conversationId;
    expect(last(chooseTurn(ctx(), "c1", id, "free-phone"), "c1", "notice")?.text).toMatch(/not one of the options/);
    expect(last(chooseTurn(ctx(), "c2", id, "phone"), "c2", "notice")?.text).toMatch(/over/);
  });
});

describe("stock at the moment of sale", () => {
  const storageOf18Pro = defaultStorage(productById("iphone-18-pro")!);
  const storageOf17 = defaultStorage(productById("iphone-17")!);
  const glacier = { model: "18-pro", storage: storageOf18Pro, colour: "Glacier", price: 1999 };

  // an NPC specialist (as the engine drives it) and the sale the customer made
  function selling(customer: string, npcId: string, sku: { model: string; storage: string; colour: string; price: number }): { id: string; out: Outgoing[] } {
    const p = npc(npcId);
    if (!present.includes(customer)) addVisitor(customer, customer, { x: p.x + 1, z: p.z });
    const hello = talkAt(startTalk(ctx(), customer, npcId), customer);
    return { id: hello.conversationId, out: beginSale(ctx(), hello.conversationId, sku) };
  }

  it("takes a unit off the shelf when the specialist checks stock, and holds it", () => {
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    const { out } = selling("c1", "spec-phones", glacier);
    expect(last(out, "c1", "turn")).toMatchObject({ ended: true });
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before - 1);
    const r = db.prepare("SELECT status, expires_at FROM reservations WHERE visitor_id = 'c1'").get() as { status: string; expires_at: number };
    expect(r).toEqual({ status: "held", expires_at: NOW + ORDER_MS });
    expect(eventTypes()).toEqual(expect.arrayContaining(["reserved", "stock_checked"]));
  });

  it("sells the unit when they pay, and it stays gone", () => {
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    selling("c1", "spec-phones", glacier);
    const pay = payFor("c1");
    chooseTurn(ctx(pay.t + 1000), "c1", pay.id, "pay:card");
    expect(db.prepare("SELECT status FROM reservations WHERE visitor_id = 'c1'").get()).toEqual({ status: "sold" });
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before - 1);
  });

  it("gives it back if they call it off at the payment", () => {
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    selling("c1", "spec-phones", glacier);
    const pay = payFor("c1");
    chooseTurn(ctx(pay.t + 1000), "c1", pay.id, "pay:cancel");
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before);
    expect(eventTypes()).toContain("reservation_released");
  });

  it("will not sell what is out of stock, and says so", () => {
    db.prepare("UPDATE stock SET qty = 0 WHERE product = 'iphone-18-pro' AND colour = 'Silver' AND storage = ?").run(storageOf18Pro);
    const { out } = selling("c1", "spec-phones", { ...glacier, colour: "Silver" });
    expect(last(out, "c1", "turn")?.say).toMatch(/has gone/);
    expect(last(out, "c1", "turn")?.ended).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations").get()).toEqual({ n: 0 });
    expect(stockOf(db, "iphone-18-pro", "Silver", storageOf18Pro)).toBe(0);
  });

  it("gives a held unit back when the time is up, with no timer (the next call catches up)", () => {
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    selling("c1", "spec-phones", glacier);
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before - 1);
    expect(releaseExpired(ctx(NOW + ORDER_MS - 1))).toBe(0);
    expect(releaseExpired(ctx(NOW + ORDER_MS))).toBe(1);
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before);
    expect(eventTypes()).toContain("reservation_expired");
    expect(releaseExpired(ctx(NOW + ORDER_MS * 2))).toBe(0); // only once
  });

  it("gives it back at once when the visitor leaves", () => {
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    selling("c1", "spec-phones", glacier);
    leaveStore(ctx(), "c1");
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before);
    expect(stateOf(db, "c1")?.state).toBe("leaving");
    expect(eventTypes()).toContain("reservation_released");
  });

  it("lets only one of two visitors have the last unit", () => {
    expect(START_STOCK["iphone-17"].Black[storageOf17]).toBe(1);
    const black = { model: "17", storage: storageOf17, colour: "Black", price: 1399 };
    selling("c1", "spec-phones", black);
    expect(stockOf(db, "iphone-17", "Black", storageOf17)).toBe(0);
    // a second customer, with the other specialist: the last unit is gone
    const { out } = selling("c2", "spec-phones-2", black);
    expect(last(out, "c2", "turn")?.say).toMatch(/has gone/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE visitor_id = 'c2'").get()).toEqual({ n: 0 });
  });
});

// The new talk engine (src/shared/talk/), wired 2026-10-19 (Ritesh: phone
// only, coexist not replace — docs/conversation-model/server-wiring-
// proposal.md), drives an NPC-staffed "phones" conversation instead of
// shared/conversation.ts's old phones script. A human-staffed "phones"
// conversation (the describe block above) still uses the old engine.
describe("the phones specialist, the new talk engine (NPC only)", () => {
  function atSpecPhones(customer: string): { x: number; z: number } {
    const s = npc("spec-phones");
    positions.set(customer, { x: s.x + 1, z: s.z });
    return s;
  }

  it("opens with the new engine's own question bank, not the old script's", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    atSpecPhones("c1");
    const out = startTalk(ctx(), "c1", "spec-phones");
    const turn = last(out, "c1", "turn")!;
    expect(turn.ended).toBe(false);
    // the old script's first line is "What can I show you?" with a
    // show/leave choice; the new engine opens with the did-you-have-a-model-
    // in-mind / opening_intent question instead (decisions.md: "start with
    // did you already have a phone in mind?").
    expect(turn.choices.some((c) => c.id === "show")).toBe(false);
    expect(turn.choices.length).toBeGreaterThan(0);
  });

  it("persists a real Scene in conversations.data, not the old ConvState shape", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    atSpecPhones("c1");
    const id = last(startTalk(ctx(), "c1", "spec-phones"), "c1", "turn")!.conversationId;
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(id) as { data: string };
    const data = JSON.parse(row.data) as { engine?: string; scene?: { answers: unknown; log: unknown[] } };
    expect(data.engine).toBe("talk");
    expect(data.scene?.log.length).toBeGreaterThan(0); // staff's opening line(s) already in the engine's own log
  });

  it("writes a talk_turn event per turn, tagged with the conversation id", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    atSpecPhones("c1");
    const opened = talkAt(startTalk(ctx(), "c1", "spec-phones"));
    const id = opened.conversationId;
    const firstChoiceId = opened.choices[0]!.id;
    const out = chooseTurn(ctx(), "c1", id, firstChoiceId);
    expect(last(out, "c1", "turn")).toBeDefined();
    const rows = db.prepare("SELECT type, data FROM events WHERE visitor_id = 'c1' AND type = 'talk_turn'").all() as Array<{ type: string; data: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.parse(rows[0]!.data)).toMatchObject({ conversationId: id, choice: firstChoiceId });
  });

  it("ends the conversation, logs it and releases the NPC, the same as the old engine does", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    atSpecPhones("c1");
    const opened = talkAt(startTalk(ctx(), "c1", "spec-phones"));
    const id = opened.conversationId;
    // "Leave" is always a standing action on the customer's menu (scene.ts's
    // customerMenu), whatever question happens to be pending — the stable
    // way to end the scene deterministically without depending on the
    // specific bank question an NPC staff opens with.
    const leave = opened.choices.find((c) => c.label === "Leave");
    expect(leave).toBeDefined();
    const out = chooseTurn(ctx(), "c1", id, leave!.id);
    expect(last(out, "c1", "turn")?.ended).toBe(true);
    const row = db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id) as { ended_at: number | null };
    expect(row.ended_at).not.toBeNull();
    expect(eventTypes()).toContain("conversation_ended");
    expect(stateOf(db, "c1")?.state).toBe("browsing");
  });
});

describe("employees", () => {
  it("joining as a specialist is an extra: the NPC specialists stay on duty", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x + 1, z: s.z });
    addVisitor("e1", "Sam", { x: s.x + 2, z: s.z }, "specialist", "phones");
    const out = startTalk(ctx(), "c1", "spec-phones");
    expect(last(out, "c1", "notice")?.text).toBeUndefined();
    expect(last(out, "c1", "turn")).toMatchObject({ withId: "spec-phones" });
  });

  // a real specialist and a customer by them, already in conversation
  const serving = () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    const open = startTalk(ctx(), "c1", "e1");
    return { open, id: last(open, "c1", "turn")!.conversationId };
  };

  it("a real specialist is given the engine's own moves, and the customer waits", () => {
    const { open } = serving();
    expect(last(open, "all", "engaged")).toBeUndefined(); // only NPCs are "engaged"
    expect(last(open, "c1", "turn")).toMatchObject({ awaiting: "staff", choices: [] });
    const menu = last(open, "e1", "staff_menu")!;
    expect(menu.awaiting).toBe("staff");
    // every conversation opens with a greeting and an introduction
    expect(menu.acts.length).toBeGreaterThan(0);
    expect(menu.acts.length).toBeLessThanOrEqual(3);
    expect(menu.tones.map((t) => t.id)).toEqual(["friendly", "neutral", "impatient", "unsure"]);
    expect(menu.stats.candidates.length).toBeGreaterThan(3); // every phone is still in play
    expect(menu.status).toBe("Your move.");
  });

  it("tells everyone who is talking to whom, so two real people are drawn talking and listening", () => {
    const { id } = serving();
    expect(chatPairs(db)).toEqual([{ customerId: "c1", staffId: "e1", lines: 0 }]); // nobody has spoken yet
    const first = staffMove(ctx(), "e1", id, "m0", "friendly");
    expect(last(first, "c1", "turn")).toBeDefined();
    expect(chatPairs(db)[0]).toMatchObject({ speaker: "e1", lines: 1 }); // the specialist has just spoken
  });

  it("takes turns: the specialist moves, the customer answers, and what they said shows beside the chat", () => {
    const { id } = serving();
    // the customer cannot jump the queue, nor the specialist
    expect(last(chooseTurn(ctx(), "c1", id, "opt:anything"), "c1", "notice")?.text).toMatch(/not one of the options/);
    const first = staffMove(ctx(), "e1", id, "m0", "friendly");
    const turn = last(first, "c1", "turn")!;
    expect(turn.awaiting).toBe("customer");
    expect(turn.choices.length).toBeGreaterThan(0);
    const after = last(first, "e1", "staff_menu")!;
    expect(after.awaiting).toBe("customer");
    expect(after.log.map((l) => l.who)).toEqual(["staff"]);
    expect(last(staffMove(ctx(), "e1", id, "m0", "friendly"), "e1", "notice")?.text).toMatch(/not one of the moves/);
    // the customer answers with their first option; it is the specialist's move again, with the answer on show
    const answered = chooseTurn(ctx(), "c1", id, turn.choices[0]!.id);
    expect(last(answered, "c1", "turn")).toMatchObject({ awaiting: "staff", choices: [] });
    const menu = last(answered, "e1", "staff_menu")!;
    expect(menu.awaiting).toBe("staff");
    expect(menu.log.map((l) => l.who)).toEqual(["staff", "customer"]);
    expect(menu.stats.answers.length).toBeGreaterThan(0);
    expect(menu.acts.length).toBeGreaterThan(0);
    expect(eventTypes()).toEqual(expect.arrayContaining(["talk_staff_move", "talk_turn"]));
  });

  it("the specialist can offer a table, and both walk to their stools and sit on the same side", () => {
    const { open, id } = serving();
    expect(last(open, "e1", "staff_menu")!.acts.some((a) => a.id === "seat")).toBe(true);
    const offer = staffMove(ctx(), "e1", id, "seat", "friendly");
    expect(last(offer, "c1", "turn")!.choices.map((c) => c.id)).toEqual(["seat:sit", "seat:stand"]);
    expect(last(offer, "e1", "staff_menu")!.acts).toEqual([]); // waiting on the customer
    const go = chooseTurn(ctx(), "c1", id, "seat:sit");
    const mine = last(go, "c1", "escort")!;
    const theirs = last(go, "e1", "escort")!;
    expect(mine).toMatchObject({ kind: "seat" });
    expect(mine.goal).not.toEqual(theirs.goal); // each is given their own stool
    // only one of them there: nobody sits
    positions.set("c1", mine.goal);
    expect(messagesTo(settleIntents(ctx(NOW + 5000)), "all", "seated")).toEqual([]);
    // both on their stools: both are seated, on the same side of the table
    positions.set("e1", theirs.goal);
    const sat = settleIntents(ctx(NOW + 6000));
    const seated = messagesTo(sat, "all", "seated") as Array<Extract<ServerMessage, { type: "seated" }>>;
    expect(seated.map((m) => m.visitorId).sort()).toEqual(["c1", "e1"]);
    expect(Math.abs(seated[0]!.at.x - seated[1]!.at.x)).toBeLessThan(0.05);
    expect(last(sat, "e1", "staff_menu")!.awaiting).toBe("staff");
  });

  it("two real people sitting hold their table, and everyone who joins later sees them seated", () => {
    const { id } = serving();
    staffMove(ctx(), "e1", id, "seat", "friendly");
    const go = chooseTurn(ctx(), "c1", id, "seat:sit");
    positions.set("c1", last(go, "c1", "escort")!.goal);
    positions.set("e1", last(go, "e1", "escort")!.goal);
    settleIntents(ctx(NOW + 6000));
    expect(seatedList(db).map((s) => s.visitorId).sort()).toEqual(["c1", "e1"]);
    const table = db.prepare("SELECT data FROM conversations WHERE id = ?").get(id) as { data: string };
    expect(JSON.parse(table.data).seat.tableId).toBeDefined();
  });

  it("when a real specialist leaves, an NPC takes their place and the conversation carries on", () => {
    const { id } = serving();
    staffMove(ctx(), "e1", id, "m0", "friendly");
    const out = handOverPost(ctx(), "e1");
    expect(last(out, "all", "notice")?.text).toMatch(/Sam left\. .* \(NPC\) has taken their place/);
    const eng = last(out, "all", "engaged")!;
    expect(eng.npcId).toMatch(/^spec-phones/);
    expect(eng.lead).toMatchObject({ x: -4, z: -3 }); // right where Sam stood
    expect(last(out, "c1", "turn")).toMatchObject({ conversationId: id, ended: false });
    expect(db.prepare("SELECT with_id, with_kind FROM conversations WHERE id = ?").get(id)).toEqual({ with_id: eng.npcId, with_kind: "npc" });
    // Sam's own leaving then has nothing left to end
    expect(last(leaveStore(ctx(), "e1"), "c1", "turn")).toBeUndefined();
  });

  it("an NPC who takes over a seated chat sits where the specialist sat, and the table stays taken", () => {
    const { id } = serving();
    staffMove(ctx(), "e1", id, "seat", "friendly");
    const go = chooseTurn(ctx(), "c1", id, "seat:sit");
    positions.set("c1", last(go, "c1", "escort")!.goal);
    positions.set("e1", last(go, "e1", "escort")!.goal);
    settleIntents(ctx(NOW + 6000));
    const out = handOverPost(ctx(NOW + 7000), "e1");
    expect(last(out, "all", "engaged")).toMatchObject({ seated: true });
    expect(messagesTo(out, "all", "unseated").map((m) => (m as { visitorId: string }).visitorId)).toEqual(["e1"]);
    expect(seatedList(db).map((s) => s.visitorId)).toEqual(["c1"]); // the customer is still sitting there
  });

  it("when the customer leaves, an NPC customer stands in and answers the specialist", () => {
    const { id } = serving();
    staffMove(ctx(), "e1", id, "m0", "friendly");
    chooseTurn(ctx(), "c1", id, last(staffMove(ctx(), "e1", id, "m0", "friendly") , "c1", "turn")?.choices[0]?.id ?? "x"); // (may be refused: either way it is the customer's move or the specialist's)
    const out = handOverCustomer(ctx(), "c1");
    expect(last(out, "all", "notice")?.text).toMatch(/Pebble left\. .* \(NPC\) is standing in for them/);
    const eng = last(out, "all", "engaged")!;
    expect(eng.lead).toMatchObject({ x: -3, z: -3 }); // where Pebble stood
    const menu = last(out, "e1", "staff_menu")!;
    expect(menu.customerName).not.toBe("Pebble");
    expect(menu.awaiting).toBe("staff"); // it answered already, so it is their move
    // leaving afterwards does not end the conversation: the stand-in is carrying it
    expect(last(leaveStore(ctx(), "c1"), "e1", "staff_menu_end")).toBeUndefined();
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).toEqual({ ended_at: null });
    // the specialist's next move is answered by the stand-in, no customer needed
    const again = staffMove(ctx(), "e1", id, menu.acts[0]!.id, "friendly");
    const after = last(again, "e1", "staff_menu") ?? last(again, "e1", "staff_menu_end");
    expect(after).toBeDefined();
    // when it ends, the stand-in is let go
    const over = db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id) as { ended_at: number | null };
    if (over.ended_at !== null) expect(messagesTo(again, "all", "released").length).toBeGreaterThan(0);
  });

  it("a returning customer retires the stand-in", () => {
    const { id } = serving();
    handOverCustomer(ctx(), "c1");
    const out = retireStandIn(ctx(), "c1");
    expect(last(out, "e1", "staff_menu_end")).toBeDefined();
    expect(messagesTo(out, "all", "released").length).toBeGreaterThan(0);
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).not.toEqual({ ended_at: null });
  });

  it("free their customer when they leave mid-conversation", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    const id = last(startTalk(ctx(), "c1", "e1"), "c1", "turn")!.conversationId;
    const out = leaveStore(ctx(), "e1");
    expect(last(out, "e1", "staff_menu_end")).toBeDefined();
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).not.toEqual({ ended_at: null });
    expect(last(out, "c1", "turn")?.ended).toBe(true);
    expect(stateOf(db, "c1")?.state).toBe("browsing");
  });
});

describe("walking away mid-conversation (Esc, either side)", () => {
  it("lets a customer leave an NPC conversation without finishing it", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const id = last(startTalk(ctx(), "c1", "greeter-1"), "c1", "turn")!.conversationId;
    const out = leaveConversation(ctx(), "c1");
    expect(last(out, "c1", "turn")).toMatchObject({ ended: true });
    expect(last(out, "all", "released")).toBeUndefined();
    expect(last(closeTalk(ctx(), "c1"), "all", "released")).toMatchObject({ npcId: "greeter-1" });
    expect(stateOf(db, "c1")?.state).toBe("browsing");
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).not.toEqual({ ended_at: null });
    expect(eventTypes()).toContain("conversation_ended");
  });

  it("lets a customer leave a human employee's conversation", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    startTalk(ctx(), "c1", "e1");
    const out = leaveConversation(ctx(), "c1");
    expect(last(out, "c1", "turn")).toMatchObject({ ended: true });
  });

  it("lets the employee leave too, not just the customer", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    startTalk(ctx(), "c1", "e1");
    const out = leaveConversation(ctx(), "e1");
    expect(last(out, "c1", "turn")).toMatchObject({ ended: true });
    expect(stateOf(db, "c1")?.state).toBe("browsing");
  });

  it("is a no-op for someone in no conversation", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    expect(leaveConversation(ctx(), "c1")).toEqual([]);
  });
});

describe("an idle NPC claiming a waiting customer on its own (tryNpcAutoClaim)", () => {
  // Not wired into any live request path yet (see service.ts's own note on
  // why: today it would only ever act on "specialist:phones", which this
  // suite's "employees" block treats as a deliberate human-staff showcase).
  // Tested directly so the rule itself is still pinned down.
  it("claims a waiting customer when an on-duty, idle NPC matches their post", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x, z: s.z });
    db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'specialist:phones' WHERE visitor_id = 'c1'").run();
    const out = tryNpcAutoClaim(ctx(), "c1");
    expect(last(out, "c1", "turn")).toMatchObject({ withId: "spec-phones", ended: false });
    expect(stateOf(db, "c1")?.state).toBe("in_conversation");
  });

  it("is a no-op for a post with no script yet (genius, D34)", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'genius' WHERE visitor_id = 'c1'").run();
    expect(tryNpcAutoClaim(ctx(), "c1")).toEqual([]);
  });

  it("will not double-book an NPC already serving someone else", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x, z: s.z });
    addVisitor("c2", "Biscuit", { x: s.x, z: s.z });
    for (const id of ["c1", "c2"]) db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'specialist:phones' WHERE visitor_id = ?").run(id);
    expect(last(tryNpcAutoClaim(ctx(), "c1"), "c1", "turn")).toMatchObject({ withId: "spec-phones" });
    // the second NPC specialist takes the second customer, never the busy one
    expect(last(tryNpcAutoClaim(ctx(), "c2"), "c2", "turn")).toMatchObject({ withId: "spec-phones-2" });
  });
});

describe("the greeter approaching a new customer on its own (tryGreeterApproach)", () => {
  it("shows intent to an arriving customer nearby, who then accepts", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const out = tryGreeterApproach(ctx(), "c1");
    // intent first: the greeter walks over, nothing opens by itself
    expect(last(out, "all", "intent")).toMatchObject({ fromId: "greeter-1", toId: "c1", reason: "greet", state: "open" });
    expect(last(out, "all", "engaged")).toMatchObject({ npcId: "greeter-1", pending: true });
    expect(last(out, "c1", "turn")).toBeUndefined();
    expect(stateOf(db, "c1")?.state).toBe("arriving");
    // the customer presses E once the greeter has arrived
    const later = ctx(NOW + 60_000);
    expect(last(acceptIntentById(later, "c1", last(out, "all", "intent")!.id), "c1", "turn")).toMatchObject({ withId: "greeter-1", ended: false });
    expect(stateOf(db, "c1")?.state).toBe("in_conversation");
  });

  it("never approaches the same customer twice", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const first = tryGreeterApproach(ctx(), "c1");
    const intentId = last(first, "all", "intent")!.id;
    const id = last(acceptIntentById(ctx(NOW + 60_000), "c1", intentId), "c1", "turn")!.conversationId;
    leaveConversation(ctx(), "c1"); // back to browsing
    expect(stateOf(db, "c1")?.state).toBe("browsing");
    expect(tryGreeterApproach(ctx(), "c1")).toEqual([]);
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).not.toEqual({ ended_at: null });
  });

  it("goes up to whoever is standing just inside the entrance, and not to anyone elsewhere", () => {
    addVisitor("c1", "Pebble", { x: 0, z: -8 });
    addVisitor("c2", "Biscuit", { x: 0, z: -11 }); // still outside
    addVisitor("c3", "Fern", { x: 5, z: 5 }); // deep in the store
    expect(last(tryGreeterApproach(ctx(), "c1"), "all", "intent")).toMatchObject({ fromId: "greeter-1", toId: "c1", reason: "greet" });
    expect(tryGreeterApproach(ctx(), "c2")).toEqual([]);
    expect(tryGreeterApproach(ctx(), "c3")).toEqual([]);
  });

  it("a customer pressing E on the greeter shows their own intent; the greeter accepts, it does not wait to be accepted", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const out = requestTalk(ctx(), "c1", "greeter-1");
    expect(last(out, "all", "intent")).toMatchObject({ fromId: "c1", toId: "greeter-1", reason: "ask" });
    expect(last(out, "all", "engaged")).not.toHaveProperty("waving"); // the visitor asked, so the greeter does not wave
  });

  it("an NPC that came over by itself waves, one the visitor asked does not", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    expect(last(tryGreeterApproach(ctx(), "c1"), "all", "engaged")).toMatchObject({ npcId: "greeter-1", pending: true, waving: true });
  });

  it("a visitor who comes back after a reload or restart is not stuck behind a chat nobody can see", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    // a conversation with the greeter was open (and its last line never dismissed) when the server restarted
    const first = talkAt(startTalk(ctx(), "c1", "greeter-1"), "c1");
    expect(first.conversationId).toBeDefined();
    expect(last(startTalk(ctx(), "c1", "greeter-1"), "c1", "notice")?.text).toMatch(/Finish what you are doing|someone else/);
    // they load the page again: a fresh visit
    rejoin(ctx(NOW + 5000), "c1", { kind: "customer" });
    expect(stateOf(db, "c1")?.state).toBe("arriving");
    expect(db.prepare("SELECT COUNT(*) AS n FROM conversations WHERE customer_id = 'c1' AND ended_at IS NULL").get()).toEqual({ n: 0 });
    const again = startTalk(ctx(NOW + 6000), "c1", "greeter-1");
    expect(last(again, "c1", "notice")?.text).toBeUndefined();
    expect(last(again, "c1", "turn")).toMatchObject({ withId: "greeter-1" });
  });

  it("greets someone again on a later visit, not just the first time they ever came", () => {
    addVisitor("c1", "Pebble", { x: 0, z: -8 });
    expect(last(tryGreeterApproach(ctx(), "c1"), "all", "intent")).toBeDefined();
    expect(tryGreeterApproach(ctx(), "c1")).toEqual([]); // once per visit
    // they leave, and come back later: a new visit
    leaveStore(ctx(), "c1");
    enter(ctx(NOW + 600_000), "c1", { kind: "customer" });
    expect(last(tryGreeterApproach(ctx(NOW + 600_000), "c1"), "all", "intent")).toMatchObject({ fromId: "greeter-1", toId: "c1" });
  });

  it("does not approach while a human holds the greeter post", () => {
    const g = npc("greeter-1");
    addVisitor("e1", "Sam", g, "greeter");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    expect(tryGreeterApproach(ctx(), "c1")).toEqual([]);
  });
});

describe("the event log", () => {
  it("writes at least one event for every operation that changes state", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const step = (name: string, fn: () => unknown): void => {
      const before = eventCount();
      fn();
      expect(eventCount(), name).toBeGreaterThan(before);
    };
    let id = "";
    step("start", () => {
      id = last(startTalk(ctx(), "c1", "greeter-1"), "c1", "turn")!.conversationId;
    });
    step("turn", () => chooseTurn(ctx(), "c1", id, "phone"));
    step("turn to end", () => chooseTurn(ctx(), "c1", id, "help"));
    step("leave", () => leaveStore(ctx(), "c1"));
  });

  it("changes nothing, and writes nothing, for a refused request", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 20, z: g.z });
    const before = eventCount();
    startTalk(ctx(), "c1", "greeter-1");
    expect(eventCount()).toBe(before);
  });
});

describe("intent to talk (Ritesh, 2026-10-19)", () => {
  const T = NOW + 60_000; // long enough for any NPC to have walked over

  it("a customer asking a free NPC shows intent; the NPC accepts one beat after arriving", () => {
    const g = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const asked = requestTalk(ctx(), "c1", "spec-phones");
    expect(last(asked, "all", "intent")).toMatchObject({ fromId: "c1", toId: "spec-phones", reason: "ask", state: "open" });
    expect(last(asked, "c1", "turn")).toBeUndefined();
    expect(settleIntents(ctx(T))).toEqual([]); // it has arrived, the beat has started
    expect(last(settleIntents(ctx(T + INTENT_BEAT_MS - 1)), "c1", "turn")).toBeUndefined();
    const out = settleIntents(ctx(T + INTENT_BEAT_MS));
    expect(last(out, "c1", "turn")).toMatchObject({ withId: "spec-phones", ended: false });
    expect(last(out, "all", "intent_end")).toMatchObject({ why: "accepted" });
    expect(eventTypes()).toEqual(expect.arrayContaining(["intent_shown", "intent_accepted", "conversation_started"]));
  });

  it("nobody starts a conversation with someone already engaged: the intent waits until they are free", () => {
    const g = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    addVisitor("c2", "Biscuit", { x: g.x - 1, z: g.z });
    requestTalk(ctx(), "c1", "spec-phones");
    settleIntents(ctx(T));
    settleIntents(ctx(T + INTENT_BEAT_MS)); // c1 is now with the specialist
    const second = requestTalk(ctx(T + 2000), "c2", "spec-phones");
    expect(last(second, "all", "intent")).toMatchObject({ fromId: "c2", state: "queued" });
    expect(last(second, "c2", "notice")?.text).toMatch(/with someone/);
    expect(last(second, "all", "engaged")).toBeUndefined();
    // c1 steps away but has not dismissed the last turn: c2 keeps waiting
    leaveConversation(ctx(T + 3000), "c1");
    expect(last(settleIntents(ctx(T + 4000)), "c2", "turn")).toBeUndefined();
    // c1 dismisses it: the specialist is free, c2's intent opens and the NPC walks over
    const freed = closeTalk(ctx(T + 5000), "c1");
    expect(last(freed, "all", "released")).toMatchObject({ npcId: "spec-phones" });
    expect(last(freed, "all", "engaged")).toMatchObject({ npcId: "spec-phones", visitorId: "c2", pending: true });
    expect(last(settleIntents(ctx(T + 5000 + 60_000)), "c2", "turn")).toBeUndefined(); // arrived, beat starts
    expect(last(settleIntents(ctx(T + 5000 + 60_000 + INTENT_BEAT_MS)), "c2", "turn")).toMatchObject({ withId: "spec-phones" });
  });

  it("an NPC that showed intent and is ignored gives up after 30 seconds and walks back", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    tryGreeterApproach(ctx(), "c1");
    settleIntents(ctx(T));
    expect(last(settleIntents(ctx(T + INTENT_GIVE_UP_MS - 1)), "all", "intent_end")).toBeUndefined();
    const out = settleIntents(ctx(T + INTENT_GIVE_UP_MS));
    expect(last(out, "all", "intent_end")).toMatchObject({ why: "expired" });
    expect(last(out, "all", "released")).toMatchObject({ npcId: "greeter-1" });
  });

  it("a customer who leaves cancels their intents", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    requestTalk(ctx(), "c1", "greeter-1");
    const out = leaveStore(ctx(), "c1");
    expect(last(out, "all", "intent_end")).toMatchObject({ why: "cancelled" });
    expect(last(out, "all", "released")).toMatchObject({ npcId: "greeter-1" });
  });

  it("a person accepts a customer's intent by pressing E; nothing opens before that", () => {
    addVisitor("e1", "Sam", { x: 0.6, z: 0 }, "specialist", "phones");
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    const asked = requestTalk(ctx(), "c1", "e1");
    const intent = last(asked, "all", "intent")!;
    expect(intent).toMatchObject({ fromId: "c1", toId: "e1", toName: "Sam" });
    expect(last(settleIntents(ctx(T)), "c1", "turn")).toBeUndefined(); // a person has to accept
    expect(last(acceptIntentById(ctx(T), "c1", intent.id), "c1", "turn")).toBeUndefined(); // the asker cannot accept their own
    expect(last(acceptIntentById(ctx(T), "e1", intent.id), "c1", "turn")).toMatchObject({ withId: "e1" });
  });

  it("tells you to wait at a spot and sends a named person only once you are there, after a delay", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    startTalk(ctx(), "c1", "greeter-1");
    const id = (db.prepare("SELECT id FROM conversations WHERE customer_id = 'c1'").get() as { id: string }).id;
    chooseTurn(ctx(), "c1", id, "phone");
    const done = chooseTurn(ctx(), "c1", id, "help");
    const intent = last(done, "all", "intent")!;
    expect(intent).toMatchObject({ fromId: "spec-phones", toId: "c1", fromName: "Theo", reason: "help", state: "held" });
    expect(intent.wait?.label).toBe("the phones area");
    expect(last(done, "c1", "turn")?.say).toMatch(/Wait near the phones area and Theo will come and find you/);
    expect(last(done, "all", "engaged")).toBeUndefined(); // nobody walks over yet
    // not at the spot: nothing happens, however long
    closeTalk(ctx(), "c1");
    expect(settleIntents(ctx(NOW + 60_000))).toEqual([]);
    // at the spot: the wait starts, and Theo comes only after the delay (3 to 8 s)
    positions.set("c1", { x: intent.wait!.x, z: intent.wait!.z });
    expect(settleIntents(ctx(NOW + 61_000))).toEqual([]);
    expect(last(settleIntents(ctx(NOW + 61_000 + 2900)), "all", "engaged")).toBeUndefined();
    const came = settleIntents(ctx(NOW + 61_000 + 8100));
    expect(last(came, "all", "engaged")).toMatchObject({ npcId: "spec-phones", visitorId: "c1", pending: true });
    expect(last(came, "all", "intent")).toMatchObject({ state: "open" });
  });

  it("starts the wait again if you wander off the spot", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    startTalk(ctx(), "c1", "greeter-1");
    const id = (db.prepare("SELECT id FROM conversations WHERE customer_id = 'c1'").get() as { id: string }).id;
    chooseTurn(ctx(), "c1", id, "phone");
    const intent = last(chooseTurn(ctx(), "c1", id, "help"), "all", "intent")!;
    closeTalk(ctx(), "c1");
    const spot = { x: intent.wait!.x, z: intent.wait!.z };
    positions.set("c1", spot);
    settleIntents(ctx(NOW + 1000)); // wait begins
    positions.set("c1", { x: spot.x + 5, z: spot.z });
    settleIntents(ctx(NOW + 5000)); // wandered off: reset
    positions.set("c1", spot);
    settleIntents(ctx(NOW + 6000)); // wait begins again
    expect(last(settleIntents(ctx(NOW + 6000 + 2900)), "all", "engaged")).toBeUndefined();
    expect(last(settleIntents(ctx(NOW + 6000 + 8100)), "all", "engaged")).toMatchObject({ npcId: "spec-phones" });
  });

  it("gives the mission to a real user first, even when an NPC is free", () => {
    addVisitor("e1", "Victor", { x: 5, z: 5 }, "specialist", "phones");
    addVisitor("c1", "Stacy", { x: 0, z: 0 });
    const a = assignHelper(ctx(), "c1", "specialist:phones");
    expect(last(a.out, "all", "intent")).toMatchObject({ fromId: "e1" });
  });

  it("a real user who is busy is passed over for a free NPC", () => {
    addVisitor("e1", "Victor", { x: 0.6, z: 0 }, "specialist", "phones");
    addVisitor("c0", "Busy", { x: 0, z: 0 });
    // Victor is already sent for a customer, so he is not free
    expect(last(assignHelper(ctx(), "c0", "specialist:phones").out, "all", "intent")).toMatchObject({ fromId: "e1" });
    addVisitor("c1", "Stacy", { x: 5, z: 5 });
    expect(last(assignHelper(ctx(), "c1", "specialist:phones").out, "all", "intent")).toMatchObject({ fromId: "spec-phones" });
  });

  it("when everyone is taken the customer joins a shared queue, and whoever is free first comes", () => {
    addVisitor("c1", "One", { x: 0, z: 0 });
    addVisitor("c2", "Two", { x: 1, z: 0 });
    addVisitor("c3", "Three", { x: 2, z: 0 });
    for (const id of ["c1", "c2", "c3"]) db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'specialist:phones', since = ? WHERE visitor_id = ?").run(NOW + Number(id.slice(1)), id);
    // the two NPC specialists take two customers
    const a1 = assignHelper(ctx(), "c1", "specialist:phones");
    const a2 = assignHelper(ctx(), "c2", "specialist:phones");
    expect(new Set([a1.helperName, a2.helperName]).size).toBe(2);
    // a third: nobody is free, nobody is named
    const a3 = assignHelper(ctx(), "c3", "specialist:phones");
    expect(a3.queued).toBe(true);
    expect(a3.helperName).toBeNull();
    expect(a3.out).toEqual([]);
    expect(settleIntents(ctx(NOW + 100)).filter((o) => o.message.type === "intent")).toEqual([]);
    // the first customer leaves: that specialist is free, and takes the one who waited
    const freed = leaveStore(ctx(NOW + 200), "c1");
    expect(last(freed, "all", "intent")).toMatchObject({ toId: "c3", state: "held" });
    expect(eventTypes()).toContain("help_queued");
  });

  it("tells a queued customer that someone will come, without a name", () => {
    const g = npc("greeter-1");
    addVisitor("a", "A", { x: 0, z: 0 });
    addVisitor("b", "B", { x: 1, z: 0 });
    for (const id of ["a", "b"]) assignHelper(ctx(), id, "specialist:phones"); // both NPCs now taken
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    startTalk(ctx(), "c1", "greeter-1");
    const id = (db.prepare("SELECT id FROM conversations WHERE customer_id = 'c1'").get() as { id: string }).id;
    chooseTurn(ctx(), "c1", id, "phone");
    const done = chooseTurn(ctx(), "c1", id, "help");
    expect(last(done, "c1", "turn")?.say).toMatch(/Wait near the phones area and someone will come and get you as soon as they're free/);
    expect(last(done, "all", "intent")).toBeUndefined();
  });

  it("gives the mission to a person holding the post, not the NPC", () => {
    addVisitor("e1", "Victor", { x: 5, z: 5 }, "specialist", "phones");
    const g = npc("greeter-1");
    addVisitor("c1", "Stacy", { x: g.x + 1, z: g.z });
    startTalk(ctx(), "c1", "greeter-1");
    const id = (db.prepare("SELECT id FROM conversations WHERE customer_id = 'c1'").get() as { id: string }).id;
    chooseTurn(ctx(), "c1", id, "phone");
    const done = chooseTurn(ctx(), "c1", id, "help");
    expect(last(done, "all", "intent")).toMatchObject({ fromId: "e1", fromName: "Victor", toId: "c1", reason: "help" });
    expect(last(done, "all", "engaged")).toBeUndefined(); // a person walks themselves
    expect(last(done, "c1", "turn")?.say).toMatch(/Wait near the phones area and Victor will come and find you/);
    // both ends are shown the spot: the customer waits there, the specialist is guided to it
    const intent = last(done, "all", "intent")!;
    expect(intent).toMatchObject({ state: "open", human: true, ready: false, wait: { label: "the phones area" } });
    // Victor walks to Stacy and presses E; until then she cannot accept, and he cannot from afar
    closeTalk(ctx(), "c1");
    positions.set("c1", { x: 0, z: 0 });
    expect(last(acceptIntentById(ctx(NOW + 5000), "c1", intent.id), "c1", "notice")?.text).toMatch(/still on the way/);
    expect(last(showIntentById(ctx(NOW + 5000), "e1", intent.id), "e1", "notice")?.text).toMatch(/closer/);
    positions.set("e1", { x: 1, z: 0 });
    const shown = showIntentById(ctx(NOW + 6000), "e1", intent.id);
    expect(last(shown, "all", "intent")).toMatchObject({ ready: true });
    // now she can accept, and the conversation opens with Victor
    expect(last(acceptIntentById(ctx(NOW + 7000), "c1", intent.id), "c1", "turn")).toMatchObject({ withId: "e1" });
    expect(eventTypes()).toContain("intent_shown_in_person");
  });
});

describe("being walked to a demo device (Ritesh, 2026-10-19)", () => {
  const T = NOW + 60_000;

  it("walks you to a real device of that model, opens it on arrival, and carries on when you put it down", () => {
    const p = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: p.x + 1, z: p.z });
    const opened = startTalk(ctx(), "c1", "spec-phones");
    const hello = talkAt(opened);
    const demo = hello.choices.find((c) => /^Ask for a demo of the (iPhone 17|iPhone 16|iPhone Air)$/.test(c.label));
    expect(demo, hello.choices.map((c) => c.label).join(" | ")).toBeDefined();
    const out = chooseTurn(ctx(), "c1", hello.conversationId, demo!.id);
    const esc = last(out, "c1", "escort")!;
    expect(esc).toMatchObject({ kind: "demo", npcId: "spec-phones", npcName: "Theo" });
    expect(esc.text).toMatch(/^Follow Theo to the iPhone/);
    const lead = last(out, "all", "engaged")!;
    expect(lead.lead).toBeDefined();
    expect(lead.from).toBeDefined();
    // the menu is on hold until they have looked
    expect(last(chooseTurn(ctx(), "c1", hello.conversationId, "anything"), "c1", "notice")?.text).toMatch(/Follow Theo first/);
    // not there yet: nothing opens
    positions.set("c1", { x: 4, z: 7 });
    expect(last(settleIntents(ctx(T)), "c1", "turn")).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM inspections").get()).toEqual({ n: 0 });
    // standing at the spot they were shown: the device opens by itself
    positions.set("c1", esc.goal);
    const arrived = settleIntents(ctx(T));
    expect(last(arrived, "all", "inspecting")).toMatchObject({ visitorId: "c1" });
    // Esc: the conversation is theirs again and the NPC comes back to them
    const done = endInspect(ctx(T + 5000), "c1", "stopped inspecting");
    expect(last(done, "c1", "escort_end")).toBeDefined();
    expect(last(done, "all", "engaged")).toMatchObject({ npcId: "spec-phones", visitorId: "c1" });
    expect(last(done, "all", "engaged")!.lead).toBeUndefined();
    // back from the device the line no longer says "here it is"
    expect(last(done, "c1", "turn")!.say).toMatch(/^So, that's the one\./);
    expect(last(chooseTurn(ctx(T + 6000), "c1", hello.conversationId, "anything"), "c1", "notice")?.text).not.toMatch(/Follow/);
    expect(eventTypes()).toEqual(expect.arrayContaining(["escort_started", "inspect_start", "escort_ended"]));
  });

  it("gives up if the customer never follows", () => {
    const p = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: p.x + 1, z: p.z });
    const hello = talkAt(startTalk(ctx(), "c1", "spec-phones"));
    const demo = hello.choices.find((c) => /^Ask for a demo of the/.test(c.label))!;
    chooseTurn(ctx(), "c1", hello.conversationId, demo.id);
    const out = settleIntents(ctx(NOW + 130_000));
    expect(last(out, "c1", "escort_end")).toBeDefined();
  });
});

describe("a sale after the chat: the bag, the specialist, the payment (Ritesh, 2026-10-21)", () => {
  // drive the engine to the moment of deciding: "yes" on the confirm question
  const decide = () => {
    const p = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: p.x + 1, z: p.z });
    const hello = talkAt(startTalk(ctx(), "c1", "spec-phones"));
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(hello.conversationId) as { data: string };
    const data = JSON.parse(row.data);
    data.scene.pending = { kind: "confirm" };
    db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(data), hello.conversationId);
    const out = chooseTurn(ctx(), "c1", hello.conversationId, "opt:yes");
    return { id: hello.conversationId, out };
  };

  it("ends the chat when it is agreed: someone will fetch it, and everyone is free to roam", () => {
    const { out } = decide();
    const turn = last(out, "c1", "turn")!;
    expect(turn.ended).toBe(true);
    expect(turn.say).toMatch(/brought out/);
    expect(turn.say).toMatch(/come and find you/);
    expect(turn.say).not.toMatch(/till/);
    // the stock runner is sent, waving, to where the specialist is
    const runner = (messagesTo(out, "all", "engaged") as Array<Extract<ServerMessage, { type: "engaged" }>>).find((e) => e.npcId.startsWith("stock-"))!;
    expect(runner).toMatchObject({ pending: true, waving: true, visitorId: "spec-phones" });
    expect(orderViews(ctx())).toEqual([expect.objectContaining({ customerId: "c1", specId: "spec-phones", stage: "fetching" })]);
    expect(eventTypes()).toEqual(expect.arrayContaining(["stock_checked", "order_placed", "stock_ordered"]));
  });

  it("the runner hands the bag to an NPC specialist a beat after arriving, who then comes to the customer to take payment", () => {
    decide();
    closeTalk(ctx(NOW + 1000), "c1");
    expect(settleIntents(ctx(NOW + 5000))).toEqual([]); // still walking out from the back
    let t = NOW + 6000;
    let out: Outgoing[] = [];
    while (orderStage() === "fetching" && t < NOW + ORDER_MS) {
      out = settleIntents(ctx(t));
      t += 1000;
    }
    expect(orderStage()).toBe("with_spec");
    expect(last(out, "all", "released")?.npcId).toMatch(/^stock-/);
    // the specialist shows intent to the customer: it waves and the customer has to accept
    expect(last(out, "all", "intent")).toMatchObject({ fromId: "spec-phones", toId: "c1", reason: "pay" });
    expect(last(out, "all", "engaged")).toMatchObject({ npcId: "spec-phones", waving: true });
    expect(eventTypes()).toContain("stock_handed_over");
  });

  it("takes payment once the customer accepts, and the unit is sold", () => {
    decide();
    const pay = payFor("c1");
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(pay.id) as { data: string };
    expect(JSON.parse(row.data).checkout).toMatchObject({ stage: "pay" });
    expect(orderViews(ctx())[0]!.stage).toBe("paying");
    const turnNow = last(chooseTurn(ctx(pay.t + 1000), "c1", pay.id, "pay:phone"), "c1", "turn")!;
    expect(turnNow).toMatchObject({ ended: true });
    expect(turnNow.say).toMatch(/gone through/);
    expect(orderViews(ctx())).toEqual([]);
    expect(eventTypes()).toEqual(expect.arrayContaining(["payment_started", "purchase_paid", "conversation_ended"]));
  });

  it("the customer can call it off at the payment", () => {
    decide();
    const pay = payFor("c1");
    const out = chooseTurn(ctx(pay.t + 1000), "c1", pay.id, "pay:cancel");
    expect(last(out, "c1", "turn")!.say).toMatch(/put it back/);
    expect(eventTypes()).toContain("purchase_cancelled");
    expect(eventTypes()).not.toContain("purchase_paid");
  });

  it("an NPC specialist follows a customer who wanders off after it has set out", () => {
    decide();
    closeTalk(ctx(NOW + 1000), "c1");
    let t = NOW + 2000;
    while (orderStage() === "fetching" && t < NOW + ORDER_MS) {
      settleIntents(ctx(t));
      t += 1000;
    }
    const before = db.prepare("SELECT at_x, at_z FROM intents WHERE reason = 'pay' AND status = 'open'").get() as { at_x: number; at_z: number };
    // it has set out for where the customer stood; they walk on, and it goes after them
    positions.set("c1", { x: before.at_x + 8, z: before.at_z });
    for (let i = 0; i < 80; i++, t += 1000) settleIntents(ctx(t));
    const after = db.prepare("SELECT at_x, from_x FROM intents WHERE reason = 'pay' AND status = 'open'").get() as { at_x: number; from_x: number | null };
    expect(Math.abs(after.at_x - (before.at_x + 8))).toBeLessThan(0.01);
    expect(after.from_x).not.toBeNull();
  });

  it("calls the order off after a while, tells the customer, and puts the unit back", () => {
    decide();
    const before = db.prepare("SELECT status FROM reservations WHERE visitor_id = 'c1'").get();
    expect(before).toEqual({ status: "held" });
    const out = settleIntents(ctx(NOW + ORDER_MS + 1000));
    expect(last(out, "c1", "notice")?.text).toMatch(/could not get your .* in time/);
    expect(last(out, "all", "released")?.npcId).toMatch(/^stock-/);
    expect(orderViews(ctx())).toEqual([]);
    expect(eventTypes()).toEqual(expect.arrayContaining(["order_cancelled", "reservation_released"]));
  });

  it("calls the order off when the customer leaves, and tells the specialist", () => {
    decide();
    const out = leaveStore(ctx(NOW + 2000), "c1");
    expect(orderViews(ctx())).toEqual([]);
    expect(messagesTo(out, "all", "released").map((m) => (m as { npcId: string }).npcId).some((n) => n.startsWith("stock-"))).toBe(true);
    expect(eventTypes()).toContain("order_cancelled");
  });

  // a real specialist: the runner comes to them and they press E; then they go and find the customer
  it("a real specialist presses E to take the bag, then shows intent to the customer", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    const id = last(startTalk(ctx(), "c1", "e1"), "c1", "turn")!.conversationId;
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(id) as { data: string };
    const data = JSON.parse(row.data);
    data.scene.pending = { kind: "confirm" };
    data.scene.toMove = "customer";
    db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(data), id);
    const out = chooseTurn(ctx(), "c1", id, "opt:yes");
    expect(last(out, "c1", "turn")).toMatchObject({ ended: true });
    expect(last(out, "e1", "staff_menu_end")?.note).toMatch(/Sale agreed/);
    // not yet: the runner is still on the way out
    expect(last(takeOrder(ctx(NOW + 500), "e1"), "e1", "notice")?.text).toMatch(/still on the way/);
    // it arrives beside them; they press E from too far away, then from beside it
    let t = NOW + 2000;
    for (; t < NOW + 40_000; t += 1000) settleIntents(ctx(t));
    positions.set("e1", { x: e.x + 12, z: e.z });
    expect(last(takeOrder(ctx(t), "e1"), "e1", "notice")?.text).toMatch(/Go over to/);
    const runner = JSON.parse((db.prepare("SELECT runner FROM orders").get() as { runner: string }).runner) as { at: { x: number; z: number } };
    // (the runner follows the specialist who moved away; wait for it to arrive again)
    for (let i = 0; i < 60; i++, t += 1000) settleIntents(ctx(t));
    const where = JSON.parse((db.prepare("SELECT runner FROM orders").get() as { runner: string }).runner) as { at: { x: number; z: number } };
    positions.set("e1", { x: where.at.x + 0.5, z: where.at.z });
    expect(runner).toBeDefined();
    const took = takeOrder(ctx(t), "e1");
    expect(last(took, "e1", "notice")?.text).toMatch(/Here you go.*Thanks/s);
    expect(last(took, "all", "intent")).toMatchObject({ fromId: "e1", toId: "c1", reason: "pay", state: "open" });
    expect(orderStage()).toBe("with_spec");
  });
});

// One whole visit, told only by the event log: whoever reads the log can say who did what
// without opening the app (week 10, "logs, narrated").
describe("the event log tells the whole story of a sale", () => {
  it("records the greeting, the chat, the order, the hand-over, the payment and the end, each with who and what", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    tryGreeterApproach(ctx(), "c1");
    expect(eventTypes()).toEqual(expect.arrayContaining(["profile", "npc_approached", "intent_shown"]));
    const p = npc("spec-phones");
    positions.set("c1", { x: p.x + 1, z: p.z });
    const hello = talkAt(startTalk(ctx(), "c1", "spec-phones"));
    const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(hello.conversationId) as { data: string };
    const data = JSON.parse(row.data);
    data.scene.pending = { kind: "confirm" };
    db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(data), hello.conversationId);
    chooseTurn(ctx(), "c1", hello.conversationId, "opt:yes");
    const pay = payFor("c1");
    chooseTurn(ctx(pay.t + 1000), "c1", pay.id, "pay:card");
    const story = (db.prepare("SELECT type FROM events WHERE visitor_id = 'c1' ORDER BY id").all() as Array<{ type: string }>).map((e) => e.type);
    const order = ["conversation_started", "reserved", "stock_checked", "order_placed", "conversation_ended", "stock_handed_over", "intent_shown", "payment_started", "purchase_paid"];
    let at = 0;
    for (const t of order) {
      const i = story.indexOf(t, at);
      expect(i, `${t} should come after the step before it, in ${story.join(" > ")}`).toBeGreaterThanOrEqual(at);
      at = i;
    }
    // every row says who (the visitor) and, where it matters, with whom and what
    const placed = JSON.parse((db.prepare("SELECT data FROM events WHERE type = 'order_placed'").get() as { data: string }).data);
    expect(placed).toMatchObject({ spec: "spec-phones", sale: { colour: expect.any(String), price: expect.any(Number) } });
    // nothing secret in any row
    for (const e of db.prepare("SELECT data FROM events").all() as Array<{ data: string | null }>) expect(e.data ?? "").not.toMatch(/token/i);
  });
});

describe("sitting down to talk it through (Ritesh, 2026-10-19)", () => {
  const T = NOW + 60_000;
  const open = () => {
    const p = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: p.x + 1, z: p.z });
    return last(startTalk(ctx(), "c1", "spec-phones"), "c1", "turn")!;
  };

  it("opens by offering to sit at a free table", () => {
    const hello = open();
    expect(hello.choices.map((c) => c.id)).toEqual(["seat:sit", "seat:stand"]);
    expect(hello.say).toMatch(/sit down at one of the tables/);
  });

  it("walks you to the table and sits you both on the same side, then the talk goes on", () => {
    const hello = open();
    const out = chooseTurn(ctx(), "c1", hello.conversationId, "seat:sit");
    const esc = last(out, "c1", "escort")!;
    expect(esc).toMatchObject({ kind: "seat", npcId: "spec-phones" });
    const lead = last(out, "all", "engaged")!;
    expect(lead.lead).toBeDefined();
    // the menu waits until they are sitting
    expect(last(chooseTurn(ctx(), "c1", hello.conversationId, "anything"), "c1", "notice")?.text).toMatch(/Follow Theo first/);
    // not there yet: nobody sits
    positions.set("c1", { x: 4, z: 0 });
    expect(last(settleIntents(ctx(T)), "all", "seated")).toBeUndefined();
    positions.set("c1", esc.goal);
    const sat = settleIntents(ctx(T));
    const seated = last(sat, "all", "seated")!;
    expect(seated).toMatchObject({ visitorId: "c1" });
    const npcEng = last(sat, "all", "engaged")!;
    expect(npcEng.seated).toBe(true);
    // the same side of the table: the same x, two stools along it
    expect(Math.abs(npcEng.lead!.x - seated.at.x)).toBeLessThan(0.05);
    expect(Math.hypot(npcEng.lead!.z - seated.at.z, 0)).toBeGreaterThan(0.6);
    // the conversation carries on with the scene's own menu
    const menu = last(sat, "c1", "turn")!;
    expect(menu.choices.some((c) => /^Ask for a demo of the/.test(c.label))).toBe(true);
    expect(menu.choices.some((c) => c.id === "seat:sit")).toBe(false); // already sitting
    expect(eventTypes()).toEqual(expect.arrayContaining(["seat_accepted", "seated"]));
  });

  it("stands up for a demo and offers to sit back down after", () => {
    const hello = open();
    const esc = last(chooseTurn(ctx(), "c1", hello.conversationId, "seat:sit"), "c1", "escort")!;
    positions.set("c1", esc.goal);
    const menu = last(settleIntents(ctx(T)), "c1", "turn")!;
    const demo = menu.choices.find((c) => /^Ask for a demo of the (iPhone 17|iPhone 16|iPhone Air)$/.test(c.label))!;
    const out = chooseTurn(ctx(T + 1000), "c1", hello.conversationId, demo.id);
    expect(last(out, "all", "unseated")).toMatchObject({ visitorId: "c1" });
    const walk = last(out, "c1", "escort")!;
    expect(walk.kind).toBe("demo");
    positions.set("c1", walk.goal);
    settleIntents(ctx(T + 40_000)); // the specialist has got there too: the device opens
    const back = last(endInspect(ctx(T + 50_000), "c1", "stopped inspecting"), "c1", "turn")!;
    expect(back.choices.some((c) => c.id === "seat:sit")).toBe(true);
    expect(back.choices.find((c) => c.id === "seat:sit")!.label).toMatch(/sit back down/);
  });

  it("does not offer a table when every table is taken", () => {
    // three conversations, one at each table
    const tables = TABLE_SEATS.map((t) => t.id);
    tables.forEach((id, i) => {
      db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(`z${i}`, `tz${i}`, `Z${i}`);
      db.prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, 'npc', 'phones', 'talk', ?, 0)").run(`zc${i}`, `z${i}`, `spec-x${i}`, JSON.stringify({ engine: "talk", scene: {}, seat: { tableId: id } }));
    });
    const hello = open();
    expect(hello.choices.some((c) => c.id === "seat:sit")).toBe(false);
    expect(hello.say).not.toMatch(/sit down at one of the tables/);
  });
});
