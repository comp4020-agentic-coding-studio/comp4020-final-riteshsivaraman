import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  Color,
  DoubleSide,
  type Group,
  InstancedMesh,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { NPCS, isStaff, npcPose } from "../../shared/npcs.ts";
import { CEILING, FLOOR } from "../../shared/protocol.ts";
import {
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BACK_SHELVES,
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
  TABLE_STOOLS,
  WALL_FACE_Z,
  bayCentre,
  type Box,
  type Table as TableSpec,
} from "../../shared/world.ts";
import {
  BACK_WALL,
  BAY_SHELVES,
  BAY_SIGN_Y,
  CEILING_SPEC,
  COLUMN_PRODUCTS,
  DOOR_H as PLAN_DOOR_H,
  GLASS,
  LIGHTBOX_BOTTOM,
  LIGHTBOX_H,
  SIDE_WALL,
  STOOLS,
  WALL_BANDS,
} from "../../shared/plan.ts";
import { net } from "./net.ts";

// The store's scenery: plain geometry and flat colour on purpose (see
// SCOPE.md 3f and 3g). Nothing here is solid except what world.ts lists, so
// what you bump into and what is drawn cannot drift apart.

const WOOD = "#d9b98c";
const WALL = "#d9dcdf";
const SILVER = "#c9ced3";
const STAND = "#9aa1a8";
const DEVICE_COLOURS = ["#2b2f36", "#c9ced3", "#e8d9c4", "#3a4a63", "#a7b7a4", "#d8b4a0"];
const BOX_COLOURS = ["#f2f2f0", "#dfe6ee", "#e9e2d6", "#cfd8d2", "#f3d9c8", "#d6d9f0"];
const HALF_W = FLOOR.maxX + 0.6;
const DOOR_W = DOOR.maxX - DOOR.minX;
const DOOR_X = (DOOR.minX + DOOR.maxX) / 2;
const DOOR_H = PLAN_DOOR_H;
const BENCH_X = Math.abs(BENCHES[0].x); // the benches stand this far from the middle
const BENCH_HALF = BENCHES[0].d / 2;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Invented abstract poster art. "light" is a soft two-colour gradient; "dark"
// is a black panel with bright rounded shapes, like the ones in the reference.
const POSTER_PAIRS: Array<[string, string]> = [
  ["#ff7a59", "#7a5cff"],
  ["#2dd4bf", "#3b82f6"],
  ["#f6d365", "#fda085"],
  ["#a18cd1", "#fbc2eb"],
];

function posterTexture(a: string, b: string, dark: boolean): CanvasTexture {
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

function labelTexture(text: string, fg = "#1d2430", bg = "#ffffff"): CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = fg;
    g.font = "bold 28px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 34);
  });
}

function floorTexture(w: number, d: number, base: string, joint: string): CanvasTexture {
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = joint;
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(w / 2, d / 2);
  return tex;
}

// Brushed grey wall panels with fine vertical seams every metre.
function wallTexture(lengthM: number): CanvasTexture {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = WALL;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#b4b8bd";
    g.fillRect(0, 0, 2, 128);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(lengthM, 1);
  return tex;
}

// Grey ceiling slats running across the room, like the reference.
function ceilingTexture(w: number, d: number): CanvasTexture {
  const tex = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#eceef0";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#a3a8ae";
    g.fillRect(0, 0, 64, 7);
  });
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, d / CEILING_SPEC.slatPitch);
  void w;
  return tex;
}

// Many boxes in one draw call: shelves, stock and boxed products.
interface Cuboid {
  x: number;
  y: number; // centre height
  z: number;
  w: number;
  h: number;
  d: number;
  colour: string;
}

function BoxField({ boxes, roughness = 0.7 }: { boxes: Cuboid[]; roughness?: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    boxes.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(b.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} />
    </instancedMesh>
  );
}

