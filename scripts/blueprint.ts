#!/usr/bin/env node
// Draws the store's floor plan as an SVG from the same constants the 3D scene
// and the server use (src/shared), so the drawing cannot drift from the model.
// Run: node scripts/blueprint.ts   (writes docs/blueprint/canberra-plan.svg)
import { mkdirSync, writeFileSync } from "node:fs";
import { CEILING, FLOOR, SPAWN } from "../src/shared/protocol.ts";
import {
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BACK_SHELVES,
  BENCHES,
  COLUMN_X,
  COUNTER,
  DOOR,
  PARTITIONS,
  SERVICE_DESKS,
  TABLES,
  TABLE_D,
  TABLE_W,
  WALL_FACE_Z,
} from "../src/shared/world.ts";

const S = 48; // pixels per metre
const X0 = -9.4;
const Z_TOP = BACK_ROOM_Z1 + 0.9;
const Z_BOTTOM = FLOOR.minZ - 1.3;
const W = Math.round(9.4 * 2 * S + 120);
const H = Math.round((Z_TOP - Z_BOTTOM) * S + 150);
const px = (x: number): number => 60 + (x - X0) * S;
const py = (z: number): number => 50 + (Z_TOP - z) * S;
const bw = (m: number): number => m * S;

const out: string[] = [];
const add = (s: string): void => {
  out.push(s);
};
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, s: string, size = 11, anchor = "middle", fill = "#222", weight = "400"): void =>
  add(
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" font-family="system-ui, sans-serif">${esc(s)}</text>`,
  );
const rect = (cx: number, cz: number, w: number, d: number, fill: string, stroke = "#555", sw = 1, extra = ""): void =>
  add(
    `<rect x="${px(cx - w / 2).toFixed(1)}" y="${py(cz + d / 2).toFixed(1)}" width="${bw(w).toFixed(1)}" height="${bw(d).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`,
  );
const line = (x1: number, z1: number, x2: number, z2: number, stroke = "#222", sw = 1, extra = ""): void =>
  add(
    `<line x1="${px(x1).toFixed(1)}" y1="${py(z1).toFixed(1)}" x2="${px(x2).toFixed(1)}" y2="${py(z2).toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`,
  );

