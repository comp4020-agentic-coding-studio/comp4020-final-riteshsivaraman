import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  type Group,
  InstancedMesh,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { NPCS, isStaff, npcPose } from "../../../shared/npcs.ts";
import { CEILING, FLOOR } from "../../../shared/protocol.ts";
import {
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BACK_AREAS,
  BACK_DOOR,
  BACK_FURNITURE,
  BACK_SHELVES,
  BACK_WALLS,
  BACK_SHELF_ROW_Z,
  BACK_SHELF_UNIT_X,
  BAY_COUNT,
  BAY_W,
  BENCHES,
  COLUMN_X,
  COUNTER,
  DOOR,
  PARTITIONS,
  PIER_W,
  SERVICE_DESKS,
  TABLES,
  BAR_STOOLS,
  TABLE_STOOLS,
  WALL_FACE_Z,
  bayCentre,
  type Box,
  type Table as TableSpec,
} from "../../../shared/world.ts";
import {
  BACK_WALL,
  BAY_LEDGES,
  BAY_SHELVES,
  LEDGE_DEPTH,
  BAY_SIGN_Y,
  CEILING_SPEC,
  DOOR_H as PLAN_DOOR_H,
  GLASS,
  LIGHTBOX_BOTTOM,
  LIGHTBOX_H,
  SIDE_WALL,
  STOOL_SEAT_H,
  WALL_BANDS,
  WALL_TONES,
} from "../../../shared/plan.ts";
import { net } from "../net.ts";
import { WOOD, WALL, SILVER, STAND, DEVICE_COLOURS, BOX_COLOURS, HALF_W, DOOR_W, DOOR_X, DOOR_H, BENCH_X, BENCH_HALF, FACE_X, canvasTexture, labelTexture, BoxField, Sign, std, BlobShadow, type Cuboid, type Kind } from "./common.tsx";
import { Device } from "./Device.tsx";
import { Desktop, Monitor } from "./computers.tsx";
import { BackFurniture, RepairBenches, StorageRacks, Stools, bayFrames } from "./furniture.tsx";
import { bayStock } from "./phones.tsx";
import { BackCeiling, BackDetails, BackFloor, BackPartitions, BackPerimeter, DockSurround } from "./back-of-house.tsx";


// Invented abstract poster art. "light" is a soft two-colour gradient; "dark"
// is a black panel with bright rounded shapes, like the ones in the reference.
export const POSTER_PAIRS: Array<[string, string]> = [
  ["#ff7a59", "#7a5cff"],
  ["#2dd4bf", "#3b82f6"],
  ["#f6d365", "#fda085"],
  ["#a18cd1", "#fbc2eb"],
];


export function posterTexture(a: string, b: string, dark: boolean): CanvasTexture {
  return canvasTexture(256, dark ? 128 : 256, (g) => {
    const h = dark ? 128 : 256;
    if (dark) {
      g.fillStyle = "#101216";
      g.fillRect(0, 0, 256, h);
      const shapes: Array<[number, number, number, number, number, string]> = [
        [30, 80, 90, 22, -0.5, "#f5b700"],
        [110, 60, 70, 14, -0.7, "#00bbf9"],
        [140, 95, 80, 26, 0.2, "#9b5de5"],
        [190, 50, 40, 16, 0.6, "#f15bb5"],
        [215, 100, 26, 26, 0, "#ee6c4d"],
      ];
      for (const [x, y, w, hh, rot, c] of shapes) {
        g.save();
        g.translate(x + w / 2, y);
        g.rotate(rot);
        g.fillStyle = c;
        g.beginPath();
        g.roundRect(-w / 2, -hh / 2, w, hh, hh / 2);
        g.fill();
        g.restore();
      }
    } else {
      const grad = g.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.25;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(80, 90, 60, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(170, 180, 80, 0, Math.PI * 2);
      g.fill();
    }
  });
}


export function floorTexture(w: number, d: number, base: string, joint: string): CanvasTexture {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // polished stone: a soft cloudy variation and fine speckle, so the floor
    // is not one flat grey
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 38; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "70,76,84"},${0.01 + rnd() * 0.016})`;
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "60,66,74"},${0.03 + rnd() * 0.05})`;
      g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5);
    }
    g.strokeStyle = joint;
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(w / 2, d / 2);
  return tex;
}