function Poster({
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
function ServiceMark({ position }: { position: [number, number, number] }) {
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

// The same original service mark, hung from the ceiling so it reads from both
// sides (outside the glass and inside).
function HangingMark({ size }: { size: number }) {
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

function Sign({
  text,
  position,
  rotY,
  w = 1.6,
  fg,
  bg,
}: {
  text: string;
  position: [number, number, number];
  rotY: number;
  w?: number;
  fg?: string;
  bg?: string;
}) {
  const map = useMemo(() => labelTexture(text, fg, bg), [text, fg, bg]);
  return (
    <mesh position={position} rotation={[0, rotY, 0]}>
      <planeGeometry args={[w, w / 4]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

type Kind =
  | "phone"
  | "tablet"
  | "tabletKb"
  | "laptop"
  | "watch"
  | "earbuds"
  | "headphones"
  | "speaker"
  | "airtag";

const std = (c: string, r = 0.4, m = 0.3) => <meshStandardMaterial color={c} roughness={r} metalness={m} />;

// One product on a surface at height `y`, facing along `rotY` (0 faces +z).
// Phones and tablets sit on little stands so they read at walking distance.
function Device({
  kind,
  x,
  y,
  z,
  rotY,
  colour,
}: {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  rotY: number;
  colour: string;
}) {
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {kind === "laptop" && (
        <>
          <mesh position={[0, 0.009, 0]}>
            <boxGeometry args={[0.36, 0.018, 0.25]} />
            {std(SILVER)}
          </mesh>
          <mesh position={[0, 0.13, -0.11]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.36, 0.24, 0.012]} />
            {std(colour, 0.35)}
          </mesh>
        </>
      )}
      {kind === "tabletKb" && (
        <>
          <mesh position={[0, 0.008, 0.02]}>
            <boxGeometry args={[0.27, 0.016, 0.19]} />
            {std("#3a3f47", 0.6, 0.1)}
          </mesh>
          <mesh position={[0, 0.115, -0.08]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[0.27, 0.2, 0.012]} />
            {std(colour, 0.35, 0.4)}
          </mesh>
        </>
      )}
      {(kind === "phone" || kind === "tablet") && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[kind === "tablet" ? 0.2 : 0.11, 0.02, 0.11]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <mesh position={[0, kind === "tablet" ? 0.14 : 0.12, -0.02]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={kind === "tablet" ? [0.26, 0.2, 0.012] : [0.1, 0.2, 0.01]} />
            {std(colour, 0.3, 0.4)}
          </mesh>
        </>
      )}
      {kind === "watch" && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 20]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.09, 0.1, 0.03]} />
            {std("#1c1f26", 0.3, 0.4)}
          </mesh>
          <mesh position={[0, 0.1, 0.01]}>
            <boxGeometry args={[0.05, 0.2, 0.025]} />
            {std(colour, 0.7, 0.05)}
          </mesh>
        </>
      )}
      {kind === "earbuds" && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.02, 20]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.1, 0.07, 0.04]} />
            {std("#f4f4f2", 0.4, 0.1)}
          </mesh>
        </>
      )}
      {kind === "headphones" && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[0.14, 0.02, 0.14]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.2, 0.014, 0.05]} />
            {std(colour, 0.4, 0.3)}
          </mesh>
          {[-0.1, 0.1].map((cx) => (
            <mesh key={cx} position={[cx, 0.14, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
              {std(colour, 0.4, 0.3)}
            </mesh>
          ))}
        </>
      )}
      {kind === "speaker" && (
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.09, 0.1, 0.2, 20]} />
          {std(colour, 0.7, 0.05)}
        </mesh>
      )}
      {kind === "airtag" && (
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.012, 20]} />
          {std("#eeeeec", 0.3, 0.5)}
        </mesh>
      )}
    </group>
  );
}

// Which products stand on each column of tables: phones, watches and earbuds,
// laptops, tablets, then audio and trackers.
const COLUMN_KINDS: Record<number, readonly Kind[]> = Object.fromEntries(
  Object.entries(COLUMN_PRODUCTS).map(([x, kinds]) => [Number(x), kinds]),
);