// dimension line with end ticks and a label, in metres
function dimX(x1: number, x2: number, z: number, label: string): void {
  line(x1, z, x2, z, "#1f6feb", 1);
  line(x1, z - 0.12, x1, z + 0.12, "#1f6feb", 1);
  line(x2, z - 0.12, x2, z + 0.12, "#1f6feb", 1);
  text(px((x1 + x2) / 2), py(z) - 4, label, 11, "middle", "#1f6feb", "600");
}
function dimZ(z1: number, z2: number, x: number, label: string): void {
  line(x, z1, x, z2, "#1f6feb", 1);
  line(x - 0.12, z1, x + 0.12, z1, "#1f6feb", 1);
  line(x - 0.12, z2, x + 0.12, z2, "#1f6feb", 1);
  add(
    `<text transform="translate(${(px(x) - 5).toFixed(1)} ${py((z1 + z2) / 2).toFixed(1)}) rotate(-90)" font-size="11" text-anchor="middle" fill="#1f6feb" font-weight="600" font-family="system-ui, sans-serif">${esc(label)}</text>`,
  );
}

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
add(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
text(60, 28, "Store floor plan: Canberra reference, as the 3D model currently has it (metres)", 16, "start", "#111", "700");

// ---- back room (staff only)
const BR_HALF = FLOOR.maxX + 0.6;
rect(0, (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2, BR_HALF * 2, BACK_ROOM_Z1 - BACK_ROOM_Z0, "#f4f1e8", "#9a9484", 1.5, 'stroke-dasharray="6 4"');
text(px(0), py(BACK_ROOM_Z1) + 16, "BACK ROOM (staff only): same footprint as the shop", 12, "middle", "#6b6556", "600");
for (const u of BACK_SHELVES) rect(u.x, u.z, u.w, u.d, "#cfd3d8", "#6b7280", 1);
text(px(0), py(BACK_SHELVES[0].z) + 4, "labelled shelving rows", 10, "middle", "#555");
for (const d of SERVICE_DESKS) rect(d.x, d.z, d.w, d.d, "#b7c4d0", "#355a7a", 1.2);
text(px(0), py(SERVICE_DESKS[0].z) + 4, "REPAIR BENCHES (technicians stand behind)", 10, "middle", "#355a7a");
rect(0, BACK_ROOM_Z1 - 0.35, 15, 0.4, "#cfd3d8", "#6b7280", 1);
text(px(0), py(BACK_ROOM_Z1 - 0.35) + 3, "parts wall", 9, "middle", "#555");

// ---- shop floor
const SW = FLOOR.maxX - FLOOR.minX;
rect(0, (FLOOR.minZ + FLOOR.maxZ) / 2, SW, FLOOR.maxZ - FLOOR.minZ, "#f6f7f8", "none", 0);

// side benches (wall shelves) and what sits above them
for (const b of BENCHES) rect(b.x, b.z, b.w, b.d, "#e6cfa8", "#8a6a2f", 1.2);
// lightboxes (white panels on the side walls): z centre, width
for (const side of [-1, 1]) {
  const x = side * (FLOOR.maxX + 0.35);
  for (const [z, w] of [
    [-5.0, 3.2],
    [-1.9, 2.0],
    [0.2, 0.9],
  ]) {
    rect(x, z, 0.12, w, "#ffffff", "#8aa", 1.2);
  }
  // dark shelving bays
  for (let i = 0; i < 4; i++) {
    const zc = 1.4 + 1.2 / 2 + i * 1.28;
    rect(x, zc, 0.2, 1.2, "#3b3f45", "#222", 1);
  }
  // two monitors on each bench
  for (const z of [-2.4, -1.4]) rect(side * 7.55, z, 0.12, 0.7, "#1a4fb8", "#0b2a6b", 1);
}
text(px(-8.55), py(-5.0), "lightbox", 9, "middle", "#678");
text(px(-8.55), py(3.7), "dark bays", 9, "middle", "#fff");

// tables
TABLES.forEach((t, i) => {
  rect(t.x, t.z, TABLE_W, TABLE_D, "#e6cfa8", "#8a6a2f", 1.2);
  text(px(t.x), py(t.z) + 4, `T${i + 1}`, 10, "middle", "#5a4210", "700");
});
// product family per column
text(px(COLUMN_X[0]), py(-6.0), "phones / watches", 10, "middle", "#555");
text(px(COLUMN_X[1]) + 0, py(-5.5), "laptops / tablets", 10, "middle", "#555");
text(px(COLUMN_X[2]), py(-6.0), "audio / trackers", 10, "middle", "#555");

// bar, stools, staff partitions
rect(COUNTER.x, COUNTER.z, COUNTER.w, COUNTER.d, "#d9b98c", "#8a6a2f", 1.5);
text(px(0), py(COUNTER.z) + 4, "SERVICE BAR (Genius Bar / checkout)", 11, "middle", "#4a3510", "700");
for (let k = 0; k < 7; k++) {
  const x = -4.5 + k * 1.5;
  add(`<circle cx="${px(x).toFixed(1)}" cy="${py(COUNTER.z - 0.95).toFixed(1)}" r="${bw(0.2).toFixed(1)}" fill="#e6cfa8" stroke="#8a6a2f"/>`);
}
for (const p of PARTITIONS) rect(p.x, p.z, p.w, p.d, "#8a6a2f", "#5a4210", 1);
text(px(0), py(6.85) + 4, "staff space behind the bar", 10, "middle", "#555");

// ---- walls
const wallStroke = "#111";
// front glass with mullions
line(FLOOR.minX - 0.5, FLOOR.minZ - 0.5, FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, "#5aa9d6", 4);
for (const x of [-6, -3, 0, 3, 6]) line(x, FLOOR.minZ - 0.7, x, FLOOR.minZ - 0.3, "#3a7ca5", 3);
text(px(0), py(FLOOR.minZ - 0.5) + 18, "GLASS FRONT / ENTRANCE", 11, "middle", "#2a6a95", "700");
// side walls and back wall (with the door gap)
line(FLOOR.minX - 0.5, FLOOR.minZ - 0.5, FLOOR.minX - 0.5, WALL_FACE_Z + 0.2, wallStroke, 3);
line(FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.2, wallStroke, 3);
line(FLOOR.minX - 0.5, WALL_FACE_Z + 0.1, DOOR.minX, WALL_FACE_Z + 0.1, wallStroke, 3);
line(DOOR.maxX, WALL_FACE_Z + 0.1, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.1, wallStroke, 3);
line(DOOR.minX, WALL_FACE_Z + 0.1, DOOR.maxX, WALL_FACE_Z + 0.1, "#c0392b", 4, 'stroke-dasharray="4 3"');
text(px((DOOR.minX + DOOR.maxX) / 2), py(WALL_FACE_Z + 0.1) - 8, "staff door (flush)", 10, "middle", "#c0392b", "700");

// ---- spawn
add(`<circle cx="${px(SPAWN.x).toFixed(1)}" cy="${py(SPAWN.z).toFixed(1)}" r="6" fill="#2a9d8f"/>`);
text(px(SPAWN.x + 2.3), py(SPAWN.z) + 4, "visitor spawn (faces the shop)", 10, "start", "#2a9d8f", "600");

// ---- dimensions
dimX(FLOOR.minX, FLOOR.maxX, FLOOR.minZ - 1.25, `${SW} m wide`);
dimZ(FLOOR.minZ, FLOOR.maxZ, FLOOR.minX - 0.95, `${FLOOR.maxZ - FLOOR.minZ} m deep`);
dimZ(BACK_ROOM_Z0, BACK_ROOM_Z1, FLOOR.minX - 0.95, `${(BACK_ROOM_Z1 - BACK_ROOM_Z0).toFixed(0)} m deep`);
dimX(COLUMN_X[0] - TABLE_W / 2, COLUMN_X[0] + TABLE_W / 2, FLOOR.minZ + 0.35, `${TABLE_W} m`);
dimX(COLUMN_X[0] + TABLE_W / 2, COLUMN_X[1] - TABLE_W / 2, FLOOR.minZ + 0.35, `${(COLUMN_X[1] - COLUMN_X[0] - TABLE_W).toFixed(1)} m aisle`);
dimX(COUNTER.x - COUNTER.w / 2, COUNTER.x + COUNTER.w / 2, 7.72, `bar ${COUNTER.w} m`);
dimZ(TABLES[0].z - TABLE_D / 2, TABLES[0].z + TABLE_D / 2, COLUMN_X[0] - TABLE_W / 2 - 0.35, `${TABLE_D} m`);
dimZ(TABLES[0].z + TABLE_D / 2, TABLES[1].z - TABLE_D / 2, COLUMN_X[0] - TABLE_W / 2 - 0.35, "1.2 m");

// ---- legend / notes
const ly = H - 62;
text(60, ly, `Ceiling ${CEILING} m. Tables ${TABLE_W} x ${TABLE_D} m, four products each. Columns at x = ${COLUMN_X.join(", ")}.`, 11, "start", "#333");
text(60, ly + 16, "From the photos: three table columns, five rows each side and three in the middle, wall benches, bar about 3/4 of the back wall, glass front about 3.8x as wide as it is tall.", 11, "start", "#333");
text(60, ly + 32, "Assumed, not measurable: shop depth (15 m), back-room size (your instruction: same as the shop), door position (your note: left of the bar), real table sizes.", 11, "start", "#a33");
add("</svg>");

mkdirSync("docs/blueprint", { recursive: true });
writeFileSync("docs/blueprint/canberra-plan.svg", out.join("\n"));
console.log(`wrote docs/blueprint/canberra-plan.svg (${W} x ${H})`);