// Brushed grey wall panels with fine vertical seams every metre.
export function wallTexture(lengthM: number): CanvasTexture {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = WALL;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#c9ccd0";
    g.fillRect(0, 0, 1, 128);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(lengthM / 1.5, 1); // joints every 1.5 m, faint
  return tex;
}


// Grey ceiling slats running across the room, like the reference: a mid-grey
// face, a dark shadow gap between slats and a thin lit lip, so the ceiling has
// depth and the light panels in it stand out.
export function ceilingTexture(w: number, d: number): CanvasTexture {
  const tex = canvasTexture(64, 64, (g) => {
    const face = g.createLinearGradient(0, 5, 0, 62);
    face.addColorStop(0, "#bcc0c6");
    face.addColorStop(1, "#cbcfd4");
    g.fillStyle = face;
    g.fillRect(0, 0, 64, 64);
    const gap = g.createLinearGradient(0, 0, 0, 5);
    gap.addColorStop(0, "#7e8389");
    gap.addColorStop(1, "#a6abb1");
    g.fillStyle = gap;
    g.fillRect(0, 0, 64, 5);
    g.fillStyle = "#e3e5e8";
    g.fillRect(0, 62, 64, 2);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, d / CEILING_SPEC.slatPitch);
  void w;
  return tex;
}

export function Poster({
  position,
  rotY,
  pair,
  dark = false,
  w = 2.2,
  h = 2,
}: {
  position: [number, number, number];
  rotY: number;
  pair: [string, string];
  dark?: boolean;
  w?: number;
  h?: number;
}) {
  const map = useMemo(() => posterTexture(pair[0], pair[1], dark), [pair, dark]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.06]} />
        <meshBasicMaterial color={dark ? "#2a2d33" : "#ffffff"} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}


// An original service mark (a ring with teeth around a dot), not anyone's logo.
export function ServiceMark({ position }: { position: [number, number, number] }) {
  const map = useMemo(
    () =>
      canvasTexture(128, 128, (g) => {
        g.fillStyle = "#101216";
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = "#ffffff";
        g.fillStyle = "#ffffff";
        g.lineWidth = 8;
        g.beginPath();
        g.arc(64, 64, 26, 0, Math.PI * 2);
        g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          g.save();
          g.translate(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40);
          g.rotate(a);
          g.fillRect(-7, -5, 14, 10);
          g.restore();
        }
        g.beginPath();
        g.arc(64, 64, 9, 0, Math.PI * 2);
        g.fill();
      }),
    [],
  );
  return (
    <mesh position={position} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[0.9, 0.9]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}


// A soft-edged rectangle of light, for the glow a lightbox throws on its wall.
let softBox: CanvasTexture | null = null;
function softBoxTexture(): CanvasTexture {
  if (softBox) return softBox;
  softBox = canvasTexture(128, 128, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 128, 128);
    g.shadowColor = "#fff";
    g.shadowBlur = 28;
    g.fillStyle = "#fff";
    g.fillRect(34, 34, 60, 60);
  });
  return softBox;
}

// Light from the ceiling washing down a wall: bright at the top, gone by the
// bottom. Black is nothing under additive blending.
let wash: CanvasTexture | null = null;
function washTexture(): CanvasTexture {
  if (wash) return wash;
  wash = canvasTexture(4, 64, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 64);
    r.addColorStop(0, "#ffffff");
    r.addColorStop(0.35, "#6a6a6a");
    r.addColorStop(1, "#000000");
    g.fillStyle = r;
    g.fillRect(0, 0, 4, 64);
  });
  return wash;
}

interface Quad {
  x: number;
  y: number;
  z: number;
  rx: number;
  w: number;
  h: number;
}

