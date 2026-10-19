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
import type { ScreenMode } from "./phones.tsx";
import {
  DESKTOP_MODELS,
  DISPLAY_MODELS,
  LAPTOP_MODELS,
  TABLET_MODELS,
  bodyMaterial,
  keyboardMaterial,
  desktopGeo,
  displayGeo,
  laptopGeo,
  tabletGeo,
  tabletHeldGeo,
  tabletKbGeo,
  type DeviceGeo,
} from "./computers-geo.ts";
import { LOGO_DESIGN, screenMaterial } from "./computers-screens.ts";

// Which screen design a modelled device shows: `home` is a device in use (a
// desktop, a call, a spreadsheet...), `lock` is a marketing-shot wallpaper
// with no interface on it. Picked from the colour and model so neighbours
// differ. Design 3 (computers-screens.ts's spec sheet) is left out: its copy
// ("11- and 13-inch, from 5.1 mm thin") is only true of one model.
const HOME_DESIGNS = [2, 4, 5, 6, 7, 9];
const LOCK_DESIGNS = [0, 1, 8];
function screenDesign(seed: string, mode: ScreenMode = "home"): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const list = mode === "lock" ? LOCK_DESIGNS : HOME_DESIGNS;
  return list[Math.abs(h) % list.length];
}

// One modelled device: the merged body (one draw call) and its screen (one more).
function ModelMeshes({ geo, colour, model, screenMode }: { geo: DeviceGeo; colour: string; model: string; screenMode?: ScreenMode }) {
  return (
    <>
      <mesh geometry={geo.body} material={bodyMaterial(colour)} />
      {geo.screen && <mesh geometry={geo.screen} material={screenMaterial(geo.format === "monitor" ? LOGO_DESIGN : screenDesign(colour + model, screenMode), geo.format)} />}
      {/* a tablet's keyboard: its own white or black, never the tablet's colour */}
      {geo.accessory && <mesh geometry={geo.accessory.geo} material={keyboardMaterial(geo.accessory.finish)} />}
    </>
  );
}


// Original screen artwork for the products: wallpapers, app tiles, a clock
// face. Drawn once per kind and colour variant and shared by every device.
export const COMPUTER_WALLPAPERS: Array<[string, string, string]> = [
  ["#ff7a59", "#7a5cff", "#ffe29a"],
  ["#2dd4bf", "#3b82f6", "#c8f7ff"],
  ["#f6d365", "#fda085", "#fff3d6"],
  ["#a18cd1", "#fbc2eb", "#ffffff"],
];

const computerScreenCache = new Map<string, CanvasTexture>();
export function computerScreen(kind: "phone" | "tablet" | "laptop" | "tabletKb" | "watch", variant: number): CanvasTexture {
  const key = `${kind}:${variant}`;
  let tex = computerScreenCache.get(key);
  if (tex) return tex;
  const [a, b, c] = COMPUTER_WALLPAPERS[variant % COMPUTER_WALLPAPERS.length];
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
  computerScreenCache.set(key, tex);
  return tex;
}


export const COMPUTER_VARIANT = (colour: string): number => {
  let h = 0;
  for (let i = 0; i < colour.length; i++) h = (h * 31 + colour.charCodeAt(i)) | 0;
  return Math.abs(h) % COMPUTER_WALLPAPERS.length;
};


