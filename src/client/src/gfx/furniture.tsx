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
import { Device } from "./Device.tsx";


// Which products stand on each column of tables: phones, watches and earbuds,
// laptops, tablets, then audio and trackers.


// A product table: a top on four legs, one product on each side facing
// outward, so a person standing at any side sees their own product.
// A service table is the same without products, with a stool either side.
export function Table({ box }: { box: TableSpec }) {
  const kinds = box.products as readonly Kind[];
  const inset = 0.2; // a product stands this far in from its edge
  // Products stand only on the two long sides (Ritesh, 2026-10-11): a row of
  // the same product along each, a person standing at that side has them in
  // front of them. The ends are bare.
  const perSide = Math.max(1, Math.floor((box.d - 0.5) / 0.42) + 1);
  const along = (i: number): number => (perSide === 1 ? 0 : (i / (perSide - 1) - 0.5) * (box.d - 0.7));
  const items = box.service
    ? []
    : [
        ...Array.from({ length: perSide }, (_, i) => ({
          x: box.x - (box.w / 2 - inset),
          z: box.z + along(i),
          rotY: -Math.PI / 2,
          kind: kinds[0],
        })),
        ...Array.from({ length: perSide }, (_, i) => ({
          x: box.x + (box.w / 2 - inset),
          z: box.z + along(i),
          rotY: Math.PI / 2,
          kind: kinds[1],
        })),
      ];
  return (
    <group>
      <group position={[box.x, 0, box.z]}>
        <BlobShadow w={box.w + 0.9} d={box.d + 0.9} />
      </group>
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
          colour={DEVICE_COLOURS[(((i + Math.round(box.z * 3) + 6) % DEVICE_COLOURS.length) + DEVICE_COLOURS.length) % DEVICE_COLOURS.length]}
        />
      ))}
    </group>
  );
}


export const BAR_TOP = 0.06; // thickness of the bar top

export const BAR_OVERHANG = 0.3; // how far the top stands out in front of its base


// A short ledge at bench height in front of part of each bay, carrying one
// product (BAY_LEDGES in plan.ts says which half and what).
export function BayLedges() {
  return (
    <group>
      {([1, -1] as const).flatMap((side) =>
        BAY_LEDGES[side === 1 ? "+x" : "-x"].map((l) => {
          const c = bayCentre(l.bay);
          const z = l.half === "front" ? c - BAY_W / 4 : c + BAY_W / 4;
          const x = side * (FACE_X - LEDGE_DEPTH / 2);
          return (
            <group key={`${side}:${l.bay}`}>
              <mesh position={[x, 0.95 - 0.06, z]}>
                <boxGeometry args={[LEDGE_DEPTH, 0.12, BAY_W / 2]} />
                <meshStandardMaterial color={WOOD} roughness={0.5} />
              </mesh>
              <Device kind={l.kind} x={x} y={0.95} z={z} rotY={side === 1 ? -Math.PI / 2 : Math.PI / 2} colour="#c9ced3" />
            </group>
          );
        }),
      )}
    </group>
  );
}


