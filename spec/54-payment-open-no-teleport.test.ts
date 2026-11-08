import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { engagedMoment } from "../src/shared/engage.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { Engagement, ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import { chooseTurn, closeTalk, enter, settleVisits, startTalk, TALK_RANGE, type Ctx, type Employee, type Outgoing } from "../src/server/service.ts";
import { seedStock } from "../src/server/stock.ts";

// Issue #54: "when a staff initiates a convo with me to hand me the bag, some
// weird teleportation takes place". An NPC specialist walking the bag over is
// drawn from the pay visit's engagement; when the payment opens, the server
// broadcasts a new `engaged` for the same NPC. Every client switches to it on
// that frame, so wherever the new engagement puts the NPC at that instant is
// where it is drawn. If that differs from where the old one had it, the NPC
// (and the customer's conversation camera aimed at its face) jumps.
//
// The customer shuffles a little after the specialist sets off, the way any
// real player does while waiting. Standing perfectly still hid the bug.

function last<T extends ServerMessage["type"]>(out: Outgoing[], to: string, type: T): Extract<ServerMessage, { type: T }> | undefined {
  return out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
}

const SPEC = "spec-phones";

// Drives one sale from "yes" until the payment opens. Returns the NPC's drawn
// spot just before and just after the new engagement takes over, and the
// customer's spot then (null if payment never opened).
function payOpens(startMs: number, shuffle: number): { before: { x: number; z: number }; after: { x: number; z: number }; customer: { x: number; z: number }; settled: { x: number; z: number } } | null {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  const positions = new Map<string, { x: number; z: number }>();
  const employees: Employee[] = [];
  const present: string[] = [];
  const ctx = (now: number): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
  const pose = npcPose(NPCS.find((n) => n.id === SPEC)!, startMs);
  const c = "c1";
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(c, "tok-c1", "Pebble");
  positions.set(c, { x: pose.x + 1, z: pose.z });
  present.push(c);
  enter(ctx(startMs), c, { kind: "customer" });
  let hello = last(startTalk(ctx(startMs), c, SPEC), c, "turn")!;
  if (hello.choices.some((x) => x.id === "seat:stand")) hello = last(chooseTurn(ctx(startMs), c, hello.conversationId, "seat:stand"), c, "turn")!;
  const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(hello.conversationId) as { data: string };
  const data = JSON.parse(row.data);
  data.scene.pending = { kind: "confirm" };
  db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(data), hello.conversationId);
  chooseTurn(ctx(startMs), c, hello.conversationId, "opt:yes");
  closeTalk(ctx(startMs + 1000), c);

  let drawn: Engagement | undefined;
  let shuffled = false;
  for (let t = startMs + 1500; t < startMs + 200_000; t += 250) {
    const out = settleVisits(ctx(t));
    const prev = drawn;
    for (const o of out) {
      if (o.message.type !== "engaged" || o.message.npcId !== SPEC) continue;
      const { type: _t, ...e } = o.message;
      drawn = e;
    }
    // the specialist has set off with the bag: the customer takes a step
    if (!shuffled && shuffle > 0 && db.prepare("SELECT 1 FROM intents WHERE status = 'open'").get()) {
      const p = positions.get(c)!;
      positions.set(c, { x: p.x + shuffle, z: p.z });
      shuffled = true;
    }
    if (last(out, c, "turn")) {
      if (!prev || !drawn) return null;
      const a = engagedMoment(SPEC, prev, t);
      const b = engagedMoment(SPEC, drawn, t);
      const s = engagedMoment(SPEC, drawn, t + 30_000);
      return { before: { x: a.x, z: a.z }, after: { x: b.x, z: b.z }, customer: positions.get(c)!, settled: { x: s.x, z: s.z } };
    }
  }
  return null;
}

const CASES: Array<[number, number]> = [];
for (const s of [0, 30_000, 60_000, 120_000, 200_000]) for (const shuffle of [0, 0.8, 1.4]) CASES.push([s, shuffle]);

describe("the specialist does not teleport when the payment opens (issue #54)", () => {
  it("the NPC is drawn in the same place on the tick the payment conversation opens as on the tick before", () => {
    const jumps: string[] = [];
    for (const [s, shuffle] of CASES) {
      if (!npcPose(NPCS.find((n) => n.id === SPEC)!, s).present) continue;
      const r = payOpens(s, shuffle);
      if (!r) {
        jumps.push(`start ${s / 1000}s shuffle ${shuffle} m: payment never opened`);
        continue;
      }
      const d = Math.hypot(r.after.x - r.before.x, r.after.z - r.before.z);
      if (d > 0.05) jumps.push(`start ${s / 1000}s shuffle ${shuffle} m: jumped ${d.toFixed(2)} m`);
    }
    expect(jumps).toEqual([]);
  });

  it("the opposite direction: it still ends up standing within talking range of the customer, facing them, not left where it was", () => {
    // guards a fix that stops the jump by freezing the NPC wherever it is,
    // even if the customer has stepped well away from it
    const far: string[] = [];
    for (const [s, shuffle] of CASES) {
      if (!npcPose(NPCS.find((n) => n.id === SPEC)!, s).present) continue;
      const r = payOpens(s, shuffle);
      if (!r) continue;
      const d = Math.hypot(r.settled.x - r.customer.x, r.settled.z - r.customer.z);
      if (d > TALK_RANGE - 1) far.push(`start ${s / 1000}s shuffle ${shuffle} m: ${d.toFixed(2)} m from the customer`);
    }
    expect(far).toEqual([]);
  });
});
