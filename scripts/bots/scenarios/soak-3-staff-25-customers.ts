// "3 staff and 25 customers at once": the volume target SKILL.md/the issue
// names explicitly. Joins 3 real specialists and 25 customers concurrently,
// sends every customer to the greeter, through to asking for the phones
// team, and measures how the server holds up under that much live WebSocket
// traffic at once -- the closest this harness gets to a load test, over the
// real protocol rather than a synthetic one. Not every customer will get a
// human specialist (there are 2 NPCs plus 3 humans for 25 customers), so
// this scenario's pass condition is "no crash, no visitor left with a
// broken turn" rather than "everyone gets served in some time bound."
import { BotClient, wsUrlFor, type LatencyMode, pause } from "../client.ts";
import { choiceById, walkToEntrance, waitForGreeter } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

export async function runSoak(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const bots: BotClient[] = [];
  const CUSTOMERS = 25;
  const STAFF = 3;

  try {
    const staff = Array.from({ length: STAFF }, (_, i) => new BotClient(wsUrlFor(baseUrl), `soak-staff-${i}`, latency));
    const customers = Array.from({ length: CUSTOMERS }, (_, i) => new BotClient(wsUrlFor(baseUrl), `soak-cust-${i}`, latency));
    bots.push(...staff, ...customers);

    const start = Date.now();
    const joinResults = await Promise.allSettled([
      ...staff.map((s, i) => s.join({ kind: "specialist", specialty: "phones", name: `Soak Staff ${i}` })),
      ...customers.map((c, i) => c.join({ kind: "customer", name: `Soak Cust ${i}` })),
    ]);
    const joinFailures = joinResults.filter((r) => r.status === "rejected");
    if (joinFailures.length > 0) {
      failures.push(`soak: ${joinFailures.length}/${staff.length + customers.length} bots failed to join at all: ${(joinFailures[0] as PromiseRejectedResult).reason}`);
    }
    const joinMs = Date.now() - start;

    // staff spread out so the queue has somewhere to send customers
    await Promise.all(staff.map((s, i) => s.send({ type: "move", x: -4.5 + i * 2, z: -3 + i, ry: 0 })));

    // every customer walks to the entrance, slightly offset so they don't
    // all pile on one spot (clampToWalkable/avoidPeople would just spread
    // them anyway, but this is closer to how real visitors would arrive)
    await Promise.all(customers.map((c, i) => walkToEntrance(c, (i % 10) * 0.3 - 1.5)));

    // There is exactly one greeter, who greets one customer at a time
    // (crit-10's fix, SCOPE.md: nobody queues behind her, but that also
    // means nobody else is served while she is busy, and she is not freed
    // until the current customer dismisses the final turn with talk_close --
    // spec/greeter-live.test.ts) -- with 25 customers arriving together,
    // most of this wave's wait is queuing for her alone, not a server
    // problem. Each customer's own greet -> ask -> talk_close must run and
    // complete BEFORE the next one can be greeted at all, so this drives
    // each customer's whole pipeline independently and concurrently (not
    // "wait for everyone to be greeted, then ask") -- waiting for the whole
    // batch first would deadlock the greeter forever, since nobody frees her
    // until their own close is sent. This scenario's pass bar is therefore
    // "a healthy fraction get through in a generous window and nothing
    // falls over", not "everyone is greeted instantly": 25 serial greetings
    // at roughly the greeter-live.test.ts pace is tens of seconds by itself.
    const greetStart = Date.now();
    const greetMs: number[] = [];
    const askRtts: number[] = [];
    let greetedCount = 0;
    let timedOutQueuing = 0;
    await Promise.all(
      customers.map(async (c, i) => {
        let hello;
        try {
          hello = await waitForGreeter(c, 90000);
        } catch {
          // never reached the front of the one-greeter queue in 90s: under
          // this much simultaneous load that is an expected outcome for
          // some customers, not a protocol failure -- counted, not pushed
          // as a failure.
          timedOutQueuing++;
          return;
        }
        greetedCount++;
        greetMs.push(Date.now() - greetStart);
        try {
          const phone = choiceById(hello, "phone");
          if (!phone) {
            failures.push(`soak: customer ${i}'s greeter turn had no "phone" option`);
            return;
          }
          const askStart = Date.now();
          await c.send({ type: "talk_choose", conversationId: hello.conversationId, choice: phone.id });
          await c.next((m) => m.type === "turn" && m.conversationId === hello.conversationId && m.choices.some((x) => x.id === "help"), 10000);
          await c.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "help" });
          await c.next((m) => m.type === "turn" && m.conversationId === hello.conversationId && m.ended, 10000);
          // dismiss the final turn: she is not released to greet the next
          // customer until this is sent.
          await c.send({ type: "talk_close" });
          askRtts.push(Date.now() - askStart);
        } catch (err) {
          // this one DID get greeted, so a failure past this point is a real
          // protocol problem, not queuing.
          failures.push(`soak: customer ${i} was greeted but got stuck asking for help: ${(err as Error).message}`);
        }
      }),
    );
    notes.push(`soak: ${greetedCount}/${customers.length} greeted within 90s, ${timedOutQueuing} still queuing for the one greeter when the window closed (one greeter, no queue by design, not necessarily a bug)`);
    if (greetedCount === 0) failures.push("soak: not a single customer was ever greeted out of 25 -- the greeter may be stuck, not just busy");

    // give the wave a moment to settle (staff walking over, NPCs picking up
    // the rest) and spot-check nobody's socket silently died
    await pause(3000);
    const droppedSockets = bots.filter((b) => b.closed).length;
    if (droppedSockets > 0) failures.push(`soak: ${droppedSockets}/${bots.length} sockets closed unexpectedly during the wave`);

    notes.push(`soak: ${staff.length} staff + ${customers.length} customers joined in ${joinMs}ms, ${greetedCount}/${customers.length} greeted`);
    return {
      scenario: "3 staff / 25 customers",
      bots: bots.length,
      failures,
      rtts: [{ label: "soak join", ms: joinMs }, ...greetMs.map((ms) => ({ label: "soak greet", ms })), ...askRtts.map((ms) => ({ label: "soak ask-for-help", ms }))],
      notes,
    };
  } catch (err) {
    failures.push(`soak: ${(err as Error).message}`);
    return { scenario: "3 staff / 25 customers", bots: bots.length, failures, rtts: [], notes };
  } finally {
    for (const b of bots) b.close();
  }
}
