import { afterAll, expect, it } from "vitest";
import { formatEvent, setNameLookup } from "../src/server/eventlog.ts";
import { narrateLine, parseLine } from "../src/server/narrate.ts";

// Promise: the log can be read back as a story. Every line says who by name, and
// `pnpm narrate` turns a stretch of `flyctl logs` into sentences without opening
// the app (crit 10, "Fly by instruments"). Pure: only the lines are used.
const PEBBLE = "11111111-aaaa-bbbb-cccc-000000000001";
const SAM = "22222222-aaaa-bbbb-cccc-000000000002";
const NAMES: Record<string, string> = { [PEBBLE]: "Pebble", [SAM]: "Sam", "greeter-1": "Maya", "spec-phones": "Theo", "stock-runner": "Owen" };
setNameLookup((id) => NAMES[id]);
afterAll(() => setNameLookup(() => undefined));

const T = Date.UTC(2026, 9, 21, 5, 30, 0);
const line = (ms: number, who: string | null, type: string, data?: unknown): string => formatEvent(T + ms * 1000, who, type, data);

it("puts the actor's name on every line, and names the other people in it", () => {
  const l = line(1, PEBBLE, "intent_shown", { from: "greeter-1", to: PEBBLE, reason: "greet", queued: false });
  expect(l).toContain("who=Pebble");
  expect(l).toContain("fromName=Maya");
  expect(l).toContain("toName=Pebble");
  expect(l).not.toContain("token");
});

it("reads a visit back as sentences, in order, from the lines alone", () => {
  const sale = { name: "iPhone 18 Pro", colour: "Silver", storage: "256GB", price: 1999 };
  const log = [
    line(0, PEBBLE, "join", { name: "Pebble", kind: "customer", role: "customer", zone: "outside" }),
    line(2, PEBBLE, "zone", { from: "outside", to: "entrance" }),
    line(3, PEBBLE, "npc_approached", { npcId: "greeter-1" }),
    line(4, PEBBLE, "conversation_started", { conversationId: "c0ffee99-1111-2222-3333-444444444444", with: "spec-phones", kind: "npc", script: "phones" }),
    line(60, PEBBLE, "order_placed", { orderId: "a", conversationId: "c0ffee99-1111-2222-3333-444444444444", spec: "spec-phones", stockId: "stock-runner", sale }),
    line(90, PEBBLE, "stock_handed_over", { orderId: "a", stockId: "stock-runner", to: "spec-phones" }),
    line(120, PEBBLE, "purchase_paid", { conversationId: "dddddddd-1111-2222-3333-444444444444", by: "spec-phones", method: "card", sale }),
    line(130, PEBBLE, "leave"),
    "listening on http://0.0.0.0:8080", // the platform's own line is not part of the story
  ];
  const story = log.map(narrateLine).filter((s): s is string => s !== null);
  expect(story).toHaveLength(8);
  expect(story[0]).toMatch(/05:30:00 {2}Pebble came in as a customer \(outside\)/);
  expect(story[1]).toContain("Pebble went from outside to entrance");
  expect(story[2]).toContain("Maya went up to Pebble");
  expect(story[3]).toContain("Pebble began talking with Theo");
  expect(story[4]).toMatch(/order placed for Pebble: Silver iPhone 18 Pro \(A\$1999\), specialist Theo, runner Owen/);
  expect(story[5]).toContain("Owen handed the bag to Theo");
  expect(story[6]).toContain("Pebble paid for Silver iPhone 18 Pro (A$1999) (card)");
  expect(story[7]).toMatch(/05:32:10 {2}Pebble left/);
});

it("parses quoted text and a json value in one line", () => {
  const p = parseLine(line(1, SAM, "notice", { text: 'Walk a little closer first. "now"' }));
  expect(p?.fields.text).toBe('Walk a little closer first. "now"');
  expect(narrateLine(line(1, SAM, "notice", { text: "Not yet." }))).toContain('the store told Sam: "Not yet."');
});

it("says something sensible for an event it has no sentence for", () => {
  expect(narrateLine(line(1, PEBBLE, "brand_new_event", { thing: 3 }))).toContain("Pebble: brand_new_event thing=3");
});