// A plain stool, for the service tables.
export function TableStool({ x, z }: { x: number; z: number }) {
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


export function WallBench({ box, side }: { box: Box; side: -1 | 1 }) {
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

export function Stools() {
  return (
    <group>
      {BAR_STOOLS.map((st) => (
        <group key={st.id} position={[st.x, 0, st.z]}>
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.03, 0.03, STOOL_SEAT_H - 0.02, 8]} />
            <meshStandardMaterial color="#8d9399" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, STOOL_SEAT_H, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 20]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// The service bar: a base set back from a top that overhangs it, so a stool
// tucks under the edge and knees go beneath; the staff-side partitions; and the
// bar stools.
export function ServiceBar() {
  return (
    <group>
      {/* the service bar, its staff-side partitions and stools */}
      {/* a base set back 0.3 m and a top that overhangs it, so a stool tucks
          under the edge and knees go beneath, as on a real bar */}
      <mesh position={[COUNTER.x, (COUNTER.h - BAR_TOP) / 2, COUNTER.z + BAR_OVERHANG / 2]}>
        <boxGeometry args={[COUNTER.w - 0.1, COUNTER.h - BAR_TOP, COUNTER.d - BAR_OVERHANG]} />
        <meshStandardMaterial color={WOOD} roughness={0.55} />
      </mesh>
      <mesh position={[COUNTER.x, COUNTER.h - BAR_TOP / 2, COUNTER.z]}>
        <boxGeometry args={[COUNTER.w, BAR_TOP, COUNTER.d]} />
        <meshStandardMaterial color="#e6cfa8" roughness={0.5} />
      </mesh>
      {PARTITIONS.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2, p.z]}>
          <boxGeometry args={[p.w, p.h, p.d]} />
          <meshStandardMaterial color={WOOD} roughness={0.55} />
        </mesh>
      ))}
      <Stools />

    </group>
  );
}

// Piers, the dark bay panels and the shelf plates of the product bays.
export function bayFrames(): Cuboid[] {
  const frames: Cuboid[] = [];
  const bottom = BAY_SHELVES.panelBottom;
  const top = BAY_SHELVES.panelTop;
  for (const side of [-1, 1]) {
    // piers: lighter strips from the bench to the ceiling, so the bays read as
    // indented between them; below the bench the grey panel runs unbroken
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zc = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      frames.push({ x: side * (FACE_X - 0.15), y: (bottom + CEILING) / 2, z: zc, w: 0.3, h: CEILING - bottom, d: PIER_W, colour: "#b4b8bd" });
    }
    for (let i = 0; i < BAY_COUNT; i++) {
      const zc = bayCentre(i);
      frames.push({ x: side * (FACE_X - 0.02), y: (bottom + top) / 2, z: zc, w: 0.04, h: top - bottom, d: BAY_W, colour: "#3b3f45" });
      for (let k = 0; k < BAY_SHELVES.count; k++) {
        const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
        frames.push({ x: side * (FACE_X - 0.14), y, z: zc, w: 0.24, h: 0.025, d: BAY_W - 0.04, colour: "#8b9096" });
      }
    }
  }
  return frames;
}


// Staff-only back room: rows of labelled shelving, two repair benches with
// technicians, and a parts wall, behind the flush door left of the bar.
export const BACK_LABELS = [
  ["PHONES  BLK", "PHONES  SLV", "TABLETS"],
  ["LAPTOPS", "WATCHES", "EARBUDS"],
  ["CASES", "CHARGERS", "CABLES"],
  ["BANDS", "KEYBOARDS", "SMART HOME"],
];

// The rolling high-density shelves in the inventory store, with their floor
// rails, stock boxes and row labels.
export function StorageRacks() {
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
    // the rolling shelves sit on floor rails, so they read as movable stock
    for (const u of BACK_SHELVES) frames.push({ x: u.x, y: 0.04, z: u.z, w: u.w + 0.1, h: 0.08, d: u.d + 0.1, colour: "#4b5058" });
    return { frames, stock };
  }, []);
  return (
    <group>
      <BoxField boxes={frames} roughness={0.5} />
      <BoxField boxes={stock} />
      {BACK_SHELF_ROW_Z.map((z, r) =>
        BACK_SHELF_UNIT_X.map((x, u) => (
          <Sign key={`${r}:${u}`} text={BACK_LABELS[r][u]} position={[x, 2.6, z - 0.33]} rotY={Math.PI} w={1.7} />
        )),
      )}
    </group>
  );
}

// The repair benches in the genius room: a work surface, a mat, open devices
// and parts trays.
export function RepairBenches() {
  return (
    <group>
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
    </group>
  );
}

