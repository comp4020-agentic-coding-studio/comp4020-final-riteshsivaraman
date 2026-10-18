import { useNet } from "./net.ts";

// What someone is up to, in the open: intent to talk is shown above their head
// ("wants to talk to you", "waiting for Theo") so nobody is surprised by a
// conversation and a busy person's queue is visible (Ritesh, 2026-10-19). An
// intent that is only waiting for you to get to a spot is not shown: nobody is
// coming yet.
export function IntentBadge({ id }: { id: string }) {
  const net = useNet();
  const me = net.you?.id;
  const mine = [...net.intents.values()].filter((i) => i.state !== "held" && (i.fromId === id || i.toId === id));
  if (mine.length === 0) return null;
  const it = mine.find((i) => i.fromId === id) ?? mine[0];
  const target = it.toId === me ? "you" : it.toName;
  const source = it.fromId === me ? "you" : it.fromName;
  const text =
    it.fromId === id
      ? it.state === "queued"
        ? `waiting for ${target}`
        : `wants to talk to ${target}`
      : it.state === "queued"
        ? `${source} is waiting`
        : `${source} wants to talk`;
  return <div className="intent-badge">💬 {text}</div>;
}
