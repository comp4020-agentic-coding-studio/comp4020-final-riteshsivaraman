// Draws the back of house two ways side by side: as the model has it now
// (src/shared/world.ts) and as a proposed redesign (the PROPOSED data below).
// Nothing here changes the model. Run: node scripts/back-redesign.ts
// Orientation as in the other blueprint drawings: +x on the LEFT, the shop is
// below, deeper into the back room is up. Distances are metres from the back
// room's first row (z = 0) and from the centre line (x = 0).
import { writeFileSync } from "node:fs";
import { BACK_AREAS, BACK_DOOR, BACK_DOORWAYS, BACK_FURNITURE, BACK_ROOM_Z0, BACK_SHELVES, BACK_WALLS, DOOR, SERVICE_DESKS } from "../src/shared/world.ts";
import { FLOOR } from "../src/shared/protocol.ts";

const S = 38; // pixels per metre
const W = 12; // metres across
const D = 18.2; // metres deep
const PAD = 40;
const px = (x: number): number => PAD + (W / 2 - x) * S; // +x to the left
const py = (z: number): number => PAD + (D - z) * S; // deeper is up
const rect = (cx: number, cz: number, w: number, d: number, fill: string, stroke = "#6f7780", sw = 1, extra = ""): string =>
  `<rect x="${px(cx + w / 2).toFixed(1)}" y="${py(cz + d / 2).toFixed(1)}" width="${(w * S).toFixed(1)}" height="${(d * S).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const zone = (x0: number, x1: number, z0: number, z1: number, fill: string): string => rect((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, fill, "none", 0);
const line = (x0: number, z0: number, x1: number, z1: number, stroke = "#3d444b", sw = 3, dash = ""): string =>
  `<line x1="${px(x0).toFixed(1)}" y1="${py(z0).toFixed(1)}" x2="${px(x1).toFixed(1)}" y2="${py(z1).toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linecap="butt"/>`;
const esc = (t: string): string => t.replace(/&/g, "&amp;");
const text = (x: number, z: number, t: string, size = 11, fill = "#2b3036", anchor = "middle", weight = "400"): string =>
  `<text x="${px(x).toFixed(1)}" y="${py(z).toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" font-family="system-ui,sans-serif">${esc(t)}</text>`;
const arrow = (x0: number, z0: number, x1: number, z1: number, colour: string): string =>
  `<path d="M${px(x0).toFixed(1)} ${py(z0).toFixed(1)} L${px(x1).toFixed(1)} ${py(z1).toFixed(1)}" stroke="${colour}" stroke-width="3" fill="none" marker-end="url(#a-${colour.slice(1)})" stroke-dasharray="7 5" opacity="0.9"/>`;
const frame = (): string => rect(0, D / 2, W, D, "#f7f6f1", "#2b3036", 3);
const dim = (x0: number, z0: number, x1: number, z1: number, label: string): string =>
  line(x0, z0, x1, z1, "#1f66c1", 1.2) + text((x0 + x1) / 2 + (x0 === x1 ? 0.35 : 0), (z0 + z1) / 2 + (z0 === z1 ? 0.22 : 0), label, 10, "#1f66c1", "middle", "600");

const COL = {
  hall: "#eef0f2",
  lane: "#e3f2e8",
  spine: "#dfe9f5",
  rooms: "#f4ece0",
  repair: "#d9e5f3",
  receiving: "#fbf0c9",
  wet: "#e9e4f3",
  office: "#ece5d8",
};

