import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { seedStock } from "../src/server/stock.ts";
import { catchUpOffers, cpuCustomersOnFloor, customersView, enter, leaveConversation, leaveStore, requestTalk, stateOf, waitingForSpecialist, type Ctx, type Employee } from "../src/server/service.ts";

// Issue #20, ADR 0010 (decided: Option B, lazy materialization), SCOPE D55/D56.
// Promise: a CPU/timetable customer (storeday.ts's CAST, e.g. "cust-1") is not
// a separate, lesser kind of customer. The moment it would appear on the
// internal waiting list (D47) it gets a real player_state row through the
// SAME code path a real visitor already uses (issue #1's catchUpOffers /
// settleOffers / waitingList), so a free real staff member can be offered
// and claim it exactly as they would a real visitor -- no human-vs-CPU
// branch anywhere. A CPU customer nobody ever interacts with costs nothing:
// no row, ever (D56's "ambient majority" promise).
//
// What this file deliberately does NOT test (out of scope, per the issue's
// own "out of scope" note and the brief given to this spec-writer):
//  - the rule engine's decision policy (what a promoted CPU customer asks
//    for, when it walks off, how it answers a slot) -- "sensible, not
//    erratic" per D55 is real, separate design/build work. Where a choice is
//    needed here (e.g. the customer's state right after promotion) this file
//    only asserts it lands in a legitimate waiting state, never which one.
//  - which storeday.ts segment should trigger promotion (criterion 1 says
//    "no later than the moment they'd appear on the waiting list" -- that
//    moment is a server-side decision the builder has to wire up from
//    momentOf's purpose/segment; this file does not try to read storeday.ts
//    segments to predict it). Instead this file does what issue #1's own
//    fake-clock block already does: hands the service layer a `present`/
//    `position` entry for a CPU id directly, standing in for whatever bridge
//    code (presence.ts or similar) will eventually notice a CPU customer is
//    on the floor and needing help. `catchUpOffers` is the one function
//    already documented as "called on every request that could change the
//    picture" (service.ts) -- it is the one correct seam for "promote no
//    later than waiting-list time," and it is a real exported function, not
//    an internal one invented for this test.
//  - live WebSocket drive: today there is NO code path at all connecting a
//    momentOf-present CPU id into presence.ts's `ctx.present`/`position`, so
//    there is nothing for a live client to observe yet; a live test would
//    only be possible after this issue is built, and belongs in a follow-up
//    pass once the presence-bridge wiring exists. This mirrors spec #1's own
//    choice to drop to the fake-clock harness for scenarios the live
//    timetable cannot be made to arrange.

const OFFER_WINDOW_MS = 15_000; // D48, same constant issue #1 pins

