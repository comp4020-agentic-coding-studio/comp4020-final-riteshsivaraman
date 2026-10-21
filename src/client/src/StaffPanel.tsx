import { useEffect, useState } from "react";
import { useNet } from "./net.ts";
import { designationOf } from "../../shared/profile.ts";

// For a specialist only. The corner is for tasks and updates and nothing else
// (Ritesh, 2026-10-20): who is waiting for your post, and what has just happened.
// You walk up to a waiting customer and press E.
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
  const post = designationOf({ kind: net.identity.kind, specialty: net.identity.specialty });
  const tasks = net.customers.filter((c) => c.state === "waiting_for_help" && c.needs === post && !c.withName);
  const orders = net.orders.filter((o) => o.specId === me && o.stage !== "paying");
  const recent = net.updates.filter((u) => Date.now() - u.at < 20000);
  if (tasks.length === 0 && orders.length === 0 && recent.length === 0) return <aside className="staff-corner idle">No customers are waiting for you.</aside>;
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
          <b>Waiting for you</b>
          {tasks.map((t, k) => (
            <div key={t.id} className="task">
              {k > 0 ? "Next: " : ""}
              {t.name}
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
