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

  it("a model we do not carry is said so, with an apology and no invented comparison", () => {
    let sc = ask(newScene(), "known_model", ["unlisted:iPhone 16 Plus"]);
    sc = staff(sc, { t: "ask", qid: "use_case" });
    expect(sc.log.at(-1)!.text).toMatch(/^Sorry, we don't carry the iPhone 16 Plus\. I can show you what we do have\./);
    // We have no data on the 16 Plus, so nothing is claimed to be "closest" to it.
    expect(sc.log.at(-1)!.text).not.toMatch(/closest/i);
  });
});

describe("demos", () => {
  it("acknowledges a phone they named instead of announcing that one phone fits", () => {
    let sc = ask(newScene(), "known_model", ["model:17e"]);
    sc = staff(sc, { t: "offer_demo" });
    // The customer named it, so staff say "it" and do not introduce it a second time,
    // and do not stack two acknowledgements ("Sure thing. Good choice.") whatever the tone.
    expect(sc.log.at(-1)!.text).toBe("Good choice. Would you like to have a look at it?");
    for (const tone of ["friendly", "neutral", "impatient", "unsure"] as const) {
      const t = staff(ask(newScene(), "known_model", ["model:17e"]), { t: "offer_demo" }, tone).log.at(-1)!.text;
      expect(t, tone).toBe("Good choice. Would you like to have a look at it?");
    }
    // Their yes does not say the phone's name back either.
    const yes = cust(sc, { picks: ["demo:17e"], tone: "unsure" }).log.at(-1)!.text;
    expect(yes).toBe("Um, OK, I suppose so?");
    expect(yes).not.toMatch(/iPhone/);
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

  it("turning down the phone they named releases it, so the pool is the other phones and not empty", () => {
    for (const reaction of ["others", "notforme", "expensive"]) {
      let sc = ask(newScene(), "known_model", ["model:17"]);
      sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:17"] });
      sc = cust(staff(sc, { t: "demo", model: "17" }), { picks: [reaction] });
      const ctx = derive(sc);
      expect(ctx.pool.length, reaction).toBeGreaterThan(0);
      expect(ctx.ranked.map((m) => m.id), reaction).not.toContain("17");
      expect(sc.fixed, reaction).toBeUndefined();
      expect(staffActs(sc).some((a) => a.act.t === "nudge"), reaction).toBe(false);
      // They are not asked which phone they had in mind: they just said they have none now.
      expect(staffActs(sc).some((a) => a.act.t === "ask" && a.act.qid === "known_model"), reaction).toBe(false);
    }
  });

  it("'not for me' removes the model from the pool", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    sc = cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["notforme"] });
    expect(derive(sc).ranked.map((m) => m.id)).toEqual(["18-pro-max"]);
  });
});

