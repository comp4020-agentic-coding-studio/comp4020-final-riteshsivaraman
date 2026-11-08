import Database from "better-sqlite3";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.ts";
import type { Profile } from "../src/shared/profile.ts";
import { migrate } from "../src/server/migrate.ts";
import { seedStock } from "../src/server/stock.ts";
import { catchUpOffers, customersView, enter, handOverPost, leaveStore, OFFER_MS, rejoin, releaseClaimsOf, requestTalk, stateOf, type Ctx, type Employee, type Outgoing } from "../src/server/service.ts";

// Issue #1, SCOPE D47 and D48. Promise: given a waiting customer, a free real
// staff user is offered the customer before any CPU, exactly one staff member
// ends up with a customer, and a CPU only takes a customer after the 15 s
// window with no real claim. Every offer, claim and takeover writes an events
// row that names who did it (CLAUDE.md: the event log is load-bearing).
//
// Real WebSockets, separate visitors, and the SQLite file read the way CLAUDE.md
// prescribes ("did it save?" means opening the file). This file starts its OWN
// server, not the shared one from global-setup, for two reasons: it has to know
// the database path to read the events table, and the CPU greeter is a shared
// singleton, so a private server keeps this file's timing from touching any
// other spec's.
//
// What is deliberately NOT pinned, because the issue does not pin it:
//  - the wire shape of the offer (the "marker" and the HUD ping, acceptance
//    criterion 1): no message type or field is named anywhere, so the offer is
//    asserted through its events row. Judged by eye in the feel-check.
//  - the exact event type names: an offer row is any type matching /offer/i, a
//    claim row /claim|staff_approached/ (the second is what a staff E press
//    already writes today), a CPU takeover row /npc_approached|npc_claimed|takeover/.
//    Each must name the staff member (or NPC) and the customer.
// Criterion 6 (a claim released on disconnect) and the pass-on to the next
// nearest (criterion 3) are pinned at the bottom against the store service
// with an in-memory database and a fake clock, as spec/service.test.ts does:
// a real 15 s wait per step would make them slow, and the release needs
// every NPC of the post busy, which the live store's timetable cannot be made
// to arrange. Criterion 6 follows Ritesh's ruling (2026-11-07, option A): an
// NPC of the post carries a conversation on if one is free (`handOverPost`),
// and only when none is the customer goes back on the waiting list.
// Criterion 8 (no timers) is a static property, left to review.

const OFFER_WINDOW_MS = 15_000; // D48
let child: ChildProcess;
let dir: string;
let wsUrl: URL;
let db: Database.Database;

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

