// Every product-table device position, as a stable id (D28: "each device gets
// a stable slot id, table and position"). The 3D render (furniture.tsx) and
// the server (inspect start/end range check, D39) both read this list instead
// of each computing table-item positions their own way, so there is exactly
// one source of truth for where a device actually sits (D20's single-model
// principle: graphics work draws on this, never recomputes it).
import { TABLES, type Table } from "./world.ts";
import type { ProductKind } from "./plan.ts";

export type Side = "-x" | "+x";

export interface DeviceSlot {
  id: string; // `${tableId}:${side}:${index}`
  tableId: string;
  side: Side;
  index: number;
  x: number;
  z: number;
  rotY: number;
  kind: ProductKind;
}

const INSET = 0.2; // a product stands this far in from its table edge

function perSideOf(t: Table): number {
  return Math.max(1, Math.floor((t.d - 0.5) / 0.42) + 1);
}

function alongOf(t: Table, perSide: number, i: number): number {
  return perSide === 1 ? 0 : (i / (perSide - 1) - 0.5) * (t.d - 0.7);
}

function slotsForTable(t: Table): DeviceSlot[] {
  if (t.service) return [];
  const perSide = perSideOf(t);
  const sides: Array<{ side: Side; sign: -1 | 1; rotY: number; kind: ProductKind }> = [
    { side: "-x", sign: -1, rotY: -Math.PI / 2, kind: t.products[0] },
    { side: "+x", sign: 1, rotY: Math.PI / 2, kind: t.products[1] },
  ];
  return sides.flatMap(({ side, sign, rotY, kind }) =>
    Array.from({ length: perSide }, (_, i) => ({
      id: `${t.id}:${side}:${i}`,
      tableId: t.id,
      side,
      index: i,
      x: t.x + sign * (t.w / 2 - INSET),
      z: t.z + alongOf(t, perSide, i),
      rotY,
      kind,
    })),
  );
}

export const DEVICE_SLOTS: DeviceSlot[] = TABLES.flatMap(slotsForTable);
export const DEVICE_SLOT_BY_ID: ReadonlyMap<string, DeviceSlot> = new Map(DEVICE_SLOTS.map((s) => [s.id, s]));