describe("remembering what they wanted", () => {
  it("a change of model keeps the colour and turns the exact storage into a floor", () => {
    let sc = ask(newScene(), "known_model", ["model:17e"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:512GB"]);
    sc = ask(sc, "colour_pick", ["colour:Black"]);
    sc = cust(staff(sc, { t: "confirm" }), { picks: ["model"] });
    expect(derive(sc).c).toMatchObject({ colours: ["Black"], minGB: 512 });
    expect(derive(sc).c.storage).toBeUndefined();
    expect(derive(sc).c.model).toBeUndefined();
    // The next phone they pick starts from those wishes.
    sc = cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "pick", model: "18-pro" } });
    expect(derive(sc).pool.every((r) => r.model === "18-pro" && r.colour === "Black" && r.gb >= 512)).toBe(true);
    expect(derive(sc).pool.length).toBeGreaterThan(0);
  });

  const movedOn = (): Scene => {
    let sc = ask(newScene(), "known_model", ["model:17e"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:512GB"]);
    sc = ask(sc, "colour_pick", ["colour:Black"]);
    sc = cust(staff(sc, { t: "confirm" }), { picks: ["model"] });
    return cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "pick", model: "18-pro" } });
  };

  it("staff can check the carried wishes still stand, saying what they were", () => {
    let sc = movedOn();
    expect(staffActs(sc).some((a) => a.act.t === "reconfirm")).toBe(true);
    sc = staff(sc, { t: "reconfirm" });
    expect(sc.log.at(-1)!.text).toBe("Earlier you mentioned Black and at least 512GB. Is that still what you want?");
    expect(customerMenu(sc)!.options.map((o) => o.id)).toEqual(["keep", "colour", "storage", "unsure"]);
  });

  it("'keep' stands them, and staff do not ask again", () => {
    let sc = cust(staff(movedOn(), { t: "reconfirm" }), { picks: ["keep"] });
    expect(sc.carried).toBeNull();
    expect(derive(sc).c).toMatchObject({ colours: ["Black"], minGB: 512 });
    expect(staffActs(sc).some((a) => a.act.t === "reconfirm")).toBe(false);
    expect(sc.log.at(-1)!.text).toBe("Yes, that still stands.");
  });

  it("changing the colour or the storage asks that question afresh", () => {
    let sc = cust(staff(movedOn(), { t: "reconfirm" }), { picks: ["colour"] });
    expect(staffActs(sc).map((a) => a.act)).toEqual([{ t: "ask", qid: "colour_pick" }]);
    expect(derive(sc).c.colours).toBeUndefined();
    sc = cust(staff(movedOn(), { t: "reconfirm" }), { picks: ["storage"] });
    expect(staffActs(sc).map((a) => a.act)).toEqual([{ t: "ask", qid: "storage_tier_for_model" }]);
    expect(derive(sc).c.minGB).toBeUndefined();
  });

  it("is not offered when nothing was carried", () => {
    const sc = ask(newScene(), "known_model", ["model:17e"]);
    expect(staffActs(sc).some((a) => a.act.t === "reconfirm")).toBe(false);
  });

  it("a wish the next phone cannot meet goes to the nudge, not silently away", () => {
    let sc = ask(newScene(), "known_model", ["model:17"]);
    sc = ask(sc, "storage_tier_for_model", ["storage:512GB"]);
    sc = ask(sc, "colour_pick", ["colour:Sage"]);
    sc = cust(staff(sc, { t: "confirm" }), { picks: ["model"] });
    sc = ask(sc, "known_model", ["model:18-pro"]);
    expect(derive(sc).pool).toHaveLength(0); // the 18 Pro has no Sage
    expect(staffActs(sc).some((a) => a.act.t === "nudge")).toBe(true);
  });
});

describe("after a demo they did not like", () => {
  const afterDemo = (): Scene => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    return staff(sc, { t: "demo", model: "18-pro" });
  };

  it("offers both 'another one you offered' and 'ask about other phones'", () => {
    const ids = customerMenu(afterDemo())!.options.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(["happy", "another", "others", "expensive", "notforme"]));
  });

  it("hides 'another one you offered' when there is no other one left to show", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = ask(sc, "storage_need", ["min:1024"]);
    sc = ask(sc, "budget_ceiling", ["ceiling:3300"]); // down to the 18 Pro alone
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    sc = staff(sc, { t: "demo", model: "18-pro" });
    expect(customerMenu(sc)!.options.map((o) => o.id)).not.toContain("another");
  });

  it("'ask about other phones' sends staff back to questions before any demo or recommendation", () => {
    let sc = cust(afterDemo(), { picks: ["others"] });
    const kinds = staffActs(sc).map((a) => a.act.t);
    expect(kinds).toContain("ask");
    expect(kinds).not.toContain("offer_demo");
    expect(kinds).not.toContain("recommend");
    expect(derive(sc).ranked.map((m) => m.id)).not.toContain("18-pro"); // they have seen it and moved on
    sc = staff(sc, staffActs(sc).find((a) => a.act.t === "ask" && !a.act.reopen)!.act);
    expect(sc.wantsMore).toBe(false); // having asked, staff may offer again
  });
});

