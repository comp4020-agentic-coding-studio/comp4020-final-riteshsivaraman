import {
  applyCustomer,
  applyStaff,
  customerMenu,
  newScene,
  staffActs,
  type CustomerMenu,
} from "../shared/talk/scene.ts";
import { randomStaff, staffMove, type StaffTraits } from "../shared/talk/npc.ts";
import { makeRng, type Rng } from "../shared/talk/rng.ts";
import type { CustomerReply, Scene, Tone } from "../shared/talk/types.ts";

// Wires the new talk engine's phone scene into the real server, coexisting
// with the old shared/conversation.ts engine for every other script
// (Ritesh, 2026-10-19: phone-only, coexist not replace — the old engine's
// "greeter" script keeps running unchanged; see
// docs/conversation-model/server-wiring-proposal.md axes 4/5).
//
// The engine is pure (state in, state out); this module is the only place
// that gives it a clock (turn-seeded RNG, deterministic per conversation,
// not wall-clock — so the same conversation replays the same NPC choices if
// ever replayed from its own log) and a place to live (the conversations.data
// JSON blob, same column the old engine already uses, just a different shape
// inside it).
//
// Staff side: v1 wires NPC-only (a human `specialist:phones` falls back to
// the old engine's "phones" script below — see the ScriptId note in
// service.ts), matching "phone only, coexist" as the smallest real slice.

export interface TalkTurn {
  say: string;
  choices: Array<{ id: string; label: string }>;
  ended: boolean;
}

// A menu item's wire id needs to round-trip back into a CustomerReply. The
// engine's own menu already gives each option/action a stable string id;
// this module never invents new ones, it only prefixes them so stepTalk can
// tell which bucket an incoming choice came from — the engine's own ids are
// the only things a human ever sees as a label.
//
// Throw-backs are deliberately not offered as their own flat choice: every
// spec example (spec/talk-scene.test.ts) pairs a throwback with an answer in
// the same CustomerReply ("Lavender, and which is lightest?"), never alone —
// applyCustomer's own answering logic treats a reply with no picks and no
// action as invalid. A v1 flat menu can't express "pick an answer AND throw
// one back" in one click, so throw-backs wait for the richer UI noted in
// docs/conversation-model/server-wiring-proposal.md axis 3 option B.
const OPTION = "opt:";
const ACTION = "act:";

// A multi-select question (menu.multi) can take several picks in one
// CustomerReply ("Black and Lavender both work") — a flat one-choice-per-turn
// TurnView can't express that either, so v1 only ever sends a single pick per
// option chosen. Narrower than the engine allows, not incorrect: the specs
// that exercise multi-pick (spec/talk-scene.test.ts's colour_prefs/
// hardware_features cases) aren't reachable through this wire path yet,
// same documented limitation as throw-backs above.
function menuToTurn(menu: CustomerMenu): TalkTurn {
  const choices: TalkTurn["choices"] = [
    ...menu.options.map((o) => ({ id: `${OPTION}${o.id}`, label: o.label })),
    ...menu.actions.map((a, i) => ({ id: `${ACTION}${i}`, label: a.label })),
  ];
  return { say: menu.prompt, choices, ended: false };
}

function lastLine(sc: Scene): string {
  return sc.log[sc.log.length - 1]?.text ?? "";
}

// A deterministic RNG seeded from the conversation id, so the same
// conversation's NPC staff always makes the same choices if ever replayed —
// no wall-clock, no global mutable RNG (the no-invented-randomness-source
// discipline the sim/spec code already follows).
function rngFor(conversationId: string, turn: number): Rng {
  let seed = turn + 1;
  for (let i = 0; i < conversationId.length; i++) seed = (seed * 31 + conversationId.charCodeAt(i)) | 0;
  return makeRng(seed >>> 0);
}

function staffTraitsFor(conversationId: string): StaffTraits {
  return randomStaff(rngFor(`staff:${conversationId}`, 0));
}

// Runs the NPC staff's move(s) until it is the customer's turn again or the
// scene ends — mirrors how a human staff member would take exactly one move
// then hand back, except an NPC never needs a human to click anything, so it
// resolves in the same call (matching the old engine's with_kind: "npc"
// auto-apply at service.ts's open()/apply()).
function advanceStaff(sc: Scene, conversationId: string): Scene {
  let cur = sc;
  let guard = 0;
  while (!cur.ended && cur.toMove === "staff" && guard++ < 50) {
    const traits = staffTraitsFor(conversationId);
    const rng = rngFor(conversationId, cur.turn);
    const { act, tone } = staffMove(cur, traits, rng);
    const next = applyStaff(cur, act, tone);
    if ("error" in next) break; // a legal-move computation bug, not a user error: stop rather than loop
    cur = next;
  }
  return cur;
}

// Starts a new phone conversation. Mirrors shared/conversation.ts's begin():
// returns the first customer-facing turn after staff's opening line(s).
export function beginTalk(conversationId: string): { scene: Scene; turn: TalkTurn } {
  const opened = advanceStaff(newScene(), conversationId);
  const menu = customerMenu(opened);
  return { scene: opened, turn: menu ? menuToTurn(menu) : { say: lastLine(opened), choices: [], ended: !!opened.ended } };
}

// What the customer can currently pick — for validating a message from a
// client the same way shared/conversation.ts's choicesFor() does.
export function talkChoices(sc: Scene): Array<{ id: string; label: string }> {
  const menu = customerMenu(sc);
  return menu ? menuToTurn(menu).choices : [];
}

// Takes one customer turn: applies their pick, then runs staff's reply.
// Returns an error the same shape as the old engine's step() on an
// off-menu or out-of-turn pick, so service.ts's call sites don't need to
// branch on which engine produced the error.
export function stepTalk(sc: Scene, conversationId: string, choiceId: string): { scene: Scene; turn: TalkTurn } | { error: string } {
  const menu = customerMenu(sc);
  if (!menu) return { error: "it is not the customer's turn" };
  const reply = replyFor(menu, choiceId);
  if (!reply) return { error: `"${choiceId}" is not an option here` };
  const applied = applyCustomer(sc, reply.reply);
  if ("error" in applied) return applied;
  const after = advanceStaff(applied, conversationId);
  const nextMenu = customerMenu(after);
  const turn = nextMenu ? menuToTurn(nextMenu) : { say: lastLine(after), choices: [], ended: !!after.ended };
  return { scene: after, turn };
}

// Default, un-opinionated tone for a human customer's plain menu pick — the
// engine's own tone system drives the NPC side; a human picking from a flat
// TurnView-shaped menu has no tone selector in v1 (noted in
// docs/conversation-model/server-wiring-proposal.md as a richer-UI follow-up,
// axis 3 option B).
const DEFAULT_TONE: Tone = "neutral";

function replyFor(menu: CustomerMenu, choiceId: string): { reply: CustomerReply } | null {
  if (choiceId.startsWith(OPTION)) {
    const id = choiceId.slice(OPTION.length);
    if (!menu.options.some((o) => o.id === id)) return null;
    return { reply: { picks: [id], tone: DEFAULT_TONE } };
  }
  if (choiceId.startsWith(ACTION)) {
    const i = Number(choiceId.slice(ACTION.length));
    const a = menu.actions[i];
    if (!a) return null;
    return { reply: { action: a.action, tone: DEFAULT_TONE } };
  }
  return null;
}

export function talkEnded(sc: Scene): boolean {
  return !!sc.ended;
}
