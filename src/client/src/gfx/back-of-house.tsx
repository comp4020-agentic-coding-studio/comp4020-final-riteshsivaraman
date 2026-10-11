import { useLayoutEffect, useMemo, useRef } from "react";
import { DoubleSide, InstancedMesh, Object3D, RepeatWrapping } from "three";
import { CEILING } from "../../../shared/protocol.ts";
import { BACK_AREAS, BACK_DOORWAYS, BACK_ROOM_Z0, BACK_ROOM_Z1, BACK_SHELF_UNIT_X, BACK_WALLS, DOORWAY_W } from "../../../shared/world.ts";
import { HALF_W, Sign, canvasTexture } from "./common.tsx";

// What the staff see behind the shop. It is meant to read like a real stockroom
// and back office: polished concrete with painted safety lines, linear lights
// on a lower ceiling, scuff bands and skirting on the walls, glazed meeting
// rooms with aluminium frames, signs mounted flat over the doorways, and the
// small things that say people work here (a clock, an extinguisher, a
// whiteboard, a kettle). It draws what shared/world.ts places; it never moves
// anything (the blueprint drawings stay true).

const rz = (v: number): number => BACK_ROOM_Z0 + v;
const WALL = "#eceef0";
const DADO = "#8f979f";
const SKIRT = "#4b5158";
const ALU = "#aeb5bc";
const DOOR_TOP = 2.1; // the height of a doorway; a lintel closes it up to the ceiling

// ---- floor ----

// Painted on a canvas in plan coordinates: x across, z from the back room's
// first row to its far wall (85 pixels to the metre).
function floorTexture(w: number, d: number) {
  const ppm = 85;
  return canvasTexture(Math.round(w * ppm), Math.round(d * ppm), (g) => {
    const W = w * ppm;
    const H = d * ppm;
    g.fillStyle = "#9da2a8";
    g.fillRect(0, 0, W, H);
    // cloudy trowel marks and speckle, so it is concrete and not a grey card
    let seed = 987654;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "60,66,74"},${0.012 + rnd() * 0.02})`;
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 40 + rnd() * 140, 20 + rnd() * 60, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "50,56,64"},${0.04 + rnd() * 0.06})`;
      g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
    }
    // saw-cut control joints every 3 m
    g.strokeStyle = "rgba(60,64,70,0.55)";
    g.lineWidth = 2;
    for (let x = 0; x <= w + 0.01; x += 3) {
      g.beginPath();
      g.moveTo(x * ppm, 0);
      g.lineTo(x * ppm, H);
      g.stroke();
    }
    for (let z = 0; z <= d + 0.01; z += 3) {
      g.beginPath();
      g.moveTo(0, z * ppm);
      g.lineTo(W, z * ppm);
      g.stroke();
    }
    const X = (x: number): number => (x + w / 2) * ppm;
    const Z = (z: number): number => (z - BACK_ROOM_Z0) * ppm;
    // yellow edge lines along the gaps between shelf units: the aisles
    g.fillStyle = "#e3b82a";
    const gaps = [(BACK_SHELF_UNIT_X[0] + BACK_SHELF_UNIT_X[1]) / 2, (BACK_SHELF_UNIT_X[1] + BACK_SHELF_UNIT_X[2]) / 2];
    for (const gx of gaps) for (const s of [-1, 1]) g.fillRect(X(gx + s * 0.52) - 3, Z(rz(0.2)), 6, (rz(8.5) - rz(0.2)) * ppm);
    // the walkway from the shop door to the dock, in green, with a letter per aisle
    g.fillStyle = "rgba(48,150,92,0.55)";
    for (const gx of gaps) g.fillRect(X(gx) - 0.45 * ppm, Z(rz(0.2)), 0.9 * ppm, (rz(8.5) - rz(0.2)) * ppm);
    g.fillStyle = "#ffffff";
    g.font = `bold ${0.5 * ppm}px system-ui, sans-serif`;
    g.textAlign = "center";
    ["A", "B"].forEach((ch, i) => g.fillText(ch, X(gaps[i]), Z(rz(0.9)) + 0.18 * ppm));
    // the dock apron: a hazard-striped box round the roller door and pallets
    const x0 = X(-2.7);
    const x1 = X(2.7);
    const z0 = Z(rz(15.0));
    const z1 = Z(BACK_ROOM_Z1 - 0.15);
    g.save();
    g.beginPath();
    g.rect(x0, z0, x1 - x0, z1 - z0);
    g.rect(x0 + 0.14 * ppm, z0 + 0.14 * ppm, x1 - x0 - 0.28 * ppm, z1 - z0 - 0.28 * ppm);
    g.clip("evenodd");
    for (let k = -H; k < W + H; k += 0.3 * ppm) {
      g.fillStyle = "#e3b82a";
      g.beginPath();
      g.moveTo(k, z0);
      g.lineTo(k + 0.15 * ppm, z0);
      g.lineTo(k + 0.15 * ppm + (z1 - z0), z1);
      g.lineTo(k + (z1 - z0), z1);
      g.fill();
    }
    g.restore();
  });
}

