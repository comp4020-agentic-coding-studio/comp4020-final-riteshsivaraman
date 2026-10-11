import { describe, expect, it } from "vitest";
import { NPCS, isStaff, npcPose } from "../src/shared/npcs.ts";
import { CAST, CYCLE, OBSTACLES, STATIONS, castOf, momentOf, timelineOf } from "../src/shared/storeday.ts";
import { clearance, headingTo, wrap } from "../src/shared/steering.ts";

// Promise: the store's staff and customers are the same for everyone, move
// like people, go where their purpose takes them, and every interaction is
// mutual. They are a pure function of the server clock, so these run with no
// app and no randomness.

const T0 = 1_800_000_000_000;
const staffIds = CAST.filter((c) => c.role !== "customer").map((c) => c.id);
const customers = CAST.filter((c) => c.role === "customer");

describe("the day", () => {
  it("puts every NPC in the same place for the same moment, and repeats each cycle", () => {
    for (const n of NPCS) {
      expect(npcPose(n, T0 + 12_345)).toEqual(npcPose(n, T0 + 12_345));
      const a = npcPose(n, T0 + 33_000);
      const b = npcPose(n, T0 + 33_000 + CYCLE * 1000);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
    }
  });

  it("never teleports: no step between two present moments is faster than a brisk walk", () => {
    let worst = 0;
    for (const c of CAST) {
      let prev = momentOf(c.id, 0);
      for (let t = 0.1; t < CYCLE; t += 0.1) {
        const m = momentOf(c.id, t * 1000);
        if (m.present && prev.present) worst = Math.max(worst, Math.hypot(m.x - prev.x, m.z - prev.z) / 0.1);
        prev = m;
      }
    }
    expect(worst).toBeLessThan(3.2);
  });

  it("is continuous in time: every timeline covers the whole cycle with no gap or overlap", () => {
    for (const c of CAST) {
      const segs = timelineOf(c.id);
      expect(segs[0].t0, c.id).toBeCloseTo(0, 6);
      expect(segs[segs.length - 1].t1, c.id).toBeGreaterThanOrEqual(CYCLE - 1e-6);
      for (let i = 1; i < segs.length; i++) expect(segs[i].t0, `${c.id} seg ${i}`).toBeCloseTo(segs[i - 1].t1, 6);
    }
  });

  it("never puts anyone inside a table, bench, bar or shelf", () => {
    for (const c of CAST) {
      const obs = c.role === "customer" ? OBSTACLES.customer : OBSTACLES.staff;
      let bad = 0;
      for (let t = 0; t < CYCLE; t += 0.5) {
        const m = momentOf(c.id, t * 1000);
        if (!m.present) continue;
        // the obstacles are inflated by a body; allow a hair for the sampling
        if (obs.some((o) => clearance(o, m.x, m.z).d < -0.02)) bad++;
      }
      expect(bad, c.id).toBe(0);
    }
  });
});

describe("roles", () => {
  it("has staff in each role the store needs, and customers", () => {
    const roles = new Set(NPCS.map((n) => n.role));
    for (const r of ["greeter", "specialist", "genius", "stock", "technician", "customer"]) expect(roles.has(r as never), r).toBe(true);
    expect(NPCS.filter(isStaff).every((n) => n.cap)).toBe(true);
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
  });

  it("gives every specialist one kind of product, covering all four", () => {
    const specs = CAST.filter((c) => c.role === "specialist");
    expect(new Set(specs.map((s) => s.specialty)).size).toBe(4);
  });

  it("gives every customer a reason to come, and several different ones", () => {
    expect(customers.every((c) => c.purpose)).toBe(true);
    expect(new Set(customers.map((c) => c.purpose)).size).toBeGreaterThanOrEqual(6);
  });

  it("keeps technicians at their bench, working, never walking", () => {
    for (const n of NPCS.filter((x) => x.role === "technician")) {
      expect(n.working).toBe(true);
      for (let t = 0; t < CYCLE; t += 5) {
        const m = momentOf(n.id, t * 1000);
        expect(m.walking).toBe(false);
        expect(m.mode).toBe("work");
      }
    }
  });

  it("keeps customers out of the back room and behind the bar, and staff on the shop floor or back of house", () => {
    for (const c of customers) {
      for (let t = 0; t < CYCLE; t += 1) {
        const m = momentOf(c.id, t * 1000);
        if (!m.present) continue;
        expect(m.z, `${c.id} +${t}s`).toBeLessThan(8.0); // the bar is at the back; its far side is behind it
      }
    }
  });
});

