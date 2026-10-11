import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SHOT, Store } from "./Store.tsx";
import { HeadLab } from "./gfx/HeadLab.tsx";
import { net, useNet } from "./net.ts";
import "./styles.css";

function Hud() {
  const live = useNet();
  const here = live.remotes.size + (live.you ? 1 : 0);
  return (
    <div className="hud">
      <div className="hud-line">
        {live.status === "open" && live.you ? (
          <>
            You are <strong>{live.you.name}</strong> · {here} in the store
          </>
        ) : live.status === "replaced" ? (
          <>This store is open in another tab. Close that one, then reload.</>
        ) : (
          <>Connecting…</>
        )}
      </div>
      <div className="hud-hint">Click the view to look around · W A S D to walk · arrows turn</div>
      {live.status === "open" && (
        <button
          className="hud-dev"
          onClick={() => net.setRole(live.role === "staff" ? "customer" : "staff")}
        >
          DEV: you are {live.role === "staff" ? "staff" : "a customer"} (click to switch)
        </button>
      )}
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

function App() {
  useEffect(() => {
    net.connect();
  }, []);
  const canDraw = webglAvailable();
  return (
    <>
      {canDraw ? (
        new URLSearchParams(location.search).has("heads") ? <HeadLab /> : <Store />
      ) : (
        <p className="no-webgl">
          This browser can't draw the store (WebGL is turned off). You can still be counted as here.
        </p>
      )}
      {!SHOT && <Hud />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
