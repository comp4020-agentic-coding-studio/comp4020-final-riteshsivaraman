// Shared customer/staff moves built on client.ts's BotClient, factored out
// of the scenario files because every scenario (S1, S2, S4, S11, the mid-wave
// staff join, the 3-staff/25-customer soak) steps through the same greeter ->
// specialist -> (sale | leave) shape. Only talk to the real server over its
// real protocol (src/shared/protocol.ts); nothing here is a mock of the
// conversation engine.
import { NPCS, npcPose } from "../../src/shared/npcs.ts";
import { FLOOR } from "../../src/shared/protocol.ts";
import type { ServerMessage } from "../../src/shared/protocol.ts";
import { BotClient, pause } from "./client.ts";

export type Turn = Extract<ServerMessage, { type: "turn" }>;

// Stand just inside the entrance zone (src/shared/world.ts's ENTRANCE_ZONE:
// |x| <= 3.5, z <= FLOOR.minZ + 3.5), the same spot spec/greeter-live.test.ts
// uses, so tryGreeterApproach actually fires on the server's own "move"
// handler rather than needing a manual talk_start.
export async function walkToEntrance(bot: BotClient, xOffset = 0): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await bot.send({ type: "move", x: xOffset, z: FLOOR.minZ + 0.9, ry: 0 });
    await pause(80);
  }
}

// Stand beside a named NPC, at its position on the server's own clock (the
// same pattern spec/conversations-live.test.ts's walkTo() uses) -- not a
// hardcoded coordinate, since an NPC's post is data (storeday.ts), not
// something a bot script should duplicate.
export async function walkToNpc(bot: BotClient, npcId: string): Promise<void> {
  const def = NPCS.find((n) => n.id === npcId);
  if (!def) throw new Error(`no such NPC: ${npcId}`);
  const p = npcPose(def, Date.now());
  for (let i = 0; i < 3; i++) {
    await bot.send({ type: "move", x: p.x + 1.1, z: p.z, ry: 0 });
    await pause(80);
  }
}

// Waits for the greeter to come over on her own (tryGreeterApproach, wired
// into the server's "move" handler) rather than pressing E -- the real path
// a customer who just walks in takes. Falls back to a manual talk_start a
// few times in case she was mid-walk when we looked.
export async function waitForGreeter(bot: BotClient, timeoutMs = 6000): Promise<Turn> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hello = bot.messages.find((m): m is Turn => m.type === "turn" && m.withId === "greeter-1");
    if (hello) return hello;
    await bot.send({ type: "talk_start", withId: "greeter-1" });
    await pause(300);
  }
  throw new Error(`[${bot.label}] the greeter never opened a conversation`);
}

// The server only advances a payment visit or an escort's walk ("its beats
// are checked without a server timer", src/shared/protocol.ts's comment on
// ClientMessage's "settle") when a client sends a "move" or an explicit
// "settle" -- never on its own clock (CLAUDE.md: "a deadline... is a stored
// column caught up on the next request that touches it, never a timer").
// A bot that just sits waiting after a sale is agreed would otherwise never
// see the stock runner arrive, so this polls "settle" until a message
// matches, or the timeout elapses.
export async function waitSettling(bot: BotClient, want: (m: ServerMessage) => boolean, timeoutMs: number, intervalMs = 1000): Promise<ServerMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = bot.messages.find(want);
    if (found) return found;
    await bot.send({ type: "settle" });
    await pause(intervalMs);
  }
  throw new Error(`[${bot.label}] timed out waiting (with settle polling) after ${timeoutMs}ms`);
}

// Picks an option by id from the current turn's choices, if present.
export function choiceById(turn: Turn, id: string): { id: string; label: string } | undefined {
  return turn.choices.find((c) => c.id === id);
}

// Picks an option whose label matches a pattern, if present.
export function choiceByLabel(turn: Turn, pattern: RegExp): { id: string; label: string } | undefined {
  return turn.choices.find((c) => pattern.test(c.label));
}

