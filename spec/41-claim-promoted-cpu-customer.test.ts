import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { seedStock } from "../src/server/stock.ts";
import { catchUpOffers, cpuCustomersOnFloor, customersView, enter, heldCpuCustomers, leaveConversation, requestTalk, stateOf, type Ctx, type Employee } from "../src/server/service.ts";
import { heldDone, heldMoment, heldTalkCandidates } from "../src/shared/heldCpu.ts";
import { momentOf } from "../src/shared/storeday.ts";
import type { HeldCpu } from "../src/shared/protocol.ts";

// Issue #41: the client half of #20. A timetable customer the store's rules
// have taken over (promoted onto the waiting list) must be something a real
// staff user can see held in place, see an offer marker over, and press E at,
// exactly as a real visitor customer. What every client draws comes from two
// things the server sends: `held_cpu` (service.ts heldCpuCustomers) to all,
// and CustomerView (customersView) to staff; the client turns them into a
// pose and an E-hint candidate through shared/heldCpu.ts. The 3D mounting
// itself (Npcs.tsx, Store.tsx) is checked by the feel-check, not here.
//
// Same fake-clock harness as spec/20's second block: cust-1's timetable has it
// standing at a phones table waiting for a specialist from about 25.9 s into
// the day, and walks it on to its chat with spec-phones by 40 s.
describe("a promoted timetable customer can be seen, marked and claimed by a real staff user (issue #41)", () => {
  const WAITING_AT = 27_000;
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
  // what presence.ts's serviceCtx does with the bridge when CPU_CUSTOMERS_LIVE is on
  const bridge = (now: number): void => {
    const floor = cpuCustomersOnFloor(mem, now);
    present = [...present.filter((id) => !id.startsWith("cust-")), ...floor.keys()];
    for (const id of [...positions.keys()]) if (id.startsWith("cust-")) positions.delete(id);
    for (const [id, at] of floor) positions.set(id, at);
  };
  const promote = (): { x: number; z: number } => {
    addStaff("sam", { x: 4, z: -2 });
    bridge(WAITING_AT);
    const spot = { ...positions.get("cust-1")! };
    catchUpOffers(ctx(WAITING_AT));
    expect(stateOf(mem, "cust-1")?.state, "setup: cust-1 was not promoted").toBe("waiting_for_help");
    return spot;
  };
  const heldMap = (now: number): Map<string, HeldCpu> => new Map(heldCpuCustomers(mem, now).map((h) => [h.id, h]));
  const noChats = new Set<string>();

  it("before promotion nobody is held and no timetable customer is an E-hint candidate", () => {
    fresh();
    addStaff("sam", { x: 4, z: -2 });
    bridge(WAITING_AT);
    expect(heldCpuCustomers(mem, WAITING_AT), "an unpromoted timetable customer was sent as held").toEqual([]);
    expect(heldTalkCandidates(heldMap(WAITING_AT).values(), noChats, WAITING_AT)).toEqual([]);
  });

  it("once promoted it is sent to every client as held at its promotion spot, and is an E-hint candidate there (criterion 1)", () => {
    fresh();
    const spot = promote();
    const held = heldMap(WAITING_AT + 1000);
    expect(held.get("cust-1")?.at, "the promoted customer was not sent as held at its spot").toEqual(spot);
    expect(held.get("cust-1")?.leftAt).toBeUndefined();
    const cands = heldTalkCandidates(held.values(), noChats, WAITING_AT + 1000);
    expect(cands.map((c) => c.id), "a promoted customer is not a staff E-hint candidate").toEqual(["cust-1"]);
    expect({ x: cands[0]!.x, z: cands[0]!.z }, "the E hint aims at somewhere other than where the server holds it").toEqual(spot);
    expect(cands[0]!.name, "the E hint names the customer by its id, not its name").not.toBe("cust-1");
  });

  it("staff see where it is held and whom it is offered to, the fields the OfferMarker draws from (criterion 2)", () => {
    fresh();
    const spot = promote();
    const view = customersView(ctx(WAITING_AT + 1000)).find((c) => c.id === "cust-1");
    expect(view, "the promoted customer is missing from the staff view").toBeDefined();
    expect(view!.offeredTo, "the promoted customer was not offered to the free real staff user").toBe("sam");
    expect(view!.offerUntil).toBeGreaterThan(WAITING_AT);
    expect(view!.at, "the staff view does not say where the promoted customer is held").toEqual(spot);
  });

  it("is drawn held at its spot while its timetable has walked on, not along the timetable (criterion 3)", () => {
    fresh();
    const spot = promote();
    const later = 45_000; // the timetable has it chatting with spec-phones somewhere else by now
    const t = momentOf("cust-1", later);
    expect(Math.hypot(t.x - spot.x, t.z - spot.z), "setup: the timetable did not move cust-1 on, so this test proves nothing").toBeGreaterThan(0.5);
    const h = heldMap(later).get("cust-1");
    expect(h, "a promoted customer still waiting was dropped from the held list").toBeDefined();
    const m = heldMoment(h!, later);
    expect(m, "a held customer was drawn as gone").not.toBeNull();
    expect({ x: m!.x, z: m!.z }, "a held customer was drawn on its timetable path, not at its spot").toEqual(spot);
    expect(m!.walking).toBe(false);
  });

  it("while staff are talking with it, it is not offered for E again", () => {
    fresh();
    const spot = promote();
    positions.set("sam", { x: spot.x + 1, z: spot.z });
    requestTalk(ctx(WAITING_AT + 10), "sam", "cust-1");
    expect(stateOf(mem, "cust-1")?.state).toBe("in_conversation");
    const chatting = new Set(["cust-1", "sam"]); // net.chats as the chats message builds it
    expect(heldTalkCandidates(heldMap(WAITING_AT + 20).values(), chatting, WAITING_AT + 20)).toEqual([]);
  });

  it("once served it walks out of the door from its spot, and is handed back to its timetable only once its day has it out of the store (criterion 3)", () => {
    fresh();
    const spot = promote();
    positions.set("sam", { x: spot.x + 1, z: spot.z });
    requestTalk(ctx(WAITING_AT + 10), "sam", "cust-1");
    leaveConversation(ctx(WAITING_AT + 20), "sam");
    bridge(WAITING_AT + 30);
    catchUpOffers(ctx(WAITING_AT + 30));
    expect(stateOf(mem, "cust-1")?.state, "setup: the served customer did not leave").toBe("leaving");

    const leftAt = stateOf(mem, "cust-1")!.since;
    const h = heldMap(WAITING_AT + 31).get("cust-1");
    expect(h?.leftAt, "a customer that left was not sent with when it left").toBe(leftAt);
    expect(heldTalkCandidates([h!], noChats, WAITING_AT + 31), "a customer that has left is still an E-hint candidate").toEqual([]);
    // it starts from where it was held, and is walking away from it
    const first = heldMoment(h!, leftAt)!;
    expect(Math.hypot(first.x - spot.x, first.z - spot.z)).toBeLessThan(0.2);
    const soon = heldMoment(h!, leftAt + 3000)!;
    expect(soon.walking, "a leaving customer is not walking").toBe(true);
    expect(soon.z, "a leaving customer is not heading for the door at the front of the shop").toBeLessThan(spot.z);
    // its timetable still has it in the store this visit: it is not drawn there, nor let go
    const stillToday = 70_000; // cust-1's day has it out of the door at about 82 s
    expect(momentOf("cust-1", stillToday).present, "setup: the timetable no longer has cust-1 in the store").toBe(true);
    expect(heldMoment(h!, stillToday), "a departed customer reappeared after walking out").toBeNull();
    expect(heldMap(stillToday).has("cust-1"), "a departed customer was handed back to its timetable while its day still had it inside").toBe(true);
    // once its day has it out of the store, the timetable has it again
    const gone = 470_000;
    expect(heldDone(h!, gone)).toBe(true);
    expect(heldMap(gone).has("cust-1"), "a departed customer whose visit is over is still held off its timetable").toBe(false);
  });
});
