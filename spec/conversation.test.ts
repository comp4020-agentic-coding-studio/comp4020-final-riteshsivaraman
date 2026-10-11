import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { PRODUCTS, START_STOCK } from "../src/shared/catalogue.ts";
import { begin, canMove, choicesFor, reachable, step, type ConvState, type Effect, type PlayerStateName, type ScriptId, type StepResult, type World } from "../src/shared/conversation.ts";
import { MIGRATIONS, migrate } from "../src/server/migrate.ts";
import { seedStock, stockOf, takeOne } from "../src/server/stock.ts";

// Promise: a conversation with a character is a state machine whose rules are
// checkable: nobody is stranded, an out-of-stock colour cannot be bought, a
// choice that is not on the menu changes nothing, and the state a visitor ends
// up in is one they could legally move to. Pure functions and an in-memory
// database, so none of this needs the app running.

const SCRIPTS: ScriptId[] = ["greeter", "phones"];
const inStock: World = { stock: () => 2 };
const soldOut: World = { stock: () => 0 };
const ok = (r: StepResult | { error: string }): StepResult => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const choose = (s: ConvState, id: string, w: World): StepResult => ok(step(s, id, w));
const effectsOf = (r: StepResult, type: Effect["type"]): Effect[] => r.effects.filter((e) => e.type === type);

describe("the scripts", () => {
  it("begin on a menu, and set the visitor to in-conversation", () => {
    for (const s of SCRIPTS) {
      const r = begin(s, inStock);
      expect(r.turn.ended).toBe(false);
      expect(r.turn.choices.length).toBeGreaterThan(0);
      expect(r.turn.say.length).toBeGreaterThan(0);
      expect(r.effects).toContainEqual({ type: "player_state", state: "in_conversation" });
    }
  });

  it("have every node reachable, and a way out of each (nobody is stranded)", () => {
    for (const s of SCRIPTS) {
      const nodes = reachable(s);
      expect(nodes.size).toBeGreaterThan(2);
      // from every state reached, some sequence of choices ends the conversation
      const stocks = [inStock, soldOut];
      const memo = new Map<string, boolean>();
      const canEnd = (st: ConvState, depth: number): boolean => {
        const key = `${st.node}|${st.product}|${st.colour}`;
        if (memo.has(key)) return memo.get(key)!;
        memo.set(key, false); // break cycles
        const here = choicesFor(st, inStock);
        if (here.length === 0) {
          memo.set(key, true);
          return true;
        }
        let found = false;
        for (const w of stocks) {
          for (const c of choicesFor(st, w)) {
            const r = step(st, c.id, w);
            if (!("error" in r) && depth < 12 && canEnd(r.state, depth + 1)) found = true;
          }
        }
        memo.set(key, found);
        return found;
      };
      expect(canEnd(begin(s, inStock).state, 0), `${s} can always be ended`).toBe(true);
    }
  });

  it("only ever offer choices that are valid, and every valid choice leads somewhere", () => {
    for (const s of SCRIPTS) {
      const seen: ConvState[] = [begin(s, inStock).state];
      const visited = new Set<string>();
      while (seen.length > 0) {
        const st = seen.pop()!;
        const key = JSON.stringify(st);
        if (visited.has(key)) continue;
        visited.add(key);
        for (const w of [inStock, soldOut]) {
          for (const c of choicesFor(st, w)) {
            const r = step(st, c.id, w);
            expect("error" in r, `${s}:${st.node} -> ${c.id}`).toBe(false);
            if (!("error" in r)) {
              expect(r.turn.say.length).toBeGreaterThan(0);
              seen.push(r.state);
            }
          }
        }
      }
    }
  });

  it("change nothing when asked for a choice that is not on the menu", () => {
    const r = begin("greeter", inStock);
    const bad = step(r.state, "give-me-a-free-phone", inStock);
    expect(bad).toEqual({ error: expect.stringContaining("not an option") });
  });

  it("refuse more turns once ended", () => {
    let r = begin("greeter", inStock);
    r = choose(r.state, "look", inStock);
    expect(r.turn.ended).toBe(true);
    expect(step(r.state, "look", inStock)).toEqual({ error: expect.stringContaining("ended") });
  });
});

describe("the greeter", () => {
  it("asks for a specialist when the visitor wants help with a phone", () => {
    let r = begin("greeter", inStock);
    r = choose(r.state, "phone", inStock);
    r = choose(r.state, "help", inStock);
    expect(r.turn.ended).toBe(true);
    expect(effectsOf(r, "request_help")).toEqual([{ type: "request_help", needs: "specialist:phones" }]);
    expect(r.effects).toContainEqual({ type: "player_state", state: "waiting_for_help", want: "phone", needs: "specialist:phones" });
  });

  it("does not ask for anyone when the visitor would rather browse", () => {
    let r = begin("greeter", inStock);
    r = choose(r.state, "phone", inStock);
    r = choose(r.state, "browse", inStock);
    expect(effectsOf(r, "request_help")).toEqual([]);
    expect(r.effects).toContainEqual({ type: "player_state", state: "browsing", want: "phone" });
  });

  it("sends repairs and pick-ups to the Genius Bar, never to a specialist", () => {
    for (const want of ["repair", "pickup"]) {
      let r = begin("greeter", inStock);
      r = choose(r.state, want, inStock);
      r = choose(r.state, "ok", inStock);
      expect(r.effects).toContainEqual({ type: "player_state", state: "waiting_for_help", want, needs: "genius" });
      expect(effectsOf(r, "request_help")).toEqual([]);
    }
  });
});

