import { useState } from "react";
import { designationOf } from "../../shared/profile.ts";
import { NPC_DESIGNATION } from "../../shared/duty.ts";
import type { CustomerView } from "../../shared/protocol.ts";
import { NPCS, npcPose } from "../../shared/npcs.ts";
import { useNet } from "./net.ts";

const POSTS = [...new Set(Object.values(NPC_DESIGNATION))];
const POST_LABEL = (p: string | null): string => (p ? p.replace("specialist:", "specialist · ").replace("_", " ") : "nobody in particular");
const STATE_LABEL: Record<string, string> = {
  arriving: "just arrived",
  browsing: "browsing",
  waiting_for_help: "waiting for help",
  in_conversation: "in a conversation",
  in_purchase: "buying",
  waiting_for_order: "waiting for an order",
  leaving: "leaving",
};
const mmss = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

// For employees only: every customer in the store and where they are in their
// visit, so the people working the floor can see who is waiting for what and
// coordinate; and the replies waiting on you when you are serving someone.
export function StaffPanel() {
  const net = useNet();
  // customers who are in the store but not asking for anyone (the list below is
  // only people who need staff), so "no customers in the store" is never said
  // over a shop full of browsers
  const now = net.serverNow();
  const inStore = NPCS.filter((n) => n.role === "customer" && npcPose(n, now).present).length + [...net.remotes.values()].filter((r) => r.identity.kind === "customer").length;
  const [open, setOpen] = useState(true);
  const [handing, setHanding] = useState<string | null>(null);
  const [to, setTo] = useState(POSTS[0]);
  const [note, setNote] = useState("");
  if (!net.isEmployee || net.status !== "open") return null;
  const mine = designationOf({ kind: net.identity.kind as never, specialty: net.identity.specialty });
  const waiting = net.customers.filter((c) => c.state === "waiting_for_help").length;

  const row = (c: CustomerView) => {
    const mineToTake = c.state === "waiting_for_help" && c.needs === mine;
    return (
      <li key={c.id} className={c.state === "waiting_for_help" ? "cust waiting" : "cust"}>
        <div className="cust-top">
          <b>{c.name}</b>
          <span className="cust-time">{mmss(c.sinceMs)}</span>
        </div>
        <div className="cust-state">
          {STATE_LABEL[c.state] ?? c.state}
          {c.want ? ` · wants ${c.want}` : ""}
        </div>
        {c.needs && <div className="cust-needs">needs: {POST_LABEL(c.needs)}</div>}
        {c.withName && <div className="cust-with">with {c.withName}</div>}
        {c.note && <div className="cust-note">{c.note}</div>}
        {c.state === "waiting_for_help" && (
          <div className="cust-actions">
            <button type="button" disabled={!mineToTake} title={mineToTake ? "Take this customer" : "They are waiting for a different post"} onClick={() => net.claim(c.id)}>
              Take
            </button>
            <button type="button" onClick={() => setHanding(handing === c.id ? null : c.id)}>
              Hand on…
            </button>
          </div>
        )}
        {handing === c.id && (
          <div className="cust-hand">
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {POSTS.map((p) => (
                <option key={p} value={p}>
                  {POST_LABEL(p)}
                </option>
              ))}
            </select>
            <input value={note} maxLength={140} placeholder="A note for them" onChange={(e) => setNote(e.target.value)} />
            <button
              type="button"
              onClick={() => {
                net.handOn(c.id, to, note);
                setHanding(null);
                setNote("");
              }}
            >
              Send
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <aside className={open ? "staff open" : "staff"}>
      <button type="button" className="staff-toggle" onClick={() => setOpen(!open)}>
        {open ? "Hide" : `Customers (${net.customers.length}${waiting ? `, ${waiting} waiting` : ""})`}
      </button>
      {open && (
        <>
          <div className="staff-head">
            Your post: <b>{POST_LABEL(mine)}</b>
          </div>
          {[...net.staffTurns.values()].map((t) => (
            <div key={t.conversationId} className="staff-turn">
              <div className="staff-turn-who">{t.customerName} chose:</div>
              <div className="staff-turn-pick">“{t.customerPicked}”</div>
              <div className="staff-turn-say">
                You would say: <i>{t.scripted}</i>
              </div>
              <div className="cust-actions">
                {t.actions.map((a) => (
                  <button key={a.id} type="button" onClick={() => net.staffRespond(t.conversationId, a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <ul className="cust-list">{net.customers.length === 0 ? <li className="cust empty">{inStore > 0 ? `No one is waiting for you. ${inStore} ${inStore === 1 ? "customer is" : "customers are"} browsing the store.` : "No customers in the store."}</li> : net.customers.map(row)}</ul>
        </>
      )}
    </aside>
  );
}