// Many flat rectangles in one draw call.
function QuadField({ quads, children }: { quads: Quad[]; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    quads.forEach((q, i) => {
      o.position.set(q.x, q.y, q.z);
      o.rotation.set(q.rx, 0, 0);
      o.scale.set(q.w, q.h, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [quads]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, quads.length]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      {children}
    </instancedMesh>
  );
}

// A soft glow around a light panel, so it reads as lit and not just white.
let panelGlow: CanvasTexture | null = null;
function panelGlowTexture(): CanvasTexture {
  if (panelGlow) return panelGlow;
  panelGlow = canvasTexture(64, 32, (g) => {
    const r = g.createRadialGradient(32, 16, 2, 32, 16, 32);
    r.addColorStop(0, "rgba(255,255,255,0.75)");
    r.addColorStop(0.45, "rgba(255,255,255,0.28)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 32);
  });
  return panelGlow;
}

// The same original service mark, hung from the ceiling so it reads from both
// sides (outside the glass and inside).
export function HangingMark({ size }: { size: number }) {
  const map = useMemo(
    () =>
      canvasTexture(128, 128, (g) => {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = "#1f2430";
        g.fillStyle = "#1f2430";
        g.lineWidth = 8;
        g.beginPath();
        g.arc(64, 64, 26, 0, Math.PI * 2);
        g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          g.save();
          g.translate(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40);
          g.rotate(a);
          g.fillRect(-7, -5, 14, 10);
          g.restore();
        }
        g.beginPath();
        g.arc(64, 64, 9, 0, Math.PI * 2);
        g.fill();
      }),
    [],
  );
  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={map} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}


export function lightboxTexture(kind: "phones" | "laptops" | "card"): CanvasTexture {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 512, 256);
    if (kind === "card") {
      g.fillStyle = "#dfe3ea";
      g.fillRect(170, 40, 172, 190);
      g.fillStyle = "#9aa3b2";
      for (let i = 0; i < 3; i++) g.fillRect(200 + i * 50, 170, 34, 34);
      return;
    }
    for (let i = 0; i < 4; i++) {
      const x = 28 + i * 122;
      const grad = g.createLinearGradient(x, 30, x + 100, 250);
      if (kind === "phones") {
        grad.addColorStop(0, "#1f3b3a");
        grad.addColorStop(1, "#6fb6a8");
      } else {
        grad.addColorStop(0, "#2a2f52");
        grad.addColorStop(1, "#b07cf2");
      }
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x, 30, 100, 220, 16);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.arc(x + 32, 70, 15, 0, Math.PI * 2);
      g.arc(x + 32, 108, 15, 0, Math.PI * 2);
      g.fill();
    }
  });
}


