import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { seedStock } from "../src/server/stock.ts";
import {
  advancePaymentBeat,
  catchUpOffers,
  cpuCustomersOnFloor,
  enter,
  requestTalk,
  settleVisits,
  staffMove,
  stateOf,
  takeOrder,
  waitingForSpecialist,
  type Ctx,
  type Employee,
  type Outgoing,
} from "../src/server/service.ts";
import { cpuCustomersLive, MAX_CPU_REPLIES } from "../src/server/cpuCustomer.ts";
import { staffActs } from "../src/shared/talk/scene.ts";
import { randomStaff, staffMove as npcStaffMove } from "../src/shared/talk/npc.ts";
import { makeRng } from "../src/shared/talk/rng.ts";
import { CAST, CYCLE } from "../src/shared/storeday.ts";
import type { Scene, StaffAct } from "../src/shared/talk/types.ts";

// Issue #39, SCOPE D55 ("decisions semi-randomly decided by rules, so that they
// behave sensibly, not erratically"), ADR 10. Issues #20/#41 let a real staff
// user be offered and claim a timetable customer, but nothing answered for the
// customer once the conversation opened, so CPU_CUSTOMERS_LIVE had to stay off.
// The promise here: a promoted timetable customer answers a real specialist
// through the SAME phones talk engine a real visitor uses, choosing from the
// same customer menu, with choices that follow from its timetable purpose and
// are seeded from its own id (the same customer on the same day answers the
// same way), and every conversation reaches a real end: a sale, or walking off.
//
// Same fake-clock harness as spec/20 and spec/41: the bridge stands in for
// presence.ts's serviceCtx with the flag on.

const findWaiting = (id: string): number => {
  for (let t = 0; t < CYCLE * 1000; t += 250) if (waitingForSpecialist(id, t)) return t + 1000;
  throw new Error(`setup: ${id} never waits for a specialist in its day`);
};
const purposeOf = (id: string): string | undefined => CAST.find((c) => c.id === id)?.purpose;