beforeAll(async () => {
  const port = await freePort();
  dir = mkdtempSync(pathJoin(tmpdir(), "store-spec-offer-"));
  child = spawn("npx", ["tsx", "src/server/index.ts"], {
    // No timetable customers on this server's floor. The waiting list is
    // oldest-first with no real-vs-CPU priority (Ritesh, 2026-11-08, issue #39
    // option B), so a timetable customer who happens to be waiting on the real
    // clock would hold the lone real specialist's one offer, and these tests
    // would pass or fail by the time of day. This block is about real visitors
    // and the CPU greeter; promoted timetable customers on the same list are
    // pinned on a fake clock in spec/20, spec/41 and spec/39.
    env: { ...process.env, PORT: String(port), DATABASE_PATH: pathJoin(dir, "store.db"), CPU_CUSTOMERS_LIVE: "0" },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      if (attempt >= 300) throw new Error(`the private server never answered at ${baseUrl}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  wsUrl = new URL("/ws", baseUrl);
  wsUrl.protocol = "ws:";
  db = new Database(pathJoin(dir, "store.db"), { readonly: true });
}, 90_000);

afterAll(() => {
  db?.close();
  child?.kill();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

class Visitor {
  readonly socket = new WebSocket(wsUrl.href);
  readonly messages: ServerMessage[] = [];
  id = "";
  constructor() {
    this.socket.on("message", (raw) => this.messages.push(JSON.parse(raw.toString()) as ServerMessage));
  }
  send(m: ClientMessage): void {
    this.socket.send(JSON.stringify(m));
  }
  async join(profile: Profile): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.send({ type: "hello", token: null, profile });
    const w = (await this.next((m) => m.type === "welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    this.id = w.you.id;
  }
  polls = 0;
  async next(want: (m: ServerMessage) => boolean, ms = 4000, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.slice(from).find(want);
      if (found) return found;
      if (this.id && ++this.polls % 25 === 0) this.send({ type: "settle" }); // the real client polls like this
      await pause(20);
    }
    throw new Error(`timed out waiting for a message (have: ${this.messages.map((m) => (m.type === "notice" ? `notice "${m.text}"` : m.type)).join(", ")})`);
  }
  mark(): number {
    return this.messages.length;
  }
  turnsFrom(from = 0): Array<Extract<ServerMessage, { type: "turn" }>> {
    return this.messages.slice(from).filter((m): m is Extract<ServerMessage, { type: "turn" }> => m.type === "turn");
  }
  /** teleport (the server clamps and collides; there is no speed limit) and give it a presence tick */
  async goto(x: number, z: number): Promise<void> {
    for (let i = 0; i < 2; i++) {
      this.send({ type: "move", x, z, ry: 0 });
      await pause(60);
    }
  }
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const open: Visitor[] = [];
afterEach(async () => {
  for (const v of open) v.send({ type: "bye" });
  await pause(150);
  for (const v of open.splice(0)) v.socket.close();
});
const join = async (profile: Profile): Promise<Visitor> => {
  const v = new Visitor();
  open.push(v);
  await v.join(profile);
  return v;
};
const specialist = (name: string): Promise<Visitor> => join({ kind: "specialist", specialty: "phones", name });
const customer = (name: string): Promise<Visitor> => join({ kind: "customer", name });

interface EventRow {
  id: number;
  visitor_id: string | null;
  type: string;
  data: string | null;
}
// events that are about all of these ids: written by one of them, or naming it in the data
const eventsNaming = (type: RegExp, ...ids: string[]): EventRow[] =>
  (db.prepare("SELECT id, visitor_id, type, data FROM events ORDER BY id").all() as EventRow[]).filter(
    (r) => type.test(r.type) && ids.every((id) => r.visitor_id === id || (r.data ?? "").includes(id)),
  );
const conversationsOf = (customerId: string): Array<{ with_id: string; ended_at: number | null }> =>
  db.prepare("SELECT with_id, ended_at FROM conversations WHERE customer_id = ?").all(customerId) as Array<{ with_id: string; ended_at: number | null }>;

const OFFER = /offer/i;
const CLAIM = /claim|staff_approached/i;
const TAKEOVER = /npc_approached|npc_claimed|takeover/i;

// just inside the entrance, where the CPU greeter walks up to a new arrival
const ENTRANCE_SPOT = { x: 0, z: -8 };
// out on the shop floor, away from the greeter's zone
const FLOOR_SPOT = { x: 0, z: -3 };

describe("a free real staff user comes before the CPU greeter (D47)", () => {
  it("offers a customer who steps inside to the free real staff user, and the greeter does not take them", async () => {
    const sam = await specialist("Sam");
    const ann = await customer("Ann");
    await ann.goto(ENTRANCE_SPOT.x, ENTRANCE_SPOT.z);
    await pause(1500); // well over one presence tick

    // the CPU greeter has not taken her: nobody opened a conversation with Ann
    expect(ann.turnsFrom().map((t) => t.withId), "Ann was greeted by a CPU while a real staff user was free").toEqual([]);
    expect(conversationsOf(ann.id), "a conversation row was opened for Ann with a CPU").toEqual([]);

    // the offer is on the record, naming who was offered whom
    const offers = eventsNaming(OFFER, sam.id, ann.id);
    expect(offers.length, `no offer event naming Sam and Ann (events seen for Ann: ${eventsNaming(/./, ann.id).map((e) => e.type).join(", ")})`).toBeGreaterThanOrEqual(1);
  }, 20_000);

  it("lets the offered staff user claim the customer with E: the conversation is with them, and the claim is logged", async () => {
    const sam = await specialist("Sam");
    const ann = await customer("Ann");
    await ann.goto(ENTRANCE_SPOT.x, ENTRANCE_SPOT.z);
    await pause(800);

    await sam.goto(ENTRANCE_SPOT.x + 1.1, ENTRANCE_SPOT.z);
    sam.send({ type: "talk_start", withId: ann.id });
    const turn = (await ann.next((m) => m.type === "turn", 3000)) as Extract<ServerMessage, { type: "turn" }>;

    expect(turn.withId, "Ann's conversation is not with the real staff user").toBe(sam.id);
    const convs = conversationsOf(ann.id);
    expect(convs.map((c) => c.with_id)).toEqual([sam.id]); // exactly one staff member, and it is not a CPU
    expect(eventsNaming(CLAIM, sam.id, ann.id).length, "the claim wrote no events row naming Sam and Ann").toBeGreaterThanOrEqual(1);
  }, 20_000);

  it("offers to the nearest free real staff user, and only to them", async () => {
    const far = await specialist("Far");
    const near = await specialist("Near");
    await far.goto(0, 8);
    await near.goto(0, -5);
    const ann = await customer("Ann");
    await ann.goto(FLOOR_SPOT.x, FLOOR_SPOT.z);
    await pause(1500);

    expect(eventsNaming(OFFER, near.id, ann.id).length, "no offer to the nearer staff user").toBeGreaterThanOrEqual(1);
    expect(eventsNaming(OFFER, far.id, ann.id), "the farther staff user was offered Ann at the same time").toEqual([]);
  }, 20_000);
});

describe("the other direction: nothing is held back without a real staff user", () => {
  it("with no real staff user in the room, the greeter still greets a new arrival at once", async () => {
    const ann = await customer("Ann");
    await ann.goto(ENTRANCE_SPOT.x, ENTRANCE_SPOT.z);
    const turn = (await ann.next((m) => m.type === "turn", 3000)) as Extract<ServerMessage, { type: "turn" }>;
    expect(turn.withId).toBe("greeter-1");
  }, 20_000);
});

describe("exactly one staff member per customer", () => {
  it("two real staff users pressing E on the same customer in the same tick: one wins, the other is told", async () => {
    const s1 = await specialist("Sam");
    const s2 = await specialist("Tia");
    const ann = await customer("Ann");
    await ann.goto(FLOOR_SPOT.x, FLOOR_SPOT.z);
    await s1.goto(FLOOR_SPOT.x + 1.1, FLOOR_SPOT.z);
    await s2.goto(FLOOR_SPOT.x - 1.1, FLOOR_SPOT.z);
    const m1 = s1.mark();
    const m2 = s2.mark();

    s1.send({ type: "talk_start", withId: ann.id });
    s2.send({ type: "talk_start", withId: ann.id });
    await pause(500);

    const opened = (v: Visitor, from: number): boolean => v.messages.slice(from).some((m) => m.type === "staff_menu");
    const told = (v: Visitor, from: number): boolean => v.messages.slice(from).some((m) => m.type === "notice");
    expect([opened(s1, m1), opened(s2, m2)].filter(Boolean), "not exactly one of the two got the conversation").toHaveLength(1);
    const loser = opened(s1, m1) ? s2 : s1;
    expect(told(loser, loser === s1 ? m1 : m2), "the loser was not told the customer is taken").toBe(true);

    const convs = conversationsOf(ann.id);
    expect(convs, "more or fewer than one conversation for Ann").toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'conversation_started' AND visitor_id = ?").get(ann.id)).toEqual({ n: 1 });
  }, 20_000);
});

describe("a CPU takes a customer only after the 15 s window with no real claim", () => {
  it("holds the greeter back for the whole window, then lets her take the customer, and logs who", async () => {
    const sam = await specialist("Sam"); // free, on duty, and never presses E
    const ann = await customer("Ann");
    const t0 = Date.now();
    await ann.goto(ENTRANCE_SPOT.x, ENTRANCE_SPOT.z);
    await pause(1000);
    expect(eventsNaming(OFFER, sam.id, ann.id).length, "Sam was never offered Ann").toBeGreaterThanOrEqual(1);

    // late in the window: she is still not the greeter's. Each move is what would trigger her.
    await pause(t0 + OFFER_WINDOW_MS - 3000 - Date.now());
    await ann.goto(ENTRANCE_SPOT.x + 0.2, ENTRANCE_SPOT.z);
    expect(ann.turnsFrom().map((t) => t.withId), "the greeter took Ann before the 15 s window ran out").toEqual([]);
    expect(eventsNaming(TAKEOVER, "greeter-1", ann.id), "a CPU takeover was logged inside the window").toEqual([]);

    // just after the window: with no real claim, the CPU may take her
    await pause(t0 + OFFER_WINDOW_MS + 1000 - Date.now());
    const mark = ann.mark();
    await ann.goto(ENTRANCE_SPOT.x, ENTRANCE_SPOT.z);
    const turn = (await ann.next((m) => m.type === "turn", 3000, mark)) as Extract<ServerMessage, { type: "turn" }>;
    expect(turn.withId).toBe("greeter-1");
    expect(eventsNaming(TAKEOVER, "greeter-1", ann.id).length, "the takeover wrote no events row naming the greeter and Ann").toBeGreaterThanOrEqual(1);
  }, 40_000);
});

// ---- the same rules against the store service, on a fake clock ----

describe("the offer passes on, and a released claim keeps its place (store service, fake clock)", () => {
  const NOW = 1000; // 1 s into the day: staff are at their posts
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
  const add = (id: string, at: { x: number; z: number }, kind: "customer" | "specialist" = "customer", specialty = "phones", joinedAt = NOW): void => {
    mem.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, id);
    positions.set(id, at);
    present.push(id);
    mem.prepare("INSERT INTO events (ts, visitor_id, type) VALUES (?, ?, 'join')").run(joinedAt, id);
    enter(ctx(), id, { kind, specialty: kind === "customer" ? undefined : specialty });
    if (kind !== "customer") employees.push({ id, name: id, kind, specialty: specialty as Employee["specialty"] });
  };
  const gone = (id: string): void => {
    present.splice(present.indexOf(id), 1);
    const i = employees.findIndex((e) => e.id === id);
    if (i >= 0) employees.splice(i, 1);
    positions.delete(id);
  };
  const waitedSince = (id: string, since: number): void => {
    mem.prepare("UPDATE player_state SET since = ? WHERE visitor_id = ?").run(since, id);
  };
  const eventsOf = (id: string): Array<{ type: string; data: Record<string, unknown> }> =>
    (mem.prepare("SELECT type, data FROM events WHERE visitor_id = ? ORDER BY id").all(id) as Array<{ type: string; data: string | null }>).map((r) => ({ type: r.type, data: JSON.parse(r.data ?? "{}") as Record<string, unknown> }));
  const offeredTo = (customer: string): string | undefined => customersView(ctx()).find((c) => c.id === customer)?.offeredTo;
  const turnTo = (out: Outgoing[], id: string): Extract<ServerMessage, { type: "turn" }> | undefined =>
    out.filter((o) => o.to === id && o.message.type === "turn").map((o) => o.message as Extract<ServerMessage, { type: "turn" }>).at(-1);

  it("after 15 s unclaimed, the next nearest real staff user is offered; after them too, the greeter takes the customer", () => {
    fresh();
    add("near", { x: 0, z: -6 }, "specialist");
    add("far", { x: 0, z: 6 }, "specialist");
    add("ann", { x: 0, z: -8 });
    expect(turnTo(catchUpOffers(ctx(), "ann"), "ann"), "greeted while two real staff users were free").toBeUndefined();
    expect(offeredTo("ann")).toBe("near");

    // just inside the window nothing moves
    catchUpOffers(ctx(NOW + OFFER_MS - 1), "ann");
    expect(offeredTo("ann")).toBe("near");

    // the window runs out: the farther one is offered, and the greeter still waits
    expect(turnTo(catchUpOffers(ctx(NOW + OFFER_MS), "ann"), "ann")).toBeUndefined();
    expect(offeredTo("ann")).toBe("far");
    expect(eventsOf("ann").map((e) => e.type)).toEqual(expect.arrayContaining(["offer_made", "offer_expired"]));

    // once they let it pass too, the CPU may take her; the takeover names who passed
    catchUpOffers(ctx(NOW + 2 * OFFER_MS), "ann"); // she starts walking over
    expect(turnTo(catchUpOffers(ctx(NOW + 2 * OFFER_MS + 60_000), "ann"), "ann")?.withId).toBe("greeter-1"); // the chat opens once she arrives
    expect(eventsOf("ann").find((e) => e.type === "npc_approached")?.data).toMatchObject({ npcId: "greeter-1", passedOver: ["near", "far"] });
  });

  it("an offer is withdrawn when its staff user leaves, and the customer goes straight to the next nearest", () => {
    fresh();
    add("near", { x: 0, z: -6 }, "specialist");
    add("far", { x: 0, z: 6 }, "specialist");
    add("ann", { x: 0, z: -8 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("near");
    gone("near");
    catchUpOffers(ctx(NOW + 100));
    expect(offeredTo("ann")).toBe("far");
    expect(eventsOf("ann").find((e) => e.type === "offer_withdrawn")?.data).toMatchObject({ staffId: "near", why: "staff left" });
  });

  it("only staff whose E would open a conversation are offered (D54 read as a capability filter, not a skill match)", () => {
    fresh();
    add("audio", { x: 0, z: -6 }, "specialist", "audio"); // nearer, but has no conversation to open yet
    add("phones", { x: 0, z: 6 }, "specialist", "phones");
    add("ann", { x: 0, z: -8 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("phones");
  });

  it("two equally near: whoever became free first is offered (D53)", () => {
    fresh();
    add("later", { x: 1, z: -6 }, "specialist", "phones", NOW);
    add("earlier", { x: -1, z: -6 }, "specialist", "phones", NOW - 500);
    add("ann", { x: 0, z: -8 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("earlier");
  });

  it("the longest-waiting customer is offered first, one customer per free staff user", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("bo", { x: 0, z: -8 });
    add("ann", { x: 0, z: -3 });
    waitedSince("bo", NOW);
    waitedSince("ann", NOW - 5000);
    catchUpOffers(ctx(), "bo");
    expect(offeredTo("ann")).toBe("sam");
    expect(offeredTo("bo")).toBeUndefined();
  });

  it("a claim made by a staff user who then disconnects, with no NPC of the post free, is released and the customer keeps their place (criterion 6)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -7 });
    add("bo", { x: 2, z: -7 });
    waitedSince("ann", NOW - 9000); // Ann has waited longest
    waitedSince("bo", NOW - 1000);
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("sam");
    expect(turnTo(requestTalk(ctx(NOW + 10), "sam", "ann"), "ann")?.withId).toBe("sam");
    expect(eventsOf("ann").find((e) => e.type === "staff_approached")?.data).toMatchObject({ staffId: "sam", offer: "theirs" });
    expect(stateOf(mem, "ann")?.state).toBe("in_conversation");

    // every NPC phones specialist is busy elsewhere, so nobody can carry Sam's conversation on
    for (const npc of ["spec-phones", "spec-phones-2"]) {
      const cid = `busy-with-${npc}`;
      mem.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(cid, `tok-${cid}`, cid);
      mem.prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, 'npc', 'phones', 'talk', '{}', ?)").run(`conv-${npc}`, cid, npc, NOW);
    }
    const t = NOW + 2000;
    expect(handOverPost(ctx(t), "sam")).toEqual([]);
    releaseClaimsOf(ctx(t), "sam");
    gone("sam");
    expect(stateOf(mem, "ann")?.state).toBe("arriving");
    expect((mem.prepare("SELECT COUNT(*) AS n FROM conversations WHERE customer_id = 'ann' AND ended_at IS NULL").get() as { n: number }).n).toBe(0);
    expect(eventsOf("ann").find((e) => e.type === "claim_released")?.data).toMatchObject({ staffId: "sam", waitingSince: NOW - 9000 });

    // back at her original place: ahead of Bo (nearer to the newcomer, and on the list
    // the whole time), so the next real staff user to come free is offered Ann
    add("tia", { x: 2, z: -5 }, "specialist");
    catchUpOffers(ctx(t + 10));
    expect(offeredTo("ann")).toBe("tia");
    expect(offeredTo("bo")).toBeUndefined();
  });

  // Issue #30: a customer who presses E directly on a free real staff user
  // (no offer first — the claim path `staffTalk` always uses) must be tracked
  // the same way an offer-claimed customer is, so the same disconnect-recovery
  // logic (`releaseClaimsOf`) applies regardless of how the conversation started.
  it("a customer who pressed E directly on a free staff user (no offer) also returns to the waiting list if that staff user disconnects with no NPC free (issue #30)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -7 });
    add("bo", { x: 2, z: -7 });
    waitedSince("ann", NOW - 9000); // Ann has waited longest
    waitedSince("bo", NOW - 1000);
    // Ann presses E on Sam directly: no offer was ever made (settleOffers/catchUpOffers never ran)
    expect(offeredTo("ann")).toBeUndefined();
    expect(turnTo(requestTalk(ctx(NOW + 10), "ann", "sam"), "ann")?.withId).toBe("sam");
    expect(stateOf(mem, "ann")?.state).toBe("in_conversation");

    // every NPC phones specialist is busy elsewhere, so nobody can carry Sam's conversation on
    for (const npc of ["spec-phones", "spec-phones-2"]) {
      const cid = `busy-with-${npc}`;
      mem.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(cid, `tok-${cid}`, cid);
      mem.prepare("INSERT INTO conversations (id, customer_id, with_id, with_kind, script, node, data, started_at) VALUES (?, ?, ?, 'npc', 'phones', 'talk', '{}', ?)").run(`conv-${npc}`, cid, npc, NOW);
    }
    // the real disconnect order (presence.ts `depart`): handOverPost, then
    // releaseClaimsOf, then leaveStore closes whatever conversation is still open
    const t = NOW + 2000;
    expect(handOverPost(ctx(t), "sam")).toEqual([]);
    releaseClaimsOf(ctx(t), "sam");
    leaveStore(ctx(t), "sam");
    gone("sam");
    // without the fix, a direct-E claim is never recorded, so releaseClaimsOf finds
    // nothing to release and leaveStore ends the conversation the ordinary way,
    // putting the customer out to "browsing" (excluded from the waiting list)
    // instead of back onto it as "arriving"
    expect(stateOf(mem, "ann")?.state, "Ann was put out to browsing, off the waiting list, instead of returned to it").toBe("arriving");
    expect((mem.prepare("SELECT COUNT(*) AS n FROM conversations WHERE customer_id = 'ann' AND ended_at IS NULL").get() as { n: number }).n).toBe(0);
    expect(eventsOf("ann").find((e) => e.type === "claim_released")?.data).toMatchObject({ staffId: "sam", waitingSince: NOW - 9000 });

    // back at her original place: ahead of Bo, so the next real staff user to come
    // free is offered Ann, exactly as the offer-claim path behaves (criterion 6)
    add("tia", { x: 2, z: -5 }, "specialist");
    catchUpOffers(ctx(t + 10));
    expect(offeredTo("ann")).toBe("tia");
    expect(offeredTo("bo")).toBeUndefined();
  });

  // ---- PR #27 review findings ----

  it("one offer per staff user across requests: a second customer arriving later is not also offered to them", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -3 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("sam");
    // a separate request, later: Bo arrives while Sam still holds Ann's offer
    add("bo", { x: 1, z: -3 });
    catchUpOffers(ctx(NOW + 1000), "bo");
    expect(offeredTo("bo"), "Sam was offered Bo while still holding Ann's offer").toBeUndefined();
    expect(offeredTo("ann")).toBe("sam");
    expect(eventsOf("bo").filter((e) => e.type === "offer_made")).toEqual([]);
  });

  it("the greeter still holds back for a newcomer at the door while the only free staff user holds someone else's offer", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -3 }); // on the floor, offered to Sam
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("sam");
    add("bo", { x: 0, z: -8 }); // steps in at the door: no offer of his own yet, Sam is taken by Ann's
    const out = catchUpOffers(ctx(NOW + 1000), "bo");
    expect(turnTo(out, "bo"), "the greeter took Bo while a free real staff user was in the room").toBeUndefined();
    expect(eventsOf("bo").filter((e) => e.type === "npc_approached")).toEqual([]);
  });

  it("a lone staff user who lets the window pass is offered the same customer again, not leaving them stranded (D57b)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -3 }); // on the floor: the greeter only takes people at the door
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("sam");
    catchUpOffers(ctx(NOW + OFFER_MS), "ann");
    expect(offeredTo("ann"), "Ann was left with nobody offered her after Sam let the window pass").toBe("sam");
    const made = eventsOf("ann").filter((e) => e.type === "offer_made");
    expect(made).toHaveLength(2);
    expect(made[1]!.data).toMatchObject({ staffId: "sam", again: true });
    // and it keeps looping for as long as she waits
    catchUpOffers(ctx(NOW + 2 * OFFER_MS), "ann");
    catchUpOffers(ctx(NOW + 8 * OFFER_MS), "ann");
    expect(offeredTo("ann")).toBe("sam");
  });

  it("a newcomer nobody has been offered comes before a customer being looped back (D57b does not starve them)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -3 });
    waitedSince("ann", NOW - 5000);
    catchUpOffers(ctx(), "ann");
    add("bo", { x: 1, z: -3 }); // waited less, but nobody has had a chance to help him yet
    catchUpOffers(ctx(NOW + OFFER_MS), "ann");
    expect(offeredTo("bo")).toBe("sam");
    expect(offeredTo("ann")).toBeUndefined();
  });

  it("a staff user who comes back (reconnect or restart) with a claimed customer open releases them back to the list, logged (review finding 1a)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -7 });
    waitedSince("ann", NOW - 4000);
    catchUpOffers(ctx(), "ann");
    requestTalk(ctx(NOW + 10), "sam", "ann");
    expect(stateOf(mem, "ann")?.state).toBe("in_conversation");
    rejoin(ctx(NOW + 2000), "sam", { kind: "specialist", specialty: "phones" });
    expect(stateOf(mem, "ann")?.state, "Ann was put out to browsing, off the waiting list").toBe("arriving");
    expect(eventsOf("ann").find((e) => e.type === "claim_released")?.data).toMatchObject({ staffId: "sam", waitingSince: NOW - 4000 });
    catchUpOffers(ctx(NOW + 2010));
    expect(offeredTo("ann")).toBe("sam");
  });

  it("a customer's offer does not survive their own reconnect: it is withdrawn, and the free staff user is offered them afresh, not the greeter (review finding 1b)", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("ann", { x: 0, z: -8 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("sam");
    const t = NOW + 20_000; // past the window, but Sam never had a chance: Ann went away and came back
    rejoin(ctx(t), "ann", { kind: "customer" });
    expect(eventsOf("ann").find((e) => e.type === "offer_withdrawn")?.data).toMatchObject({ staffId: "sam", why: "customer left" });
    const out = catchUpOffers(ctx(t), "ann");
    expect(turnTo(out, "ann"), "the greeter took Ann though Sam was free the whole time").toBeUndefined();
    expect(eventsOf("ann").filter((e) => e.type === "offer_expired")).toEqual([]);
    expect(offeredTo("ann")).toBe("sam");
  });

  it("every offer, withdrawal, expiry, claim and release row is written before the change it records", () => {
    fresh();
    add("sam", { x: 0, z: -6 }, "specialist");
    add("tia", { x: 0, z: -5 }, "specialist");
    add("ann", { x: 0, z: -3 });
    catchUpOffers(ctx(), "ann");
    expect(offeredTo("ann")).toBe("tia");
    // Sam (not offered) claims her: Tia's offer ends with its own row
    positions.set("sam", { x: 0, z: -4 });
    requestTalk(ctx(NOW + 10), "sam", "ann");
    expect(eventsOf("ann").find((e) => e.type === "offer_withdrawn")?.data).toMatchObject({ staffId: "tia", why: "claimed by another", by: "sam" });
    const order = eventsOf("ann").map((e) => e.type);
    expect(order.indexOf("staff_approached")).toBeLessThan(order.indexOf("conversation_started"));
  });
});
