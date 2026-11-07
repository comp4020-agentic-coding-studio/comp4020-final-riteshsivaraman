import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Group } from "three";
import { net } from "./net.ts";

// Issue #1, criterion 1: the staff user offered a customer sees a marker over
// them and a HUD ping. This is the marker half, following NameFloat's pattern
// (a billboarded Html label over the head). Shown only to the employee this
// customer is currently offered to (CustomerView.offeredTo/offerUntil,
// service.ts's offerView, D48), only while the offer is live. A countdown
// reads from the server's offerUntil, never a client-side timer.
export function OfferMarker({ id, y }: { id: string; y: number }) {
  const g = useRef<Group>(null);
  const [visible, setVisible] = useState(false);
  const [secsLeft, setSecsLeft] = useState(0);
  const lastShown = useMemo(() => ({ v: false }), []);

  useFrame(() => {
    const me = net.you?.id;
    const c = net.customers.find((x) => x.id === id);
    const now = net.serverNow();
    const live = !!me && !!c?.offeredTo && c.offeredTo === me && !!c.offerUntil && c.offerUntil > now;
    if (live !== lastShown.v) {
      lastShown.v = live;
      setVisible(live);
    }
    if (live && c?.offerUntil) {
      const left = Math.max(0, Math.ceil((c.offerUntil - now) / 1000));
      setSecsLeft((prev) => (prev === left ? prev : left));
    }
  });

  if (!visible) return null;
  return (
    <group ref={g} position={[0, y, 0]}>
      <Html center distanceFactor={7} style={{ pointerEvents: "none" }}>
        <div className="offer-marker">
          <div className="offer-marker-arrow">▼</div>
          <div className="offer-marker-label">
            Waiting for you — {secsLeft}s
          </div>
        </div>
      </Html>
    </group>
  );
}
