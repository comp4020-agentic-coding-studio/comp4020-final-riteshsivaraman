import { PRODUCTS, productById } from "./catalogue.ts";
import { FAULTS, faultById, runCheck, SYMPTOM_LABEL, type FaultRec, type Symptom } from "./talk/scenes/service/data.ts";

// A conversation between a visitor and a character, as a state machine: a pure
// function of (where it is, what the visitor picked, what the shop has in
// stock). Nothing here touches a database or a clock, so every rule is a spec:
// that an out-of-stock colour cannot be bought, that nobody is stranded, that a
// choice that is not on the menu changes nothing.
//
// The visitor picks from a short list each turn (SCOPE D9). The server owns the
// state and applies the effects; this only says what comes next.

export type ScriptId = "greeter" | "phones" | "repair";

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
  // the repair script: what they told the genius, and what it comes to
  symptom?: Symptom;
  wet?: boolean;
  fault?: string;
  // a device they left with the Genius Bar and have not collected: which fault it was, how long a service,
  // whether it is ready now, and whether (after a long service) it could not be saved and is replaced
  ticket?: { fault: string; kind: "quick" | "later"; ready: boolean; replace: boolean };
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
  // how a repair visit ended: fixed while they wait, swapped for a replacement,
  // or kept for a longer service (come back in `days`); the server records it
  | { type: "repair"; outcome: "quick" | "replacement" | "later"; days?: number; fault: string }
  // sit at the bar stool in front of the genius (the server picks which)
  | { type: "sit" }
  // they have their device back: the repair is closed
  | { type: "repair_collected"; fault: string };

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
        // issue #37: this put the customer on the real waiting list
        // (request_help/waiting_for_help above), so a free real staff user
        // CAN be offered them (#1/#27). But nothing proactively approaches
        // on their behalf (tryNpcAutoClaim is deliberately unwired, D40),
        // so the old "will come to you" line overpromised. This wording
        // matches what actually happens: they may be found by staff, but
        // going to find someone themselves also works.
        return end("Of course. The phones team is along the left of the shop -- someone should find you, or go find whoever's free.");
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
        return end(`I've put a ${s.colour} ${productById(s.product ?? "")?.name ?? "phone"} aside for you. I'll take your payment right here when you're ready.`);
      case "browsing":
        return end("No problem. I'm here if you want anything.");
    }
  }
  if (s.script === "repair") return repairTurn(s);
  return end("");
}


// ---- the Genius Bar: a repair, as a decision tree (Ritesh, 2026-11-09) ----
//
// A genius (an NPC; no real staff needed) narrows the problem down with a few
// questions: what is wrong, has it been near liquid, one question specific to
// the symptom. The answers pick a fault from the same table the talk engine's
// service scene uses (talk/scenes/service/data.ts: real general troubleshooting
// knowledge, with this store's turnaround and cost invented and labelled so
// there). The fault decides how it ends: a quick fix back within a minute, a
// replacement unit now, or a longer service to come back for another day.

const DETAIL: Record<Symptom, { ask: string; choices: Choice[] }> = {
  wont_charge: { ask: "Have you tried a different cable and charger?", choices: [{ id: "tried", label: "Yes, still nothing" }, { id: "not_yet", label: "Not yet" }] },
  wont_turn_on: { ask: "When you press the button, does anything show: a logo, a buzz, a sound?", choices: [{ id: "sign", label: "Yes, something happens" }, { id: "nothing", label: "Nothing at all" }] },
  cracked_screen: { ask: "Underneath the cracks, does the touch still respond and the picture look normal?", choices: [{ id: "works", label: "Yes, it works fine" }, { id: "faulty", label: "No, touch or picture is off" }] },
  battery_drain: { ask: "Did the battery trouble start after a software update, or has it crept up over months?", choices: [{ id: "update", label: "After an update" }, { id: "months", label: "Over months" }] },
};

// the fault the answers point to: the symptom's own table, narrowed by the detail answer
export function diagnose(symptom: Symptom, wet: boolean, detail: string): FaultRec {
  // water on a symptom that has a water-related cause is the stronger signal; otherwise the detail answer narrows it
  if (!(wet && FAULTS.some((f) => f.symptom === symptom && f.waterRelated))) {
    if (symptom === "wont_charge" && detail === "not_yet") return faultById("port_debris");
    if (symptom === "wont_turn_on" && detail === "sign") return faultById("battery_depleted");
    if (symptom === "cracked_screen") return faultById(detail === "works" ? "screen_only" : "screen_and_internals");
    if (symptom === "battery_drain") return faultById(detail === "update" ? "background_usage" : "battery_health_drain");
  }
  return runCheck(symptom, wet);
}

// how a fault ends: the three outcomes
export function repairOutcome(f: FaultRec): { outcome: "quick" | "replacement" | "later"; days?: number } {
  if (f.location === "in_store" && f.etaDays === null) return { outcome: "quick" };
  if (f.waterRelated || (f.etaDays ?? 0) >= 7) return { outcome: "replacement" };
  return { outcome: "later", days: f.etaDays ?? 1 };
}

const SYMPTOMS: Symptom[] = ["wont_charge", "wont_turn_on", "cracked_screen", "battery_drain"];
const dayWord = (n: number): string => (n === 1 ? "tomorrow" : `in ${n} days`);