describe("a CPU/timetable customer joins the real waiting list (issue #20, ADR 0010 Option B)", () => {
  const NOW = 1000;
  let mem: Database.Database;
  const positions = new Map<string, { x: number; z: number }>();
  const employees: Employee[] = [];
  const present: string[] = [];
  const ctx = (now = NOW): Ctx => ({ db: mem, now, employees, present, position: (id) => positions.get(id) });
  const fresh = (): void => {
    mem = new Database(":memory:");
    mem.pragma("foreign_keys = ON");
    migrate(mem);
    seedStock(mem);
    positions.clear();
    employees.length = 0;
    present.length = 0;
  };
  afterEach(() => mem?.close());

  // A real visitor: inserts the visitors row and calls enter(), as presence.ts
  // does on join. This is the path that already works today.
  const addRealVisitor = (id: string, at: { x: number; z: number }, kind: "customer" | "specialist" = "customer"): void => {
    mem.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, id);
    positions.set(id, at);
    present.push(id);
    enter(ctx(), id, { kind });
    if (kind !== "customer") employees.push({ id, name: id, kind, specialty: "phones" });
  };

  // A CPU/timetable customer the floor has noticed (standing in for the
  // presence-bridge wiring this issue has to add): present and positioned,
  // exactly as momentOf would place it, but with NO visitors row and NO
  // player_state row -- the thing that is missing today.
  const presentCpu = (id: string, at: { x: number; z: number }): void => {
    positions.set(id, at);
    present.push(id);
  };

  const offeredTo = (id: string): string | undefined => {
    const st = stateOf(mem, id);
    if (!st?.data) return undefined;
    return (JSON.parse(st.data) as { offer?: { to: string } }).offer?.to;
  };
  const eventsOf = (id: string): Array<{ type: string; data: Record<string, unknown> }> =>
    (mem.prepare("SELECT type, data FROM events WHERE visitor_id = ? ORDER BY id").all(id) as Array<{ type: string; data: string | null }>).map((r) => ({
      type: r.type,
      data: JSON.parse(r.data ?? "{}") as Record<string, unknown>,
    }));
  const WAITING: ReadonlyArray<string> = ["arriving", "waiting_for_help"];

  it("gets a real player_state row the moment it would appear on the waiting list, and is offered to a free real staff member exactly as a real visitor is (criteria 1, 2)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    presentCpu("cust-1", { x: 0, z: -8 }); // storeday.ts's own id for a phone-purpose timetable customer

    // before any interaction: nothing exists for this id at all (the gap this
    // issue closes -- today stateOf(db, "cust-1") is undefined because
    // nothing ever inserts a row for a timetable customer)
    expect(stateOf(mem, "cust-1"), "cust-1 already has a player_state row before anything touched it").toBeUndefined();
    expect(mem.prepare("SELECT 1 FROM visitors WHERE id = ?").get("cust-1"), "cust-1 already has a visitors row before anything touched it").toBeUndefined();

    // the same call a real visitor's arrival drives (issue #1's catchUpOffers)
    catchUpOffers(ctx(), "cust-1");

    const st = stateOf(mem, "cust-1");
    expect(st, "no player_state row was created for the CPU customer on reaching the waiting list").toBeDefined();
    expect(WAITING, "the promoted row's state is not a legitimate waiting state").toContain(st!.state);
    // claimable and offered exactly as issue #1 already proves for a real visitor
    expect(offeredTo("cust-1"), "the free real staff member was not offered the CPU customer").toBe("sam");
  });

  it("the offered staff member can claim the CPU customer with the same mechanism as a real visitor: same conversation open, same claim event, same 15 s window reused (criterion 2)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    presentCpu("cust-2", { x: 0, z: -8 });
    catchUpOffers(ctx(), "cust-2");
    expect(offeredTo("cust-2")).toBe("sam");

    requestTalk(ctx(NOW + 10), "sam", "cust-2");

    expect(stateOf(mem, "cust-2")?.state, "the claim did not open a conversation with the CPU customer").toBe("in_conversation");
    expect(stateOf(mem, "cust-2")?.with_id).toBe("sam");
    expect(eventsOf("cust-2").find((e) => e.type === "staff_approached")?.data).toMatchObject({ staffId: "sam" });
    expect(mem.prepare("SELECT with_id FROM conversations WHERE customer_id = ? AND ended_at IS NULL").get("cust-2")).toEqual({ with_id: "sam" });

    // the 15 s window is the SAME mechanism, not a copy: a second real staff
    // member who shows up later does not also get offered a customer already
    // claimed (this would only pass if the CPU customer's offer data really
    // lives in the same player_state.data shape issue #1 already settles)
    addRealVisitor("tia", { x: 0, z: -7 }, "specialist");
    catchUpOffers(ctx(NOW + OFFER_WINDOW_MS + 1000));
    expect(offeredTo("cust-2"), "a second staff member was offered a CPU customer already claimed by the first").toBeUndefined();
  });

  it("a CPU customer never interacted with gets no row at all -- no eager materialization (criteria 3, 4)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    // cust-3 is on the timetable and even present, but nothing ever asks
    // about it: no catchUpOffers call ever names it or scans a list it is on
    presentCpu("cust-1", { x: 0, z: -8 });
    catchUpOffers(ctx(), "cust-1"); // promotes cust-1 only

    // cust-9 is never mentioned anywhere -- never promoted, so it costs nothing
    expect(stateOf(mem, "cust-9"), "an uninteracted CPU customer got a player_state row anyway").toBeUndefined();
    expect(mem.prepare("SELECT 1 FROM visitors WHERE id = ?").get("cust-9"), "an uninteracted CPU customer got a visitors row anyway").toBeUndefined();
    expect(eventsOf("cust-9"), "an uninteracted CPU customer has events logged for it").toEqual([]);
  });

  it("on release, the promoted customer leaves and is not re-offered or re-admitted to the waiting list, even though it is still 'present' on the floor (criterion 5)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    presentCpu("cust-1", { x: 0, z: -8 });
    catchUpOffers(ctx(), "cust-1");
    requestTalk(ctx(NOW + 10), "sam", "cust-1");
    expect(stateOf(mem, "cust-1")?.state).toBe("in_conversation");

    // release, the same function a real visitor's departure already uses --
    // no special-casing by human-vs-CPU (D55's own framing)
    leaveStore(ctx(NOW + 5000), "cust-1");
    expect(stateOf(mem, "cust-1")?.state).toBe("leaving");

    // cust-1 is still in `present` (storeday.ts's own pure momentOf would
    // keep walking it through its original schedule segment -- ADR 0010's
    // decision is that nothing hands the id back to resume that segment, so
    // a later catchUpOffers must not revive it onto the waiting list)
    addRealVisitor("tia", { x: 0, z: -7 }, "specialist");
    catchUpOffers(ctx(NOW + 20_000));
    expect(offeredTo("cust-1"), "a released CPU customer was offered again as if it had resumed waiting").toBeUndefined();
    expect(stateOf(mem, "cust-1")?.state, "a released CPU customer's state reverted to a waiting state on its own").toBe("leaving");
  });

  it("every promotion, claim and departure of a promoted CPU customer writes its own events row, same as a real visitor (criterion 6)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    presentCpu("cust-1", { x: 0, z: -8 });

    catchUpOffers(ctx(), "cust-1");
    // promotion itself is an events-worthy fact, not a silent row insert
    expect(eventsOf("cust-1").length, "no events row at all was written when the CPU customer was promoted").toBeGreaterThan(0);
    expect(eventsOf("cust-1").some((e) => /promot/i.test(e.type)), `no promotion-labelled event (saw: ${eventsOf("cust-1").map((e) => e.type).join(", ")})`).toBe(true);

    requestTalk(ctx(NOW + 10), "sam", "cust-1");
    expect(eventsOf("cust-1").some((e) => e.type === "staff_approached" || e.type === "conversation_started"), "the claim wrote no events row").toBe(true);

    leaveStore(ctx(NOW + 5000), "cust-1");
    expect(eventsOf("cust-1").some((e) => e.type === "state" || e.type === "left"), "the departure wrote no events row").toBe(true);
  });

  it("no regression: a real visitor is still offered ahead of a promoted CPU customer waiting at the same time, oldest real wait first (criterion 7, D47/D48)", () => {
    fresh();
    addRealVisitor("sam", { x: 0, z: -6 }, "specialist");
    addRealVisitor("ann", { x: 0, z: -3 }); // a real visitor customer, waiting first
    mem.prepare("UPDATE player_state SET since = ? WHERE visitor_id = ?").run(NOW - 5000, "ann");
    presentCpu("cust-1", { x: 0, z: -3.2 }); // a CPU customer arrives after, right beside her

    catchUpOffers(ctx(), "ann");

    // only one free staff member: the real visitor who waited longest gets
    // the offer, exactly as issue #1 already proves without any CPU customer
    // in the room -- promoting cust-1 must not change this ordering
    expect(offeredTo("ann"), "the real visitor was not offered the only free staff member").toBe("sam");
    expect(offeredTo("cust-1"), "the CPU customer was offered the staff member ahead of the longer-waiting real visitor").toBeUndefined();
  });
});

