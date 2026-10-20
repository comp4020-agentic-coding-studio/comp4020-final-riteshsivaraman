import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Entry } from "./Entry.tsx";
import { SHOT, Store } from "./Store.tsx";
import { StaffPanel } from "./StaffPanel.tsx";
import { StaffTalk } from "./StaffTalk.tsx";
import { Talk } from "./Talk.tsx";
import { CharacterStage } from "./gfx/CharacterStage.tsx";
import { DeviceStage } from "./gfx/DeviceStage.tsx";
import { net, useNet } from "./net.ts";
import type { Profile } from "../../shared/profile.ts";
import "./styles.css";

const Q = new URLSearchParams(location.search);
const STAGE = Q.has("stage");
const DEVICE = Q.has("device");
const DEV = Q.has("dev");

const POST_LABEL: Record<string, string> = {
  greeter: "the greeter",
  "specialist:phones": "the phones team",
  "specialist:laptops": "the laptops team",
  "specialist:tablets": "the tablets team",
  "specialist:audio": "the audio team",
  genius: "the Genius Bar",
  stock: "stock",
  technician: "a technician",
};
const mmss = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function Hud() {
  const live = useNet();
  const [, tick] = useState(0);
  // a clock for "waiting 0:42" and for the notice to fade
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const here = live.remotes.size + (live.you ? 1 : 0);
  const waiting = live.state === "waiting_for_help" && live.needs;
  return (
    <div className="hud">
      <div className="hud-line">
        {live.status === "open" && live.you ? (
          <>
            You are <strong>{live.you.name}</strong>
            {live.isEmployee ? <> · {live.identity.kind === "specialist" ? `${live.identity.specialty} specialist` : live.identity.kind}</> : null} · {here} in the store
          </>
        ) : live.status === "replaced" ? (
          <>This store is open in another tab. Close that one, then reload.</>
        ) : (
          <>Connecting…</>
        )}
      </div>
      <div className="hud-hint">
        {live.myInspectSlot
          ? "Drag to turn the device in your hand · E, tap away, or Esc to put it down"
          : "Drag the view to look around · W A S D to walk · arrows turn · E to talk · V to see yourself"}
      </div>
      {waiting && (
        <div className="chip-status">
          Waiting for {POST_LABEL[live.needs!] ?? live.needs} · {mmss(Date.now() - live.stateSince)}
        </div>
      )}
      {live.state === "in_purchase" && <div className="chip-status">Your phone is set aside. Pay at the Genius Bar.</div>}
      {DEV && live.status === "open" && (
        <button className="hud-dev" onClick={() => net.setRole(live.role === "staff" ? "customer" : "staff")}>
          DEV: walking as {live.role === "staff" ? "staff" : "a customer"} (click to switch)
        </button>
      )}
      {live.waitingAt && !live.locked && (
        <div className="escort-banner">
          Wait near {live.waitingAt.label}. {live.waitingAt.who ? `${live.waitingAt.who} will come and find you.` : "Someone will come and get you as soon as they're free."}
        </div>
      )}
      {live.escort && (
        <div className="escort-banner">
          {live.escort.text}
          {live.myInspectSlot ? "" : " · Esc to stop following"}
        </div>
      )}
      {live.staffConv?.collect && (
        <div className="escort-banner">
          {live.stockNear
            ? <>Press <kbd>E</kbd> to take the {live.staffConv.collect.what} from {live.staffConv.collect.stockName}</>
            : <>{live.staffConv.collect.stockName} is bringing the {live.staffConv.collect.what}: go and meet them. {live.staffConv.customerName} will wait.</>}
        </div>
      )}
      {live.hint && !live.locked && <div className="hint">Press <kbd>E</kbd> to talk to {live.hint.name}</div>}
      {!live.hint && live.deviceHint && !live.locked && !live.myInspectSlot && <div className="hint">Press <kbd>E</kbd> to inspect {live.deviceHint.name}</div>}
      {live.notice && Date.now() - live.notice.at < 4000 && <div className="toast">{live.notice.text}</div>}
    </div>
  );
}

// Some browsers and machines have WebGL switched off. Say so, rather than
// leaving a blank grey page, and keep the connection (and the HUD) alive.
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Joins without the entry screen, for stills and checks: `?shot`, `?stage`,
// `?device` (no server needed at all), or
// `?enter=customer|greeter|specialist|genius|stock|technician`.
const AUTO: Profile | null = SHOT || STAGE || DEVICE ? { kind: "customer" } : Q.get("enter") ? ({ kind: Q.get("enter"), specialty: Q.get("lane") ?? undefined } as Profile) : null;

function App() {
  const [entered, setEntered] = useState(AUTO !== null);
  useEffect(() => {
    if (!AUTO || DEVICE) return;
    if (SHOT || STAGE) net.connect();
    else net.enter(AUTO);
  }, []);
  const canDraw = webglAvailable();
  if (!entered) {
    return (
      <Entry
        onEnter={(p) => {
          setEntered(true);
          net.enter(p);
        }}
      />
    );
  }
  return (
    <>
      {canDraw ? (
        DEVICE ? <DeviceStage /> : STAGE ? <CharacterStage /> : <Store />
      ) : (
        <p className="no-webgl">This browser can't draw the store (WebGL is turned off). You can still be counted as here.</p>
      )}
      {!SHOT && !STAGE && !DEVICE && (
        <>
          <Hud />
          <Talk />
          <StaffTalk />
          <StaffPanel />
        </>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
