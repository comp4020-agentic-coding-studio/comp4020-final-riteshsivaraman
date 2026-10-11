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

it("takes a customer to the phones team, and lets an employee claim and serve them", async () => {
  const { v: customer } = await join({ kind: "customer", name: "Cust Live" });
  await walkTo(customer, "greeter-1");
  customer.send({ type: "talk_start", withId: "greeter-1" });
  const hello = (await customer.next((m) => m.type === "turn")) as Extract<ServerMessage, { type: "turn" }>;
  expect(hello.choices.map((c) => c.id)).toContain("phone");

  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "phone" });
  await customer.next((m) => m.type === "turn" && m.choices.some((c) => c.id === "help"));
  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "help" });
  const waiting = await customer.next((m) => m.type === "state" && m.state === "waiting_for_help");
  expect(waiting).toMatchObject({ needs: "specialist:phones", want: "phone" });

  // an employee comes in and is shown the customer
  const { v: employee, welcome } = await join({ kind: "specialist", specialty: "phones", name: "Sam" });
  expect(welcome.offDuty).toContain("spec-phones");
  const view = (await employee.next((m) => m.type === "staff_view" && m.customers.some((c) => c.id === customer.id))) as Extract<ServerMessage, { type: "staff_view" }>;
  expect(view.customers.find((c) => c.id === customer.id)).toMatchObject({ state: "waiting_for_help", needs: "specialist:phones" });

  // claim, then serve through menus on both sides
  const cMark = customer.mark();
  employee.send({ type: "claim", customerId: customer.id });
  const opened = (await customer.next((m) => m.type === "turn" && m.withId === employee.id, 2500, cMark)) as Extract<ServerMessage, { type: "turn" }>;
  customer.send({ type: "talk_choose", conversationId: opened.conversationId, choice: "show" });
  const ask = (await employee.next((m) => m.type === "staff_turn")) as Extract<ServerMessage, { type: "staff_turn" }>;
  expect(ask.customerPicked).toBe("Show me what you have");
  const mark = customer.mark();
  employee.send({ type: "staff_respond", conversationId: ask.conversationId, action: "reply" });
  const models = (await customer.next((m) => m.type === "turn" && m.awaiting === "customer" && m.choices.some((c) => c.id.startsWith("product:")), 2500, mark)) as Extract<ServerMessage, { type: "turn" }>;
  expect(models.choices.length).toBeGreaterThan(1);

  // when the employee leaves, the customer is let go
  const m2 = customer.mark();
  employee.socket.close();
  await customer.next((m) => m.type === "turn" && m.ended, 3000, m2);
});

it("will not let a visitor talk to a character from across the store", async () => {
  const { v } = await join({ kind: "customer" });
  v.send({ type: "move", x: 5, z: 7, ry: 0 });
  await pause(100);
  v.send({ type: "talk_start", withId: "greeter-1" });
  const n = (await v.next((m) => m.type === "notice")) as Extract<ServerMessage, { type: "notice" }>;
  expect(n.text).toMatch(/closer|not on|someone/);
});

it("has stock on the shelves in the running app (the shop is not all sold out)", async () => {
  // the phones specialist's colour menu shows how many are left, from the real database
  const { v: customer } = await join({ kind: "customer", name: "Stock Check" });
  const { v: employee } = await join({ kind: "specialist", specialty: "phones", name: "Stock Sam" });
  customer.send({ type: "move", x: 0, z: 0, ry: 0 });
  employee.send({ type: "move", x: 0.6, z: 0, ry: 0 });
  await pause(150);
  customer.send({ type: "talk_start", withId: employee.id });
  const hello = (await customer.next((m) => m.type === "turn")) as Extract<ServerMessage, { type: "turn" }>;
  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "show" });
  const ask = (await employee.next((m) => m.type === "staff_turn")) as Extract<ServerMessage, { type: "staff_turn" }>;
  employee.send({ type: "staff_respond", conversationId: ask.conversationId, action: "reply" });
  await customer.next((m) => m.type === "turn" && m.choices.some((c) => c.id === "product:phone-b"));
  const mark = customer.mark();
  customer.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "product:phone-b" });
  const asked = (await employee.next((m) => m.type === "staff_turn" && m.customerPicked === "Phone B")) as Extract<ServerMessage, { type: "staff_turn" }>;
  employee.send({ type: "staff_respond", conversationId: asked.conversationId, action: "reply" });
  const colours = (await customer.next((m) => m.type === "turn" && m.choices.some((c) => c.id.startsWith("colour:")), 2500, mark)) as Extract<ServerMessage, { type: "turn" }>;
  // at least one colour is in stock (a stocked shop lists "(n left)")
  expect(colours.choices.some((c) => /\(\d+ left\)/.test(c.label))).toBe(true);
});
