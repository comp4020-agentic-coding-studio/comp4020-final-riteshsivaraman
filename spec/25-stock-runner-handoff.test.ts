import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { engagedMoment } from "../src/shared/engage.ts";
import { NPCS, npcPose } from "../src/shared/npcs.ts";
import type { Engagement, ServerMessage } from "../src/shared/protocol.ts";
import { migrate } from "../src/server/migrate.ts";
import { chooseTurn, closeTalk, enter, ORDER_MS, settleVisits, startTalk, TALK_RANGE, type Ctx, type Employee, type Outgoing } from "../src/server/service.ts";
import { seedStock } from "../src/server/stock.ts";

// Issue #25: "the stock runner never hands off the bag". Root cause (confirmed
// on the issue): once a sale is agreed, the specialist's conversation ends, so
// `engagements()` stops tracking it and `placeOf` falls through to its free
// roaming daily-schedule position. `settleOrders` recomputes that position
// every tick and rebuilds the runner's walk target from scratch whenever the
// specialist has drifted more than TALK_RANGE - 0.2 away from it. On a fixed
// clock (the existing spec/service.test.ts uses NOW = 1000, a single second)
// the specialist never actually moves, so that rebuild branch never refires
// and the suite stays green while a live deployment, ticking over real wall
// time, times out every single sale.
//
// This spec drives the server the way a live deployment actually does: the
// client polls `settle` every 500 ms while an order is open (src/client/src/net.ts
// pollSettle), but the specialist's daily schedule (storeday.ts) moves it to a
// new post well inside ORDER_MS regardless of tick cadence. What actually
// reproduces the bug, 3/3 against a slow tick and never against a 500 ms one
// in a short run, is a server that misses `settle` beats for a while — exactly
// what a loaded/throttled/containerized server (the bot-tester's Docker
// harness, named on the issue) does under normal load. A single stock order
// should still complete well within ORDER_MS no matter how coarsely the
// server is polled, because `settleOrders`'s own retry logic is what breaks
// down, not the polling rate the client happens to use.

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedStock(db);
  return db;
}

function last<T extends ServerMessage["type"]>(out: Outgoing[], to: string, type: T): Extract<ServerMessage, { type: T }> | undefined {
  return out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
}

// Drives one S1 sale from "yes" to however far settleOrders gets it, polling
// at `tickMs` (a stand-in for however often the live server actually catches
// up an open order, not necessarily the client's own 500 ms poll rate), and
// returns the order's final stage plus the full type trail of events logged
// for the customer.
// `gap` is the runner-to-specialist distance at the tick the bag changed hands
// (null if it never did): where the runner is drawn, from its own engagement,
// against where spec-phones' day puts it then (its chat has ended, nothing else engages it here).
function driveSale(startMs: number, tickMs: number): { stage: string | undefined; events: string[]; gap: number | null } {
  const db = freshDb();
  const positions = new Map<string, { x: number; z: number }>();
  const employees: Employee[] = [];
  const present: string[] = [];
  const ctx = (now = startMs): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });

  const spec = NPCS.find((n) => n.id === "spec-phones")!;
  const pose = npcPose(spec, startMs);
  const customer = "c1";
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, '#fff', 0, 0)").run(customer, "tok-c1", "Pebble");
  positions.set(customer, { x: pose.x + 1, z: pose.z });
  present.push(customer);
  enter(ctx(startMs), customer, { kind: "customer" });

  let hello = last(startTalk(ctx(startMs), customer, "spec-phones"), customer, "turn")!;
  if (hello.choices.some((c) => c.id === "seat:stand")) {
    hello = last(chooseTurn(ctx(startMs), customer, hello.conversationId, "seat:stand"), customer, "turn")!;
  }
  const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(hello.conversationId) as { data: string };
  const data = JSON.parse(row.data);
  data.scene.pending = { kind: "confirm" };
  db.prepare("UPDATE conversations SET data = ? WHERE id = ?").run(JSON.stringify(data), hello.conversationId);
  // the engine's "yes": the sale is agreed, the chat ends, and the order is placed (fetching)
  chooseTurn(ctx(startMs), customer, hello.conversationId, "opt:yes");
  closeTalk(ctx(startMs + 1000), customer);

  const orderStage = (): string | undefined => (db.prepare("SELECT stage FROM orders ORDER BY created_at DESC").get() as { stage: string } | undefined)?.stage;
  let t = startMs + 1000 + tickMs;
  const end = startMs + ORDER_MS + 15_000; // give it a little past the timeout to let cancellation settle
  let gap: number | null = null;
  for (; t < end; t += tickMs) {
    settleVisits(ctx(t));
    if (orderStage() !== "fetching") {
      if (orderStage() !== "cancelled") {
        const runner = JSON.parse((db.prepare("SELECT runner FROM orders").get() as { runner: string }).runner) as Engagement;
        const r = engagedMoment(runner.npcId, runner, t);
        const s = npcPose(spec, t);
        gap = Math.hypot(r.x - s.x, r.z - s.z);
      }
      break;
    }
  }
  const events = (db.prepare("SELECT type FROM events WHERE visitor_id = ? ORDER BY id").all(customer) as Array<{ type: string }>).map((e) => e.type);
  return { stage: orderStage(), events, gap };
}

describe("S1 purchase flow: the stock runner hands off the bag despite the specialist moving on its own schedule (issue #25)", () => {
  it("completes the hand-off within ORDER_MS even though settleOrders only catches up every 20s (a server missing some live settle beats)", () => {
    // tau=0: spec-phones starts the day walking the floor, then goes idle, then
    // walks off (storeday.ts) to help a customer with phones around tau=25s,
    // then to tablets around tau=85s, and so on — it genuinely relocates
    // several times inside a 3-minute order window regardless of when the
    // order starts.
    const { stage, events } = driveSale(0, 20_000);
    // the defect: this is "cancelled" with why=timeout, never "with_spec"
    expect(stage).toBe("with_spec");
    expect(events).toContain("stock_handed_over");
    expect(events).not.toContain("order_cancelled");
  });

  it("the opposite direction: the order is not satisfied by a mere state change, it specifically hands the bag over, not by just leaving the fetching stage some other way", () => {
    // guards against a fix that makes the order leave "fetching" by cancelling
    // faster, or by some other stage shortcut, instead of actually completing
    // the hand-off (the same bug, with the symptom moved earlier)
    const { stage, events } = driveSale(0, 20_000);
    expect(stage).not.toBe("cancelled");
    expect(events).not.toContain("order_cancelled");
    expect(events).toContain("stock_handed_over");
  });

  it("the bag changes hands only where the runner has actually reached the specialist, at any time of day", () => {
    // guards the opposite of the bug: a fix that hands over wherever the runner
    // happens to stop, with the specialist long gone, passes both tests above.
    // At a 500 ms catch-up the tick that notices the hand-over is within half a
    // second of it, so the specialist cannot have walked far since. Start times
    // span the whole 480 s day so some sales begin just before spec-phones
    // walks off to another table.
    const far: string[] = [];
    for (let s = 0; s < 480_000; s += 15_000) {
      if (!npcPose(NPCS.find((n) => n.id === "spec-phones")!, s).present) continue;
      const { stage, gap } = driveSale(s, 500);
      if (stage !== "with_spec" || gap === null || gap > TALK_RANGE) far.push(`start ${s / 1000}s: ${stage}, gap ${gap?.toFixed(2)} m`);
    }
    expect(far).toEqual([]);
  });
});
