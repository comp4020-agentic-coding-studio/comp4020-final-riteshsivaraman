import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultStorage, productById, START_STOCK } from "../src/shared/catalogue.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import {
  chooseTurn,
  claim,
  customersView,
  enter,
  handOn,
  HOLD_MS,
  leaveConversation,
  leaveStore,
  tryGreeterApproach,
  tryNpcAutoClaim,
  releaseExpired,
  startTalk,
  staffRespond,
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
const eventCount = (): number => (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
const eventTypes = (): string[] => (db.prepare("SELECT type FROM events ORDER BY id").all() as Array<{ type: string }>).map((r) => r.type);

function addVisitor(id: string, name: string, at: { x: number; z: number }, kind: string = "customer", specialty?: string): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind, specialty });
  if (kind !== "customer") employees.push({ id, name, kind: kind as Employee["kind"], specialty: specialty as Employee["specialty"] });
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
    expect(last(done, "all", "released")).toMatchObject({ npcId: "greeter-1" });
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

describe("the phones specialist and stock", () => {
  const storageOf18Pro = defaultStorage(productById("iphone-18-pro")!);
  const storageOf17 = defaultStorage(productById("iphone-17")!);

  // A human-staffed "phones" conversation, not the NPC one: stock reservation
  // is still the old engine's job (shared/conversation.ts). The new talk
  // engine (2026-10-19, service-scene/server-wiring work) only ever drives an
  // NPC-staffed "phones" conversation (usesTalkEngine in service.ts) and its
  // own "bought" ending does not yet reserve real stock — the two product
  // catalogues (src/shared/talk/data.ts, sourced from devices.json, vs
  // src/shared/catalogue.ts's PRODUCTS/stock table) use different ids and
  // were never reconciled by the wiring proposal, so this is a named,
  // deliberate gap (docs/conversation-model/server-wiring-proposal.md), not
  // a silent one. These specs move to a human specialist so the race/holding
  // behaviour they test keeps running on the engine that actually has it.
  function employeeAtColours(employeeId: string, customer: string, product = "iphone-18-pro"): string {
    if (!employees.some((e) => e.id === employeeId)) addVisitor(employeeId, "Sam", { x: 0, z: 0 }, "specialist", "phones");
    positions.set(customer, { x: 1, z: 0 });
    const id = last(startTalk(ctx(), customer, employeeId), customer, "turn")!.conversationId;
    chooseTurn(ctx(), customer, id, "show");
    staffRespond(ctx(), employeeId, id, "reply");
    chooseTurn(ctx(), customer, id, `product:${product}`);
    staffRespond(ctx(), employeeId, id, "reply");
    return id;
  }

  function colourTurn(employeeId: string, customer: string, id: string, choice: string): Outgoing[] {
    chooseTurn(ctx(), customer, id, choice);
    return staffRespond(ctx(), employeeId, id, "reply");
  }

  it("takes a unit off the shelf when you choose one that is in stock, and holds it", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    const id = employeeAtColours("e1", "c1");
    const out = colourTurn("e1", "c1", id, "colour:Glacier");
    expect(last(out, "c1", "turn")?.ended).toBe(true);
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before - 1);
    expect(stateOf(db, "c1")?.state).toBe("in_purchase");
    const r = db.prepare("SELECT status, expires_at FROM reservations WHERE visitor_id = 'c1'").get() as { status: string; expires_at: number };
    expect(r).toEqual({ status: "held", expires_at: NOW + HOLD_MS });
    expect(eventTypes()).toContain("reserved");
  });

  it("will not sell what is out of stock, and says so", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    db.prepare("UPDATE stock SET qty = 0 WHERE product = 'iphone-18-pro' AND colour = 'Silver' AND storage = ?").run(storageOf18Pro);
    const id = employeeAtColours("e1", "c1");
    const out = colourTurn("e1", "c1", id, "colour:Silver");
    expect(last(out, "c1", "turn")?.say).toMatch(/out of stock/);
    expect(last(out, "c1", "turn")?.ended).toBe(false);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations").get()).toEqual({ n: 0 });
    expect(stockOf(db, "iphone-18-pro", "Silver", storageOf18Pro)).toBe(0);
  });

  it("gives a held unit back when the time is up, with no timer (the next call catches up)", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    const id = employeeAtColours("e1", "c1");
    colourTurn("e1", "c1", id, "colour:Glacier");
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before - 1);
    expect(releaseExpired(ctx(NOW + HOLD_MS - 1))).toBe(0);
    expect(releaseExpired(ctx(NOW + HOLD_MS))).toBe(1);
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before);
    expect(eventTypes()).toContain("reservation_expired");
    expect(releaseExpired(ctx(NOW + HOLD_MS * 2))).toBe(0); // only once
  });

  it("gives it back at once when the visitor leaves", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    const before = stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro);
    const id = employeeAtColours("e1", "c1");
    colourTurn("e1", "c1", id, "colour:Glacier");
    leaveStore(ctx(), "c1");
    expect(stockOf(db, "iphone-18-pro", "Glacier", storageOf18Pro)).toBe(before);
    expect(stateOf(db, "c1")?.state).toBe("leaving");
    expect(eventTypes()).toContain("reservation_released");
  });

  it("lets only one of two visitors have the last unit", () => {
    addVisitor("c1", "Pebble", { x: 0, z: 0 });
    addVisitor("c2", "Biscuit", { x: 0, z: 0 });
    expect(START_STOCK["iphone-17"].Black[storageOf17]).toBe(1);
    // c1 first
    const a = employeeAtColours("e1", "c1", "iphone-17");
    colourTurn("e1", "c1", a, "colour:Black");
    expect(stockOf(db, "iphone-17", "Black", storageOf17)).toBe(0);
    // the specialist is free again for c2, and the last unit is gone
    const b = employeeAtColours("e1", "c2", "iphone-17");
    const out = colourTurn("e1", "c2", b, "colour:Black");
    expect(last(out, "c2", "turn")?.say).toMatch(/out of stock/);
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
    const opened = last(startTalk(ctx(), "c1", "spec-phones"), "c1", "turn")!;
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
    const opened = last(startTalk(ctx(), "c1", "spec-phones"), "c1", "turn")!;
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
  it("take the NPC's post: it goes off duty while they are in, and cannot be talked to", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x + 1, z: s.z });
    addVisitor("e1", "Sam", { x: s.x + 2, z: s.z }, "specialist", "phones");
    const out = startTalk(ctx(), "c1", "spec-phones");
    expect(last(out, "c1", "notice")?.text).toMatch(/not on today/);
  });

  it("serve a customer through menus on both sides", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    const open = startTalk(ctx(), "c1", "e1");
    const id = last(open, "c1", "turn")!.conversationId;
    expect(last(open, "all", "engaged")).toBeUndefined(); // only NPCs are "engaged"
    // the customer picks; the employee is asked, the customer waits
    const picked = chooseTurn(ctx(), "c1", id, "show");
    expect(last(picked, "c1", "turn")).toMatchObject({ awaiting: "staff", choices: [] });
    const asked = last(picked, "e1", "staff_turn")!;
    expect(asked.customerPicked).toBe("Show me what you have");
    expect(asked.actions.map((a) => a.id)).toEqual(["reply", "hand_to_genius", "end"]);
    // the customer cannot jump the queue
    expect(last(chooseTurn(ctx(), "c1", id, "leave"), "c1", "notice")?.text).toMatch(/Waiting for Sam/);
    // the employee replies
    const reply = staffRespond(ctx(), "e1", id, "reply");
    expect(last(reply, "c1", "turn")).toMatchObject({ awaiting: "customer" });
    expect(last(reply, "c1", "turn")!.choices.some((c) => c.id.startsWith("product:"))).toBe(true);
    expect(eventTypes()).toEqual(expect.arrayContaining(["turn_waiting_for_staff", "staff_replied"]));
  });

  it("see customers waiting, and claim the one waiting for their post", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const id = last(startTalk(ctx(), "c1", "greeter-1"), "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "phone");
    chooseTurn(ctx(), "c1", id, "help");
    addVisitor("e1", "Sam", { x: 0, z: 0 }, "specialist", "phones");
    addVisitor("e2", "Alex", { x: 0, z: 0 }, "genius");
    const view = customersView(ctx());
    expect(view.map((c) => c.id)).toEqual(["c1"]); // customers only, never employees
    expect(view[0]).toMatchObject({ state: "waiting_for_help", needs: "specialist:phones", want: "phone" });
    // the wrong post cannot claim them
    expect(last(claim(ctx(), "e2", "c1"), "e2", "notice")?.text).toMatch(/waiting for specialist:phones/);
    const out = claim(ctx(), "e1", "c1");
    expect(last(out, "c1", "turn")).toBeDefined();
    expect(stateOf(db, "c1")?.state).toBe("in_conversation");
    expect(stateOf(db, "c1")?.with_id).toBe("e1");
    expect(eventTypes()).toContain("claimed");
  });

  it("hand a waiting customer on with a note the next person can read", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const id = last(startTalk(ctx(), "c1", "greeter-1"), "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "phone");
    chooseTurn(ctx(), "c1", id, "help");
    addVisitor("e1", "Sam", { x: 0, z: 0 }, "greeter");
    handOn(ctx(), "e1", "c1", "genius", "Wants a trade-in quote");
    const v = customersView(ctx())[0];
    expect(v.needs).toBe("genius");
    expect(v.note).toBe("Sam: Wants a trade-in quote");
    expect(eventTypes()).toContain("handed_on");
    // and a post that does not exist is refused
    expect(last(handOn(ctx(), "e1", "c1", "the-moon"), "e1", "notice")?.text).toMatch(/no such post/);
  });

  it("can send a customer on to the Genius Bar, or end politely", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    let id = last(startTalk(ctx(), "c1", "e1"), "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "show");
    const out = staffRespond(ctx(), "e1", id, "hand_to_genius");
    expect(last(out, "c1", "turn")?.ended).toBe(true);
    expect(stateOf(db, "c1")).toMatchObject({ state: "waiting_for_help", needs: "genius" });
    // a fresh start, then end
    id = last(startTalk(ctx(), "c1", "e1"), "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "show");
    staffRespond(ctx(), "e1", id, "end");
    expect(stateOf(db, "c1")?.state).toBe("browsing");
  });

  it("free their customer when they leave mid-conversation", () => {
    const e = { x: -4, z: -3 };
    addVisitor("c1", "Pebble", { x: e.x + 1, z: e.z });
    addVisitor("e1", "Sam", e, "specialist", "phones");
    const id = last(startTalk(ctx(), "c1", "e1"), "c1", "turn")!.conversationId;
    chooseTurn(ctx(), "c1", id, "show");
    const out = leaveStore(ctx(), "e1");
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
    expect(last(out, "all", "released")).toMatchObject({ npcId: "greeter-1" });
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

  it("will not claim through an NPC a human already holds the post for", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x, z: s.z });
    addVisitor("e1", "Sam", s, "specialist", "phones"); // takes the post off duty
    db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'specialist:phones' WHERE visitor_id = 'c1'").run();
    expect(tryNpcAutoClaim(ctx(), "c1")).toEqual([]);
    expect(stateOf(db, "c1")?.state).toBe("waiting_for_help"); // left for the human to claim
  });

  it("will not double-book an NPC already serving someone else", () => {
    const s = npc("spec-phones");
    addVisitor("c1", "Pebble", { x: s.x, z: s.z });
    addVisitor("c2", "Biscuit", { x: s.x, z: s.z });
    for (const id of ["c1", "c2"]) db.prepare("UPDATE player_state SET state = 'waiting_for_help', needs = 'specialist:phones' WHERE visitor_id = ?").run(id);
    expect(last(tryNpcAutoClaim(ctx(), "c1"), "c1", "turn")).toBeDefined();
    expect(tryNpcAutoClaim(ctx(), "c2")).toEqual([]);
  });
});

describe("the greeter approaching a new customer on its own (tryGreeterApproach)", () => {
  it("approaches an arriving customer nearby", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const out = tryGreeterApproach(ctx(), "c1");
    expect(last(out, "c1", "turn")).toMatchObject({ withId: "greeter-1", ended: false });
    expect(stateOf(db, "c1")?.state).toBe("in_conversation");
  });

  it("never approaches the same customer twice", () => {
    const g = npc("greeter-1");
    addVisitor("c1", "Pebble", { x: g.x + 1, z: g.z });
    const first = tryGreeterApproach(ctx(), "c1");
    const id = last(first, "c1", "turn")!.conversationId;
    leaveConversation(ctx(), "c1"); // back to browsing
    expect(stateOf(db, "c1")?.state).toBe("browsing");
    expect(tryGreeterApproach(ctx(), "c1")).toEqual([]);
    expect(db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(id)).not.toEqual({ ended_at: null });
  });

  it("does not approach from across the store", () => {
    addVisitor("c1", "Pebble", { x: 50, z: 50 });
    expect(tryGreeterApproach(ctx(), "c1")).toEqual([]);
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
