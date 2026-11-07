// "A disconnect and reconnect": a customer starts a conversation with the
// phones specialist, drops the socket mid-visit (no "bye", a raw close --
// the same thing a phone losing signal looks like), then opens a brand new
// socket with the token the first "welcome" handed them
// (src/server/presence.ts's findByToken / resolveVisitor) and checks they
// come back as the same visitor rather than a stranger, and that the dropped
// conversation was cleaned up rather than left stuck holding an NPC.
import { BotClient, wsUrlFor, type LatencyMode, pause } from "../client.ts";
import { walkToNpc, type Turn } from "../flows.ts";
import type { ServerMessage } from "../../../src/shared/protocol.ts";
import type { ScenarioResult } from "../report.ts";

export async function runDisconnectReconnect(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const first = new BotClient(wsUrlFor(baseUrl), "reconnect-first", latency);
  try {
    const welcome = await first.join({ kind: "customer", name: "Flaky Connection" });
    const token = welcome.token;
    const visitorId = welcome.you.id;

    await walkToNpc(first, "spec-phones");
    await first.send({ type: "talk_start", withId: "spec-phones" });
    const hello = (await first.next((m) => m.type === "turn", 6000)) as Turn;
    if (!hello) failures.push("reconnect: never got a conversation turn before dropping the connection");

    // raw close, no "bye" -- the disconnect-mid-visit case
    const start = Date.now();
    first.socket.close();
    await pause(400);

    // a second, genuinely separate socket, joining with the real token the
    // way a reconnecting client actually would
    const third = new BotClient(wsUrlFor(baseUrl), "reconnect-third", latency);
    try {
      await third.waitOpen();
      await third.send({ type: "hello", token, profile: { kind: "customer" } });
      const w3 = (await third.next((m) => m.type === "welcome", 6000)) as Extract<ServerMessage, { type: "welcome" }>;
      const rtt = Date.now() - start;
      if (w3.you.id !== visitorId) {
        failures.push(`reconnect: rejoining with the original token gave a different visitor id (was ${visitorId}, now ${w3.you.id})`);
      } else {
        notes.push(`reconnect: same visitor id (${visitorId}) recovered after a raw socket close, in ${rtt}ms`);
      }
      // the conversation they dropped mid-visit should not still show them
      // "in conversation" with nobody there to talk to
      if (w3.state === "in_conversation" && !w3.engaged.some((e) => e.visitorId === visitorId)) {
        notes.push(`reconnect: rejoined still marked "in_conversation" with no live engagement -- check this resolves on the next turn, not left stuck (state: ${w3.state})`);
      }
      return { scenario: "disconnect and reconnect", bots: 1, failures, rtts: [{ label: "reconnect round trip", ms: rtt }], notes };
    } finally {
      third.close();
    }
  } catch (err) {
    failures.push(`reconnect: ${(err as Error).message}`);
    return { scenario: "disconnect and reconnect", bots: 1, failures, rtts: [], notes };
  } finally {
    first.close();
  }
}
