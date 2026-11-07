// "A server restart with state intact": only runs against the Docker target
// (it needs a container to restart) -- see CLAUDE.md "Never rely on
// setInterval/setTimeout for anything that must happen" and the Fly
// auto-stop/auto-start design: a restart is supposed to be indistinguishable
// from the machine having been asleep, because everything durable lives in
// SQLite (src/server/db.ts, /data on the volume) and NPC/staff positions are
// a pure function of server time (src/shared/npcs.ts), not in-memory state.
//
// Two earlier versions of this scenario tried to observe persistence purely
// through the protocol (a second visitor re-attempting the purchase; the
// same visitor reconnecting with their token) and both turned out to be
// testing the server's own correct cleanup behaviour instead: any other
// visitor's next "move" runs settleVisits(), which (correctly) cancels an
// order the instant its customer is no longer present
// (src/server/service.ts's settleOrders()); and src/server/service.ts's
// rejoin() deliberately clears unfinished business ("what they left half
// done is cleaned up, then their visit starts", src/server/presence.ts)
// on every "hello", even with a valid token. Neither is a bug -- both make
// the live-protocol version of this check unreliable for isolating "did the
// SQLite row literally survive" from "did the app's own abandon-handling
// run first". So this checks the actual claim (CLAUDE.md: "'Did it save?'
// means opening the SQLite file") directly: open /data/store.db inside the
// container before and after the restart and compare the stock row, the way
// a human doing this check by hand would.
import { execFileSync } from "node:child_process";
import { BotClient, wsUrlFor, type LatencyMode, pause } from "../client.ts";
import { choiceByLabel, driveConversationToEnd, walkToNpc, type Turn } from "../flows.ts";
import type { ScenarioResult } from "../report.ts";

function sqliteQuery(containerName: string, sql: string): string {
  return execFileSync("docker", ["exec", containerName, "sqlite3", "/data/store.db", sql], { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

const prefer = (turn: Turn): string | undefined =>
  choiceByLabel(turn, /^I already have a phone in mind$/)?.id ??
  choiceByLabel(turn, /^Name the iPhone 17$/)?.id ??
  choiceByLabel(turn, /^Colour: Black$/)?.id ??
  choiceByLabel(turn, /^Confirm this phone$/)?.id;

export async function runRestartStateIntact(baseUrl: string, latency: LatencyMode, containerName: string | undefined): Promise<ScenarioResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  if (!containerName) {
    return {
      scenario: "server restart, state intact",
      bots: 0,
      failures: [],
      rtts: [],
      notes: ["skipped: this scenario needs a Docker container name (only runs against the local Docker target, per SKILL.md)"],
    };
  }

  const before = new BotClient(wsUrlFor(baseUrl), "restart-before", latency);
  try {
    await before.join({ kind: "customer", name: "Before Restart" });
    // SPAWN is inside the entrance zone, so the greeter auto-approaches on
    // join (tryGreeterApproach): wait that out first so her "turn" message
    // isn't mistaken for the specialist's below.
    await before.next((m) => m.type === "turn" && m.withId === "greeter-1", 6000).catch(() => undefined);
    const specMark = before.mark();
    await walkToNpc(before, "spec-phones");
    await before.send({ type: "talk_start", withId: "spec-phones" });
    const hello = (await before.next((m) => m.type === "turn" && m.withId === "spec-phones", 6000, specMark)) as Turn;
    const seen = await driveConversationToEnd(before, hello.conversationId, 40, prefer);
    const last = seen.at(-1);
    const bought = last?.ended && /brought out|come and find you/i.test(last.say);
    if (!bought) {
      failures.push(`restart: couldn't buy a Black iPhone 17 before the restart to use as the persistence check (last say: "${last?.say}")`);
      return { scenario: "server restart, state intact", bots: 1, failures, rtts: [], notes };
    }
    // Read the stock row straight from the volume before disconnecting, then
    // restart and read it again -- the direct "open the SQLite file" check,
    // not a protocol round trip (see the file-top note on why the protocol
    // version is unreliable here).
    const beforeStock = sqliteQuery(containerName, "SELECT qty FROM stock WHERE product='iphone-17' AND colour='Black' AND storage='256GB';");
    notes.push(`restart: stock row before restart: qty=${beforeStock}`);
    before.close();

    notes.push(`restarting Docker container "${containerName}"...`);
    const start = Date.now();
    execFileSync("docker", ["restart", containerName], { stdio: "pipe" });
    // wait for the server to come back up (the harness's own base URL check)
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try {
        const res = await fetch(baseUrl);
        up = res.ok || res.status < 500;
      } catch {
        // not up yet
      }
      if (!up) await pause(1000);
    }
    const restartMs = Date.now() - start;
    if (!up) {
      failures.push(`restart: the container never answered HTTP again within 60s of "docker restart ${containerName}"`);
      return { scenario: "server restart, state intact", bots: 1, failures, rtts: [{ label: "restart downtime", ms: restartMs }], notes };
    }
    notes.push(`restart: back up in ${restartMs}ms`);

    const afterStock = sqliteQuery(containerName, "SELECT qty FROM stock WHERE product='iphone-17' AND colour='Black' AND storage='256GB';");
    notes.push(`restart: stock row after restart: qty=${afterStock}`);
    if (afterStock !== beforeStock) {
      failures.push(`restart: stock qty for iphone-17/Black/256GB changed across the restart with nobody touching it (was ${beforeStock}, now ${afterStock}) -- the volume did not survive intact`);
    } else if (beforeStock !== "0") {
      // The held reservation (not released until it either completes or
      // times out) should mean this unit was already off the shelf before
      // the restart happened at all -- if it wasn't, something upstream
      // (the held reservation itself) is not what this check assumed.
      notes.push(`restart: expected the qty to be 0 (held by the reservation from above) but it reads ${beforeStock} both before and after -- the restart itself is unaffected either way (the two reads agree), but this is worth checking by hand against the reservations table`);
    } else {
      notes.push("restart: the stock row read identically before and after the restart (qty 0, held by the reservation) -- the SQLite volume survived intact");
    }
    const reservations = sqliteQuery(containerName, "SELECT id, status FROM reservations WHERE visitor_id != '' ORDER BY created_at DESC LIMIT 1;");
    notes.push(`restart: most recent reservation row after restart: ${reservations || "(none)"}`);
    return {
      scenario: "server restart, state intact",
      bots: 1,
      failures,
      rtts: [{ label: "restart downtime", ms: restartMs }],
      notes,
    };
  } catch (err) {
    failures.push(`restart: ${(err as Error).message}`);
    return { scenario: "server restart, state intact", bots: 1, failures, rtts: [], notes };
  } finally {
    before.close();
  }
}