// A product table: a top on four legs, one product on each side facing
// outward, so a person standing at any side sees their own product.
// A service table is the same without products, with a stool either side.
function Table({ box, kinds }: { box: TableSpec; kinds: readonly Kind[] }) {
  const inset = 0.2; // a product stands this far in from its edge
  const items = box.service
    ? []
    : [
        { x: box.x - (box.w / 2 - inset), z: box.z, rotY: -Math.PI / 2, kind: kinds[0] },
        { x: box.x + (box.w / 2 - inset), z: box.z, rotY: Math.PI / 2, kind: kinds[1] },
        { x: box.x, z: box.z - (box.d / 2 - inset), rotY: Math.PI, kind: kinds[2] },
        { x: box.x, z: box.z + (box.d / 2 - inset), rotY: 0, kind: kinds[3] },
      ];
  return (
    <group>
      {/* a top on four legs, so you can see under it like the real ones */}
      <mesh position={[box.x, box.h - 0.04, box.z]}>
        <boxGeometry args={[box.w, 0.08, box.d]} />
        <meshStandardMaterial color={box.service ? "#d9c196" : "#e6cfa8"} roughness={0.5} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}:${sz}`}
            position={[box.x + sx * (box.w / 2 - 0.08), (box.h - 0.08) / 2, box.z + sz * (box.d / 2 - 0.08)]}
          >
            <boxGeometry args={[0.08, box.h - 0.08, 0.08]} />
            <meshStandardMaterial color={WOOD} roughness={0.55} />
          </mesh>
        )),
      )}
      {items.map((it, i) => (
        <Device
          key={i}
          kind={it.kind}
          x={it.x}
          y={box.h}
          z={it.z}
          rotY={it.rotY}
          colour={DEVICE_COLOURS[(i + Math.round(box.z * 3) + 6) % DEVICE_COLOURS.length]}
        />
      ))}
    </group>
  );
}

// A plain stool, for the service tables.
function TableStool({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#8d9399" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.05, 20]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
    </group>
  );
}

function WallBench({ box, side }: { box: Box; side: -1 | 1 }) {
  // collision box stops short of the wall; draw the slab out to the wall.
  // Thick, square-ended, open underneath (the devices on it are in WallSections).
  const extra = 0.4;
  const cx = box.x + side * (extra / 2);
  return (
    <mesh position={[cx, box.h - 0.06, box.z]}>
      <boxGeometry args={[box.w + extra, 0.12, box.d]} />
      <meshStandardMaterial color={WOOD} roughness={0.5} />
    </mesh>
  );
}

// Side walls, from the reference close-up: three tones of brushed grey, big
// recessed lightboxes toward the front, then dark charcoal shelving bays
// stacked with white boxes toward the back. The bench below carries rows of
// devices laid flat, and a couple of monitors.
const FACE_X = FLOOR.maxX + 0.4; // inner face of the side walls
const BAY_LABELS: Record<number, string[]> = {
  [-1]: ["AUDIO", "CHARGING", "CASES"],
  [1]: ["WATCH BANDS", "KEYBOARDS", "SMART HOME"],
};
const BAND_LOW = WALL_BANDS.low; // top of the dark lower band: the bench height
const BAND_MID = WALL_BANDS.mid; // top of the mid band: bottom of the lightboxes

function wallProducts(): { frames: Cuboid[]; stock: Cuboid[]; flats: Cuboid[] } {
  const frames: Cuboid[] = [];
  const stock: Cuboid[] = [];
  const flats: Cuboid[] = [];
  const tints = ["#eef3f8", "#f6efe6", "#eaf1ea", "#f3eaf3"];
  const bottom = BAY_SHELVES.panelBottom;
  const top = BAY_SHELVES.panelTop;
  for (const side of [-1, 1]) {
    // piers: lighter strips from the bench to the ceiling, so the bays read as
    // indented between them; below the bench the grey panel runs unbroken
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zc = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      frames.push({
        x: side * (FACE_X - 0.15),
        y: (bottom + CEILING) / 2,
        z: zc,
        w: 0.3,
        h: CEILING - bottom,
        d: PIER_W,
        colour: "#b4b8bd",
      });
    }
    for (let i = 0; i < BAY_COUNT; i++) {
      const zc = bayCentre(i);
      frames.push({ x: side * (FACE_X - 0.02), y: (bottom + top) / 2, z: zc, w: 0.04, h: top - bottom, d: BAY_W, colour: "#3b3f45" });
      const style = i % 3;
      for (let k = 0; k < BAY_SHELVES.count; k++) {
        const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
        frames.push({ x: side * (FACE_X - 0.14), y, z: zc, w: 0.24, h: 0.025, d: BAY_W - 0.04, colour: "#8b9096" });
        if (style === 0) {
          for (let j = 0; j < 9; j++) {
            stock.push({
              x: side * (FACE_X - 0.14),
              y: y + 0.0125 + 0.11,
              z: zc - BAY_W / 2 + 0.1 + j * 0.15,
              w: 0.16,
              h: 0.22,
              d: 0.09,
              colour: (j + k) % 5 === 4 ? tints[(i + k) % 4] : "#f4f4f2",
            });
          }
        } else if (style === 1) {
          for (let j = 0; j < 5; j++) {
            stock.push({
              x: side * (FACE_X - 0.14),
              y: y + 0.0125 + 0.12,
              z: zc - BAY_W / 2 + 0.17 + j * 0.27,
              w: 0.18,
              h: 0.24,
              d: 0.15,
              colour: (j + k) % 4 === 0 ? "#c0392b" : (j + k) % 4 === 1 ? "#2f4c7a" : "#22262c",
            });
          }
        } else if (k % 2 === 0) {
          for (let j = 0; j < 3; j++) {
            stock.push({
              x: side * (FACE_X - 0.14),
              y: y + 0.0125 + 0.03 + j * 0.06,
              z: zc,
              w: 0.2,
              h: 0.05,
              d: BAY_W - 0.2,
              colour: j % 2 === 0 ? "#f4f4f2" : "#dde3ea",
            });
          }
        }
      }
    }
    // devices laid flat in two rows along the bench, except where desktops
    // and headphones stand (the -x wall)
    const benchX = side * BENCH_X;
    // keep clear of the desktops and headphones that stand on the -x bench
    const kept = SIDE_WALL[side === 1 ? "+x" : "-x"].filter((f) => f.kind === "desktops" || f.kind === "headphones");
    const blocked = (z: number): boolean =>
      kept.some((f) => (f.kind === "desktops" || f.kind === "headphones") && z > f.z0 - 0.3 && z < f.z0 + (f.count - 1) * f.pitch + 0.3);
    for (let z = -BENCH_HALF + 0.3; z <= BENCH_HALF - 0.3; z += 0.22) {
      if (blocked(z)) continue;
      for (const dx of [-0.17, 0.17]) {
        flats.push({
          x: benchX + dx,
          y: 0.95 + 0.006,
          z,
          w: 0.155,
          h: 0.012,
          d: 0.075,
          colour: ["#2d3f66", "#1c2331", "#c9ced3", "#3a5a8c"][Math.round(z * 4 + dx * 10 + 40) % 4],
        });
      }
    }
  }
  return { frames, stock, flats };
}

function lightboxTexture(kind: "phones" | "laptops" | "card"): CanvasTexture {
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
function LightBox({
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

function monitorTexture(): CanvasTexture {
  return canvasTexture(128, 96, (g) => {
    g.fillStyle = "#1a4fb8";
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = "#6fa8ff";
    g.fillRect(8, 8, 50, 38);
    g.fillStyle = "#ffffff";
    g.fillRect(66, 10, 52, 8);
    g.fillRect(66, 24, 40, 6);
    g.fillStyle = "#e1306c";
    g.fillRect(8, 56, 36, 30);
    g.fillStyle = "#ffd23f";
    g.fillRect(52, 56, 36, 30);
  });
}

function Monitor({ x, z, side }: { x: number; z: number; side: -1 | 1 }) {
  const map = useMemo(() => monitorTexture(), []);
  return (
    <group position={[x, 0.95, z]} rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.3, 0.03, 0.2]} />
        <meshStandardMaterial color="#2a2d33" />
      </mesh>
      <mesh position={[0, 0.3, -0.02]}>
        <boxGeometry args={[0.04, 0.55, 0.04]} />
        <meshStandardMaterial color="#2a2d33" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.7, 0.42, 0.04]} />
        <meshStandardMaterial color="#15171b" />
      </mesh>
      <mesh position={[0, 0.5, 0.022]}>
        <planeGeometry args={[0.64, 0.36]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

function desktopTexture(): CanvasTexture {
  return canvasTexture(64, 48, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 48);
    grad.addColorStop(0, "#5b3fd4");
    grad.addColorStop(1, "#e04ab8");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 48);
  });
}

// A desktop display on the bench: slim screen on a stand.
function Desktop({ x, z, side }: { x: number; z: number; side: -1 | 1 }) {
  const map = useMemo(() => desktopTexture(), []);
  return (
    <group position={[x, 0.95, z]} rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.22, 0.02, 0.16]} />
        <meshStandardMaterial color="#c9ced3" />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.03]} />
        <meshStandardMaterial color="#c9ced3" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.5, 0.34, 0.03]} />
        <meshStandardMaterial color="#d9dce0" />
      </mesh>
      <mesh position={[0, 0.4, 0.017]}>
        <planeGeometry args={[0.46, 0.3]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

function WallSections() {
  const { frames, stock, flats } = useMemo(() => wallProducts(), []);
  const bandTex = useMemo(() => wallTexture(15), []);
  const faceRot = (side: -1 | 1): number => (side === -1 ? Math.PI / 2 : -Math.PI / 2);
  return (
    <group>
      {/* three tones of grey: dark lower band, mid band, light upper wall,
          with a dark reveal where the panels meet the floor */}
      {[-1, 1].flatMap((side) =>
        [
          { y0: 0, y1: BAND_LOW, c: "#8c9096" },
          { y0: BAND_LOW, y1: BAND_MID, c: "#a8acb1" },
          { y0: BAND_MID, y1: CEILING, c: "#cdd0d4" },
        ].map((b) => (
          <mesh key={`${side}:${b.y0}`} position={[side * (FACE_X - 0.01), (b.y0 + b.y1) / 2, 0]}>
            <boxGeometry args={[0.02, b.y1 - b.y0, FLOOR.maxZ - FLOOR.minZ + 1]} />
            <meshStandardMaterial map={bandTex} color={b.c} emissive="#ffffff" emissiveIntensity={0.12} />
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

// Staff-only back room: rows of labelled shelving, two repair benches with
// technicians, and a parts wall, behind the flush door left of the bar.
const BACK_LABELS = [
  ["PHONES  BLK", "PHONES  SLV", "TABLETS"],
  ["LAPTOPS", "WATCHES", "EARBUDS"],
];

function BackRoom() {
  const { frames, stock } = useMemo(() => {
    const frames: Cuboid[] = [];
    const stock: Cuboid[] = [];
    BACK_SHELVES.forEach((u, idx) => {
      for (const ux of [-u.w / 2, u.w / 2]) {
        for (const uz of [-0.28, 0.28]) {
          frames.push({ x: u.x + ux, y: 1.2, z: u.z + uz, w: 0.06, h: 2.4, d: 0.06, colour: "#8d9399" });
        }
      }
      [0.25, 0.85, 1.45, 2.05].forEach((y, s) => {
        frames.push({ x: u.x, y, z: u.z, w: u.w, h: 0.04, d: u.d, colour: "#c9ced3" });
        const perShelf = Math.floor((u.w - 0.4) / 0.31) + 1;
        for (let k = 0; k < perShelf; k++) {
          stock.push({
            x: u.x - u.w / 2 + 0.25 + k * 0.31,
            y: y + 0.17,
            z: u.z,
            w: 0.24,
            h: 0.3,
            d: 0.5,
            colour: BOX_COLOURS[(k + s + idx) % BOX_COLOURS.length],
          });
        }
      });
    });
    // a parts wall along the very back
    for (const y of [0.9, 1.5, 2.1]) {
      const half = HALF_W - 0.8;
      frames.push({ x: 0, y, z: BACK_ROOM_Z1 - 0.35, w: half * 2, h: 0.035, d: 0.4, colour: "#c9ced3" });
      for (let x = -half + 0.2; x <= half - 0.2; x += 0.4) {
        stock.push({
          x,
          y: y + 0.12,
          z: BACK_ROOM_Z1 - 0.35,
          w: 0.3,
          h: 0.2,
          d: 0.3,
          colour: BOX_COLOURS[Math.abs(Math.round(x * 5 + y * 3)) % BOX_COLOURS.length],
        });
      }
    }
    return { frames, stock };
  }, []);

  const w = HALF_W * 2;
  const depth = BACK_ROOM_Z1 - BACK_ROOM_Z0;
  const floor = useMemo(() => floorTexture(w, depth, "#c9ccd0", "#b3b7bc"), [w, depth]);
  const zc = (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zc]}>
        <planeGeometry args={[w, depth]} />
        <meshStandardMaterial map={floor} roughness={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, zc]}>
        <planeGeometry args={[w, depth]} />
        <meshStandardMaterial color="#eef0f2" emissive="#ffffff" emissiveIntensity={0.45} />
      </mesh>
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
      <BoxField boxes={frames} roughness={0.5} />
      <BoxField boxes={stock} />

      {BACK_SHELF_ROW_Z.map((z, r) =>
        BACK_SHELF_UNIT_X.map((x, u) => (
          <Sign key={`${r}:${u}`} text={BACK_LABELS[r][u]} position={[x, 2.6, z - 0.33]} rotY={Math.PI} w={1.7} />
        )),
      )}

      {/* repair benches: a work surface, a mat, open devices and parts trays */}
      {SERVICE_DESKS.map((d, i) => (
        <group key={i}>
          <mesh position={[d.x, d.h / 2, d.z]}>
            <boxGeometry args={[d.w, d.h, d.d]} />
            <meshStandardMaterial color="#aeb4ba" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[d.x, d.h + 0.004, d.z]}>
            <boxGeometry args={[d.w - 0.3, 0.008, d.d - 0.2]} />
            <meshStandardMaterial color="#3c4a57" roughness={0.9} />
          </mesh>
          <Device kind="laptop" x={d.x - 1.1} y={d.h + 0.008} z={d.z - 0.05} rotY={Math.PI} colour="#2b2f36" />
          <Device kind="tabletKb" x={d.x} y={d.h + 0.008} z={d.z - 0.05} rotY={Math.PI} colour="#3a4a63" />
          <Device kind="phone" x={d.x + 0.9} y={d.h + 0.008} z={d.z - 0.1} rotY={Math.PI} colour="#c9ced3" />
          {[-0.6, 0.45, 1.3].map((tx) => (
            <mesh key={tx} position={[d.x + tx, d.h + 0.03, d.z + 0.2]}>
              <boxGeometry args={[0.25, 0.05, 0.16]} />
              <meshStandardMaterial color="#e6a23c" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      <Sign
        text="SERVICE"
        position={[0, 2.5, SERVICE_DESKS[0].z + 0.6]}
        rotY={Math.PI}
        w={2}
        fg="#ffffff"
        bg="#1f5f99"
      />
    </group>
  );
}

function Stools() {
  const stools = [];
  for (const sx of STOOLS.x) {
    const k = sx;
    stools.push(
      <group key={k} position={[sx, 0, COUNTER.z - 0.95]}>
        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.68, 8]} />
          <meshStandardMaterial color="#8d9399" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 20]} />
          <meshStandardMaterial color={WOOD} roughness={0.6} />
        </mesh>
      </group>,
    );
  }
  return <group>{stools}</group>;
}

// The staff door: flush with the wall, the same finish, outlined by hairline
// gaps. It slides into the wall when staff (NPC or a visitor acting as staff)
// come within reach, and closes again behind them.
function StaffDoor() {
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
          <meshStandardMaterial map={wall} emissive="#ffffff" emissiveIntensity={0.3} />
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

export function Room() {
  const w = FLOOR.maxX - FLOOR.minX + 1;
  const d = FLOOR.maxZ - FLOOR.minZ + 1;
  const floor = useMemo(() => floorTexture(w, d, "#d9dcdf", "#c3c7cb"), [w, d]);
  const backWall = useMemo(() => wallTexture(w), [w]);
  const sideWall = useMemo(() => wallTexture(d), [d]);
  const ceilingMap = useMemo(() => ceilingTexture(w, d), [w, d]);
  const fullW = w + 0.2;
  const wallMat = (map: CanvasTexture) => (
    <meshStandardMaterial map={map} emissive="#ffffff" emissiveIntensity={0.3} />
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} roughness={0.8} />
      </mesh>

      {/* ceiling: grey slats running across the room, long light panels in
          paired rows either side of the centre, track rails with spots down
          the sides and along the front, and a mark hanging near the front */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={ceilingMap} emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>
      {CEILING_SPEC.panelRowsZ.flatMap((z) =>
        CEILING_SPEC.panelX.map((x) => (
          <mesh key={`${x}:${z}`} position={[x, CEILING - 0.02, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[CEILING_SPEC.panelW, CEILING_SPEC.panelD]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )),
      )}
      {[
        { x: 0, z: FLOOR.minZ + CEILING_SPEC.trackInset, len: w - 1, alongX: true },
        { x: FLOOR.minX + CEILING_SPEC.trackInset, z: 0, len: d - 1, alongX: false },
        { x: FLOOR.maxX - CEILING_SPEC.trackInset, z: 0, len: d - 1, alongX: false },
      ].map((r, i) => (
        <group key={i}>
          <mesh position={[r.x, CEILING - 0.04, r.z]}>
            <boxGeometry args={r.alongX ? [r.len, 0.04, 0.05] : [0.05, 0.04, r.len]} />
            <meshStandardMaterial color="#23262b" />
          </mesh>
          {Array.from({ length: Math.floor(r.len / CEILING_SPEC.spotPitch) }, (_, k) => {
            const off = -r.len / 2 + CEILING_SPEC.spotPitch / 2 + k * CEILING_SPEC.spotPitch;
            const px = r.alongX ? r.x + off : r.x;
            const pz = r.alongX ? r.z : r.z + off;
            return (
              <group key={k} position={[px, CEILING - 0.12, pz]}>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.05, 0.14, 10]} />
                  <meshStandardMaterial color="#23262b" />
                </mesh>
                <mesh position={[0, -0.075, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.01, 10]} />
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

      {/* tables, one product family per column; service tables have stools */}
      {TABLES.map((t, i) => (
        <Table key={i} box={t} kinds={COLUMN_KINDS[t.x]} />
      ))}
      {TABLE_STOOLS.map((st, i) => (
        <TableStool key={i} x={st.x} z={st.z} />
      ))}
      <WallBench box={BENCHES[0]} side={-1} />
      <WallBench box={BENCHES[1]} side={1} />

      {/* the service bar, its staff-side partitions and stools */}
      <mesh position={[COUNTER.x, COUNTER.h / 2, COUNTER.z]}>
        <boxGeometry args={[COUNTER.w, COUNTER.h, COUNTER.d]} />
        <meshStandardMaterial color={WOOD} roughness={0.55} />
      </mesh>
      {PARTITIONS.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]}>
          <boxGeometry args={[p.w, p.h, p.d]} />
          <meshStandardMaterial color={WOOD} roughness={0.55} />
        </mesh>
      ))}
      <Stools />

      <BackRoom />
    </group>
  );
}
