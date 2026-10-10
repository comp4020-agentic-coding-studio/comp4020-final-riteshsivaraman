import { PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { poseChanged } from "../../shared/pose.ts";
import { SPAWN, type Pose } from "../../shared/protocol.ts";
import { clampToWalkable, resolveCollisions } from "../../shared/world.ts";
import { Npcs } from "./Npcs.tsx";
import { Person, type PersonState } from "./Person.tsx";
import { Room } from "./Room.tsx";
import { net, useNet } from "./net.ts";

const EYE_HEIGHT = 1.6;
const WALK_SPEED = 3.2; // metres per second
const SEND_EVERY_MS = 100; // 10 position updates a second
const TURN_SPEED = 1.8; // radians per second when turning with the arrow keys

// Dev: `?shot=1` is for taking comparison screenshots. It leaves the view
// where `?at=` puts it (even outside the glass), hides the HUD and sends
// nothing, so it cannot affect anyone else. `?fov=` sets the field of view.
const PARAMS = new URLSearchParams(location.search);
export const SHOT = PARAMS.has("shot");
const FOV = Number(PARAMS.get("fov")) || 72;

const keys = new Set<string>();

// First person: the camera is the visitor's eyes. Keys move you relative to
// where you are looking, and collisions use the same boxes the scene draws.
function Player() {
  const { camera } = useThree();
  const lastSent = useRef(0);
  const sent = useRef<Pose | null>(null);
  const velocity = useRef({ x: 0, z: 0 });

  useEffect(() => {
    // `?at=x,z,yawDegrees` starts the camera elsewhere, for screenshots and
    // checks. It only moves your own view: the server still clamps and relays
    // whatever pose you then send.
    const at = new URLSearchParams(location.search).get("at")?.split(",").map(Number);
    const start = at && at.length === 3 && at.every(Number.isFinite) ? at : null;
    camera.position.set(start ? start[0] : SPAWN.x, EYE_HEIGHT, start ? start[1] : SPAWN.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(0, start ? (start[2] * Math.PI) / 180 : SPAWN.ry, 0);
    const down = (e: KeyboardEvent) => keys.add(e.code);
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);

    // Left and right arrows turn you on the spot (a left turn raises yaw).
    const turn = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    if (turn !== 0) camera.rotation.y += turn * TURN_SPEED * dt;

    // Heading from the camera: forward is where you look, flattened to the floor.
    const yaw = camera.rotation.y;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);

    let wx = fx * forward + rx * strafe;
    let wz = fz * forward + rz * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    // Ease towards the wanted speed so you accelerate and settle, not snap.
    const ease = 1 - Math.exp(-12 * dt);
    velocity.current.x += (wx * WALK_SPEED - velocity.current.x) * ease;
    velocity.current.z += (wz * WALK_SPEED - velocity.current.z) * ease;

    let x = camera.position.x + velocity.current.x * dt;
    let z = camera.position.z + velocity.current.z * dt;
    // where you may stand depends on your role (staff reach the back room)
    if (SHOT) return;
    ({ x, z } = clampToWalkable(net.role, x, z));
    ({ x, z } = resolveCollisions(x, z, net.role));
    camera.position.set(x, EYE_HEIGHT, z);
    net.me.x = x;
    net.me.z = z;

    // Heading as the server and other clients know it: 0 faces +z.
    const ry = Math.atan2(-fx, -fz);
    const now = performance.now();
    if (poseChanged(sent.current, { x, z, ry }) && now - lastSent.current >= SEND_EVERY_MS) {
      lastSent.current = now;
      sent.current = { x, z, ry };
      net.send({ type: "move", x, z, ry });
    }
  });

  return null;
}

// Other visitors, drawn as people, eased towards the last position the server
// reported so ten updates a second look continuous. Anyone acting as staff
// wears the cap and badge.
function Remotes() {
  const root = useRef<Group>(null);
  const live = useNet();
  const speeds = useRef(new Map<string, PersonState>());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-14 * dt);
    for (const r of net.remotes.values()) {
      const px = r.x;
      const pz = r.z;
      r.x += (r.tx - r.x) * ease;
      r.z += (r.tz - r.z) * ease;
      r.ry += (r.try - r.ry) * ease;
      const speed = dt > 0 ? Math.hypot(r.x - px, r.z - pz) / dt : 0;
      const prev = speeds.current.get(r.info.id);
      // smooth the estimate, otherwise the legs flicker on and off
      speeds.current.set(r.info.id, {
        speed: prev ? prev.speed + (speed - prev.speed) * 0.2 : speed,
        mode: "idle",
      });
    }
    root.current?.children.forEach((child) => {
      const r = net.remotes.get(child.name);
      if (r) {
        child.position.set(r.x, 0, r.z);
        child.rotation.y = r.ry;
      }
    });
  });

  return (
    <group ref={root}>
      {[...live.remotes.values()].map((r) => (
        <group key={r.info.id} name={r.info.id} position={[r.x, 0, r.z]}>
          <Person
            id={r.info.id}
            shirt={r.info.colour}
            cap={r.role === "staff" ? "#ffd23f" : undefined}
            getState={() => speeds.current.get(r.info.id) ?? { speed: 0, mode: "idle" }}
          />
        </group>
      ))}
    </group>
  );
}

export function Store() {
  return (
    <Canvas
      camera={{ fov: FOV, near: 0.1, far: 120 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      style={{ position: "fixed", inset: 0 }}
    >
      <color attach="background" args={["#dfe3e7"]} />
      <hemisphereLight args={["#ffffff", "#f1f3f5", 1.9]} />
      <directionalLight position={[4, 8, -3]} intensity={0.8} />
      {/* daylight through the glass front */}
      <directionalLight position={[0, 6, -14]} intensity={0.5} />
      <Room />
      <Remotes />
      <Npcs />
      <Player />
      <PointerLockControls />
    </Canvas>
  );
}
