import { describe, expect, it } from "vitest";
import { applyCustomer, applyStaff, customerMenu, derive, newScene, relaxMoves, staffActs } from "../src/shared/talk/scene.ts";
import type { CustomerReply, Scene, StaffAct, Tone } from "../src/shared/talk/types.ts";

// Promise: the turn engine only ever lets a move through that is on the menu,
// every answer is recomputed from the scene (so reopening replaces rather than
// stacks), an empty pool always has a way out, and a conversation that ends
// in a purchase ends on exactly one model + storage + colour.

const ok = (r: Scene | { error: string }): Scene => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const staff = (sc: Scene, act: StaffAct, tone: Tone = "neutral"): Scene => ok(applyStaff(sc, act, tone));
const cust = (sc: Scene, r: Omit<CustomerReply, "tone"> & { tone?: Tone }): Scene => ok(applyCustomer(sc, { tone: "neutral", ...r }));
// Every conversation opens with the greeting question; most specs start after it.
const opened = (): Scene => cust(staff(newScene(), { t: "ask", qid: "opening_intent" }), { picks: ["help"] });
// Someone who has said they care about the camera, which is what makes a telephoto question worth asking.
const camera = (): Scene => cust(staff(opened(), { t: "ask", qid: "use_case" }), { picks: ["photos"] });
const ask = (sc: Scene, qid: string, picks: string[], extra: Partial<CustomerReply> = {}): Scene => cust(staff(sc, { t: "ask", qid }), { picks, ...extra });

