import { PRODUCTS, productById } from "./catalogue.ts";

// A conversation between a visitor and a character, as a state machine: a pure
// function of (where it is, what the visitor picked, what the shop has in
// stock). Nothing here touches a database or a clock, so every rule is a spec:
// that an out-of-stock colour cannot be bought, that nobody is stranded, that a
// choice that is not on the menu changes nothing.
//
// The visitor picks from a short list each turn (SCOPE D9). The server owns the
// state and applies the effects; this only says what comes next.

// "till" is the payment at the Genius Bar: reached only after a sale, never
// asked for, so it is not a post's `scriptFor`.
export type ScriptId = "greeter" | "phones" | "till";

// Where a visitor is in their visit (the player_state table).
export type PlayerStateName =
  | "arriving"
  | "browsing"
  | "waiting_for_help"
  | "in_conversation"
  | "in_purchase"
  | "waiting_for_order"
  | "leaving";

const LEGAL: Record<PlayerStateName, PlayerStateName[]> = {
  arriving: ["browsing", "waiting_for_help", "in_conversation", "leaving"],
  browsing: ["waiting_for_help", "in_conversation", "leaving"],
  waiting_for_help: ["in_conversation", "browsing", "leaving"],
  in_conversation: ["browsing", "waiting_for_help", "in_purchase", "waiting_for_order", "leaving"],
  in_purchase: ["waiting_for_order", "in_conversation", "browsing", "leaving"],
  waiting_for_order: ["in_conversation", "leaving"],
  leaving: [],
};

export function canMove(from: PlayerStateName, to: PlayerStateName): boolean {
  return from === to || LEGAL[from].includes(to);
}

export interface ConvState {
  script: ScriptId;
  node: string;
  product?: string;
  colour?: string;
  // what is being paid for, set when a till conversation begins
  sale?: { name: string; colour: string; storage: string; price: number };
}

export interface Choice {
  id: string;
  label: string;
}

export interface Turn {
  say: string; // what the character says
  choices: Choice[]; // what the visitor can pick; empty when it has ended
  ended: boolean;
}

export type Effect =
  // set the visitor's overall state
  | { type: "player_state"; state: PlayerStateName; want?: string; needs?: string | null; data?: Record<string, unknown> }
  // ask for a member of staff by designation: "specialist:phones", "genius"
  | { type: "request_help"; needs: string }
  // put one unit aside. The server does this atomically and, if someone else
  // got there first, runs the step again with the new stock.
  | { type: "reserve"; product: string; colour: string }
  // the sale at the till went through, or was called off
  | { type: "paid"; method: "card" | "phone" }
  | { type: "payment_cancelled" };

export interface StepResult {
  state: ConvState;
  turn: Turn;
  effects: Effect[];
}

export interface World {
  stock: (product: string, colour: string) => number;
}

const end = (say: string): Turn => ({ say, choices: [], ended: true });
const ask = (say: string, choices: Choice[]): Turn => ({ say, choices, ended: false });

// ---- turns: what each node says and offers, from its state and the stock ----

function turnFor(s: ConvState, world: World): Turn {
  if (s.script === "greeter") {
    switch (s.node) {
      case "hello":
        return ask("Welcome in. What brings you here today?", [
          { id: "phone", label: "I'm looking for a phone" },
          { id: "repair", label: "I need something repaired" },
          { id: "pickup", label: "I'm collecting an order" },
          { id: "look", label: "Just having a look" },
        ]);
      case "phone":
        return ask("Phones are along the left of the shop. Would you like someone from the phones team to help you?", [
          { id: "help", label: "Yes, please" },
          { id: "browse", label: "No thanks, I'll browse" },
        ]);
      case "repair":
        return ask("That's the Genius Bar at the back of the shop. They'll look after you there.", [{ id: "ok", label: "Thanks" }]);
      case "pickup":
        return ask("Orders are collected at the Genius Bar at the back of the shop.", [{ id: "ok", label: "Thanks" }]);
      case "help_asked":
        return end("Of course. Someone from the phones team will come to you. Have a look around while you wait.");
      case "browsing":
        return end("No problem. Ask if you need anything.");
      case "to_bar":
        return end("Just ask at the bar when you get there.");
      case "look":
        return end("Enjoy your visit.");
    }
  }
  if (s.script === "phones") {
    switch (s.node) {
      case "hello":
        return ask("Hi, I'm from the phones team. What can I show you?", [
          { id: "show", label: "Show me what you have" },
          { id: "leave", label: "I'm fine, thanks" },
        ]);
      case "models":
        return ask("Here's what we have.", [
          ...PRODUCTS.map((p) => ({ id: `product:${p.id}`, label: p.name })),
          { id: "leave", label: "Actually, I'm fine" },
        ]);
      case "colours": {
        const p = productById(s.product ?? "");
        return ask(`Which colour for the ${p?.name ?? "phone"}?`, [
          ...(p?.colours ?? []).map((c) => {
            const n = world.stock(p!.id, c);
            return { id: `colour:${c}`, label: n > 0 ? `${c} (${n} left)` : `${c} (out of stock)` };
          }),
          { id: "back", label: "Show me the others" },
        ]);
      }
      case "out_of_stock":
        return ask(`Sorry, the ${s.colour} ${productById(s.product ?? "")?.name ?? "phone"} is out of stock right now. What would you like to do?`, [
          { id: "other_colour", label: "Try another colour" },
          { id: "other_phone", label: "Look at another phone" },
          { id: "leave", label: "Never mind" },
        ]);
      case "reserved":
        return end(`I've put a ${s.colour} ${productById(s.product ?? "")?.name ?? "phone"} aside for you. You can pay for it at the Genius Bar.`);
      case "browsing":
        return end("No problem. I'm here if you want anything.");
    }
  }
  if (s.script === "till") {
    switch (s.node) {
      case "hello":
        return ask(
          s.sale
            ? `Hi. That's the ${s.sale.name} in ${s.sale.colour}, ${s.sale.storage}, A$${s.sale.price.toLocaleString("en-AU")}. How would you like to pay?`
            : "Hi, this is the Genius Bar. How can I help?",
          [
            { id: "pay:card", label: "Pay by card" },
            { id: "pay:phone", label: "Pay with my phone" },
            { id: "cancel", label: "I've changed my mind" },
          ],
        );
      case "paid":
        return end("That's gone through. Thanks, enjoy your new phone.");
      case "cancelled":
        return end("No problem, I'll put it back. Have a look around if you like.");
    }
  }
  return end("");
}

