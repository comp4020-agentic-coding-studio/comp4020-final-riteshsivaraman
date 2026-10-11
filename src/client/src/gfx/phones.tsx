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
} from "../../../shared/plan.ts";
import { net } from "../net.ts";
import { WOOD, WALL, SILVER, STAND, DEVICE_COLOURS, BOX_COLOURS, HALF_W, DOOR_W, DOOR_X, DOOR_H, BENCH_X, BENCH_HALF, FACE_X, canvasTexture, labelTexture, BoxField, Sign, std, BlobShadow, type Cuboid, type Kind } from "./common.tsx";
import { buildPhoneBody, PHONE_MODELS } from "./phones-geo.ts";


// Original screen artwork for the products: wallpapers, app tiles, a clock
// face. Drawn once per kind and colour variant and shared by every device.
export const SCREEN_WALLPAPERS: Array<[string, string, string]> = [
  ["#ff7a59", "#7a5cff", "#ffe29a"],
  ["#2dd4bf", "#3b82f6", "#c8f7ff"],
  ["#f6d365", "#fda085", "#fff3d6"],
  ["#a18cd1", "#fbc2eb", "#ffffff"],
];

export const screenCache = new Map<string, CanvasTexture>();

export function screenTexture(kind: "phone" | "tablet" | "laptop" | "tabletKb" | "watch", variant: number): CanvasTexture {
  const key = `${kind}:${variant}`;
  let tex = screenCache.get(key);
  if (tex) return tex;
  const [a, b, c] = SCREEN_WALLPAPERS[variant % SCREEN_WALLPAPERS.length];
  const portrait = kind === "phone";
  const W = portrait ? 128 : kind === "watch" ? 128 : 192;
  const H = portrait ? 256 : kind === "watch" ? 128 : 128;
  tex = canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // soft shapes, like a wallpaper
    g.globalAlpha = 0.28;
    g.fillStyle = c;
    g.beginPath();
    g.arc(W * 0.3, H * 0.35, H * 0.28, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(W * 0.72, H * 0.7, H * 0.34, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    if (kind === "watch") {
      g.fillStyle = "#0c0d10";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 12; i++) {
        const t = (i * Math.PI) / 6;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(t) * 40, H / 2 + Math.sin(t) * 40);
        g.lineTo(W / 2 + Math.cos(t) * 46, H / 2 + Math.sin(t) * 46);
        g.stroke();
      }
      g.strokeStyle = b;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 + 22, H / 2 - 18);
      g.stroke();
      g.strokeStyle = "#ffffff";
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 - 6, H / 2 - 34);
      g.stroke();
      return;
    }
    // status bar and a grid of app tiles
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, W, 12);
    const cols = portrait ? 4 : 6;
    const rows = portrait ? 5 : 3;
    const tw = (W - 16) / cols;
    const th = portrait ? tw : (H - 40) / rows;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        g.fillStyle = `hsl(${(variant * 50 + r * 40 + k * 30) % 360},70%,${55 + ((r + k) % 3) * 8}%)`;
        g.beginPath();
        g.roundRect(8 + k * tw + 3, 22 + r * (th + 8), tw - 6, th - 2, 6);
        g.fill();
      }
    }
    if (kind === "laptop" || kind === "tabletKb") {
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillRect(W * 0.2, H - 14, W * 0.6, 8); // a dock
    }
  });
  screenCache.set(key, tex);
  return tex;
}


export let grilleTex: CanvasTexture | null = null;

export function grilleTexture(): CanvasTexture {
  if (grilleTex) return grilleTex;
  const t = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#2a2d33";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#4a4f58";
    for (let y = 2; y < 64; y += 6) for (let x = (y / 6) % 2 ? 2 : 5; x < 64; x += 6) g.fillRect(x, y, 2, 2);
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(4, 2);
  grilleTex = t;
  return t;
}

export const SCREEN_VARIANT = (colour: string): number => {
  let h = 0;
  for (let i = 0; i < colour.length; i++) h = (h * 31 + colour.charCodeAt(i)) | 0;
  return Math.abs(h) % SCREEN_WALLPAPERS.length;
};


// A back finish a shade darker/lighter than the front, for a model's
// two-tone back (camera plateau in a different finish than the body).
function shade(colour: string, factor: number): string {
  return `#${new Color(colour).multiplyScalar(factor).getHexString()}`;
}

