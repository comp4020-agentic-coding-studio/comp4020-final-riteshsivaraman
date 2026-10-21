import { afterEach, expect, inject, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.ts";
import type { Profile } from "../src/shared/profile.ts";

// Promise: when several customers arrive together, the greeter takes the first
// who steps inside, the others are never queued behind her or shown anything
// floating over their heads, and pressing E at her while she is busy gets a
// plain "with someone else" (crit 10: everyone was stuck behind one greeting).
// Real WebSockets, separate visitors.
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
  async next(want: (m: ServerMessage) => boolean, ms = 6000, from = 0): Promise<ServerMessage> {
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

it("greets the first customer at once, leaves the others free, and refuses E plainly while she is busy", async () => {
  const customers = [];
  for (const name of ["Ann", "Bo", "Cy"]) customers.push((await join({ kind: "customer", name })).v);
  const [ann, bo, cy] = customers as [Visitor, Visitor, Visitor];

  // Ann steps inside first; Bo and Cy step in right behind her
  ann.send({ type: "move", x: 0, z: -8, ry: 0 });
  await pause(100);
  bo.send({ type: "move", x: 1.2, z: -8, ry: 0 });
  cy.send({ type: "move", x: -1.2, z: -8, ry: 0 });
  await pause(300);

  const hello = (await ann.next((m) => m.type === "turn")) as Extract<ServerMessage, { type: "turn" }>;
  expect(hello.withId).toBe("greeter-1");
  expect(hello.choices.length).toBeGreaterThan(0);
  expect(bo.messages.some((m) => m.type === "turn")).toBe(false);
  expect(cy.messages.some((m) => m.type === "turn")).toBe(false);

  // nobody is told anything is floating over them or waiting for them
  for (const v of customers) expect(v.messages.map((m) => m.type as string)).not.toContain("intent");

  // Bo presses E at her while she is with Ann: told plainly, and not queued
  const mark = bo.mark();
  bo.send({ type: "talk_start", withId: "greeter-1" });
  const refused = (await bo.next((m) => m.type === "notice", 3000, mark)) as Extract<ServerMessage, { type: "notice" }>;
  expect(refused.text).toMatch(/with someone else/);
  await pause(1200);
  expect(bo.messages.slice(mark).some((m) => m.type === "turn")).toBe(false);

  // Ann finishes and lets her go; Bo presses E and is greeted at once
  ann.send({ type: "talk_leave" });
  ann.send({ type: "talk_close" });
  await pause(200);
  const mark2 = bo.mark();
  bo.send({ type: "talk_start", withId: "greeter-1" });
  const second = (await bo.next((m) => m.type === "turn", 3000, mark2)) as Extract<ServerMessage, { type: "turn" }>;
  expect(second.withId).toBe("greeter-1");
});
