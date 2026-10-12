import { describe, expect, it } from "vitest";
import { DEVICE_SLOTS, DEVICE_SLOT_BY_ID } from "../src/shared/slots.ts";
import { TABLES } from "../src/shared/world.ts";

// Promise: a device slot id is stable and unique, every slot sits inside its
// own table's footprint, and the lookup map agrees with the list — because
// both the 3D render and the server's inspect range-check (D39) key off this
// id, a collision or an off-table position would let two different devices
// answer to the same id, or let "inspect" validate a position nothing is
// actually drawn at.

describe("device slots", () => {
  it("has a unique id per slot", () => {
    const ids = DEVICE_SLOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no slots on service tables", () => {
    const serviceIds = new Set(TABLES.filter((t) => t.service).map((t) => t.id));
    expect(DEVICE_SLOTS.some((s) => serviceIds.has(s.tableId))).toBe(false);
  });

  it("sits within its own table's footprint", () => {
    const byId = new Map(TABLES.map((t) => [t.id, t]));
    for (const s of DEVICE_SLOTS) {
      const t = byId.get(s.tableId)!;
      expect(Math.abs(s.x - t.x), s.id).toBeLessThanOrEqual(t.w / 2 + 1e-6);
      expect(Math.abs(s.z - t.z), s.id).toBeLessThanOrEqual(t.d / 2 + 1e-6);
    }
  });

  it("faces the -x side outward and the +x side outward", () => {
    for (const s of DEVICE_SLOTS) {
      expect(s.rotY, s.id).toBe(s.side === "-x" ? -Math.PI / 2 : Math.PI / 2);
    }
  });

  it("agrees with its own lookup map", () => {
    for (const s of DEVICE_SLOTS) expect(DEVICE_SLOT_BY_ID.get(s.id)).toEqual(s);
  });
});
