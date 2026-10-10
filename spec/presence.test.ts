import { afterEach, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { FLOOR, type ClientMessage, type ServerMessage } from "../src/shared/protocol.ts";
import { MALL } from "../src/shared/mall.ts";
import { WALKWAY } from "../src/shared/world.ts";

// Promise: a change one visitor makes reaches every other open session within
// about a second, with no reload (the brief's real-time requirement). These
// open real WebSockets against the RUNNING app, as two separate visitors.
const baseUrl = inject("baseUrl");
const wsUrl = new URL("/ws", baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

class Visitor {
  readonly socket = new WebSocket(wsUrl);
  readonly messages: ServerMessage[] = [];
  id = "";
  token = "";

  constructor() {
    this.socket.on("message", (raw) => this.messages.push(JSON.parse(raw.toString()) as ServerMessage));
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  async join(token: string | null = null): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.send({ type: "hello", token });
    const welcome = await this.next((m) => m.type === "welcome");
    if (welcome.type !== "welcome") throw new Error("no welcome");
    this.id = welcome.you.id;
    this.token = welcome.token;
  }

  // Resolves with the first message (already received or yet to arrive) that
  // satisfies `want`, or rejects after `ms`.
  async next(want: (m: ServerMessage) => boolean, ms = 1500): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.find(want);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out after ${ms}ms waiting for a message`);
  }
}

const open: Visitor[] = [];
afterEach(() => {
  for (const v of open.splice(0)) v.socket.close();
});

async function visitor(token: string | null = null): Promise<Visitor> {
  const v = new Visitor();
  open.push(v);
  await v.join(token);
  return v;
}

it("tells two visitors apart", async () => {
  const a = await visitor();
  const b = await visitor();
  expect(a.id).not.toBe(b.id);
  expect(a.token).not.toBe(b.token);
});

it("shows B's movement to A within a second, with no action from A", async () => {
  const a = await visitor();
  const b = await visitor();

  const t0 = Date.now();
  // a spot no NPC ever walks through (beside the bar, past its partition), so
  // people-collision cannot move it
  b.send({ type: "move", x: 5.2, z: 6.0, ry: 0.5 });
  const moved = await a.next((m) => m.type === "moved" && m.id === b.id, 1000);

  expect(Date.now() - t0).toBeLessThan(1000);
  expect(moved).toMatchObject({ type: "moved", id: b.id, x: 5.2, z: 6.0 });
});

// The store is on the first floor: outside the glass is a walkway a visitor
// may step onto, with a balustrade. Beyond it is a drop, so nobody stands there.
it("never lets a visitor stand in the void beyond the balustrade or outside the walls", async () => {
  const a = await visitor();
  const b = await visitor();
  b.send({ type: "move", x: 9999, z: -9999, ry: 0 });
  const moved = await a.next((m) => m.type === "moved" && m.id === b.id);
  if (moved.type !== "moved") throw new Error("wrong message");
  expect(moved.x).toBeGreaterThanOrEqual(FLOOR.minX);
  expect(moved.x).toBeLessThanOrEqual(WALKWAY.maxX);
  expect(moved.z).toBeGreaterThanOrEqual(MALL.walkwayZ);
  expect(moved.z).toBeLessThanOrEqual(FLOOR.maxZ);
});

it("does not let one visitor walk through another", async () => {
  const a = await visitor();
  const b = await visitor();
  a.send({ type: "move", x: 2.2, z: -2.0, ry: 0 });
  await b.next((m) => m.type === "moved" && m.id === a.id);
  await new Promise((r) => setTimeout(r, 60)); // the server accepts a move every 40 ms
  b.send({ type: "move", x: 2.2, z: -2.0, ry: 0 }); // right on top of a
  const moved = await a.next((m) => m.type === "moved" && m.id === b.id);
  if (moved.type !== "moved") throw new Error("wrong message");
  expect(Math.hypot(moved.x - 2.2, moved.z - -2.0)).toBeGreaterThanOrEqual(0.5);
});

it("puts a visitor who joins beside, not on top of, the person standing at the spawn", async () => {
  const a = await visitor();
  const joined = await visitor();
  const first = a.messages.find((m) => m.type === "joined" && m.visitor.id === joined.id);
  if (!first || first.type !== "joined") throw new Error("no join seen");
  const mine = (await joined.next((m) => m.type === "welcome")) as Extract<ServerMessage, { type: "welcome" }>;
  const there = mine.others.find((o) => o.id === a.id);
  expect(there).toBeDefined();
  // A greeter can stand at the spawn too, and then the newcomer is pushed from
  // two bodies at once and cannot clear both by a full body width. Not on top
  // of them is the promise; the full 0.6 m is covered by the pure specs.
  expect(Math.hypot(first.visitor.x - (there?.x ?? 0), first.visitor.z - (there?.z ?? 0))).toBeGreaterThan(0.25);
});

// Measured on Fly: a clean WebSocket close takes ~5 s to reach the server
// through the proxy, an abrupt drop ~25 ms. So the client says "bye" first.
it("announces a visitor leaving within a second when they say goodbye", async () => {
  const a = await visitor();
  const b = await visitor();
  b.send({ type: "bye" });
  b.socket.close();
  await a.next((m) => m.type === "left" && m.id === b.id, 1000);
});

it("announces a visitor leaving within a second when the connection drops", async () => {
  const a = await visitor();
  const b = await visitor();
  b.socket.terminate();
  await a.next((m) => m.type === "left" && m.id === b.id, 1000);
});

it("keeps a customer out of the back room, and lets staff in", async () => {
  const a = await visitor();
  const b = await visitor();

  // a customer asking for a spot in the back room is held on the shop floor
  b.send({ type: "move", x: -2, z: 10, ry: 0 });
  const held = await a.next((m) => m.type === "moved" && m.id === b.id);
  if (held.type !== "moved") throw new Error("wrong message");
  expect(held.z).toBeLessThanOrEqual(FLOOR.maxZ);

  // as staff, the same request is honoured
  b.send({ type: "role", role: "staff" });
  await a.next((m) => m.type === "role" && m.id === b.id && m.role === "staff");
  await new Promise((r) => setTimeout(r, 60)); // past the per-visitor rate limit
  b.send({ type: "move", x: -2, z: 10, ry: 0 });
  const inside = await a.next((m) => m.type === "moved" && m.id === b.id && m.z > FLOOR.maxZ);
  if (inside.type !== "moved") throw new Error("wrong message");
  expect(inside.z).toBeCloseTo(10, 3);
});

it("pulls someone back out of staff areas when they stop being staff", async () => {
  const a = await visitor();
  const b = await visitor();
  b.send({ type: "role", role: "staff" });
  await new Promise((r) => setTimeout(r, 60));
  b.send({ type: "move", x: 0, z: 10, ry: 0 });
  await a.next((m) => m.type === "moved" && m.id === b.id && m.z > FLOOR.maxZ);
  b.send({ type: "role", role: "customer" });
  const back = await a.next((m) => m.type === "moved" && m.id === b.id && m.z <= FLOOR.maxZ);
  expect(back.type).toBe("moved");
});

it("remembers a returning visitor by their token", async () => {
  const first = await visitor();
  const { id, token } = first;
  first.socket.close();
  await new Promise((r) => setTimeout(r, 100));

  const again = await visitor(token);
  expect(again.id).toBe(id);
});