describe("coming back to a phone they turned down", () => {
  const turnedDown = (): Scene => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    return cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["notforme"] });
  };

  it("staff never offer it again, even though they could", () => {
    const sc = turnedDown();
    expect(derive(sc).ranked.map((m) => m.id)).not.toContain("18-pro");
    const offered = staffActs(sc).flatMap((a) => (a.act.t === "recommend" ? [a.act.model] : []));
    expect(offered).not.toContain("18-pro");
  });

  it("the customer can still ask about it, see it, or go with it", () => {
    const menu = customerMenu(staff(turnedDown(), { t: "recommend", model: "18-pro-max" }))!;
    expect(menu.throwbacks.map((t) => t.id)).toContain("about:18-pro");
    expect(menu.actions.map((a) => JSON.stringify(a.action))).toEqual(expect.arrayContaining([JSON.stringify({ t: "demo", model: "18-pro" }), JSON.stringify({ t: "pick", model: "18-pro" })]));
  });

  it("asking about it gets the facts again and does not bring it back", () => {
    let sc = cust(staff(turnedDown(), { t: "recommend", model: "18-pro-max" }), { picks: ["unsure"], throwback: "about:18-pro" });
    sc = staff(sc, { t: "answer" });
    expect(sc.log.at(-1)!.text).toMatch(/^Here's the iPhone 18 Pro again\. It has .* and starts from A\$2,099\./);
    expect(derive(sc).ranked.map((m) => m.id)).not.toContain("18-pro");
  });

  it("asking to see it, or going with it, brings it back instead of leaving it both wanted and refused", () => {
    let sc = cust(staff(turnedDown(), { t: "recommend", model: "18-pro-max" }), { action: { t: "demo", model: "18-pro" } });
    expect(sc.excluded).not.toContain("18-pro");
    sc = cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["happy"] });
    expect(sc.fixed).toBe("18-pro");
    expect(derive(sc).pool.length).toBeGreaterThan(0);
    const go = cust(staff(turnedDown(), { t: "recommend", model: "18-pro-max" }), { action: { t: "pick", model: "18-pro" } });
    expect(go.fixed).toBe("18-pro");
    expect(go.excluded).not.toContain("18-pro");
    expect(derive(go).pool.length).toBeGreaterThan(0);
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

// Findings from the first automated review of 40 simulated conversations
// (docs/conversation-model/review/review-1.md), each pinned by a spec.
describe("review 1: honest answers", () => {
  it("'of these' means the phones they were looking at when they asked, not the pool after their answer", () => {
    // They say Lavender (leaving only the 17) and in the same breath ask which is lightest.
    let sc = ask(camera(), "colour_prefs", ["colour:Lavender"], { throwback: "attr:weight" });
    sc = staff(sc, { t: "answer" });
    const t = sc.log.at(-1)!.text;
    expect(t).toMatch(/Of our iPhones, the iPhone Air is the lightest at 165g/); // out of everything they had been looking at, and said so
    expect(t).not.toMatch(/of these|looking at/);
  });

  it("a telephoto question is answered from the phones in play, never 'none of these' for a range that has them", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"], { throwback: "attr:tele" });
    sc = staff(sc, { t: "answer" });
    expect(sc.log.at(-1)!.text).toMatch(/only the iPhone 18 Pro( Max)? and iPhone 18 Pro( Max)? have a separate telephoto lens/);
    expect(sc.log.at(-1)!.text).not.toMatch(/crop/i); // not in the data
  });

  it("says when what they told us has cut the list of storage sizes, instead of passing it off as the range", () => {
    let sc = ask(opened(), "storage_need", ["min:512"]);
    sc = cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "pick", model: "18-pro-max" } });
    sc = staff(sc, { t: "ask", qid: "storage_tier_for_model" });
    expect(sc.log.at(-1)!.text).toBe("Since you wanted at least 512GB, you could have it in 512GB, 1TB or 2TB. Which would you like?");
    const plain = staff(ask(newScene(), "known_model", ["model:18-pro-max"]), { t: "ask", qid: "storage_tier_for_model" });
    expect(plain.log.at(-1)!.text).toBe("It comes in 256GB, 512GB, 1TB or 2TB. Which would you like?");
  });

  it("describes the foldable's two screens and which screen its battery figure is for", () => {
    let sc = cust(staff(ask(opened(), "use_case", ["travel"]), { t: "ask", qid: "form_factor" }), { action: { t: "demo", model: "duo" } });
    sc = staff(sc, { t: "demo", model: "duo" });
    expect(sc.log.at(-1)!.text).toMatch(/a 7\.6" screen inside and a 5\.4" screen outside/);
    expect(sc.log.at(-1)!.text).toMatch(/up to 44 hours of video playback on the outer screen/);
  });

  it("a feature they say matters is a requirement: a phone listed without it is out, and one that does not say stays", () => {
    const sc = ask(ask(opened(), "use_case", ["photos"]), "hardware_features", ["promotion"]);
    const ids = derive(sc).ranked.map((m) => m.id);
    expect(ids).not.toContain("17e"); // "No ProMotion technology"
    expect(ids).toContain("16"); // the page is silent: not stated is not "no"
  });

  it("price talk is for the till and promises nothing", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"], { throwback: "haggle" });
    sc = staff(sc, { t: "answer" });
    // With no phone chosen yet, "the listed price" would be of what?
    expect(sc.log.at(-1)!.text).toBe("That depends on the phone, but our prices start at A$2,099.");
    let one = ask(newScene(), "known_model", ["model:17"], { throwback: "haggle" });
    one = staff(one, { t: "answer" });
    expect(one.log.at(-1)!.text).toBe("That's the listed price, I'm afraid.");
    expect(one.log.at(-1)!.text).not.toMatch(/deal|till/);
  });
});