// A recessed lightbox: the whole panel glows white, the picture sits low in it.
export function LightBox({
  side,
  z,
  w,
  kind,
}: {
  side: -1 | 1;
  z: number;
  w: number;
  kind: "phones" | "laptops" | "card";
}) {
  const map = useMemo(() => lightboxTexture(kind), [kind]);
  const h = LIGHTBOX_H;
  const y = LIGHTBOX_BOTTOM + h / 2;
  return (
    <group position={[side * (FACE_X - 0.03), y, z]} rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      {/* the light it throws on the wall around it */}
      <mesh position={[0, 0, 0.0005]}>
        <planeGeometry args={[w + 0.9, h + 0.9]} />
        <meshBasicMaterial map={softBoxTexture()} transparent opacity={0.3} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[0, -h * 0.08, 0.002]}>
        <planeGeometry args={[w * 0.92, h * 0.78]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}


export const BAY_LABELS: Record<number, string[]> = {
  [-1]: ["AUDIO", "CHARGING", "CASES"],
  [1]: ["WATCH BANDS", "KEYBOARDS", "SMART HOME"],
};

const BAND_LOW = WALL_BANDS.low; // top of the dark lower band: the bench height
const BAND_MID = WALL_BANDS.mid; // top of the mid band: bottom of the lightboxes

export function WallSections() {
  const frames = useMemo(() => bayFrames(), []);
  const { stock, flats } = useMemo(() => bayStock(), []);
  const bandTex = useMemo(() => wallTexture(15), []);
  const faceRot = (side: -1 | 1): number => (side === -1 ? Math.PI / 2 : -Math.PI / 2);
  return (
    <group>
      {/* three tones of grey: dark lower band, mid band, light upper wall,
          with a dark reveal where the panels meet the floor */}
      {[-1, 1].flatMap((side) =>
        [
          { y0: 0, y1: BAND_LOW, c: WALL_TONES.low },
          { y0: BAND_LOW, y1: BAND_MID, c: WALL_TONES.mid },
          { y0: BAND_MID, y1: CEILING, c: WALL_TONES.upper },
        ].map((b) => (
          <mesh key={`${side}:${b.y0}`} position={[side * (FACE_X - 0.01), (b.y0 + b.y1) / 2, 0]}>
            <boxGeometry args={[0.02, b.y1 - b.y0, FLOOR.maxZ - FLOOR.minZ + 1]} />
            <meshStandardMaterial map={bandTex} color={b.c} emissive="#ffffff" emissiveIntensity={0.12} roughness={0.4} metalness={0.25} />
          </mesh>
        )),
      )}
      <BoxField boxes={frames} roughness={0.5} />
      <BoxField boxes={stock} />
      <BoxField boxes={flats} roughness={0.35} />
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          {SIDE_WALL[side === 1 ? "+x" : "-x"].map((f, i) => {
            if (f.kind === "lightbox") {
              return <LightBox key={i} side={side} z={f.z} w={f.w} kind={f.art} />;
            }
            if (f.kind === "display") {
              return (
                <Poster
                  key={i}
                  position={[side * (FACE_X - 0.05), LIGHTBOX_BOTTOM + f.h / 2, f.z]}
                  rotY={faceRot(side)}
                  pair={POSTER_PAIRS[1]}
                  dark
                  w={f.w}
                  h={f.h}
                />
              );
            }
            if (f.kind === "monitors") {
              return f.zs.map((mz) => <Monitor key={`m${mz}`} x={side * BENCH_X} z={mz} side={side} />);
            }
            if (f.kind === "desktops") {
              return Array.from({ length: f.count }, (_, k) => (
                <Desktop key={`d${k}`} x={side * BENCH_X} z={f.z0 + k * f.pitch} side={side} />
              ));
            }
            return Array.from({ length: f.count }, (_, k) => (
              <Device
                key={`h${k}`}
                kind="headphones"
                x={side * BENCH_X}
                y={0.95}
                z={f.z0 + k * f.pitch}
                rotY={faceRot(side)}
                colour={["#e8a98c", "#c9ced3", "#d8cfe8"][k % 3]}
              />
            ));
          })}
          {BAY_LABELS[side].slice(0, BAY_COUNT).map((label, i) => (
            <Sign
              key={label}
              text={label}
              position={[side * (FACE_X - 0.04), BAY_SIGN_Y, bayCentre(i)]}
              rotY={faceRot(side)}
              w={1.2}
            />
          ))}
        </group>
      ))}
    </group>
  );
}


