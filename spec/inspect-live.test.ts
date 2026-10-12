import { afterEach, expect, inject, it } from "vitest";
import WebSocket from "ws";
import { DEVICE_SLOT_BY_ID } from "../src/shared/slots.ts";
import type { ClientMessage, ServerMessage } from "../src/shared/protocol.ts";
import type { Profile } from "../src/shared/profile.ts";

// Promise: D39's real-time requirement holds against the running app, not
// just the in-memory service.ts spec — a second, genuinely separate visitor
// (its own socket, its own welcome) sees another visitor's inspection live,
// and sees it close live too. This is the part a solo browser check can't
// exercise at all (it needs two independent connections), and the part a
// `pnpm check` screenshot can't either (it's about the broadcast, not a look).

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

const PHONE_SLOT = "T1:-x:0";
const slot = DEVICE_SLOT_BY_ID.get(PHONE_SLOT)!;

it("lets a second, genuinely separate visitor see an inspection live, and see it end live", async () => {
  const { v: a } = await join({ kind: "customer", name: "Looker" });
  const { v: b } = await join({ kind: "customer", name: "Watcher" });
  a.send({ type: "move", x: slot.x, z: slot.z, ry: 0 });
  await pause(150);

  const bMark = b.mark();
  a.send({ type: "inspect_start", slotId: PHONE_SLOT });
  const seen = (await b.next((m) => m.type === "inspecting", 2500, bMark)) as Extract<ServerMessage, { type: "inspecting" }>;
  expect(seen).toMatchObject({ slotId: PHONE_SLOT, visitorId: a.id });

  const bMark2 = b.mark();
  a.send({ type: "inspect_end" });
  const ended = (await b.next((m) => m.type === "inspect_ended", 2500, bMark2)) as Extract<ServerMessage, { type: "inspect_ended" }>;
  expect(ended.slotId).toBe(PHONE_SLOT);
});

it("backfills an inspection already in progress to a visitor who joins afterwards", async () => {
  const { v: a } = await join({ kind: "customer", name: "Early Looker" });
  a.send({ type: "move", x: slot.x, z: slot.z, ry: 0 });
  await pause(150);
  a.send({ type: "inspect_start", slotId: PHONE_SLOT });
  await pause(150);

  const { welcome } = await join({ kind: "customer", name: "Late Joiner" });
  expect(welcome.inspecting).toContainEqual(expect.objectContaining({ slotId: PHONE_SLOT, visitorId: a.id }));
});

it("refuses a second visitor the same slot while it's taken (the real race, not just the in-memory one)", async () => {
  const { v: a } = await join({ kind: "customer", name: "Holder" });
  const { v: b } = await join({ kind: "customer", name: "Rival" });
  for (const v of [a, b]) v.send({ type: "move", x: slot.x, z: slot.z, ry: 0 });
  await pause(150);

  a.send({ type: "inspect_start", slotId: PHONE_SLOT });
  await pause(150);
  const bMark = b.mark();
  b.send({ type: "inspect_start", slotId: PHONE_SLOT });
  const notice = (await b.next((m) => m.type === "notice", 2500, bMark)) as Extract<ServerMessage, { type: "notice" }>;
  expect(notice.text).toMatch(/already|someone/i);
});

it("ends live when the visitor disconnects, not just when they say so", async () => {
  const { v: a } = await join({ kind: "customer", name: "Vanisher" });
  const { v: b } = await join({ kind: "customer", name: "Witness" });
  a.send({ type: "move", x: slot.x, z: slot.z, ry: 0 });
  await pause(150);
  a.send({ type: "inspect_start", slotId: PHONE_SLOT });
  await b.next((m) => m.type === "inspecting");

  const bMark = b.mark();
  a.socket.close();
  const ended = (await b.next((m) => m.type === "inspect_ended", 2500, bMark)) as Extract<ServerMessage, { type: "inspect_ended" }>;
  expect(ended.slotId).toBe(PHONE_SLOT);
});
