import { useEffect, useState } from "react";
import { NPCS } from "../../shared/npcs.ts";
import { payPose, type HandheldScreen } from "./gfx/pay-choreo.ts";
import { net, useNet } from "./net.ts";
import { payState } from "./payBeats.ts";

// The handheld's screen, mirrored flat for the two people in the payment
// (issue #42): the customer's HUD matching the handheld, and big enough to
// read on a phone where the 3D screen is a few pixels tall. It shows exactly
// what the handheld shows, from the same pure function of the server's beat,
// beat time and stored price (pay-choreo.ts), so the two can never disagree.
// React state changes only when the screen's content does, a few times a
// payment, never per frame.

const NPC_IDS = new Set(NPCS.map((n) => n.id));
const STEPS = ["Scan", "Total", "Tap", "Paid"] as const;

function stepOf(s: HandheldScreen): number {
  if (s.kind === "scan" || s.kind === "scanned") return 0;
  if (s.kind === "total") return 1;
  if (s.kind === "paid") return 3;
  return -1;
}

function currentScreen(): { screen: HandheldScreen; ripple: boolean } | null {
  const o = net.myPayingOrder;
  const p = o && payState(o);
  if (!o || !p) return null;
  const pose = payPose(p, net.serverNow(), NPC_IDS.has(o.specId));
  return { screen: pose.screen, ripple: pose.ripple >= 0 };
}

export function PayCard() {
  const live = useNet();
  const [shown, setShown] = useState(currentScreen);
  const order = live.myPayingOrder;
  useEffect(() => {
    if (!order) {
      setShown(null);
      return;
    }
    let id = 0;
    let key = "";
    const tick = () => {
      const next = currentScreen();
      const k = JSON.stringify(next);
      if (k !== key) {
        key = k;
        setShown(next);
      }
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [order?.id, order?.stage, order?.pay?.beat, order?.pay?.beatAt]);
  if (!order || !shown || shown.screen.kind === "idle") return null;
  const s = shown.screen;
  const step = stepOf(s);
  const iAmStaff = order.specId === live.you?.id;
  return (
    <aside className={`pay-card pay-${s.kind}`} aria-live="polite" aria-label="Payment">
      <ol className="pay-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "done" : i === step ? "on" : ""}>
            {label}
          </li>
        ))}
      </ol>
      {(s.kind === "scan" || s.kind === "scanned") && (
        <>
          <div className="pay-item">{s.item}</div>
          <div className="pay-note">{s.kind === "scan" ? "Scanning…" : "Scanned ✓"}</div>
        </>
      )}
      {s.kind === "total" && (
        <>
          <div className="pay-item">{s.item}</div>
          <div className="pay-detail">{s.detail}</div>
          <div className="pay-price">{s.price}</div>
          <div className={`pay-tap${shown.ripple ? " rippling" : ""}`}>{iAmStaff ? `${order.customerName} taps to pay` : "Tap to pay"}</div>
        </>
      )}
      {s.kind === "paid" && (
        <>
          <div className="pay-tick" aria-hidden="true">✓</div>
          <div className="pay-price">{s.price}</div>
          <div className="pay-note">Paid</div>
        </>
      )}
    </aside>
  );
}
