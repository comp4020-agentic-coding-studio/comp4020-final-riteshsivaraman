// S4 (SCOPE.md 3d): "Out of stock after the wait: fall back or leave." Steers
// a customer towards a model/colour combo START_STOCK (src/shared/catalogue.ts)
// starts at zero units -- iPhone Air in Light Gold -- so the real stock table
// refuses the sale the way src/server/service.ts's startCheckout() does for
// any customer, not a scripted shortcut. The customer is then offered a
// fallback and leaves, which is the scenario's "fall back or leave" outcome.
import { BotClient, wsUrlFor, type LatencyMode } from "../client.ts";
import { choiceByLabel, driveConversationToEnd, walkToNpc, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

const prefer = (turn: Turn): string | undefined =>
  choiceByLabel(turn, /^I already have a phone in mind$/)?.id ??
  choiceByLabel(turn, /^Name the iPhone Air$/)?.id ??
  choiceByLabel(turn, /^Colour: Light Gold$/)?.id ??
  choiceByLabel(turn, /^Confirm this phone$/)?.id;

export async function runS4(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const bot = new BotClient(wsUrlFor(baseUrl), "S4-customer", latency);
  try {
    await bot.join({ kind: "customer", name: "S4 Shopper" });

    // go straight to the phones specialist (skips the greeter hand-off,
    // which S1 already covers) to keep this scenario focused on stock
    await walkToNpc(bot, "spec-phones");
    await bot.send({ type: "talk_start", withId: "spec-phones" });
    const hello = (await bot.next((m) => m.type === "turn", 6000)) as Turn;

    const start = Date.now();
    const seen = await driveConversationToEnd(bot, hello.conversationId, 40, prefer);
    const last = seen.at(-1);
    const soldOut = seen.some((t) => /gone: someone else has the last one|sold out/i.test(t.say));
    if (!soldOut) {
      failures.push(
        `S4: drove the customer to the iPhone Air in Light Gold (START_STOCK qty 0), but never saw the "sold out" refusal (final say: "${last?.say}")`,
      );
    }
    if (!last?.ended) failures.push(`S4: conversation never ended after the out-of-stock refusal (last say: "${last?.say}")`);
    const rtt = Date.now() - start;
    return { scenario: "S4 out of stock", bots: 1, failures, rtts: [{ label: "S4 out-of-stock flow", ms: rtt }], notes };
  } catch (err) {
    failures.push(`S4: ${(err as Error).message}`);
    return { scenario: "S4 out of stock", bots: 1, failures, rtts: bot.takeRtts(), notes };
  } finally {
    bot.close();
  }
}
