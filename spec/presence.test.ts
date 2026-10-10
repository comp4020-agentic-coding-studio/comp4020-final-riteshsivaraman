import { afterEach, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { FLOOR, type ClientMessage, type ServerMessage } from "../src/shared/protocol.ts";

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
  b.send({ type: "move", x: 2.5, z: 1.25, ry: 0.5 });
  const moved = await a.next((m) => m.type === "moved" && m.id === b.id, 1000);

  expect(Date.now() - t0).toBeLessThan(1000);
  expect(moved).toMatchObject({ type: "moved", id: b.id, x: 2.5, z: 1.25 });
});

it("never lets a visitor stand outside the store", async () => {
  const a = await visitor();
  const b = await visitor();
  b.send({ type: "move", x: 9999, z: -9999, ry: 0 });
  const moved = await a.next((m) => m.type === "moved" && m.id === b.id);
  if (moved.type !== "moved") throw new Error("wrong message");
  expect(moved.x).toBeGreaterThanOrEqual(FLOOR.minX);
  expect(moved.x).toBeLessThanOrEqual(FLOOR.maxX);
  expect(moved.z).toBeGreaterThanOrEqual(FLOOR.minZ);
  expect(moved.z).toBeLessThanOrEqual(FLOOR.maxZ);
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
  b.send({ type: "move", x: -3, z: 15, ry: 0 });
  const held = await a.next((m) => m.type === "moved" && m.id === b.id);
  if (held.type !== "moved") throw new Error("wrong message");
  expect(held.z).toBeLessThanOrEqual(FLOOR.maxZ);

  // as staff, the same request is honoured
  b.send({ type: "role", role: "staff" });
  await a.next((m) => m.type === "role" && m.id === b.id && m.role === "staff");
  await new Promise((r) => setTimeout(r, 60)); // past the per-visitor rate limit
  b.send({ type: "move", x: -3, z: 15, ry: 0 });
  const inside = await a.next((m) => m.type === "moved" && m.id === b.id && m.z > FLOOR.maxZ);
  if (inside.type !== "moved") throw new Error("wrong message");
  expect(inside.z).toBeCloseTo(15, 3);
});

it("pulls someone back out of staff areas when they stop being staff", async () => {
  const a = await visitor();
  const b = await visitor();
  b.send({ type: "role", role: "staff" });
  await new Promise((r) => setTimeout(r, 60));
  b.send({ type: "move", x: 0, z: 15, ry: 0 });
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
