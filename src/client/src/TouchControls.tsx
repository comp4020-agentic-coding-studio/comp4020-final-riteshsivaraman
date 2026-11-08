import { useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { keys } from "./Store.tsx";
import { net, useNet } from "./net.ts";
import { touchUi } from "./touch.ts";

// On-screen controls for touch (see touch.ts): a D-pad whose four buttons hold the same keys W, A, S, D do, so walking
// is exactly the keyboard's; and one button for whatever E would do right now (talk to the person you are close to,
// look at the device in front of you, take the bag), or to put a device down. Not shown while you are in a
// conversation, which holds the view and has its own buttons.
// the keys the fingers on the D-pad are holding, by finger: a key is let go when ITS finger lifts, wherever that happens
const fingers = new Map<number, string>();
function lift(pointerId: number): void {
  const code = fingers.get(pointerId);
  if (code === undefined) return;
  fingers.delete(pointerId);
  if (![...fingers.values()].includes(code)) keys.delete(code);
}
function liftAll(): void {
  for (const code of fingers.values()) keys.delete(code);
  fingers.clear();
}

function hold(code: string) {
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    lift(e.pointerId);
    e.currentTarget.classList.remove("down");
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("down");
      fingers.set(e.pointerId, code);
      keys.add(code);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onContextMenu: (e: ReactPointerEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}

export function TouchControls() {
  const live = useNet();
  const shown = touchUi && live.status === "open" && !live.locked;
  // The pad vanishes when a chat opens (the greeter stops you as you walk in) or the connection drops. A finger held on it then
  // never gets to "lift" on a button that is gone, which used to leave the walk key held for good: the character then walked
  // forward the moment the chat ended. So: whenever the pad is hidden or unmounted, everything it held is let go, and a finger
  // lifting anywhere (or the page losing focus) lets go of its own key.
  useEffect(() => {
    if (!shown) liftAll();
  }, [shown]);
  useEffect(() => {
    const up = (e: PointerEvent) => lift(e.pointerId);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", liftAll);
    document.addEventListener("visibilitychange", liftAll);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", liftAll);
      document.removeEventListener("visibilitychange", liftAll);
      liftAll();
    };
  }, []);
  if (!shown) return null;
  // what the action button does: the same choices E makes, in the same order
  let action: { label: string; run: () => void } | null = null;
  if (live.myInspectSlot) action = { label: "Put it down", run: () => net.inspectEnd() };
  else if (live.runnerNear && live.myOrderAsSpecialist) action = { label: `Take the bag from ${live.myOrderAsSpecialist.stockName}`, run: () => net.takeOrder() };
  else if (live.hint) action = { label: `Talk to ${live.hint.name}`, run: () => net.talkStart(live.hint!.id) };
  else if (live.deviceHint) action = { label: `Look at ${live.deviceHint.name}`, run: () => net.inspectStart(live.deviceHint!.slotId) };
  return (
    <>
      <div className="dpad" role="group" aria-label="Walk">
        <button type="button" className="dpad-up" aria-label="Walk forward" {...hold("KeyW")}>▲</button>
        <button type="button" className="dpad-left" aria-label="Step left" {...hold("KeyA")}>◀</button>
        <button type="button" className="dpad-right" aria-label="Step right" {...hold("KeyD")}>▶</button>
        <button type="button" className="dpad-down" aria-label="Walk back" {...hold("KeyS")}>▼</button>
      </div>
      {action && (
        <button type="button" className="touch-action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </>
  );
}
