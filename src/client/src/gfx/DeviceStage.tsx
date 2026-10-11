import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Device } from "./Device.tsx";
import { DEVICE_COLOURS, WOOD, type Kind } from "./common.tsx";

// Dev only (`?device=1`): one product alone on a plinth, for the per-model
// look check (graphics-brief "check your work" step 3). Not the in-store
// pose — the camera starts behind the device so a camera plateau or back
// design reads clearly; drag to orbit. Query params: `kind` (default phone),
// `model` (a PHONE_MODELS id), `colour` (hex), `yaw`/`pitch` (degrees) and
// `dist`/`h` (m) place a fixed camera for a headless screenshot.

const Q = new URLSearchParams(location.search);

export function DeviceStage() {
  const kind = (Q.get("kind") ?? "phone") as Kind;
  const model = Q.get("model") ?? undefined;
  const colour = Q.get("colour") ?? DEVICE_COLOURS[0];
  const yaw = ((Number(Q.get("yaw") ?? "200")) * Math.PI) / 180;
  const pitch = ((Number(Q.get("pitch") ?? "-14")) * Math.PI) / 180;
  const dist = Number(Q.get("dist") ?? "0.4");
  const h = Number(Q.get("h") ?? "0.2");
  const target: [number, number, number] = [0, 0.12, 0];
  const camPos: [number, number, number] = [Math.sin(yaw) * dist * Math.cos(pitch), h - Math.sin(pitch) * dist, Math.cos(yaw) * dist * Math.cos(pitch)];
  return (
    <>
      <Canvas camera={{ fov: 32, near: 0.01, far: 10, position: camPos }} dpr={[1, 1.5]} gl={{ antialias: true }} style={{ position: "fixed", inset: 0 }}>
        <color attach="background" args={["#e8e9eb"]} />
        <hemisphereLight args={["#ffffff", "#9aa0a6", 1.1]} />
        <directionalLight position={[-0.6, 1.2, -0.8]} intensity={1.4} />
        <directionalLight position={[0.8, 0.5, 0.6]} intensity={0.5} />
        {/* a scrap of the real product table top (1.2 x 2.0 m, graphics-brief), not the floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
          <planeGeometry args={[1.2, 1.2]} />
          <meshStandardMaterial color={WOOD} roughness={0.55} />
        </mesh>
        <Device kind={kind} model={model} x={0} y={0} z={0} rotY={0} colour={colour} />
        <OrbitControls target={target} />
      </Canvas>
      {Q.get("ui") !== "0" && (
        <div style={{ position: "fixed", left: 16, top: 16, font: "13px system-ui", color: "#111", background: "#fffc", padding: "6px 10px", borderRadius: 8 }}>
          {model ?? `${kind} (no model)`} · {colour}
        </div>
      )}
    </>
  );
}
