import type { PointerEvent as ReactPointerEvent } from "react";
import { keys } from "./Store.tsx";
import { net, useNet } from "./net.ts";
import { touchUi } from "./touch.ts";

// On-screen controls for touch (see touch.ts): a D-pad whose four buttons hold the same keys W, A, S, D do, so walking
// is exactly the keyboard's; and one button for whatever E would do right now (talk to the person you are close to,
// look at the device in front of you, take the bag), or to put a device down. Not shown while you are in a
// conversation, which holds the view and has its own buttons.
function hold(code: string) {
  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    keys.delete(code);
    e.currentTarget.classList.remove("down");
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("down");
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
  if (!touchUi || live.status !== "open" || live.locked) return null;
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