describe("review 1: answering what was said", () => {
  it("'I know the range' gets 'which range' next, and 'I have a phone in mind' gets 'which one'", () => {
    const line = cust(staff(newScene(), { t: "ask", qid: "opening_intent" }), { picks: ["line"] });
    expect(staffActs(line).map((a) => a.act)).toEqual([{ t: "ask", qid: "model_family" }]);
    const know = cust(staff(newScene(), { t: "ask", qid: "opening_intent" }), { picks: ["know"] });
    expect(staffActs(know).map((a) => a.act)).toEqual([{ t: "ask", qid: "known_model" }]);
  });

  it("'what have you got?' gets an overview from the data before the next question", () => {
    let sc = ask(newScene(), "known_model", ["notyet"]);
    sc = staff(sc, { t: "ask", qid: "use_case" });
    expect(sc.log.at(-1)!.text).toMatch(/^We've got 7 iPhones\. Prices start at A\$1,149 for the iPhone 17e, and the iPhone Duo, our foldable, starts at A\$3,499\. /);
  });

  it("does not recommend before it knows what the phone is for or what it should cost", () => {
    const rec = (sc: Scene) => staffActs(sc).some((a) => a.act.t === "recommend");
    expect(rec(ask(opened(), "form_factor", ["standard"]))).toBe(false);
    expect(rec(ask(opened(), "budget_ceiling", ["ceiling:2300"]))).toBe(true);
  });

  it("asks about features and colours only after it knows the use or the budget", () => {
    const asks = (sc: Scene) => staffActs(sc).flatMap((a) => (a.act.t === "ask" ? [a.act.qid] : []));
    expect(asks(opened())).not.toContain("hardware_features");
    expect(asks(opened())).not.toContain("colour_prefs");
    expect(asks(ask(opened(), "use_case", ["photos"]))).toEqual(expect.arrayContaining(["hardware_features", "colour_prefs"]));
  });

  it("lists the phones still on offer as 'also', once some have been shown", () => {
    let sc = ask(camera(), "telephoto_need", ["yes"]);
    sc = cust(staff(sc, { t: "offer_demo" }), { picks: ["demo:18-pro"] });
    sc = cust(staff(sc, { t: "demo", model: "18-pro" }), { picks: ["another"] });
    sc = staff(sc, { t: "offer_demo" });
    // Not "it": the phone they just saw was the 18 Pro, so "it" would be ambiguous.
    expect(sc.log.at(-1)!.text).toBe("I could also show you the iPhone 18 Pro Max. Would you like to have a look at it?");
  });
});

describe("review 1: how it sounds", () => {
  it("a customer who leaves says only that, with no stock phrase after it", () => {
    const sc = cust(staff(opened(), { t: "ask", qid: "use_case" }), { action: { t: "leave" }, tone: "impatient" });
    expect(sc.log.at(-2)!.text).toBe("I'll leave it there, thanks.");
  });

  it("describes a phone in sentences, and says the demo-unit note once", () => {
    let sc = cust(staff(opened(), { t: "ask", qid: "use_case" }), { action: { t: "demo", model: "17e" } });
    sc = staff(sc, { t: "demo", model: "17e" });
    const first = sc.log.at(-1)!.text;
    // They asked to try it by name, so it is "it" and not named again.
    expect(first).toMatch(/^Here it is\. It has .* and starts from A\$1,149\./);
    expect(first).not.toMatch(/;/);
    expect(first).toMatch(/The demo unit might not be the colour/);
    // The note about the demo unit is said on the first demo only.
    sc = cust(sc, { picks: ["unsure"] });
    sc = cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "demo", model: "17" } });
    const second = staff(sc, { t: "demo", model: "17" }).log.at(-1)!.text;
    expect(second).not.toMatch(/The demo unit might not be the colour/);
  });

  it("apologises for bad news and puts no lead-in before it", () => {
    for (const tone of ["friendly", "neutral", "impatient", "unsure"] as const) {
      const sc = staff(ask(opened(), "form_factor", ["fold"]), { t: "ask", qid: "budget_ceiling" }, tone);
      const nudge = staff(cust(sc, { picks: ["ceiling:2000"] }), { t: "nudge" }, tone).log.at(-1)!.text;
      expect(nudge, tone).toMatch(/^(Um, )?[Ss]orry, nothing fits /);
    }
  });
});

