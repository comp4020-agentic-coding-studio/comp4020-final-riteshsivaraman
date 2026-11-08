// S1 (SCOPE.md 3d): "Happy path: greet, check in, specialist, configure,
// extra declined or accepted, swipe, bag, leave." One customer walks in, the
// greeter approaches on her own, asks for the phones team, then walks over
// and presses E on the specialist NPC themselves (D47/D32: nobody is ever
// sent to fetch a waiting customer -- tryNpcAutoClaim exists but is
// deliberately not wired into the live path, src/server/service.ts around
// line 1681, so the real flow is "told where to go, then walks over"), the
// specialist NPC runs the talk engine through to a sale, a stock runner is
// sent, and the customer pays.
import { BotClient, wsUrlFor, type LatencyMode } from "../client.ts";
import { choiceById, driveConversationToEnd, reachSpecialist, walkToEntrance, waitForGreeter, waitSettling, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

export async function runS1(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const bot = new BotClient(wsUrlFor(baseUrl), "S1-customer", latency);
  try {
    await bot.join({ kind: "customer", name: "S1 Shopper" });
    await walkToEntrance(bot);

    // tryGreeterApproach fires on the server's "move" handler (walkToEntrance
    // already sent a few), so the greeter should already be opening up; fall
    // back to a manual talk_start if we somehow raced her.
    const greetStart = Date.now();
    const greet = await waitForGreeter(bot, 6000);
    const greetRtt = Date.now() - greetStart;
    const phoneChoice = choiceById(greet, "phone");
    if (!phoneChoice) {
      failures.push(`S1: greeter's opening turn had no "phone" option (choices: ${greet.choices.map((c) => c.label).join(", ")})`);
      return { scenario: "S1 happy path", bots: 1, failures, rtts: bot.takeRtts(), notes };
    }
    await bot.send({ type: "talk_choose", conversationId: greet.conversationId, choice: phoneChoice.id });
    await bot.next((m) => m.type === "turn" && m.conversationId === greet.conversationId && m.choices.some((c) => c.id === "help"), 6000);
    await bot.send({ type: "talk_choose", conversationId: greet.conversationId, choice: "help" });
    const sentOff = (await bot.next((m) => m.type === "turn" && m.conversationId === greet.conversationId && m.ended, 6000)) as Turn;
    // src/server/service.ts's apply() overrides the static "help_asked" node
    // text (src/shared/conversation.ts) with a dynamic "Head over to <area>:
    // <name> will look after you" line once a real helper is pointed to.
    if (!/Head over to.*will look after you/.test(sentOff.say)) failures.push(`S1: greeter's send-off line was "${sentOff.say}" (expected "Head over to <area>: <name> will look after you")`);
    await bot.send({ type: "talk_close" });

    // told to head to the phones area; the customer walks over and presses E
    // on the specialist themselves (the real flow -- see the note above)
    const specMark = bot.mark();
    // (the specialist may already be coming over to them, D58: whichever gets there first)
    const specTurn = await reachSpecialist(bot, "spec-phones", specMark);
    if (!specTurn) {
      failures.push("S1: walked up to the specialist and pressed E, but never got a conversation turn back");
      return { scenario: "S1 happy path", bots: 1, failures, rtts: bot.takeRtts(), notes };
    }

    const start = Date.now();
    const seen = await driveConversationToEnd(bot, specTurn.conversationId, 50);
    const last = seen.at(-1);
    bot.takeRtts(); // discard; recorded below with one deliberate label
    if (!last?.ended) {
      failures.push(`S1: the phone conversation never reached an ended turn within 50 bot turns (last say: "${last?.say}")`);
    } else if (!/brought out|come and find you|aside for you/i.test(last.say)) {
      notes.push(`S1: conversation ended with "${last.say}" rather than a sale hand-off line`);
    }

    // the stock runner brings the phone; the server only advances that walk
    // on a request that touches it, so poll with "settle" while waiting.
    // Waits the FULL order window (src/server/service.ts's ORDER_MS, 3 min):
    // this is a known, reproduced bug (reported to the orchestrator during
    // this issue's build, not fixed here per CLAUDE.md's defect loop) where
    // the stock runner never completes its hand-off to the specialist, so
    // every order times out and the unit goes back on the shelf -- this is
    // a genuine S1 failure, not a flaky wait, so it is asserted as one.
    const payTurn = await waitSettling(bot, (m) => m.type === "turn" && m.say.includes("How would you like to pay"), 3 * 60_000 + 5000).catch(() => undefined);
    if (!payTurn) {
      failures.push("S1: no payment turn ever arrived, even after waiting the full 3-minute order window -- the stock runner never completes the hand-off to the specialist (reported to the orchestrator during this build; a real product bug, not a harness timing issue)");
    } else {
      const pt = payTurn as Turn;
      const payMark = bot.mark();
      await bot.send({ type: "talk_choose", conversationId: pt.conversationId, choice: "pay:card" });
      const done = (await bot.next((m) => m.type === "turn" && m.ended && /gone through/.test(m.say), 6000, payMark).catch(() => undefined)) as Turn | undefined;
      if (!done) failures.push("S1: paid by card but never got a confirmation turn");
    }
    const totalMs = Date.now() - start;
    return {
      scenario: "S1 happy path",
      bots: 1,
      failures,
      rtts: [{ label: "S1 greeter-approach", ms: greetRtt }, { label: "S1 greet-to-sale", ms: totalMs }, ...bot.takeRtts()],
      notes,
    };
  } catch (err) {
    failures.push(`S1: ${(err as Error).message}`);
    return { scenario: "S1 happy path", bots: 1, failures, rtts: bot.takeRtts(), notes };
  } finally {
    bot.close();
  }
}
