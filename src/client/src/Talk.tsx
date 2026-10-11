import { useEffect } from "react";
import { useNet } from "./net.ts";

// The conversation box, at the bottom of the screen like a Pokemon text box:
// who is speaking, what they say, and your choices as numbered buttons (press
// 1 to 9, or click). When it is the employee's turn it says so, and when it has
// ended Space, Enter or Esc closes it. The mouse look is let go while it is open.
export function Talk() {
  const net = useNet();
  const turn = net.turn;

  useEffect(() => {
    if (!turn) return;
    document.exitPointerLock?.();
    const key = (e: KeyboardEvent) => {
      const t = net.turn;
      if (!t) return;
      if (t.ended) {
        if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
          e.preventDefault();
          net.closeTurn();
        }
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= t.choices.length && t.awaiting === "customer") net.choose(t.choices[n - 1].id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [turn?.conversationId, turn?.ended, net]);

  if (!turn) return null;
  return (
    <div className="talk" role="dialog" aria-label={`Conversation with ${turn.withName}`}>
      <div className="talk-name">{turn.withName}</div>
      <p className="talk-say">{turn.say}</p>
      {turn.awaiting === "staff" && !turn.ended && <div className="talk-wait">Waiting for {turn.withName}…</div>}
      {!turn.ended && turn.awaiting === "customer" && (
        <div className="talk-choices">
          {turn.choices.map((c, i) => (
            <button key={c.id} type="button" onClick={() => net.choose(c.id)}>
              <kbd>{i + 1}</kbd> {c.label}
            </button>
          ))}
        </div>
      )}
      {turn.ended && (
        <div className="talk-choices">
          <button type="button" onClick={() => net.closeTurn()}>
            <kbd>Space</kbd> Close
          </button>
        </div>
      )}
    </div>
  );
}
