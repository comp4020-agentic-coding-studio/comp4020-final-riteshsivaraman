import { useNet } from "./net.ts";

// What someone is up to, in the open: intent to talk is shown above their head
// ("wants to talk to Pebble", "waiting for Theo") so nobody is surprised by a
// conversation and a busy person's queue is visible (Ritesh, 2026-10-19).
export function IntentBadge({ id }: { id: string }) {
  const net = useNet();
  const mine = [...net.intents.values()].filter((i) => i.fromId === id || i.toId === id);
  if (mine.length === 0) return null;
  const it = mine.find((i) => i.fromId === id) ?? mine[0];
  const text =
    it.fromId === id
      ? it.state === "queued"
        ? `waiting for ${it.toName}`
        : `wants to talk to ${it.toName}`
      : it.state === "queued"
        ? `${it.fromName} is waiting`
        : `${it.fromName} wants to talk`;
  return <div className="intent-badge">💬 {text}</div>;
}
