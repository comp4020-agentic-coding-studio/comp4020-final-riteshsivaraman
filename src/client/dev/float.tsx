import { Canvas } from "@react-three/fiber";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Reflections } from "../src/Store.tsx";
import { Device } from "../src/gfx/Device.tsx";
import type { Kind } from "../src/gfx/common.tsx";

// Dev only: a device held up in front of the camera, as when inspecting one
// (`/dev/float.html?kind=phone&model=iphone-18-pro&yaw=0.6&pitch=0.3`). Not part of the built app.
const Q = new URLSearchParams(location.search);
const kind = (Q.get("kind") ?? "phone") as Kind;
const reach = kind === "laptop" ? 0.6 : kind === "tabletKb" ? 0.52 : kind === "tablet" ? 0.42 : 0.3;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas camera={{ fov: 72, near: 0.05, far: 50, position: [0, 1.6, 0], rotation: [Math.atan2(-0.12, reach), 0, 0] }}>
      <color attach="background" args={["#dfe3e7"]} />
      <Reflections />
      <hemisphereLight args={["#ffffff", "#d3d6da", 1.25]} />
      <directionalLight position={[2, 4, 3]} intensity={0.6} />
      {/* the same nesting as the live one: it faces the viewer, then the drag turns it */}
      <group position={[0, 1.48, -reach]} rotation={[0, 0, 0]}>
        <group rotation={[0, Number(Q.get("yaw") ?? 0), 0]}>
          <group rotation={[Number(Q.get("pitch") ?? 0), 0, 0]}>
            <Device kind={kind} model={Q.get("model") ?? undefined} colour={Q.get("colour") ?? "#d8d7d2"} x={0} y={0} z={0} rotY={0} held />
          </group>
        </group>
      </group>
    </Canvas>
  </StrictMode>,
);