// Laptops, tablets and tablets with keyboards: one product on a surface at
// height y, facing rotY (0 faces +z). With a `model` (a LAPTOP_MODELS id for
// a laptop, a TABLET_MODELS id for a tablet or tablet with keyboard) it draws
// that real model (SCOPE D37); without one, the generic placeholder below.
export function ComputerDevice({
  kind,
  x,
  y,
  z,
  rotY,
  colour,
  model,
  screenMode,
  held = false,
}: {
  kind: "laptop" | "tabletKb" | "tablet";
  x: number;
  y: number;
  z: number;
  rotY: number;
  colour: string;
  model?: string;
  screenMode?: ScreenMode;
  held?: boolean; // in a hand: no stand, centred, screen to +z
}) {
  const geo = modelGeo(kind, model, held);
  if (geo) {
    return (
      <group position={[x, y, z]} rotation={[0, rotY, 0]}>
        <ModelMeshes geo={geo} colour={colour} model={model!} screenMode={screenMode} />
      </group>
    );
  }
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      {kind === "laptop" && (
        <>
          <mesh position={[0, 0.009, 0]}>
            <boxGeometry args={[0.36, 0.018, 0.25]} />
            {std(SILVER)}
          </mesh>
          <group position={[0, 0.13, -0.11]} rotation={[-0.2, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.36, 0.24, 0.012]} />
              {std(colour, 0.35)}
            </mesh>
            <mesh position={[0, 0, 0.0065]}>
              <planeGeometry args={[0.33, 0.21]} />
              <meshBasicMaterial map={computerScreen("laptop", COMPUTER_VARIANT(colour))} toneMapped={false} />
            </mesh>
          </group>
        </>
      )}
      {kind === "tabletKb" && (
        <>
          <mesh position={[0, 0.008, 0.02]}>
            <boxGeometry args={[0.27, 0.016, 0.19]} />
            {std("#3a3f47", 0.6, 0.1)}
          </mesh>
          <group position={[0, 0.115, -0.08]} rotation={[-0.25, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.27, 0.2, 0.012]} />
              {std(colour, 0.35, 0.4)}
            </mesh>
            <mesh position={[0, 0, 0.0065]}>
              <planeGeometry args={[0.245, 0.175]} />
              <meshBasicMaterial map={computerScreen("tabletKb", COMPUTER_VARIANT(colour))} toneMapped={false} />
            </mesh>
          </group>
        </>
      )}
      {kind === "tablet" && (
        <>
          <mesh position={[0, 0.01, 0]}>
            <boxGeometry args={[kind === "tablet" ? 0.2 : 0.11, 0.02, 0.11]} />
            {std(STAND, 0.5, 0.4)}
          </mesh>
          <group position={[0, kind === "tablet" ? 0.14 : 0.12, -0.02]} rotation={[-0.3, 0, 0]}>
            <mesh>
              <boxGeometry args={kind === "tablet" ? [0.26, 0.2, 0.012] : [0.1, 0.2, 0.01]} />
              {std(colour, 0.3, 0.4)}
            </mesh>
            <mesh position={[0, 0, kind === "tablet" ? 0.0065 : 0.0055]}>
              <planeGeometry args={kind === "tablet" ? [0.235, 0.175] : [0.088, 0.184]} />
              <meshBasicMaterial map={computerScreen(kind, COMPUTER_VARIANT(colour))} toneMapped={false} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

function modelGeo(kind: "laptop" | "tabletKb" | "tablet", model: string | undefined, held = false): DeviceGeo | null {
  if (!model) return null;
  if (kind === "laptop") {
    const spec = LAPTOP_MODELS[model];
    return spec ? laptopGeo(spec) : null;
  }
  const spec = TABLET_MODELS[model];
  if (!spec) return null;
  if (held && kind === "tablet") return tabletHeldGeo(spec);
  return kind === "tabletKb" ? tabletKbGeo(spec) : tabletGeo(spec);
}

// Monitor and Desktop stand on the wall bench (y 0.95) turned to face the
// aisle from `side`. `y` and `rotY` override that for the look-check stage.
const benchRot = (side: -1 | 1) => (side === -1 ? Math.PI / 2 : -Math.PI / 2);

export function monitorTexture(): CanvasTexture {
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


// A standalone display. `model`: a DISPLAY_MODELS id (Studio Display, Studio
// Display XDR); without one, the generic placeholder.
export function Monitor({ x, z, side, model, screenMode, y = 0.95, rotY }: { x: number; z: number; side: -1 | 1; model?: string; screenMode?: ScreenMode; y?: number; rotY?: number }) {
  const map = useMemo(() => monitorTexture(), []);
  const spec = model ? DISPLAY_MODELS[model] : undefined;
  if (spec) {
    return (
      <group position={[x, y, z]} rotation={[0, rotY ?? benchRot(side), 0]}>
        <ModelMeshes geo={displayGeo(spec)} colour={SILVER} model={spec.id} screenMode={screenMode} />
      </group>
    );
  }
  return (
    <group position={[x, y, z]} rotation={[0, rotY ?? benchRot(side), 0]}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.3, 0.03, 0.2]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.3, -0.02]}>
        <boxGeometry args={[0.04, 0.55, 0.04]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.7, 0.42, 0.04]} />
        <meshStandardMaterial color="#15171b" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.5, 0.022]}>
        <planeGeometry args={[0.64, 0.36]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}


export function desktopTexture(): CanvasTexture {
  return canvasTexture(64, 48, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 48);
    grad.addColorStop(0, "#5b3fd4");
    grad.addColorStop(1, "#e04ab8");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 48);
  });
}


// A desktop on the bench. `model`: a DESKTOP_MODELS id — "imac" (the
// all-in-one, true size: 547 mm wide, so neighbours at the bench's 0.5 m
// pitch overlap), "mac-mini" or "mac-studio" (boxes, silver). `colour` tints
// the iMac (default silver). Without a model, the generic slim screen.
export function Desktop({ x, z, side, model, colour, screenMode, y = 0.95, rotY }: { x: number; z: number; side: -1 | 1; model?: string; colour?: string; screenMode?: ScreenMode; y?: number; rotY?: number }) {
  const map = useMemo(() => desktopTexture(), []);
  const spec = model ? DESKTOP_MODELS[model] : undefined;
  if (spec) {
    return (
      <group position={[x, y, z]} rotation={[0, rotY ?? benchRot(side), 0]}>
        <ModelMeshes geo={desktopGeo(spec)} colour={spec.kind === "box" ? SILVER : (colour ?? SILVER)} model={spec.id} screenMode={screenMode} />
      </group>
    );
  }
  return (
    <group position={[x, y, z]} rotation={[0, rotY ?? benchRot(side), 0]}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.22, 0.02, 0.16]} />
        <meshStandardMaterial color="#c9ced3" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.03]} />
        <meshStandardMaterial color="#c9ced3" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.5, 0.34, 0.03]} />
        <meshStandardMaterial color="#d9dce0" roughness={0.18} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.4, 0.017]}>
        <planeGeometry args={[0.46, 0.3]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  );
}

