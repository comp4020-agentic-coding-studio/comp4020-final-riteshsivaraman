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

// Shared by every graphics module: colours, canvas textures, instanced boxes,
// signs. Keep this small; each module owns its own look.

// The store's scenery: plain geometry and flat colour on purpose (see
// SCOPE.md 3f and 3g). Nothing here is solid except what world.ts lists, so
// what you bump into and what is drawn cannot drift apart.

export const WOOD = "#d9b98c";

export const WALL = "#d9dcdf";

export const SILVER = "#c9ced3";

export const STAND = "#9aa1a8";

export const DEVICE_COLOURS = ["#2b2f36", "#c9ced3", "#e8d9c4", "#3a4a63", "#a7b7a4", "#d8b4a0"];

export const BOX_COLOURS = ["#f2f2f0", "#dfe6ee", "#e9e2d6", "#cfd8d2", "#f3d9c8", "#d6d9f0"];

export const HALF_W = FLOOR.maxX + 0.6;

export const DOOR_W = DOOR.maxX - DOOR.minX;

export const DOOR_X = (DOOR.minX + DOOR.maxX) / 2;

export const DOOR_H = PLAN_DOOR_H;

export const BENCH_X = Math.abs(BENCHES[0].x); // the benches stand this far from the middle

export const BENCH_HALF = BENCHES[0].d / 2;



// Side walls, from the reference close-up: three tones of brushed grey, big
// recessed lightboxes toward the front, then dark charcoal shelving bays
// stacked with white boxes toward the back. The bench below carries rows of
// devices laid flat, and a couple of monitors.
export const FACE_X = FLOOR.maxX + 0.4; // inner face of the side walls

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function labelTexture(text: string, fg = "#1d2430", bg = "#ffffff"): CanvasTexture {
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



// Many boxes in one draw call: shelves, stock and boxed products.
export interface Cuboid {
  x: number;
  y: number; // centre height
  z: number;
  w: number;
  h: number;
  d: number;
  colour: string;
}


export function BoxField({ boxes, roughness = 0.7 }: { boxes: Cuboid[]; roughness?: number }) {
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


export function Sign({
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


export type Kind =
  | "phone"
  | "tablet"
  | "tabletKb"
  | "laptop"
  | "watch"
  | "earbuds"
  | "headphones"
  | "speaker"
  | "airtag";


// A soft dark blob on the floor, in place of real shadows (cheap on phones).
export let blobTex: CanvasTexture | null = null;

export function blobTexture(): CanvasTexture {
  if (blobTex) return blobTex;
  blobTex = canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    r.addColorStop(0, "rgba(20,24,30,0.32)");
    r.addColorStop(1, "rgba(20,24,30,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  return blobTex;
}

export function BlobShadow({ w, d, y = 0.006 }: { w: number; d: number; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} />
    </mesh>
  );
}


export const std = (c: string, r = 0.4, m = 0.3) => <meshStandardMaterial color={c} roughness={r} metalness={m} />;