// Furniture in the areas behind the shop: a desk and computers, a break table,
// lockers, restrooms and the pallets at the loading dock (positions come from
// BACK_FURNITURE in world.ts).
export function BackFurniture() {
  return (
    <group>
      {BACK_FURNITURE.map((f, i) => {
        if (f.kind === "lockers") {
          return (
            <group key={i}>
              <mesh position={[f.x, f.h / 2, f.z]}>
                <boxGeometry args={[f.w, f.h, f.d]} />
                <meshStandardMaterial color="#6f8fa8" roughness={0.5} metalness={0.3} />
              </mesh>
              {Array.from({ length: 7 }, (_, k) => (
                <mesh key={k} position={[f.x + f.w / 2 + 0.005, f.h / 2, f.z - f.d / 2 + 0.2 + k * 0.4]}>
                  <boxGeometry args={[0.01, f.h - 0.2, 0.02]} />
                  <meshStandardMaterial color="#2c3f4f" />
                </mesh>
              ))}
            </group>
          );
        }
        if (f.kind === "restroom") {
          return (
            <group key={i}>
              <mesh position={[f.x, f.h / 2, f.z]}>
                <boxGeometry args={[f.w, f.h, f.d]} />
                <meshStandardMaterial color="#dfe3e7" roughness={0.8} />
              </mesh>
              {[-0.6, 0.6].map((dx) => (
                <mesh key={dx} position={[f.x + dx, 1.05, f.z - f.d / 2 - 0.01]}>
                  <boxGeometry args={[0.8, 2.0, 0.03]} />
                  <meshStandardMaterial color="#9aa5b1" roughness={0.6} />
                </mesh>
              ))}
              <Sign text="RESTROOMS" position={[f.x, 2.25, f.z - f.d / 2 - 0.03]} rotY={Math.PI} w={1.6} fg="#ffffff" bg="#2f3a4a" />
            </group>
          );
        }
        if (f.kind === "pallet") {
          return (
            <group key={i}>
              <mesh position={[f.x, 0.08, f.z]}>
                <boxGeometry args={[f.w, 0.16, f.d]} />
                <meshStandardMaterial color="#b58a54" roughness={0.9} />
              </mesh>
              <mesh position={[f.x, 0.16 + (f.h - 0.16) / 2, f.z]}>
                <boxGeometry args={[f.w - 0.1, f.h - 0.16, f.d - 0.1]} />
                <meshStandardMaterial color="#c9a46b" roughness={0.9} />
              </mesh>
            </group>
          );
        }
        if (f.kind === "computers") {
          return (
            <group key={i}>
              <mesh position={[f.x, f.h - 0.02, f.z]}>
                <boxGeometry args={[f.w, 0.04, f.d]} />
                <meshStandardMaterial color="#e6cfa8" roughness={0.5} />
              </mesh>
              {[-0.9, 0, 0.9].map((dz) => (
                <Device key={dz} kind="tabletKb" x={f.x} y={f.h} z={f.z + dz} rotY={-Math.PI / 2} colour="#3a4a63" />
              ))}
            </group>
          );
        }
        // a desk or a table: a top on four legs
        return (
          <group key={i}>
            <mesh position={[f.x, f.h - 0.03, f.z]}>
              <boxGeometry args={[f.w, 0.06, f.d]} />
              <meshStandardMaterial color="#e6cfa8" roughness={0.5} />
            </mesh>
            {[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) => (
                <mesh key={`${sx}:${sz}`} position={[f.x + sx * (f.w / 2 - 0.05), (f.h - 0.06) / 2, f.z + sz * (f.d / 2 - 0.05)]}>
                  <boxGeometry args={[0.05, f.h - 0.06, 0.05]} />
                  <meshStandardMaterial color="#8d9399" metalness={0.5} />
                </mesh>
              )),
            )}
            {f.kind === "desk" && <Device kind="laptop" x={f.x} y={f.h} z={f.z - 0.1} rotY={0} colour="#2b2f36" />}
          </group>
        );
      })}
    </group>
  );
}