// Phones, watches, earbuds, headphones, speakers and trackers: one product on a
// surface at height y, facing rotY (0 faces +z). `model` picks a real,
// distinct-looking body from `phones-geo.ts` (SCOPE D37); omit it for the
// plain placeholder body still used by un-costed table slots.
export function PhoneDevice({
  kind,
  x,
  y,
  z,
  rotY,
  colour,
  model,
}: {
  kind: "phone" | "watch" | "earbuds" | "headphones" | "speaker" | "airtag";
  x: number;
  y: number;
  z: number;
  rotY: number;
  colour: string;
  model?: string;
}) {
  const spec = kind === "phone" && model ? PHONE_MODELS[model] : undefined;
  const plateauColour = useMemo(() => shade(colour, 0.88), [colour]);
  const built = useMemo(() => (spec ? buildPhoneBody(spec, colour, plateauColour) : null), [spec, colour, plateauColour]);
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {kind === "phone" && spec && built && (
        <group position={[0, spec.length / 2 + 0.012, 0]}>
          {(["matte", "metal", "gloss"] as const).map(
            (f) =>
              built[f] && (
                <mesh key={f} geometry={built[f]!}>
                  {f === "metal" ? (
                    <meshStandardMaterial vertexColors roughness={0.3} metalness={0.85} />
                  ) : f === "gloss" ? (
                    <meshStandardMaterial vertexColors roughness={0.12} metalness={0.2} />
                  ) : (
                    <meshStandardMaterial vertexColors roughness={0.38} metalness={0.55} />
                  )}
                </mesh>
              ),
          )}
          <mesh position={[0, 0, spec.thickness / 2 + 0.0004]}>
            <planeGeometry args={[spec.width * 0.86, spec.length * 0.9]} />
            <meshBasicMaterial map={screenTexture("phone", SCREEN_VARIANT(colour))} toneMapped={false} />
          </mesh>
          <mesh position={[0, -spec.length / 2 - 0.006, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, 20]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
        </group>
      )}
      {kind === "phone" && !spec && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[0.11, 0.02, 0.11]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <group position={[0, 0.12, -0.02]} rotation={[-0.3, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.1, 0.2, 0.01]} />
              {std(colour, 0.3, 0.4)}
            </mesh>
            <mesh position={[0, 0, 0.0055]}>
              <planeGeometry args={[0.088, 0.184]} />
              <meshBasicMaterial map={screenTexture(kind, SCREEN_VARIANT(colour))} toneMapped={false} />
            </mesh>
          </group>
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
          <mesh position={[0, 0.1, 0.0155]}>
            <planeGeometry args={[0.075, 0.085]} />
            <meshBasicMaterial map={screenTexture("watch", SCREEN_VARIANT(colour))} toneMapped={false} />
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
          <mesh position={[0, 0.07, 0.0205]}>
            <boxGeometry args={[0.1, 0.004, 0.002]} />
            {std("#c9ccd1", 0.5, 0.1)}
          </mesh>
          <mesh position={[0, 0.05, 0.0205]}>
            <cylinderGeometry args={[0.006, 0.006, 0.002, 10]} />
            {std("#33d17a", 0.4, 0.1)}
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
          <meshStandardMaterial color={colour} map={grilleTexture()} roughness={0.7} metalness={0.05} />
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

// What stands on the bay shelves, and the devices laid flat along the bench.
// Today: plain coloured boxes. (Shelf y is BAY_SHELVES.first + k * step; a
// bay is BAY_W wide and its shelf plate is 0.24 deep, out from FACE_X - 0.02.)
export function bayStock(): { stock: Cuboid[]; flats: Cuboid[] } {
  const stock: Cuboid[] = [];
  const flats: Cuboid[] = [];
  const tints = ["#eef3f8", "#f6efe6", "#eaf1ea", "#f3eaf3"];
  for (const side of [-1, 1]) {
    for (let i = 0; i < BAY_COUNT; i++) {
      const zc = bayCentre(i);
      const style = i % 3;
      for (let k = 0; k < BAY_SHELVES.count; k++) {
        const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
        if (style === 0) {
          for (let j = 0; j < 9; j++) {
            stock.push({
              x: side * (FACE_X - 0.14),
              y: y + 0.0125 + 0.11,
              z: zc - BAY_W / 2 + 0.1 + (j * (BAY_W - 0.2)) / 8,
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
              z: zc - BAY_W / 2 + 0.17 + (j * (BAY_W - 0.34)) / 4,
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
    for (let z = BENCHES[0].z - BENCH_HALF + 0.3; z <= BENCHES[0].z + BENCH_HALF - 0.3; z += 0.22) {
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
  return { stock, flats };
}