function InstancedBoxes({ items, size, colour, emissive = 0, roughness = 0.6 }: { items: Array<[number, number, number]>; size: [number, number, number]; colour: string; emissive?: number; roughness?: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    items.forEach((p, i) => {
      o.position.set(p[0], p[1], p[2]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={colour} emissive={emissive > 0 ? "#ffffff" : "#000000"} emissiveIntensity={emissive} roughness={roughness} />
    </instancedMesh>
  );
}

export function BackFloor() {
  const w = HALF_W * 2;
  const d = BACK_ROOM_Z1 - BACK_ROOM_Z0;
  const map = useMemo(() => floorTexture(w, d), [w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

// ---- ceiling and lights ----

export function BackCeiling() {
  const w = HALF_W * 2;
  const d = BACK_ROOM_Z1 - BACK_ROOM_Z0;
  const lights = useMemo(() => {
    const out: Array<[number, number, number]> = [];
    for (const x of [-4.8, -1.8, 1.8, 4.8]) for (let k = 0; k < 6; k++) out.push([x, CEILING - 0.03, rz(1.5 + k * 3.1)]);
    return out;
  }, []);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#dfe2e5" emissive="#ffffff" emissiveIntensity={0.18} />
      </mesh>
      {/* linear LED fixtures: a diffuser strip in a white housing */}
      <InstancedBoxes items={lights} size={[0.16, 0.05, 2.0]} colour="#ffffff" emissive={1.15} />
      {/* cable trays and a duct along the storage hall */}
      <InstancedBoxes items={[[-3.0, CEILING - 0.16, rz(4.5)], [3.0, CEILING - 0.16, rz(4.5)]]} size={[0.3, 0.05, 9]} colour="#6f767d" roughness={0.5} />
      <InstancedBoxes items={[[0, CEILING - 0.22, rz(4.5)]]} size={[0.5, 0.3, 9]} colour="#c9ced3" roughness={0.7} />
    </group>
  );
}

// ---- walls ----

// The perimeter: a scuff band and skirting on the inside faces.
export function BackPerimeter() {
  const d = BACK_ROOM_Z1 - BACK_ROOM_Z0;
  const zc = (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (HALF_W - 0.012), 0.55, zc]}>
            <boxGeometry args={[0.024, 0.9, d]} />
            <meshStandardMaterial color={DADO} roughness={0.7} />
          </mesh>
          <mesh position={[s * (HALF_W - 0.03), 0.06, zc]}>
            <boxGeometry args={[0.06, 0.12, d]} />
            <meshStandardMaterial color={SKIRT} roughness={0.6} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.55, BACK_ROOM_Z1 - 0.012]}>
        <boxGeometry args={[HALF_W * 2, 0.9, 0.024]} />
        <meshStandardMaterial color={DADO} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.06, BACK_ROOM_Z1 - 0.03]}>
        <boxGeometry args={[HALF_W * 2, 0.12, 0.06]} />
        <meshStandardMaterial color={SKIRT} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Partition walls to the ceiling. The two long walls between the rooms are
// glazed above waist height so the rooms read as rooms.
export function BackPartitions() {
  return (
    <group>
      {BACK_WALLS.map((w, i) => {
        const long = w.d > w.w; // runs front to back: between the rooms
        if (!long) {
          return (
            <group key={i}>
              <mesh position={[w.x, CEILING / 2, w.z]}>
                <boxGeometry args={[w.w, CEILING, w.d]} />
                <meshStandardMaterial color={WALL} roughness={0.85} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[w.x, 0.06, w.z + s * (w.d / 2 + 0.015)]}>
                  <boxGeometry args={[w.w, 0.12, 0.03]} />
                  <meshStandardMaterial color={SKIRT} />
                </mesh>
              ))}
            </group>
          );
        }
        const panes = Math.max(1, Math.round(w.d / 1.35));
        const pw = w.d / panes;
        return (
          <group key={i}>
            <mesh position={[w.x, 0.5, w.z]}>
              <boxGeometry args={[w.w, 1.0, w.d]} />
              <meshStandardMaterial color={WALL} roughness={0.85} />
            </mesh>
            <mesh position={[w.x, (2.6 + CEILING) / 2, w.z]}>
              <boxGeometry args={[w.w, CEILING - 2.6, w.d]} />
              <meshStandardMaterial color={WALL} roughness={0.85} />
            </mesh>
            <mesh position={[w.x, 1.8, w.z]}>
              <boxGeometry args={[0.03, 1.6, w.d]} />
              <meshStandardMaterial color="#bcd9e6" transparent opacity={0.28} roughness={0.1} metalness={0.2} side={DoubleSide} depthWrite={false} />
            </mesh>
            {Array.from({ length: panes + 1 }, (_, k) => (
              <mesh key={k} position={[w.x, 1.8, w.z - w.d / 2 + k * pw]}>
                <boxGeometry args={[0.07, 1.64, 0.05]} />
                <meshStandardMaterial color={ALU} metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
            {[1.0, 2.6].map((y) => (
              <mesh key={y} position={[w.x, y, w.z]}>
                <boxGeometry args={[0.07, 0.04, w.d]} />
                <meshStandardMaterial color={ALU} metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
          </group>
        );
      })}
      {BACK_DOORWAYS.map((d, i) => {
        const name = ["REPAIR", "MANAGER'S OFFICE", "BREAK & TRAINING", "LOCKERS & DOCK"][i] ?? "";
        return (
          <group key={i}>
            {/* lintel to the ceiling, aluminium head and jambs, a plate sign on the shop side */}
            <mesh position={[d.x, (DOOR_TOP + CEILING) / 2, d.z]}>
              <boxGeometry args={[DOORWAY_W + 0.2, CEILING - DOOR_TOP, 0.12]} />
              <meshStandardMaterial color={WALL} roughness={0.85} />
            </mesh>
            <mesh position={[d.x, DOOR_TOP + 0.025, d.z]}>
              <boxGeometry args={[DOORWAY_W + 0.1, 0.05, 0.16]} />
              <meshStandardMaterial color={ALU} metalness={0.6} roughness={0.35} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[d.x + s * (DOORWAY_W / 2 + 0.025), DOOR_TOP / 2, d.z]}>
                <boxGeometry args={[0.05, DOOR_TOP, 0.16]} />
                <meshStandardMaterial color={ALU} metalness={0.6} roughness={0.35} />
              </mesh>
            ))}
            <Sign text={name} position={[d.x, 2.55, d.z - 0.075]} rotY={Math.PI} w={1.3} fg="#ffffff" bg="#2f3a4a" />
          </group>
        );
      })}
    </group>
  );
}