// Added by the #20 builder: the parts of the mechanism the block above never
// reaches, so that breaking any of them turns the suite red (CLAUDE.md defect
// loop: promotion is the kind of rule a subtly wrong version passes every
// normal run). The bridge is `cpuCustomersOnFloor`, the function presence.ts
// merges into ctx.present/position (behind CPU_CUSTOMERS_LIVE until the client
// can claim a timetable customer).
describe("the timetable bridge, the D47 gate and the visit rule (issue #20, builder's sensors)", () => {
  const CYCLE_MS = 480_000; // storeday.ts CYCLE
  // cust-1's timetable has it standing at a phones table, waiting for spec-phones, from about 25.9 s into the day
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
  // what presence.ts does with the bridge: the floor's timetable customers join present/position
  const bridge = (now: number): void => {
    const floor = cpuCustomersOnFloor(mem, now);
    present = [...present.filter((id) => !id.startsWith("cust-")), ...floor.keys()];
    for (const id of [...positions.keys()]) if (id.startsWith("cust-")) positions.delete(id);
    for (const [id, at] of floor) positions.set(id, at);
  };
  const types = (id: string): string[] => (mem.prepare("SELECT type FROM events WHERE visitor_id = ? ORDER BY id").all(id) as Array<{ type: string }>).map((r) => r.type);

  it("puts a timetable customer on the floor only while its timetable has it waiting for a specialist, and never someone ambient", () => {
    fresh();
    expect(waitingForSpecialist("cust-1", WAITING_AT)).toBe(true);
    expect(cpuCustomersOnFloor(mem, WAITING_AT).has("cust-1"), "cust-1 is waiting for a specialist but the bridge left it off the floor").toBe(true);
    expect(cpuCustomersOnFloor(mem, 5_000).has("cust-1"), "cust-1 has not even arrived but the bridge put it on the floor").toBe(false);
    expect(cpuCustomersOnFloor(mem, 15_000).has("cust-1"), "cust-1 is only being greeted but the bridge put it on the floor").toBe(false);
    expect(cpuCustomersOnFloor(mem, 40_000).has("cust-1"), "cust-1 is chatting with its timetable specialist but the bridge put it on the floor").toBe(false);
  });

  it("with no free real staff user, nothing is promoted: the timetable's own specialist serves them (D47, D56)", () => {
    fresh();
    bridge(WAITING_AT);
    catchUpOffers(ctx(WAITING_AT));
    expect(stateOf(mem, "cust-1"), "a timetable customer got a row with no real staff user to serve it").toBeUndefined();
    expect(mem.prepare("SELECT 1 FROM visitors WHERE id = ?").get("cust-1")).toBeUndefined();
  });

  it("a promoted customer is held where it was promoted, then leaves when its visit is over, through leaveStore, logged", () => {
    fresh();
    addStaff("sam", { x: 4, z: -2 });
    bridge(WAITING_AT);
    const spot = positions.get("cust-1")!;
    catchUpOffers(ctx(WAITING_AT));
    expect(stateOf(mem, "cust-1")?.state).toBe("waiting_for_help");
    // later the timetable would have walked it on: it stays where it was promoted
    expect(cpuCustomersOnFloor(mem, 60_000).get("cust-1"), "a promoted customer was not held at its promotion spot").toEqual(spot);
    // after its day has it out of the store, the bridge drops it and the next catch-up sees it off
    expect(cpuCustomersOnFloor(mem, 470_000).has("cust-1"), "a promoted customer whose visit is over is still on the floor").toBe(false);
    bridge(470_000);
    catchUpOffers(ctx(470_000));
    expect(stateOf(mem, "cust-1")?.state, "a promoted customer whose visit ended never left").toBe("leaving");
    expect(types("cust-1")).toContain("cpu_customer_departed");
  });

  it("served and released by the staff user, it leaves at once and is off the floor for the rest of that visit, but its next day's visit can be promoted again", () => {
    fresh();
    addStaff("sam", { x: 4, z: -2 });
    bridge(WAITING_AT);
    const at = positions.get("cust-1")!;
    positions.set("sam", { x: at.x + 1, z: at.z });
    catchUpOffers(ctx(WAITING_AT));
    requestTalk(ctx(WAITING_AT + 10), "sam", "cust-1");
    expect(stateOf(mem, "cust-1")?.state).toBe("in_conversation");
    // the staff user ends it: the customer is back to browsing, then leaves on the next catch-up
    leaveConversation(ctx(WAITING_AT + 20), "sam");
    expect(stateOf(mem, "cust-1")?.state).toBe("browsing");
    bridge(WAITING_AT + 30);
    catchUpOffers(ctx(WAITING_AT + 30));
    expect(stateOf(mem, "cust-1")?.state, "a served timetable customer did not leave").toBe("leaving");
    expect(types("cust-1").filter((t) => t === "cpu_customer_departed")).toHaveLength(1);
    // same visit: its timetable still has it at the table, but it never comes back onto the floor or the list
    expect(cpuCustomersOnFloor(mem, WAITING_AT + 500).has("cust-1"), "a released customer came back onto the floor in the same visit").toBe(false);
    present.push("cust-1");
    positions.set("cust-1", at);
    catchUpOffers(ctx(WAITING_AT + 600));
    expect(stateOf(mem, "cust-1")?.state, "a released customer was promoted again in the same visit").toBe("leaving");
    // the next day: a new visit, promoted afresh
    const nextDay = CYCLE_MS + WAITING_AT;
    bridge(nextDay);
    expect(positions.has("cust-1"), "the next day's visit never reached the floor").toBe(true);
    catchUpOffers(ctx(nextDay));
    expect(stateOf(mem, "cust-1")?.state, "the next day's visit was not promoted").toBe("waiting_for_help");
    expect(types("cust-1").filter((t) => t === "cpu_customer_promoted")).toHaveLength(2);
  });
});