function repairTurn(s: ConvState): Turn {
  const fault = s.fault ? faultById(s.fault) : undefined;
  switch (s.node) {
    case "seat":
      // seated is the only way: at the bar you sit, and are level with the genius
      return ask("Hi, welcome to the Genius Bar. Please, take a seat and tell me what's going on.", [{ id: "sit", label: "Take a seat" }]);
    case "hello":
      return ask(s.ticket ? "What can I do for you today?" : "What's going on with your device?", [
        ...(s.ticket ? [{ id: "collect", label: "I'm here to collect my device" }] : []),
        ...SYMPTOMS.map((k) => ({ id: `symptom:${k}`, label: SYMPTOM_LABEL[k] })),
        { id: "leave", label: "Never mind" },
      ]);
    case "wet":
      return ask("Okay. Has it been near water or any liquid recently?", [
        { id: "yes", label: "Yes, it got wet" },
        { id: "no", label: "No" },
      ]);
    case "detail": {
      const d = DETAIL[s.symptom!];
      return ask(d.ask, d.choices);
    }
    case "diagnosis":
      return ask(`Right, that points to ${fault!.label}.`, [{ id: "ok", label: "Okay, what happens now?" }]);
    case "warn":
      return ask("One thing before I start: this kind of repair can wipe what's on the device. Do you have a backup?", [
        { id: "go", label: "Yes, go ahead" },
        { id: "think", label: "No, let me think about it" },
      ]);
    case "quick":
      return ask("Good news, that's a quick one. Give me about a minute and I'll have it back to you.", [{ id: "ok", label: "Okay, I'll wait" }]);
    case "quick_end":
      return end("Have a seat or a look around. I'll call you over the moment it's ready, then come back to the bar and I'll hand it over.");
    case "replacement":
      return ask("This one isn't worth repairing. I'll swap it for a replacement unit: it's set up and ready for you now.", [{ id: "ok", label: "Great, thank you" }]);
    case "replacement_end":
      return end("There you go, a fresh replacement. Sorry for the trouble, and I'll deal with the old one. Take care!");
    case "later": {
      const d = repairOutcome(fault!).days ?? 1;
      return ask(`This needs a proper service, so I'll keep it. It'll be ready ${dayWord(d)}: come back to the Genius Bar then and ask for me.`, [{ id: "ok", label: "Okay, see you then" }]);
    }
    case "later_end":
      return end("I've noted it all down under your name, so just come to the bar and I'll know exactly what we're doing. See you then!");
    case "notready":
      return end(s.ticket?.kind === "quick" ? "It's still with the technician: give it a few more moments and ask me again." : "It's still with our technicians. Come back on another day and ask me again.");
    case "handback_replace":
      return ask("I'm sorry: after the full service we couldn't bring it back. I've got a replacement for you, set up and ready.", [{ id: "ok", label: "Oh. Okay, thank you" }]);
    case "handback":
      return ask(`Welcome back, it's all done: we sorted out ${fault!.label}. It's as good as new.`, [{ id: "ok", label: "Brilliant, thank you" }]);
    case "handback_end":
      return end("My pleasure. If anything else acts up, you know where I am. Take care!");
    case "declined":
      return end("No problem. Back it up, and come back whenever you're ready. Nothing's been touched.");
    case "browsing":
      return end("No problem. I'm here if you need anything.");
  }
  return end("");
}

function repairStep(state: ConvState, choiceId: string, go: (node: string, patch?: Partial<ConvState>, effects?: Effect[]) => StepResult): StepResult | null {
  const browsing: Effect = { type: "player_state", state: "browsing", needs: null };
  const decided = (f: FaultRec): StepResult => {
    const o = repairOutcome(f);
    return go(o.outcome, {}, [{ type: "repair", outcome: o.outcome, days: o.days, fault: f.id }]);
  };
  switch (state.node) {
    case "seat":
      return go("hello", {}, choiceId === "sit" ? [{ type: "sit" }] : []);
    case "hello":
      if (choiceId === "collect" && state.ticket) {
        const t = state.ticket;
        if (!t.ready) return go("notready", {}, [browsing]);
        return go(t.kind === "later" && t.replace ? "handback_replace" : "handback", { fault: t.fault });
      }
      if (choiceId.startsWith("symptom:")) return go("wet", { symptom: choiceId.slice("symptom:".length) as Symptom });
      return go("browsing", {}, [browsing]);
    case "wet":
      return go("detail", { wet: choiceId === "yes" });
    case "detail":
      return go("diagnosis", { fault: diagnose(state.symptom!, !!state.wet, choiceId).id });
    case "diagnosis": {
      const f = faultById(state.fault!);
      return f.destructive ? go("warn") : decided(f);
    }
    case "warn":
      if (choiceId === "go") return decided(faultById(state.fault!));
      return go("declined", {}, [browsing]);
    case "quick":
    case "later":
      return go(`${state.node}_end`, {}, [browsing]);
    case "replacement":
    case "handback_replace":
      // a replacement is handed over there and then: the repair is closed
      return go("replacement_end", {}, [browsing, { type: "repair_collected", fault: state.fault! }]);
    case "handback":
      return go("handback_end", {}, [browsing, { type: "repair_collected", fault: state.fault! }]);
  }
  return null;
}

export function begin(script: ScriptId, world: World, ticket?: ConvState["ticket"]): StepResult {
  const state: ConvState = { script, node: script === "repair" ? "seat" : "hello", ...(ticket ? { ticket } : {}) };
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
  if (state.script === "repair") {
    const r = repairStep(state, choiceId, go);
    if (r) return r;
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
