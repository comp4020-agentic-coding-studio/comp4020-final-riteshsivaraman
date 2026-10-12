import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { enter, endInspect, inspections, INSPECT_RANGE, leaveStore, startInspect, startTalk, type Ctx, type Employee, type Outgoing } from "../src/server/service.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";

// Promise: D39's rules hold with nothing but a database — any tabled device
// can be inspected (extended 2026-10-12 past the original phone-only pilot),
// only within range, only one visitor per slot at a time, inspecting one
// device while already looking at another closes the first, and every
// start/end writes its own events row (CLAUDE.md's event-log invariant) so a
// server-log read can answer "is this happening right now", not just "did it
// happen at some point".

const NOW = 1000;
let db: Database.Database;
const positions = new Map<string, { x: number; z: number }>();
const employees: Employee[] = [];
const present: string[] = [];

const ctx = (now = NOW): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
const messagesTo = (out: Outgoing[], to: string, type: ServerMessage["type"]): ServerMessage[] => out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message);
const eventRows = (): Array<{ visitor_id: string; type: string; data: string | null }> =>
  db.prepare("SELECT visitor_id, type, data FROM events ORDER BY id").all() as Array<{ visitor_id: string; type: string; data: string | null }>;

const PHONE_SLOT = "T1:-x:0"; // x=-3.6, z=-7.25 (spec/slots.test.ts)
const PHONE_SLOT_2 = "T1:+x:0"; // a different, unoccupied phone slot on the same table
const TABLET_SLOT = "T3:-x:0";

function addVisitor(id: string, at: { x: number; z: number }): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(id, `tok-${id}`, id);
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind: "customer" });
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
  addVisitor("alice", { x: -3.6, z: -7.25 }); // standing right at PHONE_SLOT
  addVisitor("bob", { x: -3.6, z: -7.25 });
  addVisitor("far", { x: 10, z: 10 });
});

describe("starting an inspection", () => {
  it("lets a visitor in range inspect a phone, and logs it", () => {
    const out = startInspect(ctx(), "alice", PHONE_SLOT);
    expect(messagesTo(out, "all", "inspecting")).toEqual([{ type: "inspecting", slotId: PHONE_SLOT, visitorId: "alice", since: NOW }]);
    expect(inspections(db)).toEqual([{ slotId: PHONE_SLOT, visitorId: "alice", since: NOW }]);
    expect(eventRows()).toContainEqual({ visitor_id: "alice", type: "inspect_start", data: JSON.stringify({ slotId: PHONE_SLOT }) });
  });

  it("refuses a slot that doesn't exist", () => {
    const out = startInspect(ctx(), "alice", "not-a-slot");
    expect(messagesTo(out, "alice", "notice")).toHaveLength(1);
    expect(inspections(db)).toEqual([]);
  });

  it("lets a tablet be inspected too, not just phones (extended past the original pilot)", () => {
    positions.set("alice", { x: -3.6, z: -1.25 }); // right at TABLET_SLOT
    const out = startInspect(ctx(), "alice", TABLET_SLOT);
    expect(messagesTo(out, "all", "inspecting")).toEqual([{ type: "inspecting", slotId: TABLET_SLOT, visitorId: "alice", since: NOW }]);
  });

  it("refuses from outside the range", () => {
    const out = startInspect(ctx(), "far", PHONE_SLOT);
    expect(messagesTo(out, "far", "notice")).toHaveLength(1);
    expect(inspections(db)).toEqual([]);
  });

  it("allows right at the edge of the range, refuses just past it", () => {
    positions.set("alice", { x: -3.6 + INSPECT_RANGE - 0.01, z: -7.25 });
    expect(inspections(db).length).toBe(0);
    startInspect(ctx(), "alice", PHONE_SLOT);
    expect(inspections(db)).toHaveLength(1);

    endInspect(ctx(), "alice", "test reset");
    positions.set("alice", { x: -3.6 + INSPECT_RANGE + 0.5, z: -7.25 });
    startInspect(ctx(), "alice", PHONE_SLOT);
    expect(inspections(db)).toHaveLength(0);
  });

  it("refuses a slot someone else already has (the race D39 exists to prevent)", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    const out = startInspect(ctx(), "bob", PHONE_SLOT);
    expect(messagesTo(out, "bob", "notice")).toHaveLength(1);
    expect(inspections(db)).toEqual([{ slotId: PHONE_SLOT, visitorId: "alice", since: NOW }]);
  });

  it("is a no-op if you ask to inspect what you're already inspecting", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    const before = eventRows().length;
    const out = startInspect(ctx(), "alice", PHONE_SLOT);
    expect(out).toEqual([]);
    expect(eventRows().length).toBe(before);
  });

  it("closes your previous inspection when you look at a second device", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    const out = startInspect(ctx(), "alice", PHONE_SLOT_2);
    expect(messagesTo(out, "all", "inspect_ended")).toEqual([{ type: "inspect_ended", slotId: PHONE_SLOT }]);
    expect(messagesTo(out, "all", "inspecting")).toEqual([{ type: "inspecting", slotId: PHONE_SLOT_2, visitorId: "alice", since: NOW }]);
    expect(inspections(db)).toEqual([{ slotId: PHONE_SLOT_2, visitorId: "alice", since: NOW }]);
  });
});

describe("ending an inspection", () => {
  it("closes the row and logs it", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    const out = endInspect(ctx(), "alice", "tapped away");
    expect(messagesTo(out, "all", "inspect_ended")).toEqual([{ type: "inspect_ended", slotId: PHONE_SLOT }]);
    expect(inspections(db)).toEqual([]);
    expect(eventRows()).toContainEqual({ visitor_id: "alice", type: "inspect_end", data: JSON.stringify({ slotId: PHONE_SLOT, why: "tapped away" }) });
  });

  it("is a no-op for a visitor inspecting nothing", () => {
    expect(endInspect(ctx(), "alice", "whatever")).toEqual([]);
  });

  it("frees the slot for someone else", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    endInspect(ctx(), "alice", "done");
    const out = startInspect(ctx(), "bob", PHONE_SLOT);
    expect(messagesTo(out, "all", "inspecting")).toEqual([{ type: "inspecting", slotId: PHONE_SLOT, visitorId: "bob", since: NOW }]);
  });
});

describe("cleanup", () => {
  it("ends an open inspection when the visitor leaves the store", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    const out = leaveStore(ctx(), "alice");
    expect(messagesTo(out, "all", "inspect_ended")).toEqual([{ type: "inspect_ended", slotId: PHONE_SLOT }]);
    expect(inspections(db)).toEqual([]);
  });

  it("puts down a device when the visitor starts talking to someone instead", () => {
    startInspect(ctx(), "alice", PHONE_SLOT);
    // no NPC/employee set up to talk to, so this is expected to fail to open
    // a conversation — but it should still have put the device down first
    startTalk(ctx(), "alice", "nobody-here");
    expect(inspections(db)).toEqual([]);
  });
});
