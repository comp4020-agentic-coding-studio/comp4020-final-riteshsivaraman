import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { buildHead } from "./head-geo.ts";

// Dev only (`?heads=1`): the same head cut two ways, side by side and large,
// for judging the look before building a body around it. `&yaw=30` turns them.
function Head({ x, detail, smooth, yaw }: { x: number; detail: number; smooth: boolean; yaw: number }) {
  const geo = useMemo(() => buildHead(detail, smooth), [detail, smooth]);
  const skin = "#d9a679";
  return (
    <group position={[x, 0, 0]} rotation={[0, yaw, 0]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={skin} roughness={0.7} flatShading={!smooth} />
      </mesh>
      {[-0.036, 0.036].map((ex) => (
        <group key={ex} position={[ex, 0.004, -0.084]}>
          <mesh>
            <sphereGeometry args={[0.0125, 12, 8]} />
            <meshStandardMaterial color="#f2f1ee" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.008]}>
            <sphereGeometry args={[0.0075, 10, 8]} />
            <meshStandardMaterial color="#3a2616" roughness={0.3} />
          </mesh>
        </group>
      ))}
      {[-0.036, 0.036].map((ex) => (
        <mesh key={ex} position={[ex, 0.027, -0.088]} rotation={[0, 0, ex < 0 ? 0.08 : -0.08]}>
          <boxGeometry args={[0.04, 0.007, 0.01]} />
          <meshStandardMaterial color="#3a2a1f" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, -0.071, -0.083]}>
        <boxGeometry args={[0.042, 0.004, 0.006]} />
        <meshStandardMaterial color="#8a4a4a" roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.079, -0.004, 0.006]} scale={[0.35, 1, 0.7]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

export function HeadLab() {
  const yaw = (Number(new URLSearchParams(location.search).get("yaw") ?? 0) * Math.PI) / 180;
  return (
    <Canvas
      camera={{ fov: 30, near: 0.05, far: 20 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      style={{ position: "fixed", inset: 0 }}
      onCreated={({ camera }) => {
        camera.position.set(0, 0, -0.7);
        camera.lookAt(0, 0, 0);
      }}
    >
      <color attach="background" args={["#c9ccd0"]} />
      <hemisphereLight args={["#ffffff", "#8a8f95", 1.1]} />
      <directionalLight position={[-1.5, 1.5, -2]} intensity={1.6} />
      <Head x={0.1} detail={4} smooth={false} yaw={yaw} />
      <Head x={-0.1} detail={14} smooth yaw={yaw} />
    </Canvas>
  );
}
