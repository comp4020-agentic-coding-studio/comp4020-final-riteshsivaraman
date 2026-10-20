import { useEffect, useState } from "react";
import { useNet } from "./net.ts";

// For a specialist only. The corner is for tasks and updates and nothing else
// (Ritesh, 2026-10-20): who you have been sent for, and what has just happened.
// You do not pick customers; they are assigned to you, and you speak to them.
export function StaffPanel() {
  const net = useNet();
  const [, tick] = useState(0);
  // updates fade after a while, without anything having to change
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);
  if (!net.isEmployee || net.status !== "open" || !net.you) return null;
  const me = net.you.id;
  const tasks = [...net.intents.values()].filter((i) => i.fromId === me);
  const orders = net.orders.filter((o) => o.specId === me && o.stage !== "paying");
  const recent = net.updates.filter((u) => Date.now() - u.at < 20000);
  if (tasks.length === 0 && orders.length === 0 && recent.length === 0) return <aside className="staff-corner idle">Nothing assigned. Customers are sent to you.</aside>;
  return (
    <aside className="staff-corner" aria-live="polite">
      {orders.length > 0 && (
        <div>
          <b>Orders</b>
          {orders.map((o) => (
            <div key={o.id} className="task">
              {o.stage === "fetching" ? `Take ${o.customerName}'s ${o.what} from ${o.stockName}` : `Take payment from ${o.customerName}: you have the bag`}
            </div>
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <b>Your customers</b>
          {tasks.map((t, k) => (
            <div key={t.id} className="task">
              {k > 0 ? "Next: " : ""}
              Meet {t.toName}
              {t.wait ? ` near ${t.wait.label}` : ""}
              {t.ready ? " · waiting for them to accept" : ""}
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="updates">
          <b>Updates</b>
          {recent.map((u, k) => (
            <div key={`${u.at}:${k}`}>{u.text}</div>
          ))}
        </div>
      )}
    </aside>
  );
}
