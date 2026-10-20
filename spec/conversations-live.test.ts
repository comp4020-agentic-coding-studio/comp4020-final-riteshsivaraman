import { afterEach, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.ts";
import type { Profile } from "../src/shared/profile.ts";

// Promise: the whole flow works for real visitors on the running app: a
// customer asks the greeter for the phones team, an employee sees them waiting,
// claims them and serves them through menus on both sides. Real WebSockets,
// two separate visitors.
const baseUrl = inject("baseUrl");
const wsUrl = new URL("/ws", baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

class Visitor {
  readonly socket = new WebSocket(wsUrl);
  readonly messages: ServerMessage[] = [];
  id = "";
  constructor() {
    this.socket.on("message", (raw) => this.messages.push(JSON.parse(raw.toString()) as ServerMessage));
  }
  send(m: ClientMessage): void {
    this.socket.send(JSON.stringify(m));
  }
  async join(profile?: Profile): Promise<Extract<ServerMessage, { type: "welcome" }>> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.send({ type: "hello", token: null, profile });
    const w = (await this.next((m) => m.type === "welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    this.id = w.you.id;
    return w;
  }
  async next(want: (m: ServerMessage) => boolean, ms = 2500, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.messages.slice(from).find(want);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting for a message (have: ${this.messages.map((m) => (m.type === "notice" ? `notice "${m.text}"` : m.type)).join(", ")})`);
  }
  mark(): number {
    return this.messages.length;
  }
}

const open: Visitor[] = [];
afterEach(() => {
  for (const v of open.splice(0)) v.socket.close();
});
const join = async (profile?: Profile): Promise<{ v: Visitor; welcome: Extract<ServerMessage, { type: "welcome" }> }> => {
  const v = new Visitor();
  open.push(v);
  const welcome = await v.join(profile);
  return { v, welcome };
};
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// stand beside an NPC: where it is on the server's clock right now
async function walkTo(v: Visitor, npcId: string): Promise<void> {
  const def = NPCS.find((n) => n.id === npcId)!;
  const p = npcPose(def, Date.now());
  // a few small moves: the server clamps and rate-limits
  for (let i = 0; i < 3; i++) {
    v.send({ type: "move", x: p.x + 1.1, z: p.z, ry: 0 });
    await pause(60);
  }
}

it("tells a visitor who they are, where they are in their visit, and who is off duty", async () => {
  const { welcome } = await join({ kind: "customer", name: "Test Customer", look: { body: "toon", eyes: "sparkle" } });
  expect(welcome.identity).toMatchObject({ kind: "customer", look: { body: "toon", eyes: "sparkle" } });
  expect(welcome.you.name).toBe("Test Customer");
  expect(welcome.state).toBe("arriving");
  expect(Array.isArray(welcome.offDuty)).toBe(true);
});

it("ignores a profile that is not valid, rather than trusting it", async () => {
  const { welcome } = await join({ kind: "emperor", look: { body: "<script>" } } as unknown as Profile);
  expect(welcome.identity.kind).toBe("customer");
  expect(welcome.identity.look).toBeUndefined();
});

it("sends a real specialist for a customer, who shows intent, is accepted, and serves them through the engine", async () => {
  // the specialist is in the store first, so they are who is sent for the customer
  const { v: employee, welcome } = await join({ kind: "specialist", specialty: "phones", name: "Sam" });
  expect(welcome.offDuty).not.toContain("spec-phones"); // an extra pair of hands, not a replacement
  employee.send({ type: "move", x: 2.6, z: 0, ry: 0 });

  const { v: customer } = await join({ kind: "customer", name: "Cust Live" });
  await walkTo(customer, "greeter-1");
  customer.send({ type: "talk_start", withId: "greeter-1" });
  const hello = (await customer.next((m) => m.type === "turn")) as Extract<ServerMessage, { type: "turn" }>;
  expect(hello.choices.map((c) => c.id)).toContain("phone");
  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "phone" });
  await customer.next((m) => m.type === "turn" && m.choices.some((c) => c.id === "help"));
  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "help" });
  const told = (await customer.next((m) => m.type === "turn" && m.ended)) as Extract<ServerMessage, { type: "turn" }>;
  expect(told.say).toMatch(/Sam will come and find you/);

  // Sam is given the customer as a task, goes to them and shows intent in person
  const task = (await employee.next((m) => m.type === "intent" && m.fromId === employee.id)) as Extract<ServerMessage, { type: "intent" }>;
  expect(task).toMatchObject({ toId: customer.id, reason: "help" });
  customer.send({ type: "talk_close" });
  customer.send({ type: "move", x: 2, z: 0, ry: 0 });
  await pause(150);
  employee.send({ type: "intent_show", intentId: task.id });
  await customer.next((m) => m.type === "intent" && m.id === task.id && m.ready === true);

  // the customer accepts: both are in the conversation, Sam given the engine's moves
  const mark = employee.mark();
  customer.send({ type: "intent_accept", intentId: task.id });
  const waiting = (await customer.next((m) => m.type === "turn" && m.withId === employee.id)) as Extract<ServerMessage, { type: "turn" }>;
  expect(waiting.awaiting).toBe("staff");
  const menu = (await employee.next((m) => m.type === "staff_menu", 2500, mark)) as Extract<ServerMessage, { type: "staff_menu" }>;
  expect(menu.acts.length).toBeGreaterThan(0);

  // Sam makes a move; the customer is given their menu
  const cMark = customer.mark();
  employee.send({ type: "staff_move", conversationId: menu.conversationId, actId: menu.acts[0]!.id, tone: "friendly" });
  const turn = (await customer.next((m) => m.type === "turn" && m.awaiting === "customer" && m.choices.length > 0, 2500, cMark)) as Extract<ServerMessage, { type: "turn" }>;
  expect(turn.choices.length).toBeGreaterThan(0);

  // when the specialist leaves, an NPC takes their place and the conversation carries on
  const m2 = customer.mark();
  employee.socket.close();
  const taken = (await customer.next((m) => m.type === "notice" && /has taken their place/.test(m.text), 3000, m2)) as Extract<ServerMessage, { type: "notice" }>;
  expect(taken.text).toMatch(/\(NPC\)/);
  const carried = (await customer.next((m) => m.type === "turn" && !m.ended && m.choices.length > 0, 3000, m2)) as Extract<ServerMessage, { type: "turn" }>;
  expect(carried.conversationId).toBe(menu.conversationId);
});

it("will not let a visitor talk to a character from across the store", async () => {
  const { v } = await join({ kind: "customer" });
  v.send({ type: "move", x: 5, z: 7, ry: 0 });
  await pause(100);
  v.send({ type: "talk_start", withId: "greeter-1" });
  const n = (await v.next((m) => m.type === "notice")) as Extract<ServerMessage, { type: "notice" }>;
  expect(n.text).toMatch(/closer|not on|someone/);
});