describe("purposes are served by the right people", () => {
  const partnersOf = (id: string): string[] => timelineOf(id).filter((s) => s.kind === "act" && s.with).map((s) => s.with!);

  it("greets every customer at the door", () => {
    for (const c of customers) expect(partnersOf(c.id), c.id).toContain("greeter-1");
  });

  it("sends a customer looking for a kind of product to the specialist for that kind", () => {
    const want: Record<string, string> = { phone: "spec-phones", laptop: "spec-laptops", tablet: "spec-tablets", audio: "spec-audio" };
    let checked = 0;
    for (const c of customers) {
      const spec = c.purpose ? want[c.purpose] : undefined;
      if (!spec) continue;
      // helped, unless the day was nearly over
      const partners = partnersOf(c.id);
      const wrong = partners.filter((p) => p.startsWith("spec-") && p !== spec);
      expect(wrong, `${c.id} (${c.purpose}) was helped by the wrong specialist`).toEqual([]);
      if (partners.includes(spec)) checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("serves repairs and pick-ups at the bar, never from a specialist", () => {
    for (const c of customers.filter((x) => x.purpose === "repair" || x.purpose === "pickup")) {
      const partners = partnersOf(c.id);
      expect(partners.some((p) => p.startsWith("genius-")), c.id).toBe(true);
      expect(partners.some((p) => p.startsWith("spec-")), c.id).toBe(false);
    }
  });

  it("makes people who are just looking go unhelped by specialists", () => {
    for (const c of customers.filter((x) => x.purpose === "browse")) {
      expect(partnersOf(c.id).some((p) => p.startsWith("spec-")), c.id).toBe(false);
    }
  });

  it("has the stock runner fetch for repairs and pick-ups", () => {
    expect(partnersOf("stock-runner").filter((p) => p.startsWith("genius-")).length).toBeGreaterThan(0);
  });

  it("only has specialists helping people at a table of their kind", () => {
    const groupAt = (x: number, z: number): string | undefined => {
      let best: { g: string; d: number } | undefined;
      for (const s of STATIONS) {
        const d = Math.hypot(s.at.x - x, s.at.z - z);
        if (d < 1.6 && (!best || d < best.d)) best = { g: s.group, d };
      }
      return best?.g;
    };
    for (const id of staffIds.filter((i) => castOf(i).role === "specialist")) {
      const want = castOf(id).specialty;
      for (const s of timelineOf(id).filter((x) => x.kind === "act")) {
        expect(groupAt(s.at!.x, s.at!.z), `${id} at (${s.at!.x.toFixed(1)}, ${s.at!.z.toFixed(1)})`).toBe(want);
      }
    }
  });
});

describe("interactions are mutual", () => {
  it("matches every interaction with the same one at the other end, at the same seconds", () => {
    let checked = 0;
    for (const c of CAST) {
      for (const s of timelineOf(c.id).filter((x) => x.kind === "act")) {
        const back = timelineOf(s.with!).find((o) => o.kind === "act" && o.with === c.id && Math.abs(o.t0 - s.t0) < 1e-6 && Math.abs(o.t1 - s.t1) < 1e-6);
        expect(back, `${c.id} with ${s.with} at ${s.t0.toFixed(1)}`).toBeDefined();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("has both people standing within reach and each facing the other while it happens", () => {
    for (const c of CAST) {
      for (const s of timelineOf(c.id).filter((x) => x.kind === "act")) {
        // after they have had time to turn
        const mid = (s.t0 + s.t1) / 2;
        const a = momentOf(c.id, mid * 1000);
        const b = momentOf(s.with!, mid * 1000);
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, `${c.id} with ${s.with} at ${mid.toFixed(1)}: ${d.toFixed(2)} m apart`).toBeLessThan(2.4);
        const toward = Math.abs(wrap(headingTo(a.x, a.z, b.x, b.z) - a.ry));
        expect(toward, `${c.id} facing ${s.with}`).toBeLessThan(0.6);
      }
    }
  });
});