describe("review 2: not building on a phone nobody accepted, and answering everything asked", () => {
  // Down to the 17e by their own budget, but nobody has said they want it.
  const narrowed = (): Scene => ask(ask(newScene(), "known_model", ["notyet"]), "budget_ceiling", ["ceiling:1200"]);

  it("a phone left over by elimination is suggested, not confirmed: colour, storage and confirm wait for a yes", () => {
    const sc = narrowed();
    const moves = staffActs(sc).map((a) => a.act);
    expect(derive(sc).ranked.map((m) => m.id)).toEqual(["17e"]);
    expect(moves.some((a) => a.t === "ask" && (a.qid === "colour_pick" || a.qid === "storage_tier_for_model"))).toBe(false);
    expect(moves.some((a) => a.t === "confirm")).toBe(false);
    expect(moves).toContainEqual({ t: "recommend", model: "17e" });
    const yes = cust(staff(sc, { t: "recommend", model: "17e" }), { picks: ["yes"] });
    expect(staffActs(yes).some((a) => a.act.t === "ask" && a.act.qid === "colour_pick")).toBe(true);
  });

  it("when the budget decided the storage size, the confirmation says so", () => {
    let sc = cust(staff(narrowed(), { t: "recommend", model: "17e" }), { picks: ["yes"] });
    sc = ask(sc, "colour_pick", ["colour:White"]);
    const t = staff(sc, { t: "confirm" }).log.at(-1)!.text;
    expect(t).toBe("With your A$1,200 budget, 256GB is the only size that fits. So that's the iPhone 17e, 256GB, White, A$1,149. I'll check we have it in stock. Is that right?");
  });

  it("answers every question asked in one go, in order (what have you got, and is there room on the price)", () => {
    let sc = ask(newScene(), "known_model", ["notyet"], { throwback: "haggle" });
    expect(sc.owed).toBe("overview|haggle");
    sc = staff(sc, { t: "ask", qid: "use_case" });
    const t = sc.log.at(-1)!.text;
    expect(t).toMatch(/^We've got 7 iPhones\. .* That depends on the phone, but our prices start at A\$1,149\. /);
  });

  it("a foldable is not suggested to someone who has not said they are open to one, and is introduced as one when it is", () => {
    const sc = ask(opened(), "budget_ceiling", ["nolimit"]);
    const recs = staffActs(sc).flatMap((a) => (a.act.t === "recommend" ? [a.act.model] : []));
    expect(recs).not.toContain("duo");
    const duo = staff(cust(staff(sc, { t: "ask", qid: "use_case" }), { action: { t: "demo", model: "duo" } }), { t: "demo", model: "duo" });
    expect(duo.log.at(-1)!.text).toMatch(/It has a folding design/);
  });

  it("when nothing fits, says where the colour they want does exist, and does not read the same line twice", () => {
    let sc = ask(ask(newScene(), "known_model", ["model:18-pro"]), "colour_pick", ["colour:Light Gold"]);
    expect(derive(sc).pool).toHaveLength(0);
    const first = staff(sc, { t: "nudge" }).log.at(-1)!.text;
    expect(first).toMatch(/Light Gold is only on the iPhone Air\. How do you want to go\?$/);
    sc = cust(staff(sc, { t: "nudge" }), { picks: ["keep"] });
    const second = staff(sc, { t: "nudge" }).log.at(-1)!.text;
    expect(second).toBe("Sorry, nothing fits yet. Is there anything you'd be willing to change?");
  });

  it("when no single concession brings anything back, offers the smallest pair, never just 'hold firm'", () => {
    // A telephoto lens, Light Gold and under A$1,200: no one of the three can be dropped alone and leave a phone.
    const sc = opened();
    sc.answers["telephoto_need"] = { picks: ["yes"], turn: 1 };
    sc.answers["colour_prefs"] = { picks: ["colour:Light Gold"], turn: 1 };
    sc.answers["budget_ceiling"] = { picks: ["ceiling:1200"], turn: 1 };
    sc.order.push("telephoto_need", "colour_prefs", "budget_ceiling");
    expect(derive(sc).pool).toHaveLength(0);
    const ids = customerMenu(staff(sc, { t: "nudge" }))!.options.map((o) => o.id);
    expect(ids).toContain("drop:separateTelephoto+colours");
    // Taking it forgets both, and something fits again.
    const after = cust(staff(sc, { t: "nudge" }), { picks: ["drop:separateTelephoto+colours"] });
    expect(derive(after).pool.length).toBeGreaterThan(0);
  });
});
