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
// Not covered here: criterion 6 (a claim released on disconnect: it interacts
// with the existing stand-in handover, which the issue does not reconcile) and
// criterion 8 (no timers: a static property, left to review).

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
    env: { ...process.env, PORT: String(port), DATABASE_PATH: pathJoin(dir, "store.db") },
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
  async next(want: (m: ServerMessage) => boolean, ms = 4000, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.slice(from).find(want);
      if (found) return found;
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