// ---------- current, from the model ----------
function current(): string {
  const o: string[] = [frame()];
  for (const a of BACK_AREAS) {
    const fill = a.id === "storage" ? COL.hall : a.id === "repair" ? COL.repair : a.id === "dock" ? COL.receiving : COL.office;
    o.push(zone(a.x0, a.x1, a.z0 - BACK_ROOM_Z0, a.z1 - BACK_ROOM_Z0, fill));
  }
  for (const s of BACK_SHELVES) o.push(rect(s.x, s.z - BACK_ROOM_Z0, s.w, s.d, "#c4cad1"));
  for (const w of BACK_WALLS) o.push(rect(w.x, w.z - BACK_ROOM_Z0, w.w, w.d, "#4a5058", "none", 0));
  for (const d of BACK_DOORWAYS) o.push(rect(d.x, d.z - BACK_ROOM_Z0, 1.0, 0.2, "#f7f6f1", "#c0392b", 1));
  for (const f of BACK_FURNITURE) o.push(rect(f.x, f.z - BACK_ROOM_Z0, f.w, f.d, f.kind === "pallet" ? "#c9a46b" : f.kind === "lockers" ? "#7f95aa" : f.kind === "restroom" ? "#d7dbe0" : "#e3cfa5"));
  for (const d of SERVICE_DESKS) o.push(rect(d.x, d.z - BACK_ROOM_Z0, d.w, d.d, "#b0c0d2"));
  o.push(rect((BACK_DOOR.minX + BACK_DOOR.maxX) / 2, D, BACK_DOOR.maxX - BACK_DOOR.minX, 0.2, "#ffd23f", "#8a6a2f", 1));
  o.push(rect((DOOR.minX + DOOR.maxX) / 2, 0, DOOR.maxX - DOOR.minX, 0.2, "#c0392b", "#c0392b", 1));
  o.push(text(0, 3.9, "12 shelf units in four rows", 11, "#555"));
  o.push(text(-3.6, 8.0, "aisles 0.98 m", 10, "#1f66c1", "middle", "600"));
  o.push(text(0, 1.2, "", 1));
  return o.join("\n");
}

