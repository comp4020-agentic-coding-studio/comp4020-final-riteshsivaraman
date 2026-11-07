import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { defaultStorage, productById } from "../src/shared/catalogue.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.ts";
import type { Profile } from "../src/shared/profile.ts";
import { migrate } from "../src/server/migrate.ts";
import * as service from "../src/server/service.ts";
import { seedStock, stockOf } from "../src/server/stock.ts";

// Issue #3. Promise: a unit held for a customer (a `reservations` row, status
// 'held') is shown to everyone, as the server knows it: who holds it, when the
// hold ends (the server's `expires_at`, never a client's guess) and how many
// are still free. It is gone for everyone when the hold is paid, given back,
// expired or the holder leaves. A second customer going for the held last unit
// is told the truth ("on hold for <name>"). Showing a hold changes no state, so
// it writes no events row of its own: every appearance and clearance is read
// off the reservation and its existing `reserved` / `reservation_expired` /
// `reservation_released` / sale rows.
//
// THE CONTRACT THIS SPEC PINS (the builder implements exactly this; it mirrors
// how `orders` already travels, so nothing here is a new kind of mechanism):
//
//   HoldView  = { product, colour, storage, holderId, holderName,
//                 expiresAt /* server epoch ms, = reservations.expires_at */,
//                 free      /* units of that SKU left on the shelf now */ }
//   ServerMessage  { type: "holds"; holds: HoldView[] }   to "all", whenever the list changes
//   welcome.holds: HoldView[]                              so a late joiner sees it with no event
//   service.holdViews(ctx): HoldView[]                     read-only, pure of the clock in ctx.now
//
// Two halves. The first runs over real WebSockets against the running app
// (separate visitors, as in spec/greeter-live.test.ts). The second runs the
// service layer on an in-memory database with an injected clock, because
// expiry (3 to 5 minutes) and the events table are not reachable over the wire
// in a fast, trustworthy check.
//
// Advisory, not here (feel-check list on the issue): is the tag noticeable but
// not cluttering at 1920x1080 and 390x844; does the countdown read as calm.

interface HoldView {
  product: string;
  colour: string;
  storage: string;
  holderId: string;
  holderName: string;
  expiresAt: number;
  free: number;
}
type HoldsMessage = { type: "holds"; holds: HoldView[] };
type Welcome = Extract<ServerMessage, { type: "welcome" }>;

const holdsMessages = (v: { messages: ServerMessage[] }, from = 0): HoldsMessage[] =>
  v.messages.slice(from).filter((m) => (m.type as string) === "holds") as unknown as HoldsMessage[];
const welcomeHolds = (w: Welcome): HoldView[] | undefined => (w as unknown as { holds?: HoldView[] }).holds;

const STORAGE_17 = defaultStorage(productById("iphone-17")!);
const isBlack17 = (h: HoldView): boolean => h.product === "iphone-17" && h.colour === "Black" && h.storage === STORAGE_17;

// ---------------------------------------------------------------- live half