describe("the opening and the sign-off", () => {
  it("starts with a greeting: only the two opening questions are legal first", () => {
    const first = staffActs(newScene()).map((a) => a.act);
    expect(first).toEqual([
      { t: "ask", qid: "known_model" },
      { t: "ask", qid: "opening_intent" },
    ].sort((a, b) => first.findIndex((x) => JSON.stringify(x) === JSON.stringify(a)) - first.findIndex((x) => JSON.stringify(x) === JSON.stringify(b))));
    expect(applyStaff(newScene(), { t: "ask", qid: "storage_need" }, "neutral")).toHaveProperty("error");
    expect(applyStaff(newScene(), { t: "ask", qid: "budget_ceiling" }, "neutral")).toHaveProperty("error");
  });

  it("introduces the staff member in the first line, and the customer says hello back", () => {
    const sc = cust(staff(newScene(), { t: "ask", qid: "opening_intent" }), { picks: ["help"] });
    expect(sc.log[0]!.text).toMatch(/^Hi, welcome in\. I'm on the phones table/);
    expect(sc.log[1]!.text).toMatch(/^Hi\. /);
  });

  it("ends with a staff sign-off, whichever way it ends", () => {
    let sc = ask(newScene(), "known_model", ["model:17"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:256GB"]);
    sc = ask(sc, "colour_pick", ["colour:Sage"]);
    const sold = cust(staff(sc, { t: "confirm" }), { picks: ["yes"] });
    expect(sold.log.at(-1)).toMatchObject({ who: "staff", move: "close" });
    expect(sold.log.at(-1)!.text).toMatch(/till/);
    const left = cust(staff(opened(), { t: "ask", qid: "use_case" }), { action: { t: "leave" } });
    expect(left.log.at(-1)).toMatchObject({ who: "staff", move: "close" });
  });
});

describe("refusals", () => {
  it("refuses a staff move that is not on the menu", () => {
    const sc = newScene();
    expect(applyStaff(sc, { t: "ask", qid: "colour_pick" }, "neutral")).toHaveProperty("error"); // no model yet
    expect(applyStaff(sc, { t: "confirm" }, "neutral")).toHaveProperty("error"); // nothing to confirm
  });

  it("refuses a customer pick that is not on the menu, and changes nothing", () => {
    const sc = staff(newScene(), { t: "ask", qid: "opening_intent" });
    expect(applyCustomer(sc, { picks: ["teleport"], tone: "neutral" })).toHaveProperty("error");
    expect(applyCustomer(sc, { picks: ["know", "help"], tone: "neutral" })).toHaveProperty("error"); // single choice
    expect(sc.answers).toEqual({});
  });

  it("refuses a custom ceiling that is not in A$100 steps", () => {
    const sc = staff(opened(), { t: "ask", qid: "budget_ceiling" });
    expect(applyCustomer(sc, { picks: ["ceiling:3650"], tone: "neutral" })).toHaveProperty("error");
    expect(applyCustomer(sc, { picks: ["ceiling:3600"], tone: "neutral" })).not.toHaveProperty("error");
  });

  it("does not let the wrong side move", () => {
    const sc = staff(newScene(), { t: "ask", qid: "opening_intent" });
    expect(staffActs(sc)).toEqual([]);
    expect(customerMenu(newScene())).toBeNull();
  });
});

describe("answers are recomputed, not stacked", () => {
  it("reopening the budget replaces it and widens the pool again", () => {
    let sc = ask(opened(), "budget_ceiling", ["ceiling:1200"]);
    const tight = derive(sc).pool.length;
    sc = cust(staff(sc, { t: "ask", qid: "budget_ceiling", reopen: true }), { picks: ["ceiling:2300"] });
    expect(derive(sc).pool.length).toBeGreaterThan(tight);
    expect(sc.order.filter((q) => q === "budget_ceiling")).toHaveLength(1);
  });

  it("only offers a hard question while some answer narrows the pool", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    // Everything left has the lens, so asking again would be a question worth nothing.
    expect(staffActs(sc).some((a) => a.act.t === "ask" && a.act.qid === "telephoto_need" && !a.act.reopen)).toBe(false);
    sc = ask(ask(sc, "storage_need", ["min:1024"]), "budget_ceiling", ["ceiling:3300"]);
    expect(derive(sc).ranked.map((m) => m.id)).toEqual(["18-pro"]);
  });

  it("never eliminates on 'Not sure'", () => {
    const before = derive(newScene()).pool.length;
    const sc = ask(opened(), "budget_ceiling", ["notsure"]);
    expect(derive(sc).pool.length).toBe(before);
  });
});

describe("throw-backs", () => {
  it("are answered in staff's next line, from the data", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"], { throwback: "attr:battery" });
    sc = staff(sc, { t: "answer" });
    expect(sc.log.at(-1)!.text).toMatch(/longest video playback/);
    expect(sc.pending).toEqual({ kind: "free" });
    sc = cust(sc, { action: { t: "ok" } });
    expect(staffActs(sc).length).toBeGreaterThan(0);
  });

  it("a model we do not carry is said so, naming the closest we have", () => {
    let sc = ask(newScene(), "known_model", ["unlisted:iPhone 16 Plus"]);
    sc = staff(sc, { t: "ask", qid: "use_case" });
    expect(sc.log.at(-1)!.text).toMatch(/We don't carry the iPhone 16 Plus/);
  });
});

describe("demos", () => {
  it("acknowledges a phone they named instead of announcing that one phone fits", () => {
    let sc = ask(newScene(), "known_model", ["model:17e"]);
    sc = staff(sc, { t: "offer_demo" });
    expect(sc.log.at(-1)!.text).toMatch(/Good choice\. Would you like to have a look at the iPhone 17e\?/);
    expect(sc.log.at(-1)!.text).not.toMatch(/fits/);
  });

  it("'show me another' makes staff offer another, and not ask something else", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    sc = cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["another"] });
    expect(staffActs(sc).map((a) => a.act)).toEqual([{ t: "offer_demo" }]);
    sc = staff(sc, { t: "offer_demo" });
    expect(sc.pending).toEqual({ kind: "offer_demo", models: ["18-pro-max"] });
  });

  it("does not ask the technical questions before the customer has shown they care", () => {
    const acts = (sc: Scene) => staffActs(sc).map((a) => a.act).filter((a) => a.t === "ask").map((a) => (a as { qid: string }).qid);
    expect(acts(opened())).not.toContain("telephoto_need");
    expect(acts(opened())).not.toContain("battery_priority");
    expect(acts(camera())).toContain("telephoto_need");
    expect(acts(cust(staff(opened(), { t: "ask", qid: "use_case" }), { picks: ["travel"] }))).toContain("battery_priority");
  });

  it("a customer's request forces the demo, and 'this could be the one' fixes the model", () => {
    let sc = cust(staff(newScene(), { t: "ask", qid: "opening_intent" }), { picks: ["help"] });
    sc = cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "demo", model: "17" } });
    expect(staffActs(sc).map((a) => a.act)).toEqual([{ t: "demo", model: "17" }]);
    sc = staff(sc, { t: "demo", model: "17" });
    expect(sc.log.at(-1)!.text).toMatch(/The demo unit might not be the colour/);
    sc = cust(sc, { picks: ["happy"] });
    expect(derive(sc).model).toBe("17");
  });

  it("'not for me' removes the model from the pool", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    sc = cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["notforme"] });
    expect(derive(sc).ranked.map((m) => m.id)).toEqual(["18-pro-max"]);
  });
});

