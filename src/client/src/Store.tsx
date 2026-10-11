import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Group } from "three";
import { NPC_DESIGNATION, NPC_LABEL, scriptFor } from "../../shared/duty.ts";
import { NPCS, npcPose } from "../../shared/npcs.ts";
import { poseChanged } from "../../shared/pose.ts";
import { designationOf, EMPLOYEE_COLOUR, STAFF_SHIRT } from "../../shared/profile.ts";
import { avoidPeople } from "../../shared/people.ts";
import { SPAWN, STORE_Y, type Pose } from "../../shared/protocol.ts";
import { clampToWalkable, resolveCollisions } from "../../shared/world.ts";
import { Mall, MallPeople } from "./Mall.tsx";
import { Npcs } from "./Npcs.tsx";
import { Actor, type ActorState } from "./gfx/Actor.tsx";
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
  const { camera, gl } = useThree();
  const lastSent = useRef(0);
  const sent = useRef<Pose | null>(null);
  const velocity = useRef({ x: 0, z: 0 });

  useEffect(() => {
    // `?at=x,z,yawDegrees` starts the camera elsewhere, for screenshots and
    // checks. It only moves your own view: the server still clamps and relays
    // whatever pose you then send.
    const at = new URLSearchParams(location.search).get("at")?.split(",").map(Number);
    // a fourth number is the pitch in degrees (negative looks down)
    const start = at && (at.length === 3 || at.length === 4) && at.every(Number.isFinite) ? at : null;
    camera.position.set(start ? start[0] : SPAWN.x, STORE_Y + EYE_HEIGHT, start ? start[1] : SPAWN.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(start && start.length === 4 ? (start[3] * Math.PI) / 180 : 0, start ? (start[2] * Math.PI) / 180 : SPAWN.ry, 0);
    const down = (e: KeyboardEvent) => keys.add(e.code);
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    // Look by dragging with the mouse held down. The pointer is never captured
    // by the browser, so the cursor stays on screen all the time.
    const canvas = gl.domElement;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    let dragging = false;
    const press = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const drag = (e: PointerEvent) => {
      if (!dragging) return;
      camera.rotation.y -= e.movementX * 0.003;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - e.movementY * 0.003));
    };
    const release = (e: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", press);
    canvas.addEventListener("pointermove", drag);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    return () => {
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointermove", drag);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    // in a conversation you stand and read; the keys pick from the menu
    const talking = net.turn !== null;
    const forward = talking ? 0 : (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const strafe = talking ? 0 : (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);

    // Left and right arrows turn you on the spot (a left turn raises yaw).
    const turn = talking ? 0 : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
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
    // people are solid too: other visitors, staff, customers, walkers
    ({ x, z } = avoidPeople(x, z, [...net.remotes.values()], net.serverNow()));
    ({ x, z } = clampToWalkable(net.role, x, z));
    camera.position.set(x, STORE_Y + EYE_HEIGHT, z);
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
  const speeds = useRef(new Map<string, ActorState>());

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
      const smooth = prev ? (prev.speed ?? 0) + (speed - (prev.speed ?? 0)) * 0.2 : speed;
      speeds.current.set(r.info.id, { walking: smooth > 0.25, mode: "idle", mood: "neutral", speed: smooth });
    }
    root.current?.children.forEach((child) => {
      const r = net.remotes.get(child.name);
      if (r) {
        child.position.set(r.x, STORE_Y, r.z);
        child.rotation.y = r.ry;
      }
    });
  });

  return (
    <group ref={root}>
      {[...live.remotes.values()].map((r) => (
        <group key={r.info.id} name={r.info.id} position={[r.x, STORE_Y, r.z]}>
          <Actor
            id={r.info.id}
            shirt={r.identity.kind === "customer" ? r.info.colour : STAFF_SHIRT}
            look={r.identity.look}
            uniform={
              r.identity.kind !== "customer"
                ? { cap: EMPLOYEE_COLOUR[r.identity.kind], badge: EMPLOYEE_COLOUR[r.identity.kind] }
                : r.role === "staff"
                  ? { cap: "#ffd23f", badge: "#ffd23f" } // the dev switch
                  : undefined
            }
            getState={() => speeds.current.get(r.info.id) ?? { walking: false, mode: "idle", mood: "neutral" }}
          />
          {r.identity.kind !== "customer" && (
            <Html position={[0, 2.0, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
              <div className="name-tag" style={{ borderColor: EMPLOYEE_COLOUR[r.identity.kind] }}>
                <b>{r.info.name}</b>
                <span>{r.identity.kind === "specialist" ? `${r.identity.specialty} specialist` : r.identity.kind}</span>
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

// "Press E to talk": the nearest person in front of you who has something to
// say, within a couple of metres. Only for customers who are free to talk.
const TALK_HINT_RANGE = 2.6;
function Interact() {
  const { camera } = useThree();
  useEffect(() => {
    const press = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && net.hint && !net.turn && !e.repeat) net.talkStart(net.hint.id);
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, []);

  useFrame(() => {
    let best: { id: string; name: string; d: number } | null = null;
    const free = net.state === "arriving" || net.state === "browsing" || net.state === "waiting_for_help";
    if (net.identity.kind === "customer" && free && !net.turn && net.status === "open") {
      const yaw = camera.rotation.y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const consider = (id: string, name: string, x: number, z: number) => {
        const dx = x - net.me.x;
        const dz = z - net.me.z;
        const d = Math.hypot(dx, dz);
        if (d > TALK_HINT_RANGE) return;
        // roughly in front of you, not behind
        if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) return;
        if (!best || d < best.d) best = { id, name, d };
      };
      const now = net.serverNow();
      for (const n of NPCS) {
        const post = NPC_DESIGNATION[n.id];
        if (!post || !scriptFor(post) || net.offDuty.has(n.id) || net.engaged.has(n.id) || net.released.has(n.id)) continue;
        const p = npcPose(n, now);
        if (p.present) consider(n.id, NPC_LABEL[n.id] ?? n.id, p.x, p.z);
      }
      for (const r of net.remotes.values()) {
        if (r.identity.kind === "customer") continue;
        const post = designationOf({ kind: r.identity.kind, specialty: r.identity.specialty });
        if (post && scriptFor(post)) consider(r.info.id, r.info.name, r.x, r.z);
      }
    }
    const next = best ? { id: (best as { id: string }).id, name: (best as { name: string }).name } : null;
    if (next?.id !== net.hint?.id) {
      net.hint = next;
      net.changed();
    }
  });
  return null;
}

// Soft reflections on glass, metal and the polished floor, from a small
// procedural room (no image download, so it costs nothing to load).
function Reflections() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
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
      <Reflections />
      <hemisphereLight args={["#ffffff", "#d3d6da", 1.25]} />
      <directionalLight position={[4, 8, -3]} intensity={0.6} />
      {/* daylight through the glass front */}
      <directionalLight position={[0, 6, -14]} intensity={0.5} />
      <group position={[0, STORE_Y, 0]}>
        <Room />
      </group>
      <Mall />
      <MallPeople />
      <fog attach="fog" args={["#dfe3e7", 28, 85]} />
      <Remotes />
      <Npcs />
      <Interact />
      <Player />
    </Canvas>
  );
}
