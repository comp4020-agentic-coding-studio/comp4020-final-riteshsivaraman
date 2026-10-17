import { expect, it } from "vitest";
import { formatEvent } from "../src/server/eventlog.ts";

// Promise: each events row is also one stdout line that says who, what and
// when, tells two visitors apart, and never carries a token or typed text
// (crit 10: narrate "who did what" from `flyctl logs` alone).
const ADA = "11111111-aaaa-bbbb-cccc-000000000001";
const BO = "22222222-aaaa-bbbb-cccc-000000000002";

it("names the time, the event and the visitor, one line", () => {
  const line = formatEvent(Date.UTC(2026, 9, 18, 3, 0, 0), ADA, "join", { name: "Mellow Pebble", kind: "customer" });
  expect(line).toBe('2026-10-18T03:00:00.000Z [11111111] join user=11111111 name="Mellow Pebble" kind=customer');
  expect(line).not.toContain("\n");
});

it("tells two visitors apart", () => {
  expect(formatEvent(1, ADA, "leave")).toContain("user=11111111");
  expect(formatEvent(1, BO, "leave")).toContain("user=22222222");
});

it("tags a conversation's lines with the conversation, not the visitor", () => {
  const a = formatEvent(1, ADA, "turn", { conversationId: "c0ffee99-1111-2222-3333-444444444444", choice: "budget" });
  const b = formatEvent(1, BO, "staff_replied", { conversationId: "c0ffee99-1111-2222-3333-444444444444", action: "reply" });
  expect(a).toContain("[c0ffee99]");
  expect(b).toContain("[c0ffee99]");
});

it("leaves an NPC id whole", () => {
  expect(formatEvent(1, ADA, "npc_approached", { npcId: "greeter-1" })).toContain("npcId=greeter-1");
});

it("keeps tokens and typed notes out of the line", () => {
  const line = formatEvent(1, ADA, "handed_on", { customerId: BO, to: "x", note: "she is allergic to nuts", token: "SECRETSECRET" });
  expect(line).not.toContain("SECRETSECRET");
  expect(line).not.toContain("allergic");
  expect(line).toContain("note=yes");
});