// ---------- proposed ----------
const SPINE = { z0: 9.0, z1: 10.8 };
const LANE = { x0: 4.2, x1: 6 };
function proposed(): string {
  const o: string[] = [frame()];
  // zones
  o.push(zone(-6, 6, 0, 2.0, COL.spine)); // concourse
  o.push(zone(-6, LANE.x0, 2.0, SPINE.z0, COL.hall)); // stock hall
  o.push(zone(LANE.x0, 6, 2.0, SPINE.z0, COL.lane)); // east lane
  o.push(zone(-6, 6, SPINE.z0, SPINE.z1, COL.spine)); // spine
  o.push(zone(-2.2, 2.2, SPINE.z1, D, COL.receiving)); // receiving
  o.push(zone(-6, -3.4, SPINE.z1, 13.4, COL.wet)); // restrooms
  o.push(zone(-3.4, -2.2, SPINE.z1, 13.4, COL.rooms)); // cleaner's store
  o.push(zone(-6, -2.2, 13.4, D, COL.rooms)); // break and training
  o.push(zone(2.2, 6, SPINE.z1, 15.4, COL.repair)); // repair
  o.push(zone(2.2, 6, 15.4, D, COL.office)); // office
  // walls
  const wall = (x0: number, z0: number, x1: number, z1: number): string => line(x0, z0, x1, z1, "#3d444b", 4);
  // wall along z = 10.8 with doorways at the restrooms, cleaner's store and repair room
  wall(-6, SPINE.z1, -5.2, SPINE.z1) && o.push(wall(-6, SPINE.z1, -5.2, SPINE.z1));
  o.push(wall(-4.2, SPINE.z1, -3.3, SPINE.z1));
  o.push(wall(-2.7, SPINE.z1, -2.2, SPINE.z1));
  o.push(wall(2.2, SPINE.z1, 4.6, SPINE.z1));
  o.push(wall(5.6, SPINE.z1, 6, SPINE.z1));
  o.push(wall(-2.2, SPINE.z1, -2.2, 14.5), wall(-2.2, 15.5, -2.2, D)); // west of receiving, door to the break room
  o.push(wall(2.2, SPINE.z1, 2.2, 16.5), wall(2.2, 17.5, 2.2, 18.2 - 0.0)); // east of receiving, window door to the office
  o.push(wall(-3.4, SPINE.z1, -3.4, 13.4));
  o.push(wall(-6, 13.4, -2.2, 13.4));
  o.push(wall(2.2, 15.4, 6, 15.4));
  // fixtures: lockers on the shop-side wall, sign-in, shelves
  o.push(rect(-3.9, 0.3, 3.6, 0.5, "#7f95aa"));
  o.push(text(-3.9, 0.95, "lockers (14)", 10, "#2b3036"));
  o.push(rect(LANE.x0 + 0.5, 0.35, 0.8, 0.4, "#e3cfa5"));
  o.push(text(LANE.x0 + 0.5, 1.0, "sign-in", 10));
  for (const rz of [4.0, 6.7]) for (const cx of [-4.4, -0.9, 2.6]) o.push(rect(cx, rz, 2.4, 1.24, "#c4cad1"));
  o.push(text(-1, 5.35, "stock hall: 12 banks back to back in two runs", 11, "#555"));
  // dividers inside a double bank
  for (const rz of [4.0, 6.7]) for (const cx of [-4.4, -0.9, 2.6]) o.push(line(cx - 1.2, rz, cx + 1.2, rz, "#9aa2ab", 1));
  // receiving
  for (const [cx, cz] of [[-1.0, 16.7], [1.0, 16.7]]) o.push(rect(cx, cz, 1.0, 1.0, "#c9a46b"));
  o.push(rect(-1.5, 12.5, 1.2, 0.6, "#e3cfa5"));
  o.push(text(-1.5, 11.9, "goods-in desk", 9));
  o.push(rect(1.4, 12.6, 0.7, 1.0, "#a8b0b8"));
  o.push(text(1.4, 11.9, "trolleys", 9));
  o.push(text(0, 14.8, "receiving and staging", 11, "#2b3036", "middle", "600"));
  o.push(rect((BACK_DOOR.minX + BACK_DOOR.maxX) / 2, D, BACK_DOOR.maxX - BACK_DOOR.minX, 0.2, "#ffd23f", "#8a6a2f", 1));
  // repair
  for (const cz of [12.0, 14.2]) o.push(rect(5.55, cz, 0.8, 2.0, "#b0c0d2"));
  o.push(rect(2.65, 12.8, 0.5, 1.8, "#a8b0b8"));
  o.push(text(4.0, 13.2, "GENIUS ROOM: REPAIR", 11, "#2b3036", "middle", "600"));
  o.push(text(4.0, 12.4, "2 benches, parts cabinet", 9));
  // office
  o.push(rect(4.4, 16.9, 1.6, 0.8, "#e3cfa5"));
  o.push(text(4.1, 15.9, "MANAGER'S OFFICE", 11, "#2b3036", "middle", "600"));
  // break and training
  o.push(rect(-5.7, 15.4, 0.6, 2.4, "#c7ccd2"));
  o.push(text(-5.25, 16.8, "kitchenette", 9, "#2b3036", "start"));
  o.push(rect(-3.8, 14.6, 1.2, 0.9, "#e3cfa5"));
  o.push(rect(-4.2, 17.7, 2.8, 0.7, "#b0c0d2"));
  o.push(text(-4.2, 18.0, "", 1));
  o.push(text(-4.1, 17.2, "training computers", 9));
  o.push(text(-4.1, 16.0, "BREAK & TRAINING", 11, "#2b3036", "middle", "600"));
  // restrooms and cleaner's store
  o.push(rect(-5.1, 12.4, 1.6, 1.6, "#d7dbe0"));
  o.push(rect(-4.2, 11.5, 0.2, 0.01, "#d7dbe0"));
  o.push(text(-4.7, 12.0, "RESTROOMS", 10, "#2b3036", "middle", "600"));
  o.push(text(-2.8, 12.0, "clean", 9));
  // painted lane edge and labels
  o.push(line(LANE.x0, 2.0, LANE.x0, SPINE.z0, "#2e8b57", 2, "6 5"));
  o.push(text(5.1, 5.5, "STAFF LANE", 10, "#2e8b57", "middle", "700"));
  o.push(text(0, 1.0, "RUNNER CONCOURSE", 10, "#2b3036", "middle", "700"));
  o.push(text(0, SPINE.z0 + 0.9, "SPINE 1.8 m", 10, "#2b3036", "middle", "700"));
  o.push(text(0, 2.7, "", 1));
  // door and flows
  o.push(rect((DOOR.minX + DOOR.maxX) / 2, 0, DOOR.maxX - DOOR.minX, 0.2, "#c0392b", "#c0392b", 1));
  o.push(arrow(4.9, 0.4, 5.1, 10.6, "#2e8b57")); // staff to repair
  o.push(arrow(0.4, 17.4, 0.4, 9.6, "#c07a1f")); // deliveries in
  o.push(arrow(0.4, 9.2, 2.2, 7.4, "#c07a1f"));
  o.push(arrow(3.6, 3.0, 4.6, 0.6, "#1f66c1")); // runner to shop
  // dimensions
  o.push(dim(-5.0, 8.95, -5.0, 7.32, "1.7"));
  o.push(dim(-5.0, 6.08, -5.0, 4.62, "1.5"));
  o.push(dim(-5.0, 3.38, -5.0, 2.0, "1.4"));
  return o.join("\n");
}