export function begin(script: ScriptId, world: World, sale?: ConvState["sale"]): StepResult {
  const state: ConvState = { script, node: "hello", ...(sale ? { sale } : {}) };
  return { state, turn: turnFor(state, world), effects: [{ type: "player_state", state: "in_conversation" }] };
}

// What the visitor can pick right now (for validating a message from a client).
export function choicesFor(state: ConvState, world: World): Choice[] {
  return turnFor(state, world).choices;
}

// Takes one turn. A choice that is not on the current menu is an error and
// changes nothing.
export function step(state: ConvState, choiceId: string, world: World): StepResult | { error: string } {
  const here = turnFor(state, world);
  if (here.ended) return { error: "the conversation has ended" };
  if (!here.choices.some((c) => c.id === choiceId)) return { error: `"${choiceId}" is not an option here` };
  const go = (node: string, patch: Partial<ConvState> = {}, effects: Effect[] = []): StepResult => {
    const next: ConvState = { ...state, ...patch, node };
    return { state: next, turn: turnFor(next, world), effects };
  };

  if (state.script === "greeter") {
    switch (state.node) {
      case "hello":
        if (choiceId === "phone") return go("phone");
        if (choiceId === "repair") return go("repair");
        if (choiceId === "pickup") return go("pickup");
        return go("look", {}, [{ type: "player_state", state: "browsing" }]);
      case "phone":
        if (choiceId === "help") {
          return go("help_asked", {}, [
            { type: "request_help", needs: "specialist:phones" },
            { type: "player_state", state: "waiting_for_help", want: "phone", needs: "specialist:phones" },
          ]);
        }
        return go("browsing", {}, [{ type: "player_state", state: "browsing", want: "phone" }]);
      case "repair":
        return go("to_bar", {}, [{ type: "player_state", state: "waiting_for_help", want: "repair", needs: "genius" }]);
      case "pickup":
        return go("to_bar", {}, [{ type: "player_state", state: "waiting_for_help", want: "pickup", needs: "genius" }]);
    }
  }

  if (state.script === "till") {
    if (state.node === "hello") {
      if (choiceId === "cancel") return go("cancelled", {}, [{ type: "payment_cancelled" }, { type: "player_state", state: "browsing" }]);
      return go("paid", {}, [{ type: "paid", method: choiceId === "pay:phone" ? "phone" : "card" }, { type: "player_state", state: "browsing" }]);
    }
  }

  if (state.script === "phones") {
    switch (state.node) {
      case "hello":
        return choiceId === "show" ? go("models") : go("browsing", {}, [{ type: "player_state", state: "browsing" }]);
      case "models":
        if (choiceId === "leave") return go("browsing", {}, [{ type: "player_state", state: "browsing" }]);
        return go("colours", { product: choiceId.slice("product:".length) });
      case "colours": {
        if (choiceId === "back") return go("models", { product: undefined, colour: undefined });
        const colour = choiceId.slice("colour:".length);
        const product = state.product ?? "";
        if (world.stock(product, colour) > 0) {
          return go("reserved", { colour }, [
            { type: "reserve", product, colour },
            { type: "player_state", state: "in_purchase", want: "phone", needs: "genius", data: { step: "pay", product, colour } },
          ]);
        }
        return go("out_of_stock", { colour });
      }
      case "out_of_stock":
        if (choiceId === "other_colour") return go("colours", { colour: undefined });
        if (choiceId === "other_phone") return go("models", { product: undefined, colour: undefined });
        return go("browsing", {}, [{ type: "player_state", state: "browsing" }]);
    }
  }
  return { error: "no such node" };
}

// The nodes a script can reach, for specs. Walks every choice, without a
// stock rule getting in the way (it asks both ways for each colour).
export function reachable(script: ScriptId): Set<string> {
  const seen = new Set<string>();
  const stocks: World[] = [{ stock: () => 1 }, { stock: () => 0 }];
  const queue: ConvState[] = [begin(script, stocks[0]).state];
  const key = (s: ConvState): string => `${s.node}|${s.product ?? ""}|${s.colour ?? ""}`;
  const visited = new Set<string>();
  while (queue.length > 0) {
    const s = queue.shift()!;
    if (visited.has(key(s))) continue;
    visited.add(key(s));
    seen.add(s.node);
    for (const w of stocks) {
      for (const c of choicesFor(s, w)) {
        const r = step(s, c.id, w);
        if (!("error" in r)) queue.push(r.state);
      }
    }
  }
  return seen;
}