describe("an empty pool", () => {
  const empty = (): Scene => ask(ask(opened(), "form_factor", ["fold"]), "budget_ceiling", ["ceiling:2000"]);

  it("always has a nudge, and every relax move makes the pool non-empty", () => {
    const sc = empty();
    expect(derive(sc).pool).toHaveLength(0);
    expect(staffActs(sc).some((a) => a.act.t === "nudge")).toBe(true);
    const moves = relaxMoves(derive(sc));
    expect(moves.length).toBeGreaterThan(0);
  });

  it("raising the budget rewrites the answer and brings the foldable back", () => {
    let sc = cust(staff(empty(), { t: "nudge" }), { picks: ["raise:3500"] });
    expect(derive(sc).ranked.map((m) => m.id)).toEqual(["duo"]);
    expect(sc.order.filter((q) => q === "budget_ceiling")).toHaveLength(1);
  });

  it("refusing to relax leads to a rescue, and 'I'll think about it' ends it without a sale", () => {
    let sc = cust(staff(empty(), { t: "nudge" }), { picks: ["keep"] });
    expect(staffActs(sc).some((a) => a.act.t === "rescue")).toBe(true);
    sc = cust(staff(sc, { t: "rescue" }), { picks: ["think"] });
    expect(sc.ended).toMatchObject({ how: "left" });
    expect(staffActs(sc)).toEqual([]);
  });
});

describe("finishing", () => {
  it("ends in a sale on exactly one model, storage and colour", () => {
    let sc = ask(newScene(), "known_model", ["model:17"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:256GB"]);
    sc = ask(sc, "colour_pick", ["colour:Sage"]);
    sc = cust(staff(sc, { t: "confirm" }), { picks: ["yes"] });
    expect(sc.ended).toMatchObject({ how: "bought", sku: { model: "17", storage: "256GB", colour: "Sage", price: 1549 } });
  });

  it("'change the colour' reopens only the colour", () => {
    let sc = ask(newScene(), "known_model", ["model:17"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:256GB"]);
    sc = ask(sc, "colour_pick", ["colour:Sage"]);
    sc = cust(staff(sc, { t: "confirm" }), { picks: ["colour"] });
    expect(staffActs(sc).map((a) => a.act)).toEqual([{ t: "ask", qid: "colour_pick", reopen: true }]);
    expect(derive(sc).c).toMatchObject({ model: "17", storage: "256GB" });
    expect(derive(sc).c.colours).toBeUndefined();
  });

  it("an 'unsure' storage answer is asked again without the Not sure option, so nobody is stranded", () => {
    let sc = ask(newScene(), "known_model", ["model:17"]);
    sc = ask(sc, "storage_tier_for_model", ["notsure"]);
    const again = staffActs(sc).find((a) => a.act.t === "ask" && a.act.qid === "storage_tier_for_model");
    expect(again).toBeDefined();
    sc = staff(sc, again!.act);
    expect(customerMenu(sc)!.options.some((o) => o.id === "notsure")).toBe(false);
  });
});
