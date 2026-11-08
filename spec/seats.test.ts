import { describe, expect, it } from "vitest";
import { BAR_SEATS, TABLE_SEATS } from "../src/shared/storeday.ts";
import { seatEyeY, seatHeightAt } from "../src/shared/seats.ts";
import { BAR_STOOL_SEAT_H, STOOL_SEAT_H } from "../src/shared/plan.ts";

const STANDING_EYE = 1.6; // Store.tsx's EYE_HEIGHT, a standing person's eyes

describe("eye level when seated", () => {
  it("a customer on a bar stool is eye to eye with the member of staff standing behind the bar", () => {
    expect(BAR_STOOL_SEAT_H).toBeGreaterThan(STOOL_SEAT_H);
    for (const s of BAR_SEATS) {
      expect(seatHeightAt(s.at.x, s.at.z), s.id).toBe(BAR_STOOL_SEAT_H);
      expect(Math.abs(seatEyeY(BAR_STOOL_SEAT_H) - STANDING_EYE)).toBeLessThan(0.1);
    }
  });
  it("two people sat at a square table sit on the same height of stool, so their eyes are level with each other", () => {
    for (const t of TABLE_SEATS) {
      expect(seatHeightAt(t.guest.at.x, t.guest.at.z), t.id).toBe(STOOL_SEAT_H);
      expect(seatHeightAt(t.host.at.x, t.host.at.z), t.id).toBe(STOOL_SEAT_H);
    }
  });
  it("the bar stools still clear the underside of the bar top", async () => {
    const { COUNTER } = await import("../src/shared/world.ts");
    expect(COUNTER.h - BAR_STOOL_SEAT_H).toBeGreaterThan(0.18); // room for the thighs
  });
});