const baseUrl = inject("baseUrl");
const wsUrl = new URL("/ws", baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

class Visitor {
  readonly socket = new WebSocket(wsUrl);
  readonly messages: ServerMessage[] = [];
  id = "";
  welcome!: Welcome;
  constructor() {
    this.socket.on("message", (raw) => this.messages.push(JSON.parse(raw.toString()) as ServerMessage));
  }
  send(m: ClientMessage): void {
    this.socket.send(JSON.stringify(m));
  }
  async join(profile?: Profile): Promise<Welcome> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.send({ type: "hello", token: null, profile });
    this.welcome = (await this.next((m) => m.type === "welcome")) as Welcome;
    this.id = this.welcome.you.id;
    return this.welcome;
  }
  async next(want: (m: ServerMessage) => boolean, ms = 6000, from = 0, what = "a message"): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.slice(from).find(want);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting for ${what} (have: ${this.messages.map((m) => (m.type === "notice" ? `notice "${m.text}"` : m.type)).join(", ")})`);
  }
  async nextHolds(want: (h: HoldView[]) => boolean, ms: number, from: number, what: string): Promise<HoldView[]> {
    const m = (await this.next((x) => (x.type as string) === "holds" && want((x as unknown as HoldsMessage).holds), ms, from, what)) as unknown as HoldsMessage;
    return m.holds;
  }
  mark(): number {
    return this.messages.length;
  }
}

const open: Visitor[] = [];
afterEach(() => {
  for (const v of open.splice(0)) v.socket.close();
});
const join = async (profile?: Profile): Promise<Visitor> => {
  const v = new Visitor();
  open.push(v);
  await v.join(profile);
  return v;
};
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function walkTo(v: Visitor, npcId: string): Promise<void> {
  const p = npcPose(NPCS.find((n) => n.id === npcId)!, Date.now());
  for (let i = 0; i < 3; i++) {
    v.send({ type: "move", x: p.x + 1.1, z: p.z, ry: 0 });
    await pause(60);
  }
}

// Talks to an NPC phones specialist and answers the menu through to "Is that
// right?" for the iPhone 17 in Black: the one colour whose stock is a single unit.
const PATH = ["opt:know", "opt:model:17", `opt:storage:${STORAGE_17}`, "opt:decline", "opt:colour:Black"];
async function chooseBlack17UpToConfirm(v: Visitor, npcId: string): Promise<string> {
  await walkTo(v, npcId);
  v.send({ type: "talk_start", withId: npcId });
  let turn = (await v.next((m) => m.type === "turn" && m.withId === npcId, 6000, 0, `${npcId}'s opening turn`)) as Extract<ServerMessage, { type: "turn" }>;
  const id = turn.conversationId;
  if (turn.choices.some((c) => c.id === "seat:stand")) {
    // the specialist first asks whether to sit down; carry on standing
    const mark = v.mark();
    v.send({ type: "talk_choose", conversationId: id, choice: "seat:stand" });
    turn = (await v.next((m) => m.type === "turn" && m.conversationId === id && !m.choices.some((c) => c.id === "seat:stand"), 6000, mark, "the first question after standing")) as Extract<ServerMessage, { type: "turn" }>;
  }
  // answer whichever of the wanted options the engine is asking now (the demo offer is not always made)
  for (let step = 0; step < 12 && !turn.choices.some((c) => c.id === "opt:yes"); step++) {
    const want = PATH.find((w) => turn.choices.some((c) => c.id === w));
    expect(want, `${v.id} at "${turn.say}": one of ${PATH.join(", ")} is offered`).toBeDefined();
    const mark = v.mark();
    v.send({ type: "talk_choose", conversationId: id, choice: want! });
    turn = (await v.next((m) => m.type === "turn" && m.conversationId === id, 6000, mark, `the turn after ${want}`)) as Extract<ServerMessage, { type: "turn" }>;
  }
  expect(turn.choices.map((c) => c.id)).toContain("opt:yes");
  return id;
}

it("tells every joiner the holds list, empty when nothing is held", async () => {
  const v = await join({ kind: "customer", name: "Early" });
  const holds = welcomeHolds(v.welcome);
  expect(Array.isArray(holds), "welcome.holds is an array").toBe(true);
  expect(holds!.filter(isBlack17)).toEqual([]); // nothing is held yet: no tag is invented
});

it("shows a held last unit to everyone live, with the server's expiry; tells the loser the truth; clears when the holder leaves", async () => {
  const obs = await join({ kind: "customer", name: "Obs" });
  const ann = await join({ kind: "customer", name: "Ann" });
  const bo = await join({ kind: "customer", name: "Bo" });

  // both are at "Is that right?" for the last black iPhone 17 before either confirms
  const annConv = await chooseBlack17UpToConfirm(ann, "spec-phones");
  const boConv = await chooseBlack17UpToConfirm(bo, "spec-phones-2");
  expect(holdsMessages(obs).flatMap((m) => m.holds).filter(isBlack17), "nothing is shown as held before anyone confirms").toEqual([]);

  // Ann confirms: the tag appears in a second profile within about a second, no reload
  const mark = obs.mark();
  const confirmedAt = Date.now();
  ann.send({ type: "talk_choose", conversationId: annConv, choice: "opt:yes" });
  const seen = await obs.nextHolds((hs) => hs.some(isBlack17), 1500, mark, "a holds message naming Ann's hold");
  const shownAfter = Date.now() - confirmedAt;
  const hold = seen.find(isBlack17)!;
  expect(shownAfter).toBeLessThan(1500);
  expect(hold.holderId).toBe(ann.id);
  expect(hold.holderName).toBe("Ann");
  expect(hold.free, "the last unit is held, so none are free").toBe(0);

  // the end time is a server epoch time in the future, no further than the longest hold the server grants
  expect(hold.expiresAt).toBeGreaterThan(confirmedAt);
  expect(hold.expiresAt - confirmedAt).toBeLessThanOrEqual(service.HOLD_MS + 2000);
  expect(hold.expiresAt - confirmedAt).toBeGreaterThanOrEqual(60_000);
  // a relative "seconds left" would drift per client; the wire carries an absolute time only
  expect(Object.keys(hold)).not.toEqual(expect.arrayContaining(["remainingMs"]));

  // server-authoritative: someone arriving later is handed the very same record, with no event to replay
  const late = await join({ kind: "customer", name: "Late" });
  expect(welcomeHolds(late.welcome)!.find(isBlack17)).toEqual(hold);

  // Bo (a different specialist, a different profile) then confirms the same unit: told the truth, and the hold is not stolen
  const boMark = bo.mark();
  const obsMark = obs.mark();
  bo.send({ type: "talk_choose", conversationId: boConv, choice: "opt:yes" });
  const told = (await bo.next((m) => m.type === "turn" && m.conversationId === boConv && m.ended, 6000, boMark, "Bo's answer")) as Extract<ServerMessage, { type: "turn" }>;
  expect(told.say).toMatch(/on hold for Ann/);
  await pause(300);
  const after = holdsMessages(obs, obsMark).flatMap((m) => m.holds).filter(isBlack17);
  for (const h of after) expect(h, "Bo's attempt changed neither holder nor expiry").toEqual(hold);

  // Ann walks out: the hold is given back and the tag clears for everyone within about a second
  const leaveMark = obs.mark();
  ann.send({ type: "bye" });
  ann.socket.close();
  const cleared = await obs.nextHolds((hs) => !hs.some(isBlack17), 1500, leaveMark, "a holds message without Ann's hold");
  expect(cleared.filter(isBlack17)).toEqual([]);
  const newcomer = await join({ kind: "customer", name: "After" });
  expect(welcomeHolds(newcomer.welcome)!.filter(isBlack17)).toEqual([]);
}, 40_000);

