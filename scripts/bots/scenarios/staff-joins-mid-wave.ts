// "A staff member joining mid-wave": checks D47 (SCOPE.md) directly: "A real
// user behind a screen is always prioritised over a CPU staff member" by
// src/server/service.ts's pickHelper(), which tries every free human
// specialist before falling back to the NPCs. A wave of customers is already
// browsing, pointed at the two NPC specialists (nobody else is on duty yet),
// when a real human joins as a specialist mid-wave. The next customer who
// then asks for help should be told to go to the human by name, not an NPC,
// even though the NPCs are still free too.
import { BotClient, wsUrlFor, type LatencyMode } from "../client.ts";
import { choiceById, walkToEntrance, waitForGreeter, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

async function askGreeterForPhones(c: BotClient, name: string): Promise<Turn> {
  await walkToEntrance(c);
  const hello = await waitForGreeter(c, 6000);
  const phone = choiceById(hello, "phone");
  if (!phone) throw new Error(`${name}: greeter's opening turn had no "phone" option`);
  await c.send({ type: "talk_choose", conversationId: hello.conversationId, choice: phone.id });
  await c.next((m) => m.type === "turn" && m.conversationId === hello.conversationId && m.choices.some((x) => x.id === "help"), 6000);
  await c.send({ type: "talk_choose", conversationId: hello.conversationId, choice: "help" });
  const sentOff = (await c.next((m) => m.type === "turn" && m.conversationId === hello.conversationId && m.ended, 6000)) as Turn;
  await c.send({ type: "talk_close" });
  return sentOff;
}

export async function runStaffJoinsMidWave(baseUrl: string, latency: LatencyMode): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const bots: BotClient[] = [];
  try {
    // two customers arrive first, filling both NPC specialists (spec-phones, spec-phones-2)
    const early = [0, 1].map((i) => new BotClient(wsUrlFor(baseUrl), `midwave-early-${i}`, latency));
    bots.push(...early);
    await Promise.all(early.map((c, i) => c.join({ kind: "customer", name: `MidWave Early ${i}` })));
    const earlySentOff = await Promise.all(early.map((c, i) => askGreeterForPhones(c, `early-${i}`)));
    for (const s of earlySentOff) {
      if (!/phones area/.test(s.say)) failures.push(`midwave: an early customer's send-off line was "${s.say}" (expected to be pointed at the phones area)`);
    }

    // now a real human specialist joins -- should outrank the NPCs for the
    // NEXT customer who asks, per D47, even though the NPCs may now be busy
    // with the two early customers anyway
    const staff = new BotClient(wsUrlFor(baseUrl), "midwave-staff", latency);
    bots.push(staff);
    await staff.join({ kind: "specialist", specialty: "phones", name: "MidWave Sam" });
    await staff.send({ type: "move", x: 2.6, z: 0, ry: 0 });

    // a third customer arrives and asks for the phones team
    const late = new BotClient(wsUrlFor(baseUrl), "midwave-late", latency);
    bots.push(late);
    await late.join({ kind: "customer", name: "MidWave Late" });
    const start = Date.now();
    const sentOff = await askGreeterForPhones(late, "late");
    const rtt = Date.now() - start;

    if (/Sam will look after you/.test(sentOff.say)) {
      notes.push(`midwave: D47 held -- the new customer was pointed at the human specialist Sam, not an NPC ("${sentOff.say}")`);
    } else if (/Theo will look after you|Priya will look after you/.test(sentOff.say)) {
      failures.push(`midwave: D47 violated -- a real human specialist (Sam) was free, but the new customer was pointed at an NPC instead ("${sentOff.say}")`);
    } else {
      notes.push(`midwave: send-off line was "${sentOff.say}" -- couldn't tell which specialist this points to from the text; check manually`);
    }

    // and Sam herself should have been told
    const notice = await staff.next((m) => m.type === "notice" && /New customer/.test(m.text), 5000).catch(() => undefined);
    if (!notice) failures.push("midwave: the human specialist Sam was pointed to by name, but never got a 'New customer' notice telling her to go meet them");

    return { scenario: "staff joins mid-wave (D47)", bots: bots.length, failures, rtts: [{ label: "midwave ask-to-sentoff", ms: rtt }], notes };
  } catch (err) {
    failures.push(`midwave: ${(err as Error).message}`);
    return { scenario: "staff joins mid-wave (D47)", bots: bots.length, failures, rtts: [], notes };
  } finally {
    for (const b of bots) b.close();
  }
}