describe("a promoted timetable customer answers a real specialist through the talk engine (issue #39)", () => {
  let mem: Database.Database;
  const positions = new Map<string, { x: number; z: number }>();
  const employees: Employee[] = [];
  let present: string[] = [];
  const ctx = (now: number): Ctx => ({ db: mem, now, employees, present, position: (id) => positions.get(id) });
  const fresh = (): void => {
    mem = new Database(":memory:");
    mem.pragma("foreign_keys = ON");
    migrate(mem);
    seedStock(mem);
    positions.clear();
    employees.length = 0;
    present = [];
  };
  afterEach(() => mem?.close());
  const addStaff = (id: string, at: { x: number; z: number }): void => {
    mem.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, id);
    positions.set(id, at);
    present.push(id);
    enter(ctx(0), id, { kind: "specialist" });
    employees.push({ id, name: id, kind: "specialist", specialty: "phones" });
  };
  const bridge = (now: number): void => {
    const floor = cpuCustomersOnFloor(mem, now);
    present = [...present.filter((id) => !id.startsWith("cust-")), ...floor.keys()];
    for (const id of [...positions.keys()]) if (id.startsWith("cust-")) positions.delete(id);
    for (const [id, at] of floor) positions.set(id, at);
  };
  // promoted, and claimed by sam standing next to it
  const claim = (id: string): number => {
    const t0 = findWaiting(id);
    addStaff("sam", { x: 4, z: -2 });
    bridge(t0);
    catchUpOffers(ctx(t0));
    expect(stateOf(mem, id)?.state, `setup: ${id} was not promoted`).toBe("waiting_for_help");
    const at = positions.get(id)!;
    positions.set("sam", { x: at.x + 1, z: at.z });
    requestTalk(ctx(t0 + 10), "sam", id);
    expect(stateOf(mem, id)?.state, `setup: sam could not claim ${id}`).toBe("in_conversation");
    return t0 + 10;
  };
  interface Row {
    id: string;
    data: string;
    ended_at: number | null;
  }
  const convOf = (id: string): Row => mem.prepare("SELECT id, data, ended_at FROM conversations WHERE customer_id = ? ORDER BY started_at, rowid LIMIT 1").get(id) as Row;
  const sceneOf = (r: Row): Scene => (JSON.parse(r.data) as { scene: Scene }).scene;
  const eventsOf = (id: string, type: string): Array<Record<string, unknown>> =>
    (mem.prepare("SELECT data FROM events WHERE visitor_id = ? AND type = ? ORDER BY id").all(id, type) as Array<{ data: string | null }>).map((r) => JSON.parse(r.data ?? "{}") as Record<string, unknown>);
  const menuTo = (out: Outgoing[], who: string): Extract<Outgoing["message"], { type: "staff_menu" }> | undefined =>
    out.map((o) => ("to" in o && o.to === who ? o.message : undefined)).find((m): m is Extract<Outgoing["message"], { type: "staff_menu" }> => m?.type === "staff_menu");

  // A sensible specialist: the engine's own NPC staff policy picks the move,
  // and the spec sends it as the real staff user's act id (its index in the menu).
  const npcPick = (sc: Scene): { actId: string; tone: string } => {
    const { act, tone } = npcStaffMove(sc, randomStaff(makeRng(7)), makeRng(sc.turn + 1));
    const i = staffActs(sc).findIndex((v) => JSON.stringify(v.act) === JSON.stringify(act));
    return { actId: `m${i}`, tone };
  };
  // A specialist who never closes: only ever asks or re-asks, always friendly
  // (friendly offsets a question's patience cost, so the scene's own patience never runs out).
  const stallPick = (sc: Scene): { actId: string; tone: string } => {
    const acts = staffActs(sc);
    const i = acts.findIndex((v: { act: StaffAct }) => v.act.t === "ask" || v.act.t === "answer");
    return { actId: `m${i >= 0 ? i : 0}`, tone: "friendly" };
  };

  // Drives the conversation from sam's side until it ends. After every staff
  // move the customer must already have answered: the move is sam's again.
  const drive = (id: string, t0: number, pick: (sc: Scene) => { actId: string; tone: string }, maxMoves = 80): { t: number; moves: number } => {
    let t = t0;
    let moves = 0;
    for (; moves < maxMoves; moves++) {
      const row = convOf(id);
      if (row.ended_at !== null) break;
      const sc = sceneOf(row);
      expect(sc.toMove, `turn ${sc.turn}: the CPU customer has not answered, it is still waiting on them`).toBe("staff");
      const { actId, tone } = pick(sc);
      t += 1500;
      const out = staffMove(ctx(t), "sam", row.id, actId, tone);
      const after = convOf(id);
      if (after.ended_at !== null) continue;
      const menu = menuTo(out, "sam");
      expect(menu, "sam was not sent a menu after their move").toBeDefined();
      expect(menu!.awaiting, `after sam's move ${actId} the CPU customer did not answer`).toBe("staff");
      expect(menu!.acts.map((a) => a.id), "a CPU customer is held in place and cannot walk to a table, but sam was offered a seat").not.toContain("seat");
    }
    return { t, moves };
  };

  it("answers every move a real specialist makes, from the same customer menu, and the conversation reaches a real end", () => {
    fresh();
    expect(purposeOf("cust-1"), "setup: cust-1 is not a phone customer").toBe("phone");
    const t0 = claim("cust-1");
    drive("cust-1", t0, npcPick);
    const row = convOf("cust-1");
    expect(row.ended_at, "the conversation never ended").not.toBeNull();
    const sc = sceneOf(row);
    const said = sc.log.filter((l) => l.who === "customer");
    expect(said.length, "the CPU customer never said anything").toBeGreaterThan(0);
    for (const l of said) expect(l.text.trim().length, "the CPU customer said an empty line").toBeGreaterThan(0);
    expect(sc.ended?.how, "the conversation ended without a sale or a walk-off").toMatch(/^(bought|left)$/);
    // a phone customer came in for a phone: it never says it is here about something else
    const opening = sc.log.find((l) => l.who === "customer" && sc.answers["opening_intent"] !== undefined);
    if (opening) expect(sc.answers["opening_intent"]!.picks, "a phone customer said it was here about something else").not.toContain("other");
    // every answer is a logged event, and the end is logged
    expect(eventsOf("cust-1", "talk_turn").length, "the CPU customer's answers wrote no events rows").toBeGreaterThanOrEqual(said.length);
    expect(eventsOf("cust-1", "conversation_ended").length).toBe(1);
  });

  it("is not random: the same customer on the same day answers the same way", () => {
    const lines = (): string[] => {
      fresh();
      const t0 = claim("cust-7");
      drive("cust-7", t0, npcPick);
      return sceneOf(convOf("cust-7")).log.filter((l) => l.who === "customer").map((l) => l.text);
    };
    const a = lines();
    const b = lines();
    expect(a.length, "setup: cust-7 said nothing").toBeGreaterThan(0);
    expect(b, "the same customer on the same day answered differently").toEqual(a);
  });

  it("follows its timetable purpose: a customer who came in for something other than a phone says so and the chat ends", () => {
    fresh();
    const other = CAST.find((c) => c.role === "customer" && c.purpose && ["laptop", "tablet", "audio"].includes(c.purpose))!;
    const t0 = claim(other.id);
    // sam opens by asking what brings them in
    const sc = sceneOf(convOf(other.id));
    const i = staffActs(sc).findIndex((v) => v.act.t === "ask" && v.act.qid === "opening_intent");
    expect(i, "setup: the opening question is not on sam's menu").toBeGreaterThanOrEqual(0);
    staffMove(ctx(t0 + 1000), "sam", convOf(other.id).id, `m${i}`, "friendly");
    const row = convOf(other.id);
    expect(sceneOf(row).answers["opening_intent"]?.picks, `a ${other.purpose} customer did not say it was here about something else`).toEqual(["other"]);
    expect(row.ended_at, "the chat did not end after the customer said it was here for something else").not.toBeNull();
  });

  it(`never loops: a specialist who only keeps asking is walked out on within ${MAX_CPU_REPLIES} answers`, () => {
    fresh();
    const t0 = claim("cust-1");
    const { moves } = drive("cust-1", t0, stallPick, 200);
    const row = convOf("cust-1");
    expect(row.ended_at, "a specialist who only keeps asking kept the CPU customer forever").not.toBeNull();
    expect(moves).toBeLessThanOrEqual(MAX_CPU_REPLIES + 2);
    const sc = sceneOf(row);
    expect(sc.ended?.how).toBe("left");
    expect(sc.log.filter((l) => l.who === "customer").length).toBeLessThanOrEqual(MAX_CPU_REPLIES);
  });

  it("buys for real: takes a unit off the shelf, waits for the bag, and pays a beat after the total is shown", () => {
    // find, deterministically, a phone customer whose answers end in a sale with this specialist
    const buyers = CAST.filter((c) => c.role === "customer" && c.purpose === "phone").map((c) => c.id);
    let buyer: string | undefined;
    let t = 0;
    for (const id of buyers) {
      fresh();
      const t0 = claim(id);
      t = drive(id, t0, npcPick).t;
      if (sceneOf(convOf(id)).ended?.how === "bought") {
        buyer = id;
        break;
      }
    }
    expect(buyer, "no phone customer ever bought from a sensible specialist").toBeDefined();
    const id = buyer!;
    const order = (): { id: string; stage: string } | undefined => mem.prepare("SELECT id, stage FROM orders WHERE customer_id = ?").get(id) as { id: string; stage: string } | undefined;
    expect(order()?.stage, "the sale did not place an order").toBe("fetching");
    expect((mem.prepare("SELECT COUNT(*) AS n FROM reservations WHERE visitor_id = ? AND status = 'held'").get(id) as { n: number }).n, "the sale did not hold a unit").toBe(1);

    // the runner brings the bag to sam, who takes it with E; sam is standing next to the customer
    for (let k = 0; k < 120 && order()?.stage === "fetching"; k++) {
      t += 1000;
      bridge(t);
      settleVisits(ctx(t));
      takeOrder(ctx(t), "sam");
    }
    expect(order()?.stage, "sam never got the bag").not.toBe("fetching");
    // sam is already with the customer: the payment opens a beat later
    for (let k = 0; k < 10 && order()?.stage === "with_spec"; k++) {
      t += 600;
      bridge(t);
      settleVisits(ctx(t));
    }
    expect(order()?.stage, "the payment never opened").toBe("paying");
    const pay = mem.prepare("SELECT id FROM conversations WHERE customer_id = ? AND ended_at IS NULL").get(id) as { id: string };
    // sam shows the total on the handheld; the customer does not tap in the same instant
    advancePaymentBeat(ctx(t + 100), "sam", pay.id);
    catchUpOffers(ctx(t + 200));
    expect(order()?.stage, "the customer tapped the instant the total was shown").toBe("paying");
    expect(eventsOf(id, "total_shown").length).toBe(1);
    // ...and taps a beat later, with no further click from sam (the client has no handheld button yet)
    t += 2000;
    bridge(t);
    catchUpOffers(ctx(t));
    expect(order()?.stage, "the CPU customer never paid after the total was shown").toBe("done");
    expect(eventsOf(id, "purchase_paid").length).toBe(1);
    expect((mem.prepare("SELECT COUNT(*) AS n FROM reservations WHERE visitor_id = ? AND status = 'sold'").get(id) as { n: number }).n, "the unit was not sold").toBe(1);
    // served and paid: it leaves the store
    t += 1000;
    bridge(t);
    catchUpOffers(ctx(t));
    expect(stateOf(mem, id)?.state, "the customer stayed after paying").toBe("leaving");
  });

  it("the live switch is on by default, and can still be turned off", () => {
    expect(cpuCustomersLive({}), "CPU customers are still off by default").toBe(true);
    expect(cpuCustomersLive({ CPU_CUSTOMERS_LIVE: "0" })).toBe(false);
    expect(cpuCustomersLive({ CPU_CUSTOMERS_LIVE: "1" })).toBe(true);
  });
});