const markers = ["#2e8b57", "#c07a1f", "#1f66c1"]
  .map((c) => `<marker id="a-${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`)
  .join("");

const PW = W * S + PAD * 2;
const PH = D * S + PAD * 2 + 30;
const panel = (title: string, sub: string, inner: string, dx: number): string =>
  `<g transform="translate(${dx} 0)"><text x="${PAD}" y="26" font-size="17" font-weight="700" font-family="system-ui,sans-serif">${title}</text><text x="${PAD}" y="44" font-size="12" fill="#555" font-family="system-ui,sans-serif">${sub}</text><g transform="translate(0 30)">${inner}</g></g>`;

const table = `
<g font-family="system-ui,sans-serif" font-size="12" transform="translate(${PAD} ${PH + 10})">
  <text font-weight="700" font-size="14">What changes (12 m x 18.2 m footprint, the shop's, unchanged)</text>
  <text y="22">Shelving: 12 units in four rows, aisles 0.98 m  ->  12 banks in two double-sided runs, aisles 1.4 to 1.7 m, a cross-passage between every unit.</text>
  <text y="40">Entry: one flush door, straight into shelving  ->  the same door into a clear 2 m concourse, then a clear 1.8 m staff lane down the east side to the spine.</text>
  <text y="58">Genius repair: far end of the back, 30 m2, reached through the shelving  ->  next to the staff lane (about 11 m from the door), 17 m2, door on the spine.</text>
  <text y="76">Deliveries: roller door, pallets in a strip at the far wall  ->  open receiving 4.4 x 7.4 m straight from the dock door onto the spine, then the hall.</text>
  <text y="94">Rooms: three rooms off a shelving hall  ->  six rooms off a spine, none reached through shelving; break room and office both have a door onto receiving.</text>
  <text y="112">Unchanged: footprint, staff door position, dock door width (4 m), role clamping, ceiling 3 m. Moves: partitions, shelf positions, BACK_AREAS, furniture.</text>
  <text y="134" fill="#c0392b">Assumed, not measured: all of it. Room sizes are my layout, as the first one was; the three flows (green staff, amber deliveries, blue runner) are the design argument.</text>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW * 2} ${PH + 170}" width="${PW * 2}" height="${PH + 170}"><defs>${markers}</defs>
<rect width="100%" height="100%" fill="#ffffff"/>
${panel("Back of house now", "as the model has it: shelving first, rooms behind, dock at the far wall", current(), 0)}
${panel("Back of house, proposed", "entry concourse, a clear staff lane, a spine, open receiving", proposed(), PW)}
${table}
</svg>`;
writeFileSync("docs/blueprint/back-redesign.svg", svg);
console.log("wrote docs/blueprint/back-redesign.svg");
void FLOOR;