describe("the phones specialist and stock", () => {
  const toColours = (w: World, productId = PRODUCTS[0].id): StepResult => {
    let r = begin("phones", w);
    r = choose(r.state, "show", w);
    return choose(r.state, `product:${productId}`, w);
  };

  it("shows how many are left, and says so when none are", () => {
    const stocked = toColours({ stock: () => 3 });
    expect(stocked.turn.choices.some((c) => /\(3 left\)/.test(c.label))).toBe(true);
    const none = toColours(soldOut);
    expect(none.turn.choices.filter((c) => c.id.startsWith("colour:")).every((c) => /out of stock/.test(c.label))).toBe(true);
  });

  it("reserves one when there is stock, and moves the visitor to paying", () => {
    const w: World = { stock: (p, c) => (p === "phone-a" && c === "Graphite" ? 1 : 0) };
    let r = toColours(w, "phone-a");
    r = choose(r.state, "colour:Graphite", w);
    expect(r.turn.ended).toBe(true);
    expect(effectsOf(r, "reserve")).toEqual([{ type: "reserve", product: "phone-a", colour: "Graphite" }]);
    expect(r.effects.some((e) => e.type === "player_state" && e.state === "in_purchase")).toBe(true);
  });

  it("never reserves a colour that is out of stock: it offers something else", () => {
    for (const p of PRODUCTS) {
      for (const colour of p.colours) {
        const r0 = toColours(soldOut, p.id);
        const r = choose(r0.state, `colour:${colour}`, soldOut);
        expect(effectsOf(r, "reserve"), `${p.id} ${colour}`).toEqual([]);
        expect(r.turn.ended).toBe(false);
        expect(r.turn.choices.map((c) => c.id)).toEqual(expect.arrayContaining(["other_colour", "other_phone", "leave"]));
      }
    }
  });

  it("lets the visitor go back and try another colour or another phone after a sell-out", () => {
    let r = toColours(soldOut);
    r = choose(r.state, "colour:Graphite", soldOut);
    const again = choose(r.state, "other_colour", inStock);
    expect(again.state.node).toBe("colours");
    const other = choose(r.state, "other_phone", inStock);
    expect(other.state.node).toBe("models");
  });
});

describe("the visitor's state", () => {
  it("only moves to states a visitor in a conversation could legally reach", () => {
    for (const s of SCRIPTS) {
      const queue: ConvState[] = [begin(s, inStock).state];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const st = queue.pop()!;
        if (visited.has(JSON.stringify(st))) continue;
        visited.add(JSON.stringify(st));
        for (const w of [inStock, soldOut]) {
          for (const c of choicesFor(st, w)) {
            const r = ok(step(st, c.id, w));
            for (const e of r.effects) {
              if (e.type === "player_state") expect(canMove("in_conversation", e.state as PlayerStateName), `${s}:${st.node}->${c.id}`).toBe(true);
            }
            queue.push(r.state);
          }
        }
      }
    }
  });

  it("does not let a visitor who has left come back", () => {
    for (const s of ["arriving", "browsing", "in_conversation"] as PlayerStateName[]) expect(canMove("leaving", s)).toBe(false);
    expect(canMove("browsing", "leaving")).toBe(true);
  });
});

describe("the database", () => {
  it("adds the new tables and columns to a database that already has visitors, keeping them", () => {
    const db = new Database(":memory:");
    migrate(db, MIGRATIONS.slice(0, 1));
    db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES ('a','tok','Pebble','#fff',1,1)").run();
    db.prepare("INSERT INTO events (ts, visitor_id, type) VALUES (1,'a','join')").run();
    migrate(db);
    const row = db.prepare("SELECT role, specialty, look FROM visitors WHERE id = 'a'").get() as Record<string, unknown>;
    expect(row).toEqual({ role: "customer", specialty: null, look: null });
    for (const t of ["player_state", "conversations", "stock"]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t), t).toBeTruthy();
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 1 });
  });

  it("seeds stock once and never resets what the shop has now", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedStock(db);
    const first = db.prepare("SELECT COUNT(*) AS n FROM stock").get() as { n: number };
    expect(first.n).toBe(Object.values(START_STOCK).reduce((a, m) => a + Object.keys(m).length, 0));
    expect(takeOne(db, "phone-a", "Graphite")).toBe(true);
    seedStock(db); // a redeploy
    expect(stockOf(db, "phone-a", "Graphite")).toBe(START_STOCK["phone-a"].Graphite - 1);
  });

  it("lets only one of two visitors take the last unit, and never goes below zero", () => {
    const db = new Database(":memory:");
    migrate(db);
    seedStock(db);
    // phone-a Silver has exactly one
    expect(stockOf(db, "phone-a", "Silver")).toBe(1);
    const results = [takeOne(db, "phone-a", "Silver"), takeOne(db, "phone-a", "Silver")];
    expect(results.filter(Boolean).length).toBe(1);
    expect(stockOf(db, "phone-a", "Silver")).toBe(0);
    expect(takeOne(db, "phone-a", "Blue")).toBe(false); // there were none
    expect(() => db.prepare("UPDATE stock SET qty = -1 WHERE product = 'phone-a'").run()).toThrow();
  });
});