// ------------------------------------------------------------ service half

const NOW = 1000;
let db: Database.Database;
const positions = new Map<string, { x: number; z: number }>();
const employees: service.Employee[] = [];
const present: string[] = [];
const ctx = (now = NOW): service.Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
const eventTypes = (): string[] => (db.prepare("SELECT type FROM events ORDER BY id").all() as Array<{ type: string }>).map((r) => r.type);
const eventCount = (): number => (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
const holdViews = (c: service.Ctx): HoldView[] => {
  const fn = (service as unknown as { holdViews?: (c: service.Ctx) => HoldView[] }).holdViews;
  if (typeof fn !== "function") throw new Error("service.ts does not export holdViews(ctx): the read-only list of held units (issue #3)");
  return fn(c);
};
const black17 = { model: "17", storage: STORAGE_17, colour: "Black", price: 1549 };
const turnSay = (out: service.Outgoing[], to: string): string | undefined =>
  (out.filter((o) => o.to === to && o.message.type === "turn").at(-1)?.message as Extract<ServerMessage, { type: "turn" }> | undefined)?.say;

function addVisitor(id: string, name: string, at: { x: number; z: number }): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, name);
  positions.set(id, at);
  present.push(id);
  service.enter(ctx(), id, { kind: "customer" });
}
// a customer standing at an NPC specialist whose chat has reached the sale
function selling(customer: string, name: string, npcId: string, sku = black17, now = NOW): service.Outgoing[] {
  const def = NPCS.find((n) => n.id === npcId)!;
  const p = npcPose(def, now);
  addVisitor(customer, name, { x: p.x + 1, z: p.z });
  const hello = service.startTalk(ctx(now), customer, npcId).filter((o) => o.to === customer && o.message.type === "turn").at(-1)!.message as Extract<ServerMessage, { type: "turn" }>;
  return service.beginSale(ctx(now), hello.conversationId, sku);
}
const reservationRow = (visitor: string): { status: string; expires_at: number } =>
  db.prepare("SELECT status, expires_at FROM reservations WHERE visitor_id = ? ORDER BY created_at DESC").get(visitor) as { status: string; expires_at: number };

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
});

