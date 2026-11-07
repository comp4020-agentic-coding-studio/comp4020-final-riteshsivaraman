// S2 (SCOPE.md 3d): "Browse and leave, nobody serves you." The greeter still
// greets (she greets everyone who steps in, D47), but the visitor says
// "Just having a look" and leaves without ever waiting on staff. Checks that
// browsing never gets stuck waiting on anyone and that a plain socket close
// is accepted as a leave.
import { BotClient, wsUrlFor, type LatencyMode } from "../client.ts";
import { choiceById, walkToEntrance, waitForGreeter, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

export async function runS2(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const bot = new BotClient(wsUrlFor(baseUrl), "S2-browser", latency);
  try {
    await bot.join({ kind: "customer", name: "S2 Browser" });
    await walkToEntrance(bot);

    const start = Date.now();
    const hello = await waitForGreeter(bot, 6000);
    const rtt = Date.now() - start;
    const look = choiceById(hello, "look");
    if (!look) {
      failures.push(`S2: greeter's opening turn had no "Just having a look" option (choices: ${hello.choices.map((c) => c.label).join(", ")})`);
      return { scenario: "S2 browse and leave", bots: 1, failures, rtts: bot.takeRtts(), notes };
    }
    const mark = bot.mark();
    await bot.send({ type: "talk_choose", conversationId: hello.conversationId, choice: look.id });
    const ended = (await bot.next((m) => m.type === "turn" && m.conversationId === hello.conversationId && m.ended, 5000, mark).catch(() => undefined)) as Turn | undefined;
    if (!ended) failures.push("S2: choosing to browse never ended the greeter conversation");
    await bot.send({ type: "talk_close" });

    // browse a bit, then just close the socket (the "leave" case this
    // scenario is about: nobody ever serves them, and that is fine)
    await bot.send({ type: "move", x: 2, z: -2, ry: Math.PI / 2 });
    bot.close();
    return { scenario: "S2 browse and leave", bots: 1, failures, rtts: [{ label: "S2 greeter-approach", ms: rtt }], notes };
  } catch (err) {
    failures.push(`S2: ${(err as Error).message}`);
    return { scenario: "S2 browse and leave", bots: 1, failures, rtts: bot.takeRtts(), notes };
  } finally {
    bot.close();
  }
}