// ---- the small things ----

function Clock({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.03, 32]} />
        <meshStandardMaterial color="#2a2e33" />
      </mesh>
      <mesh position={[0, 0, 0.017]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.004, 32]} />
        <meshStandardMaterial color="#f7f7f5" />
      </mesh>
      <mesh position={[0, 0.06, 0.022]}>
        <boxGeometry args={[0.012, 0.13, 0.004]} />
        <meshStandardMaterial color="#1b1d20" />
      </mesh>
      <mesh position={[0.05, 0.02, 0.022]} rotation={[0, 0, -1.1]}>
        <boxGeometry args={[0.012, 0.1, 0.004]} />
        <meshStandardMaterial color="#1b1d20" />
      </mesh>
    </group>
  );
}

function Extinguisher({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.32, 0.4, 0.01]} />
        <meshStandardMaterial color="#c2272d" />
      </mesh>
      <mesh position={[0, 0.5, 0.06]}>
        <cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />
        <meshStandardMaterial color="#c2272d" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.74, 0.06]}>
        <cylinderGeometry args={[0.03, 0.04, 0.06, 12]} />
        <meshStandardMaterial color="#1b1d20" />
      </mesh>
    </group>
  );
}

function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.15, 0.4, 16]} />
        <meshStandardMaterial color="#dfe2e5" roughness={0.6} />
      </mesh>
      {[
        [0, 0.7, 0, 0.25],
        [0.12, 0.95, 0.05, 0.2],
        [-0.1, 1.05, -0.04, 0.18],
      ].map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color="#4d7f4a" roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function BackDetails() {
  const board = useMemo(
    () =>
      canvasTexture(256, 160, (g) => {
        g.fillStyle = "#f6f7f8";
        g.fillRect(0, 0, 256, 160);
        g.strokeStyle = "#2a5a9a";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(16, 40);
        g.lineTo(150, 40);
        g.moveTo(16, 70);
        g.lineTo(200, 70);
        g.moveTo(16, 100);
        g.lineTo(120, 100);
        g.stroke();
        g.strokeStyle = "#c2272d";
        g.beginPath();
        g.arc(200, 110, 22, 0, Math.PI * 2);
        g.stroke();
      }),
    [],
  );
  const rzEnd = BACK_ROOM_Z1;
  const eastX = HALF_W - 0.03;
  const office = BACK_AREAS.find((a) => a.id === "office")!;
  return (
    <group>
      <Clock position={[eastX, 2.3, rz(1.2)]} rotY={-Math.PI / 2} />
      <Extinguisher x={eastX} z={rz(7.6)} rotY={-Math.PI / 2} />
      <Extinguisher x={-eastX} z={rz(17.2)} rotY={Math.PI / 2} />
      {/* an exit sign and the dock door's sign, tidied: two plates, nothing floating */}
      <Sign text="EXIT" position={[-2.7, 2.35, rzEnd - 0.04]} rotY={Math.PI} w={0.8} fg="#ffffff" bg="#1f8a4c" />
      {/* the whiteboard in the training room, the kettle bench in the break room */}
      <mesh position={[eastX, 1.6, rz(10.3)]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.6, 1.0]} />
        <meshStandardMaterial map={board} roughness={0.4} />
      </mesh>
      <mesh position={[eastX + 0.005, 1.6, rz(10.3)]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.68, 1.08]} />
        <meshStandardMaterial color="#8f979f" />
      </mesh>
      <group position={[eastX - 0.3, 0, rz(9.5)]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.6, 0.9, 1.6]} />
          <meshStandardMaterial color="#e9ecee" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.92, 0]}>
          <boxGeometry args={[0.64, 0.04, 1.64]} />
          <meshStandardMaterial color="#3b4047" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.07, -0.35]}>
          <boxGeometry args={[0.26, 0.26, 0.22]} />
          <meshStandardMaterial color="#222529" />
        </mesh>
        <mesh position={[0, 1.55, -0.1]}>
          <boxGeometry args={[0.35, 0.7, 1.4]} />
          <meshStandardMaterial color="#e9ecee" roughness={0.6} />
        </mesh>
      </group>
      <Plant x={office.x1 - 0.4} z={office.z0 + 0.5} />
      <Plant x={office.x0 + 0.4} z={office.z1 - 0.5} />
      {/* a cage trolley near the dock */}
      <group position={[2.9, 0, rz(17.0)]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.7, 0.04, 1.0]} />
          <meshStandardMaterial color="#8f969d" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.85, 0.48]}>
          <boxGeometry args={[0.7, 1.3, 0.03]} />
          <meshStandardMaterial color="#8f969d" metalness={0.5} roughness={0.4} transparent opacity={0.7} />
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.3, 0.09, sz * 0.4]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 12]} />
            <meshStandardMaterial color="#1b1d20" />
          </mesh>
        )))}
      </group>
    </group>
  );
}

// the roller door's surround: hazard-striped bollards either side
export function DockSurround() {
  const stripes = useMemo(
    () =>
      canvasTexture(32, 64, (g) => {
        g.fillStyle = "#e3b82a";
        g.fillRect(0, 0, 32, 64);
        g.fillStyle = "#1b1d20";
        for (let y = -32; y < 64; y += 16) {
          g.beginPath();
          g.moveTo(0, y + 16);
          g.lineTo(32, y);
          g.lineTo(32, y + 8);
          g.lineTo(0, y + 24);
          g.fill();
        }
        return;
      }),
    [],
  );
  void RepeatWrapping;
  return (
    <group>
      {[-2.35, 2.35].map((x) => (
        <mesh key={x} position={[x, 0.55, BACK_ROOM_Z1 - 0.5]}>
          <cylinderGeometry args={[0.09, 0.09, 1.1, 14]} />
          <meshStandardMaterial map={stripes} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
