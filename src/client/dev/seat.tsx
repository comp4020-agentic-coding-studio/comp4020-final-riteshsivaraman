import { Canvas, useThree } from "@react-three/fiber";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Reflections } from "../src/Store.tsx";
import { Room } from "../src/Room.tsx";
import { Actor } from "../src/gfx/Actor.tsx";
import { TABLE_SEATS } from "../../shared/storeday.ts";
import { STORE_Y } from "../../shared/protocol.ts";

// Dev only: two people seated on the same side of a service table, seen from
// the side or from one seat (`/dev/seat.html?view=side|guest|host&n=0`). Not part of the built app.
const Q = new URLSearchParams(location.search);
const t = TABLE_SEATS[Number(Q.get("n") ?? 0)]!;
const view = Q.get("view") ?? "side";
const yawTo = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.atan2(-(b.x - a.x), -(b.z - a.z));

function Cam() {
  const { camera } = useThree();
  useEffect(() => {
    camera.rotation.order = "YXZ";
    if (view === "side") {
      // from across the table, looking at both
      // from just in front of them (the table side), a little above
      const mid = { x: t.guest.at.x, z: (t.guest.at.z + t.host.at.z) / 2 };
      const toward = Math.sign(t.guest.face.x - t.guest.at.x);
      camera.position.set(mid.x + toward * 2.0, STORE_Y + 1.6, mid.z);
      camera.lookAt(mid.x, STORE_Y + 0.9, mid.z);
    } else {
      const me = view === "guest" ? t.guest : t.host;
      const other = view === "guest" ? t.host : t.guest;
      camera.position.set(me.at.x + (other.at.x - me.at.x) * 0.1, STORE_Y + 1.18, me.at.z + (other.at.z - me.at.z) * 0.1);
      camera.lookAt(other.at.x, STORE_Y + 1.2, other.at.z);
    }
  }, [camera]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas camera={{ fov: 72, near: 0.1, far: 120 }}>
      <color attach="background" args={["#dfe3e7"]} />
      <Reflections />
      <hemisphereLight args={["#ffffff", "#d3d6da", 1.25]} />
      <directionalLight position={[4, 8, -3]} intensity={0.6} />
      <group position={[0, STORE_Y, 0]}>
        <Room />
      </group>
      {[t.guest, t.host].map((s, i) => (
        <group key={i} position={[s.at.x, STORE_Y, s.at.z]} rotation={[0, Math.atan2(-(s.face.x - s.at.x), -(s.face.z - s.at.z)), 0]}>
          <Actor id={i ? "host-x" : "guest-x"} getState={() => ({ walking: false, mode: "idle", mood: "neutral", seated: true })} />
        </group>
      ))}
      <Cam />
    </Canvas>
  </StrictMode>,
);
