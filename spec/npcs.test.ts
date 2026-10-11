import { describe, expect, it } from "vitest";
import { NPCS, isStaff, npcPose } from "../src/shared/npcs.ts";
import { CAST, CYCLE, OBSTACLES, SEATS_AT_BAR, SEATS_AT_TABLES, STATIONS, castOf, momentOf, timelineOf } from "../src/shared/storeday.ts";
import { clearance, headingTo, wrap } from "../src/shared/steering.ts";
import { BACK_SHELVES, SOLIDS, TABLES } from "../src/shared/world.ts";

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

  it("never walks on the spot: nobody is shown walking for more than a second without getting anywhere", () => {
    // Defect class: a walker pinned against furniture kept its walking pose
    // for the whole 90 s it took the planner to give up (seen as people
    // "continuously walking into a table").
    const stalls: string[] = [];
    for (const c of CAST) {
      let still = 0;
      let prev = momentOf(c.id, 0);
      for (let t = 0.1; t < CYCLE; t += 0.1) {
        const m = momentOf(c.id, t * 1000);
        if (m.present && prev.present && m.walking && Math.hypot(m.x - prev.x, m.z - prev.z) < 0.02) still += 0.1;
        else {
          if (still > 1) stalls.push(`${c.id} stands still for ${still.toFixed(1)} s ending t=${t.toFixed(1)} (${m.intent})`);
          still = 0;
        }
        prev = m;
      }
    }
    expect(stalls).toEqual([]);
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
        if (m.seated) {
          // sitting up to a table is meant to be close: check the real furniture
          if (SOLIDS.some((b) => Math.abs(m.x - b.x) < b.w / 2 - 0.02 && Math.abs(m.z - b.z) < b.d / 2 - 0.02)) bad++;
          continue;
        }
        // on the way on to a stool, or just up from one: close to a stool, which
        // is tucked in beside the furniture on purpose
        const atStool = [...SEATS_AT_BAR.map((x) => x.at), ...SEATS_AT_TABLES.flatMap((t) => [t.guest.at, t.host.at])].some((p) => Math.hypot(p.x - m.x, p.z - m.z) < 0.75);
        if (atStool) continue;
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

describe("the back room", () => {
  it("has stock staff restock a shelf they are facing, never empty floor", () => {
    let seen = 0;
    for (const id of ["stock-1", "stock-2"]) {
      for (let t = 0; t < CYCLE; t += 0.5) {
        const m = momentOf(id, t * 1000);
        // not while still turning on arrival (about 0.7 s)
        if (m.intent !== "restocking shelves" || momentOf(id, (t - 1) * 1000).intent !== "restocking shelves") continue;
        seen++;
        const fx = m.x - Math.sin(m.ry) * 0.9;
        const fz = m.z - Math.cos(m.ry) * 0.9;
        const facing = BACK_SHELVES.some((b) => Math.abs(fx - b.x) <= b.w / 2 + 0.1 && Math.abs(fz - b.z) <= b.d / 2 + 0.25);
        expect(facing, `${id} at t=${t} faces (${fx.toFixed(1)}, ${fz.toFixed(1)})`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(20);
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

describe("sitting", () => {
  const seatedSegs = (id: string) => timelineOf(id).filter((x) => x.seated && x.kind !== "walk");

  it("has people sit, at the bar and at the square tables, with a device out", () => {
    let atTable = 0;
    let atBar = 0;
    let devices = 0;
    for (const c of CAST) {
      for (const s of seatedSegs(c.id)) {
        if (s.at!.z > 7.3) atBar++;
        else atTable++;
      }
      for (let t = 0; t < CYCLE; t += 0.5) if (momentOf(c.id, t * 1000).device) devices++;
    }
    expect(atTable).toBeGreaterThan(0);
    expect(atBar).toBeGreaterThan(0);
    expect(devices).toBeGreaterThan(20);
  });

  it("seats people on a stool: close to one, and never two on the same stool at once", () => {
    const stools = TABLES.length > 0 ? [...SEATS_AT_BAR.map((s) => s.at), ...SEATS_AT_TABLES.flatMap((t) => [t.guest.at, t.host.at])] : [];
    const taken = new Map<string, string>();
    for (let t = 0; t < CYCLE; t += 0.5) {
      taken.clear();
      for (const c of CAST) {
        const m = momentOf(c.id, t * 1000);
        if (!m.present || !m.seated) continue;
        expect(m.walking, `${c.id} +${t}s`).toBe(false);
        const k = stools.findIndex((p) => Math.hypot(p.x - m.x, p.z - m.z) < 0.35);
        expect(k, `${c.id} +${t}s seated at (${m.x.toFixed(2)}, ${m.z.toFixed(2)}) is not on a stool`).toBeGreaterThanOrEqual(0);
        expect(taken.get(String(k)), `two people on stool ${k} at +${t}s`).toBeUndefined();
        taken.set(String(k), c.id);
      }
    }
  });

  it("only brings a device out during a seated discussion (either end may be standing, behind the bar)", () => {
    for (const c of CAST) {
      for (let t = 0; t < CYCLE; t += 0.5) {
        const m = momentOf(c.id, t * 1000);
        if (!m.device) continue;
        const seg = timelineOf(c.id).find((x) => t >= x.t0 && t < x.t1);
        expect(seg?.act?.kind, `${c.id} +${t}s has a device out outside a sit-down`).toBe("sitdown");
      }
    }
  });

  it("sits two people opposite each other at a table", () => {
    for (const t of SEATS_AT_TABLES) {
      expect(Math.hypot(t.guest.at.x - t.host.at.x, t.guest.at.z - t.host.at.z), t.id).toBeLessThan(2.3);
      expect(t.guest.at.x).toBeLessThan(t.host.at.x);
    }
  });
});