// The areas behind the shop and what is in them: partition walls with
// doorways, a sign over each area, a desk and computers, lockers, restrooms,
// pallets and the roller door of the loading dock.
export function BackAreas() {
  const slats = useMemo(() => {
    const t = canvasTexture(64, 64, (g) => {
      g.fillStyle = "#b8bec5";
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = "#8e959d";
      for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2);
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(2, 3);
    return t;
  }, []);
  const rz = BACK_ROOM_Z1;
  return (
    <group>
      <BackPartitions />
      {/* the back door onto the loading dock: a roller door and a sign */}
      <mesh position={[(BACK_DOOR.minX + BACK_DOOR.maxX) / 2, 1.3, rz - 0.04]}>
        <boxGeometry args={[BACK_DOOR.maxX - BACK_DOOR.minX, 2.6, 0.06]} />
        <meshStandardMaterial map={slats} roughness={0.6} metalness={0.3} />
      </mesh>
      <Sign text="DELIVERIES" position={[0, 2.78, rz - 0.04]} rotY={Math.PI} w={1.6} fg="#111111" bg="#ffd23f" />
      <DockSurround />
    </group>
  );
}


export function BackRoom() {


  const w = HALF_W * 2;
  const depth = BACK_ROOM_Z1 - BACK_ROOM_Z0;
  const zc = (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2;
  return (
    <group>
      <BackFloor />
      <BackCeiling />
      <mesh position={[0, CEILING / 2, BACK_ROOM_Z1 + 0.1]}>
        <boxGeometry args={[w, CEILING, 0.2]} />
        <meshStandardMaterial color="#e2e6ea" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W + 0.1), CEILING / 2, zc]}>
          <boxGeometry args={[0.2, CEILING, depth]} />
          <meshStandardMaterial color="#e2e6ea" emissive="#ffffff" emissiveIntensity={0.3} />
        </mesh>
      ))}
      <BackPerimeter />
      <BackDetails />
      <StorageRacks />
      <BackFurniture />
      <RepairBenches />

      {/* walls between the areas (with doorways), area signs, furniture, the dock door */}
      <BackAreas />


    </group>
  );
}



// The staff door: flush with the wall, the same finish, outlined by hairline
// gaps. It slides into the wall when staff (NPC or a visitor acting as staff)
// come within reach, and closes again behind them.
export function StaffDoor() {
  const slide = useRef<Group>(null);
  const open = useRef(0);
  useFrame((_, delta) => {
    const now = net.serverNow();
    const near = (x: number, z: number) => Math.hypot(x - DOOR_X, z - WALL_FACE_Z) < 2.2;
    let want = false;
    for (const n of NPCS) {
      if (!isStaff(n)) continue;
      const p = npcPose(n, now);
      if (near(p.x, p.z)) want = true;
    }
    for (const r of net.remotes.values()) if (r.role === "staff" && near(r.x, r.z)) want = true;
    if (net.role === "staff" && near(net.me.x, net.me.z)) want = true;
    open.current += ((want ? 1 : 0) - open.current) * Math.min(1, delta * 6);
    if (slide.current) slide.current.position.x = -open.current * (DOOR_W + 0.1);
  });
  const wall = useMemo(() => wallTexture(DOOR_W), []);
  const z = WALL_FACE_Z + 0.1; // middle of the wall's thickness
  return (
    <group>
      <group ref={slide}>
        <mesh position={[DOOR_X, DOOR_H / 2, z]}>
          <boxGeometry args={[DOOR_W - 0.03, DOOR_H - 0.03, 0.1]} />
          <meshStandardMaterial map={wall} color={WALL_TONES.upper} emissive="#ffffff" emissiveIntensity={0.12} />
        </mesh>
      </group>
      {/* hairline gaps around the door */}
      <mesh position={[DOOR.minX, DOOR_H / 2, WALL_FACE_Z - 0.005]}>
        <boxGeometry args={[0.012, DOOR_H, 0.01]} />
        <meshBasicMaterial color="#8d9399" />
      </mesh>
      <mesh position={[DOOR.maxX, DOOR_H / 2, WALL_FACE_Z - 0.005]}>
        <boxGeometry args={[0.012, DOOR_H, 0.01]} />
        <meshBasicMaterial color="#8d9399" />
      </mesh>
      {/* a small card reader beside it is the only tell */}
      <mesh position={[DOOR.maxX + 0.25, 1.2, WALL_FACE_Z - 0.02]}>
        <boxGeometry args={[0.08, 0.12, 0.03]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.5} />
      </mesh>
    </group>
  );
}


