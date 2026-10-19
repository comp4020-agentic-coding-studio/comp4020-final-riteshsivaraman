import { useEffect, useRef, useState } from "react";
import { useNet } from "./net.ts";

// A real specialist's conversation (Ritesh, 2026-10-20), laid out like the
// customer's: the chat on the left with the moves you can make, and on the
// right what the customer has told you and which phones are still in play.
// The camera is on the customer and you cannot walk about; Esc steps away.
export function StaffTalk() {
  const net = useNet();
  const conv = net.staffTalking;
  const [tone, setTone] = useState("neutral");
  const logEl = useRef<HTMLDivElement>(null);
  // the newest line is always in view
  useEffect(() => {
    if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [net.staffConv?.log.length, net.staffConv?.conversationId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape" && net.staffTalking) {
        e.preventDefault();
        net.staffLeave();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [net]);
  if (!conv) return null;
  const myMove = conv.awaiting === "staff";
  return (
    <>
      <section className="staff-talk" role="dialog" aria-label={`Serving ${conv.customerName}`}>
        <div className="talk-name">{conv.customerName}</div>
        <div className="talk-leave-hint">
          <kbd>Esc</kbd> to step away
        </div>
        <div className="staff-log" ref={logEl}>
          {conv.log.length === 0 && <p className="staff-empty">You are on. Start with a greeting.</p>}
          {conv.log.map((l, i) => (
            <p key={i} className={l.who === "staff" ? "you" : "them"}>
              <span>{l.who === "staff" ? "You" : conv.customerName}</span> {l.text}
            </p>
          ))}
        </div>
        <div className="staff-status">{conv.status}</div>
        {myMove && (
          <>
            <div className="staff-tones" role="radiogroup" aria-label="Tone">
              {conv.tones.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} className={tone === t.id ? "on" : ""} onClick={() => setTone(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="staff-acts">
              {conv.acts.map((a) => (
                <button key={a.id} type="button" className="talk-card" onClick={() => net.staffMove(a.id, tone)}>
                  {a.label}
                  {a.hint && <small>narrows the phones: {a.hint}</small>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <aside className="staff-facts" aria-label="What you know">
        <h3>What they've told you</h3>
        {conv.stats.answers.length === 0 ? <p className="staff-empty">Nothing yet.</p> : (
          <ul>
            {conv.stats.answers.map((a, i) => (
              <li key={i}>
                <span>{a.label}</span> {a.value}
              </li>
            ))}
          </ul>
        )}
        <h3>Still in play</h3>
        <table>
          <tbody>
            {conv.stats.candidates.map((c) => (
              <tr key={c.name}>
                <td>
                  <b>{c.name}</b>
                  {c.note && <small>{c.note}</small>}
                </td>
                <td>{c.screen}</td>
                <td>{c.from}</td>
                <td>{c.battery}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </>
  );
}