// Generic "take a reasonable customer turn, over and over, until the
// conversation ends or we give up": always prefers a non-"leave"/non-"browse"
// option so the bot drives the conversation forward through whatever the
// talk engine's own branching happens to offer (opt:/act: prefixed ids from
// src/server/talkWire.ts), rather than hardcoding the engine's node graph —
// this is deliberately robust to the engine's own non-linear routing
// (ADR 6), at the cost of being a plausible customer rather than a scripted
// one. Returns every turn seen, so a scenario can assert on the final state.
// A `prefer` callback returns this to stop the drive entirely (without
// sending anything for the current turn) rather than falling through to the
// generic default -- e.g. S11 stopping right before "Confirm this phone" so
// two bots can send it at almost the same moment themselves.
export const STOP = Symbol("stop driving");

// `prefer`, when given, gets first refusal on each customer turn: return a
// choice id to steer the conversation (e.g. S4 forcing a model/colour combo
// that is already out of stock), STOP to halt without sending anything, or
// undefined to fall through to the generic "any reasonable forward move"
// default below.
export async function driveConversationToEnd(bot: BotClient, conversationId: string, maxTurns = 40, prefer?: (turn: Turn) => string | undefined | typeof STOP): Promise<Turn[]> {
  const seen: Turn[] = [];
  let turn = bot.messages.slice().reverse().find((m): m is Turn => m.type === "turn" && m.conversationId === conversationId);
  if (turn) seen.push(turn);
  for (let i = 0; i < maxTurns; i++) {
    if (!turn || turn.ended) break;
    if (turn.awaiting === "staff") {
      // waiting on an NPC or a human specialist's next move: just wait for the next turn
      const mark = bot.mark();
      const next = (await bot.next((m) => m.type === "turn" && m.conversationId === conversationId, 10000, mark)) as Turn;
      seen.push(next);
      turn = next;
      continue;
    }
    if (turn.choices.length === 0) break;
    const preferredId = prefer?.(turn);
    if (preferredId === STOP) break;
    // Prefer: an explicit steer from the scenario > stay standing (skip the
    // seating sub-flow) > confirm the sale > any option that isn't a way to
    // leave, decline, or ask for a demo (a demo walks the customer to a
    // physical device and blocks every other choice -- "Follow Theo first"
    // -- until they arrive and press Esc, which this generic driver doesn't
    // attempt to handle; a scenario that wants to test demos should drive it
    // itself) > whatever is first.
    const pick =
      (preferredId ? choiceById(turn, preferredId) : undefined) ??
      choiceById(turn, "seat:stand") ??
      choiceByLabel(turn, /^confirm this phone$/i) ??
      choiceById(turn, "opt:yes") ??
      choiceByLabel(turn, /^leaning towards this one$/i) ??
      choiceByLabel(turn, /no demo for now/i) ??
      turn.choices.find((c) => !/leave|browse|never mind|fine, thanks|not for me|undecided|ask for a demo|ask to see|another one you offered|ask about other/i.test(c.label)) ??
      turn.choices[0]!;
    const mark = bot.mark();
    await bot.send({ type: "talk_choose", conversationId, choice: pick.id });
    const next = (await bot.next((m) => m.type === "turn" && m.conversationId === conversationId, 10000, mark)) as Turn;
    seen.push(next);
    turn = next;
  }
  return seen;
}

// Gets to a specialist's first conversation turn however it comes about: since D58 an NPC may already have come over and opened
// it by the time the bot has walked up, and the greeter may have stopped the bot on the way in. Looks for the specialist's turn
// since `sinceMark`; failing that steps away from any greeter chat and presses E.
export async function reachSpecialist(bot: BotClient, npcId: string, sinceMark: number): Promise<Turn | undefined> {
  await walkToNpc(bot, npcId);
  const mine = (m: ServerMessage): m is Turn => m.type === "turn" && m.withId === npcId;
  const already = bot.messages.slice(sinceMark).find(mine);
  if (already) return already as Turn;
  const greeting = bot.messages.slice(sinceMark).filter((m): m is Turn => m.type === "turn" && m.withId === "greeter-1" && !m.ended).at(-1);
  if (greeting) {
    await bot.send({ type: "talk_leave" });
    await bot.send({ type: "talk_close" });
    await new Promise((r) => setTimeout(r, 400));
  }
  await bot.send({ type: "talk_start", withId: npcId });
  return (await bot.next(mine, 8000, sinceMark).catch(() => undefined)) as Turn | undefined;
}