export function ShopShell() {
  const w = FLOOR.maxX - FLOOR.minX + 1;
  const d = FLOOR.maxZ - FLOOR.minZ + 1;
  const floor = useMemo(() => floorTexture(w, d, "#8f9398", "#7f848a"), [w, d]);
  const backWall = useMemo(() => wallTexture(w), [w]);
  const sideWall = useMemo(() => wallTexture(d), [d]);
  const ceilingMap = useMemo(() => ceilingTexture(w, d), [w, d]);
  const panelAt = CEILING_SPEC.panelRowsZ.flatMap((z) => CEILING_SPEC.panelX.map((x) => ({ x, z })));
  const panelGlows = useMemo<Quad[]>(
    () => panelAt.map(({ x, z }) => ({ x, y: CEILING - 0.005, z, rx: Math.PI / 2, w: CEILING_SPEC.panelW * 1.5, h: CEILING_SPEC.panelD * 3.2 })),
    [],
  );
  const panelCores = useMemo<Quad[]>(
    () => panelAt.map(({ x, z }) => ({ x, y: CEILING - 0.02, z, rx: Math.PI / 2, w: CEILING_SPEC.panelW, h: CEILING_SPEC.panelD })),
    [],
  );
  const floorPools = useMemo<Quad[]>(
    () => panelAt.map(({ x, z }) => ({ x, y: 0.006, z, rx: -Math.PI / 2, w: CEILING_SPEC.panelW * 1.6, h: CEILING_SPEC.panelD * 2.8 })),
    [],
  );
  const fullW = w + 0.2;
  const wallMat = (map: CanvasTexture) => (
    <meshStandardMaterial map={map} color={WALL_TONES.upper} emissive="#ffffff" emissiveIntensity={0.12} roughness={0.4} metalness={0.25} />
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* ceiling: grey slats running across the room, long light panels in
          paired rows either side of the centre, track rails with spots down
          the sides and along the front, and a mark hanging near the front */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={ceilingMap} emissive="#ffffff" emissiveIntensity={0.1} roughness={0.9} />
      </mesh>
      {/* the light panels, the glow around them and the pool each leaves on
          the floor: three draw calls for all of them */}
      <QuadField quads={panelGlows}>
        <meshBasicMaterial map={panelGlowTexture()} transparent depthWrite={false} toneMapped={false} />
      </QuadField>
      <QuadField quads={panelCores}>
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </QuadField>
      <QuadField quads={floorPools}>
        <meshBasicMaterial map={panelGlowTexture()} transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </QuadField>
      {/* ceiling light washing down the side walls */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (FACE_X - 0.025), CEILING - 0.7, 0]} rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <planeGeometry args={[d, 1.4]} />
          <meshBasicMaterial map={washTexture()} transparent opacity={0.24} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
      {[
        { x: 0, z: FLOOR.minZ + CEILING_SPEC.trackInset, len: w - 1, alongX: true },
        { x: FLOOR.minX + CEILING_SPEC.trackInset, z: 0, len: d - 1, alongX: false },
        { x: FLOOR.maxX - CEILING_SPEC.trackInset, z: 0, len: d - 1, alongX: false },
      ].map((r, i) => (
        <group key={i}>
          <mesh position={[r.x, CEILING - 0.04, r.z]}>
            <boxGeometry args={r.alongX ? [r.len, 0.025, 0.03] : [0.03, 0.025, r.len]} />
            <meshStandardMaterial color="#868b91" />
          </mesh>
          {Array.from({ length: Math.floor(r.len / CEILING_SPEC.spotPitch) }, (_, k) => {
            const off = -r.len / 2 + CEILING_SPEC.spotPitch / 2 + k * CEILING_SPEC.spotPitch;
            const px = r.alongX ? r.x + off : r.x;
            const pz = r.alongX ? r.z : r.z + off;
            return (
              <group key={k} position={[px, CEILING - 0.12, pz]}>
                <mesh>
                  <cylinderGeometry args={[0.034, 0.034, 0.11, 10]} />
                  <meshStandardMaterial color="#5c6066" />
                </mesh>
                <mesh position={[0, -0.075, 0]}>
                  <cylinderGeometry args={[0.028, 0.028, 0.01, 10]} />
                  <meshBasicMaterial color="#fff6dd" />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
      <group position={[CEILING_SPEC.hangingMark.x, CEILING_SPEC.hangingMark.y, CEILING_SPEC.hangingMark.z]}>
        <mesh position={[0, (CEILING - CEILING_SPEC.hangingMark.y) / 2 + CEILING_SPEC.hangingMark.size / 2, 0]}>
          <boxGeometry args={[0.02, CEILING - CEILING_SPEC.hangingMark.y, 0.02]} />
          <meshStandardMaterial color="#23262b" />
        </mesh>
        <HangingMark size={CEILING_SPEC.hangingMark.size} />
      </group>

      {/* back wall, with the flush staff door set into it */}
      <mesh position={[(-fullW / 2 + DOOR.minX) / 2, CEILING / 2, FLOOR.maxZ + 0.5]}>
        <boxGeometry args={[DOOR.minX + fullW / 2, CEILING, 0.2]} />
        {wallMat(backWall)}
      </mesh>
      <mesh position={[(DOOR.maxX + fullW / 2) / 2, CEILING / 2, FLOOR.maxZ + 0.5]}>
        <boxGeometry args={[fullW / 2 - DOOR.maxX, CEILING, 0.2]} />
        {wallMat(backWall)}
      </mesh>
      <mesh position={[DOOR_X, (CEILING + DOOR_H) / 2, FLOOR.maxZ + 0.5]}>
        <boxGeometry args={[DOOR_W, CEILING - DOOR_H, 0.2]} />
        {wallMat(backWall)}
      </mesh>
      <StaffDoor />

      {/* side walls */}
      <mesh position={[FLOOR.minX - 0.5, CEILING / 2, 0]}>
        <boxGeometry args={[0.2, CEILING, d]} />
        {wallMat(sideWall)}
      </mesh>
      <mesh position={[FLOOR.maxX + 0.5, CEILING / 2, 0]}>
        <boxGeometry args={[0.2, CEILING, d]} />
        {wallMat(sideWall)}
      </mesh>

      {/* glass front with mullions, a header band and the entrance opening */}
      {[
        [-w / 2, GLASS.entranceX[0]],
        [GLASS.entranceX[1], w / 2],
      ].map(([a, b]) => (
        <mesh key={a} position={[(a + b) / 2, CEILING / 2, FLOOR.minZ - 0.5]}>
          <boxGeometry args={[b - a, CEILING, 0.05]} />
          <meshPhysicalMaterial color="#cfe6f0" transparent opacity={0.16} roughness={0.05} />
        </mesh>
      ))}
      {[...GLASS.mullionX, ...GLASS.entranceX]
        .filter((x) => !(x > GLASS.entranceX[0] && x < GLASS.entranceX[1]))
        .map((x) => (
          <mesh key={x} position={[x, CEILING / 2, FLOOR.minZ - 0.5]}>
            <boxGeometry args={[0.06, CEILING, 0.08]} />
            <meshStandardMaterial color="#9aa1a8" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      <mesh position={[0, CEILING - 0.3, FLOOR.minZ - 0.5]}>
        <boxGeometry args={[w, 0.6, 0.1]} />
        <meshStandardMaterial color="#b9bec4" />
      </mesh>

      {/* the bar's back wall: three screens and a service mark between them */}
      {BACK_WALL.screenX.map((x, i) => (
        <Poster
          key={x}
          position={[x, BACK_WALL.screenY, WALL_FACE_Z - 0.03]}
          rotY={Math.PI}
          pair={POSTER_PAIRS[i]}
          dark
          w={BACK_WALL.screenW}
          h={BACK_WALL.screenH}
        />
      ))}
      {BACK_WALL.markX.map((x) => (
        <ServiceMark key={x} position={[x, BACK_WALL.screenY, WALL_FACE_Z - 0.03]} />
      ))}
      <Sign
        text="SERVICE BAR"
        position={[0, BACK_WALL.signY, WALL_FACE_Z - 0.03]}
        rotY={Math.PI}
        w={BACK_WALL.signW}
        fg="#ffffff"
        bg="#1f2430"
      />

      <WallSections />
    </group>
  );
}
