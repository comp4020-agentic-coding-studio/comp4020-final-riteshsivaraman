// S11 (SCOPE.md 3d): "Two visitors race for the last unit" -- the concurrency
// test. Two customers are steered to the same model+colour with START_STOCK
// qty 1 (iPhone Duo, Night Sky) and both confirm at nearly the same moment.
// The invariant this checks is src/server/stock.ts's takeOne(): exactly one
// of the two real sockets gets the unit, the other gets the real "someone
// else has the last one" refusal -- not a race the in-memory service.ts spec
// can exercise, since it needs two independent connections hitting one
// SQLite row at once (CLAUDE.md: "a defect check that measures one
// direction passes while the opposite ships" -- this checks both outcomes
// are possible and exactly one wins, not just that nobody crashes).
import { BotClient, wsUrlFor, type LatencyMode } from "../client.ts";
import { choiceByLabel, driveConversationToEnd, walkToNpc, STOP, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

const prefer = (turn: Turn): string | undefined =>
  choiceByLabel(turn, /^I already have a phone in mind$/)?.id ??
  choiceByLabel(turn, /^Name the iPhone Duo$/)?.id ??
  choiceByLabel(turn, /^Colour: Night Sky$/)?.id;

// Drives the conversation up to (but not through) the final confirm, so both
// bots can be made to press "Confirm this phone" at close to the same time.
async function driveToConfirm(bot: BotClient, conversationId: string): Promise<Turn> {
  const turns = await driveConversationToEnd(bot, conversationId, 40, (t) => {
    if (choiceByLabel(t, /^Confirm this phone$/)) return STOP; // stop here, don't send it yet
    return prefer(t);
  });
  const last = turns.at(-1);
  if (!last || !choiceByLabel(last, /^Confirm this phone$/)) {
    throw new Error(`never reached the confirm turn (last say: "${last?.say}", choices: ${last?.choices.map((c) => c.label).join(", ")})`);
  }
  return last;
}

export async function runS11(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const a = new BotClient(wsUrlFor(baseUrl), "S11-A", latency);
  const b = new BotClient(wsUrlFor(baseUrl), "S11-B", latency);
  try {
    await Promise.all([a.join({ kind: "customer", name: "S11 Rival A" }), b.join({ kind: "customer", name: "S11 Rival B" })]);
    // two different specialists, so neither queues behind the other: this is
    // about the stock row racing, not staff availability
    await Promise.all([walkToNpc(a, "spec-phones"), walkToNpc(b, "spec-phones-2")]);
    await Promise.all([a.send({ type: "talk_start", withId: "spec-phones" }), b.send({ type: "talk_start", withId: "spec-phones-2" })]);
    const [helloA, helloB] = await Promise.all([a.next((m) => m.type === "turn", 6000) as Promise<Turn>, b.next((m) => m.type === "turn", 6000) as Promise<Turn>]);

    const [confirmA, confirmB] = await Promise.all([driveToConfirm(a, helloA.conversationId), driveToConfirm(b, helloB.conversationId)]);

    const start = Date.now();
    const [outA, outB] = await Promise.all([
      a.send({ type: "talk_choose", conversationId: confirmA.conversationId, choice: "opt:yes" }).then(() => a.next((m) => m.type === "turn" && m.conversationId === confirmA.conversationId && m.ended, 10000)) as Promise<Turn>,
      b.send({ type: "talk_choose", conversationId: confirmB.conversationId, choice: "opt:yes" }).then(() => b.next((m) => m.type === "turn" && m.conversationId === confirmB.conversationId && m.ended, 10000)) as Promise<Turn>,
    ]);
    const rtt = Date.now() - start;

    const wonA = /brought out|come and find you/i.test(outA.say);
    const wonB = /brought out|come and find you/i.test(outB.say);
    const lostA = /gone: someone else has the last one/i.test(outA.say);
    const lostB = /gone: someone else has the last one/i.test(outB.say);

    if (wonA && wonB) failures.push(`S11: BOTH customers were told they got the Night Sky iPhone Duo (A said "${outA.say}", B said "${outB.say}") -- stock race sold two units of one`);
    else if (!wonA && !wonB) failures.push(`S11: NEITHER customer got the unit (A said "${outA.say}", B said "${outB.say}")`);
    else if (!(lostA || lostB)) failures.push(`S11: one customer won but the other's refusal didn't say "someone else has the last one" (A: "${outA.say}", B: "${outB.say}")`);
    else notes.push(`S11: exactly one customer won the race, as expected (${wonA ? "A" : "B"} got it)`);

    return { scenario: "S11 stock race", bots: 2, failures, rtts: [{ label: "S11 simultaneous confirm", ms: rtt }], notes };
  } catch (err) {
    failures.push(`S11: ${(err as Error).message}`);
    return { scenario: "S11 stock race", bots: 2, failures, rtts: [...a.takeRtts(), ...b.takeRtts()], notes };
  } finally {
    a.close();
    b.close();
  }
}