describe("holdViews reads off the reservation (service layer)", () => {
  it("lists nothing when nothing is held, and an out-of-stock colour is not a hold", () => {
    expect(holdViews(ctx())).toEqual([]);
    db.prepare("UPDATE stock SET qty = 0 WHERE product = 'iphone-17' AND colour = 'Black' AND storage = ?").run(STORAGE_17);
    expect(holdViews(ctx())).toEqual([]); // nothing faked from a stock count alone
  });

  it("shows the holder's name, the reservation's own expires_at and the free count, and writes no events row to do so", () => {
    selling("c1", "Pebble", "spec-phones");
    const row = reservationRow("c1");
    expect(row.status).toBe("held");
    const before = eventCount();
    const views = holdViews(ctx());
    holdViews(ctx(NOW + 5000)); // later and again: still a read
    expect(eventCount(), "showing a hold or its time left is not a state change, so it is not an event").toBe(before);
    expect(views.filter(isBlack17)).toEqual([
      { product: "iphone-17", colour: "Black", storage: STORAGE_17, holderId: "c1", holderName: "Pebble", expiresAt: row.expires_at, free: stockOf(db, "iphone-17", "Black", STORAGE_17) },
    ]);
    expect(views.find(isBlack17)!.free).toBe(0);
    // the tag corresponds to the one existing `reserved` event, which carries the same end time
    const reserved = db.prepare("SELECT data FROM events WHERE type = 'reserved' AND visitor_id = 'c1'").all() as Array<{ data: string }>;
    expect(reserved).toHaveLength(1);
    expect(JSON.parse(reserved[0]!.data).expiresAt).toBe(row.expires_at);
  });

  it("shows a unit held with more left on the shelf as a hold with the remaining count, not as sold out", () => {
    const lav = { ...black17, colour: "Lavender" }; // two on the shelf at the start
    selling("c1", "Pebble", "spec-phones", lav);
    const hold = holdViews(ctx()).find((h) => h.colour === "Lavender" && h.product === "iphone-17");
    expect(hold?.free).toBe(1);
    expect(hold?.holderName).toBe("Pebble");
  });

  it("tells a second customer the truth about the held last unit, and does not give it to them or move the hold", () => {
    selling("c1", "Pebble", "spec-phones");
    const before = holdViews(ctx());
    const out = selling("c2", "Moss", "spec-phones-2");
    expect(turnSay(out, "c2")).toMatch(/on hold for Pebble/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE visitor_id = 'c2'").get()).toEqual({ n: 0 });
    expect(holdViews(ctx())).toEqual(before);
    expect(eventTypes()).toContain("reserve_lost"); // the existing event for the lost race, unchanged
  });

  it("names the current holder, not a stale released one, when a unit is re-held after being given back", () => {
    // c1 holds the last Black 17, then leaves: the reservation row becomes
    // 'released', the unit is free again, but the old row still exists.
    selling("c1", "Pebble", "spec-phones");
    service.leaveStore(ctx(), "c1");
    expect(reservationRow("c1").status).toBe("released");
    expect(stockOf(db, "iphone-17", "Black", STORAGE_17)).toBe(1);
    // c2 re-holds the same, now-free unit.
    selling("c2", "Moss", "spec-phones-2");
    expect(reservationRow("c2").status).toBe("held");
    // c3 loses the race against c2's hold: must be told c2 (current), never c1 (stale).
    const out = selling("c3", "River", "spec-phones");
    expect(turnSay(out, "c3")).toMatch(/on hold for Moss/);
    expect(turnSay(out, "c3")).not.toMatch(/Pebble/);
  });

  it("keeps the tag until the second the hold ends, then it is gone for everyone with no timer, and the unit is buyable", () => {
    selling("c1", "Pebble", "spec-phones");
    const endsAt = reservationRow("c1").expires_at;
    expect(holdViews(ctx(endsAt - 1)).filter(isBlack17)).toHaveLength(1); // not early
    // at the end, with nothing having run since: the view is already right (caught up on the request that touches it)
    expect(holdViews(ctx(endsAt)).filter(isBlack17)).toEqual([]);
    service.releaseExpired(ctx(endsAt));
    expect(eventTypes().filter((t) => t === "reservation_expired")).toHaveLength(1);
    expect(stockOf(db, "iphone-17", "Black", STORAGE_17)).toBe(1);
    // another customer can now have it, and the tag names them
    selling("c2", "Moss", "spec-phones-2", black17, endsAt);
    expect(holdViews(ctx(endsAt + 1)).find(isBlack17)).toMatchObject({ holderId: "c2", holderName: "Moss" });
  });

  it("clears the tag when the holder leaves, and does not list a unit that has been sold", () => {
    selling("c1", "Pebble", "spec-phones");
    service.leaveStore(ctx(), "c1");
    expect(holdViews(ctx()).filter(isBlack17)).toEqual([]);
    expect(eventTypes()).toContain("reservation_released");

    selling("c2", "Moss", "spec-phones-2");
    expect(holdViews(ctx()).filter(isBlack17)).toHaveLength(1);
    db.prepare("UPDATE reservations SET status = 'sold' WHERE visitor_id = 'c2'").run(); // what the existing payment path does on a paid sale
    expect(holdViews(ctx()).filter(isBlack17)).toEqual([]);
  });
});
