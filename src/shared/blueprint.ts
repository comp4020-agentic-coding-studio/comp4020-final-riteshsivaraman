// Draws the store's blueprints as SVG, from the same constants the 3D scene,
// the server and the checks use (world.ts, plan.ts, protocol.ts). Nothing here
// has numbers of its own, so a drawing cannot disagree with the model: change
// the model and the committed drawings fail a check until they are regenerated
// and approved again.
//
// Everything is drawn as a visitor standing at the entrance, facing in, would
// see it: the +x wall is on the visitor's LEFT, the -x wall on their right.
import { MALL, ROUTES } from "./mall.ts";
import { CEILING, FLOOR, SPAWN, STORE_Y, WALKWAY_DEPTH } from "./protocol.ts";
import {
  BACK_WALL,
  BAY_LEDGES,
  BAY_SHELVES,
  LEDGE_DEPTH,
  BAY_SIGN_Y,
  CARD_READER,
  CEILING_SPEC,
  DESKTOP,
  DOOR_H,
  FLOOR_REVEAL,
  GLASS,
  LIGHTBOX_BOTTOM,
  LIGHTBOX_H,
  MONITOR,
  SIDE_WALL,
  STOOL_SEAT_H,
  TRACK_LIGHT_Y,
  WALL_BANDS,
} from "./plan.ts";
import {
  BACK_ROOM_Z0,
  BACK_ROOM_Z1,
  BACK_SHELVES,
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
  SERVICE_SIDE,
  TABLE_LEN,
  BAR_STOOLS,
  TABLE_STOOLS,
  TABLE_W,
  WALL_FACE_Z,
  bayCentre,
} from "./world.ts";

const FONT = "system-ui, sans-serif";
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const n1 = (n: number): string => n.toFixed(1);

class Svg {
  private parts: string[] = [];
  add(s: string): void {
    this.parts.push(s);
  }
  text(x: number, y: number, s: string, size = 11, anchor = "middle", fill = "#222", weight = "400"): void {
    this.add(
      `<text x="${n1(x)}" y="${n1(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" font-family="${FONT}">${esc(s)}</text>`,
    );
  }
  vtext(x: number, y: number, s: string, size = 11, fill = "#1f6feb"): void {
    this.add(
      `<text transform="translate(${n1(x)} ${n1(y)}) rotate(-90)" font-size="${size}" text-anchor="middle" fill="${fill}" font-weight="600" font-family="${FONT}">${esc(s)}</text>`,
    );
  }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke = "#555", sw = 1, extra = ""): void {
    this.add(
      `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`,
    );
  }
  line(x1: number, y1: number, x2: number, y2: number, stroke = "#222", sw = 1, extra = ""): void {
    this.add(
      `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`,
    );
  }
  circle(cx: number, cy: number, r: number, fill: string, stroke = "none"): void {
    this.add(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${fill}" stroke="${stroke}"/>`);
  }
  head(w: number, h: number): void {
    this.add(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
    this.add(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);
  }
  done(): string {
    this.add("</svg>");
    return this.parts.join("\n") + "\n";
  }
}

// dimension marks, in blue
function hDim(g: Svg, x1: number, x2: number, y: number, label: string): void {
  g.line(x1, y, x2, y, "#1f6feb");
  g.line(x1, y - 5, x1, y + 5, "#1f6feb");
  g.line(x2, y - 5, x2, y + 5, "#1f6feb");
  g.text((x1 + x2) / 2, y - 5, label, 11, "middle", "#1f6feb", "600");
}
function vDim(g: Svg, y1: number, y2: number, x: number, label: string): void {
  g.line(x, y1, x, y2, "#1f6feb");
  g.line(x - 5, y1, x + 5, y1, "#1f6feb");
  g.line(x - 5, y2, x + 5, y2, "#1f6feb");
  g.vtext(x - 6, (y1 + y2) / 2, label);
}

// =====================================================================
// Top-down plan of the shop and the staff-only back room. Entrance at the
// bottom; the +x wall on the LEFT, as a visitor entering sees it.
// =====================================================================
export function renderPlan(): string {
  const S = 62;
  const half = FLOOR.maxX + 2.2; // metres either side of the middle that are drawn
  const zTop = BACK_ROOM_Z1 + 0.9;
  const zBottom = FLOOR.minZ - 1.9;
  const W = Math.round(half * 2 * S + 120);
  const H = Math.round((zTop - zBottom) * S + 150);
  const cx = 60 + half * S;
  const px = (x: number): number => cx - x * S; // mirrored: +x is on the left
  const py = (z: number): number => 50 + (zTop - z) * S;
  const benchX = Math.abs(BENCHES[0].x);
  const g = new Svg();
  g.head(W, H);
  g.text(60, 28, "Floor plan, as a visitor sees it entering: +x wall on the LEFT, entrance at the bottom (metres)", 16, "start", "#111", "700");

  const R = (x: number, z: number, w: number, d: number, fill: string, stroke = "#555", sw = 1, extra = ""): void =>
    g.rect(px(x + w / 2), py(z + d / 2), w * S, d * S, fill, stroke, sw, extra);
  const L = (x1: number, z1: number, x2: number, z2: number, stroke = "#222", sw = 1, extra = ""): void =>
    g.line(px(x1), py(z1), px(x2), py(z2), stroke, sw, extra);

  // back room
  const brHalf = FLOOR.maxX + 0.6;
  R(0, (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2, brHalf * 2, BACK_ROOM_Z1 - BACK_ROOM_Z0, "#f4f1e8", "#9a9484", 1.5, 'stroke-dasharray="6 4"');
  g.text(px(0), py(BACK_ROOM_Z1) + 18, "BACK ROOM (staff only): same footprint as the shop", 12, "middle", "#6b6556", "600");
  for (const u of BACK_SHELVES) R(u.x, u.z, u.w, u.d, "#cfd3d8", "#6b7280");
  g.text(px(0), py(BACK_SHELVES[0].z) + 4, "labelled shelving rows", 10, "middle", "#555");
  for (const d of SERVICE_DESKS) R(d.x, d.z, d.w, d.d, "#b7c4d0", "#355a7a", 1.2);
  g.text(px(0), py(SERVICE_DESKS[0].z) + 4, "REPAIR BENCHES", 10, "middle", "#355a7a");
  g.text(px(0), py(SERVICE_DESKS[0].z) + 18, "(technicians stand behind)", 9, "middle", "#355a7a");
  R(0, BACK_ROOM_Z1 - 0.35, brHalf * 2 - 1.6, 0.4, "#cfd3d8", "#6b7280");
  g.text(px(0), py(BACK_ROOM_Z1 - 0.35) + 3, "parts wall", 9, "middle", "#555");

  // shop floor
  R(0, (FLOOR.minZ + FLOOR.maxZ) / 2, FLOOR.maxX - FLOOR.minX, FLOOR.maxZ - FLOOR.minZ, "#f6f7f8", "none", 0);
  for (const b of BENCHES) R(b.x, b.z, b.w, b.d, "#e6cfa8", "#8a6a2f", 1.2);
  for (const side of [-1, 1]) {
    const x = side * (FLOOR.maxX + 0.35);
    for (const f of SIDE_WALL[side === 1 ? "+x" : "-x"]) {
      if (f.kind === "lightbox") R(x, f.z, 0.12, f.w, "#ffffff", "#8aa", 1.2);
      else if (f.kind === "display") R(x, f.z, 0.12, f.w, "#101216", "#000", 1.2);
      else if (f.kind === "monitors") for (const z of f.zs) R(side * benchX, z, 0.1, MONITOR.w, "#1a4fb8", "#0b2a6b");
      else if (f.kind === "desktops")
        for (let k = 0; k < f.count; k++) R(side * benchX, f.z0 + k * f.pitch, 0.1, DESKTOP.w, "#6b45d6", "#3a2a8a");
      else for (let k = 0; k < f.count; k++) g.circle(px(side * benchX), py(f.z0 + k * f.pitch), 0.1 * S, "#e8a98c", "#8a5a46");
    }
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zp = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      R(side * (FLOOR.maxX + 0.25), zp, 0.3, PIER_W, "#b4b8bd", "#555");
    }
    for (let i = 0; i < BAY_COUNT; i++) R(side * (FLOOR.maxX + 0.38), bayCentre(i), 0.04, BAY_W, "#3b3f45", "#222");
  }
  // ledges in front of the bays, at the wall face
  for (const side of [-1, 1]) {
    for (const l of BAY_LEDGES[side === 1 ? "+x" : "-x"]) {
      const c = bayCentre(l.bay);
      const zc = l.half === "front" ? c - BAY_W / 4 : c + BAY_W / 4;
      R(side * (FLOOR.maxX + 0.4 - LEDGE_DEPTH / 2), zc, LEDGE_DEPTH, BAY_W / 2, "#e6cfa8", "#8a6a2f", 1.2);
      g.circle(px(side * (FLOOR.maxX + 0.4 - LEDGE_DEPTH / 2)), py(zc), 0.07 * S, "#2d3f66", "#0b1530");
    }
  }
  g.text(px(FLOOR.maxX + 0.75), py(FLOOR.minZ + 2.0), "lightboxes", 10, "end", "#678");
  g.text(px(FLOOR.maxX + 0.75), py(bayCentre(1)), "product bays", 10, "end", "#555");
  g.text(px(-FLOOR.maxX - 0.75), py(bayCentre(1)), "product bays", 10, "start", "#555");

  // tables run front to back
  TABLES.forEach((t, i) => {
    if (t.service) {
      R(t.x, t.z, t.w, t.d, "#d9c196", "#5a4210", 2, 'stroke-dasharray="5 3"');
      g.text(px(t.x), py(t.z) + 4, t.id, 11, "middle", "#5a4210", "700");
    } else {
      R(t.x, t.z, t.w, t.d, "#e6cfa8", "#8a6a2f", 1.2);
      g.text(px(t.x), py(t.z) + 4, t.id, 11, "middle", "#5a4210", "700");
      // one product on each side, facing outward
      const m = 0.2;
      for (const [dx, dz] of [
        [-(t.w / 2 - m), 0],
        [t.w / 2 - m, 0],
        [0, -(t.d / 2 - m)],
        [0, t.d / 2 - m],
      ]) {
        g.circle(px(t.x + dx), py(t.z + dz), 0.07 * S, "#2d3f66", "#0b1530");
      }
    }
  });
  for (const st of TABLE_STOOLS) g.circle(px(st.x), py(st.z), 0.16 * S, "#e6cfa8", "#8a6a2f");
  const labelZ = FLOOR.minZ + 0.62;
  g.text(px(COLUMN_X[0]), py(labelZ), "phones / watches / earbuds", 10, "middle", "#555");
  g.text(px(COLUMN_X[1]), py(labelZ), "laptops / tablets", 10, "middle", "#555");
  g.text(px(COLUMN_X[2]), py(labelZ), "audio / trackers", 10, "middle", "#555");

  // bar, stools, staff partitions
  R(COUNTER.x, COUNTER.z, COUNTER.w, COUNTER.d, "#d9b98c", "#8a6a2f", 1.5);
  g.text(px(0), py(COUNTER.z) + 4, "SERVICE BAR", 11, "middle", "#4a3510", "700");
  for (const st of BAR_STOOLS) g.circle(px(st.x), py(st.z), 0.18 * S, "#e6cfa8", "#8a6a2f");
  for (const p of PARTITIONS) R(p.x, p.z, p.w, p.d, "#8a6a2f", "#5a4210");
  g.text(px(0), py(COUNTER.z + COUNTER.d / 2 + 0.3) + 4, "staff space behind the bar", 10, "middle", "#555");

  // walls and glass, with the entrance opening
  L(FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, GLASS.entranceX[1], FLOOR.minZ - 0.5, "#5aa9d6", 4);
  L(GLASS.entranceX[0], FLOOR.minZ - 0.5, FLOOR.minX - 0.5, FLOOR.minZ - 0.5, "#5aa9d6", 4);
  g.text(px(0), py(FLOOR.minZ - 0.5) - 8, "entrance opening, 3 m (assumed)", 10, "middle", "#2a6a95");
  g.text(px(0), py(FLOOR.minZ - 0.5) + 26, "to the mall concourse (see the mall drawing)", 10, "middle", "#2a6a95");
  for (const x of GLASS.mullionX) g.line(px(x), py(FLOOR.minZ - 0.7), px(x), py(FLOOR.minZ - 0.3), "#3a7ca5", 3);
  L(FLOOR.minX - 0.5, FLOOR.minZ - 0.5, FLOOR.minX - 0.5, WALL_FACE_Z + 0.2, "#111", 3);
  L(FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.2, "#111", 3);
  L(FLOOR.minX - 0.5, WALL_FACE_Z + 0.1, DOOR.minX, WALL_FACE_Z + 0.1, "#111", 3);
  L(DOOR.maxX, WALL_FACE_Z + 0.1, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.1, "#111", 3);
  L(DOOR.minX, WALL_FACE_Z + 0.1, DOOR.maxX, WALL_FACE_Z + 0.1, "#c0392b", 4, 'stroke-dasharray="4 3"');
  g.text(px((DOOR.minX + DOOR.maxX) / 2), py(WALL_FACE_Z + 0.1) - 8, "staff door (flush), left of the bar as you face it", 10, "start", "#c0392b", "700");

  // spawn
  g.circle(px(SPAWN.x), py(SPAWN.z), 6, "#2a9d8f");
  g.text(px(SPAWN.x) - 10, py(SPAWN.z) + 4, "visitor spawn (faces the shop)", 10, "end", "#2a9d8f", "600");

  // dimensions
  const SW = FLOOR.maxX - FLOOR.minX;
  hDim(g, px(FLOOR.maxX), px(FLOOR.minX), py(FLOOR.minZ - 1.4), `${SW} m wide`);
  vDim(g, py(FLOOR.maxZ), py(FLOOR.minZ), px(FLOOR.maxX) - 1.0 * S, `${FLOOR.maxZ - FLOOR.minZ} m deep`);
  vDim(g, py(BACK_ROOM_Z1), py(BACK_ROOM_Z0), px(FLOOR.maxX) - 1.0 * S, `${(BACK_ROOM_Z1 - BACK_ROOM_Z0).toFixed(0)} m deep`);
  const t0 = TABLES[0];
  hDim(g, px(t0.x + TABLE_W / 2), px(t0.x - TABLE_W / 2), py(FLOOR.minZ + 0.3), `${TABLE_W} m`);
  hDim(g, px(COLUMN_X[1] + TABLE_W / 2), px(COLUMN_X[0] + TABLE_W / 2), py(FLOOR.minZ + 0.3), `${(COLUMN_X[1] - COLUMN_X[0] - TABLE_W).toFixed(2)} m aisle`);
  vDim(g, py(t0.z + TABLE_LEN / 2), py(t0.z - TABLE_LEN / 2), px(t0.x - TABLE_W / 2) + 0.4 * S, `${TABLE_LEN} m`);

  hDim(g, px(COUNTER.x + COUNTER.w / 2), px(COUNTER.x - COUNTER.w / 2), py(BACK_ROOM_Z0 + 0.45), `bar ${COUNTER.w} m`);
  // the clear space where customers are received, and the gap between tables
  const prod = TABLES.filter((t) => !t.service && t.x === COLUMN_X[0]).sort((a, b) => a.z - b.z);
  const frontEdge = Math.min(...TABLES.map((t) => t.z - t.d / 2));
  vDim(g, py(FLOOR.minZ), py(frontEdge), px(4.1), `${(frontEdge - FLOOR.minZ).toFixed(1)} m clear: customers are received here`);
  if (prod.length > 1) {
    const gap = prod[1].z - prod[1].d / 2 - (prod[0].z + prod[0].d / 2);
    vDim(g, py(prod[1].z - prod[1].d / 2), py(prod[0].z + prod[0].d / 2), px(COLUMN_X[0] + TABLE_W / 2) - 0.45 * S, `${gap.toFixed(2)} m clear`);
  }

  const ly = H - 62;
  g.text(60, ly, `Ceiling ${CEILING} m. T = product table (${TABLE_W} x ${TABLE_LEN} m, one product per side). S = square service table (${SERVICE_SIDE} m side, no products, two stools each side, tucked under). Columns at x = ${COLUMN_X.join(", ")}.`, 11, "start", "#333");
  g.text(60, ly + 16, "The 3 m wall height is from the references; the width and depth were enlarged on request (option A) so there is room to move between tables.", 11, "start", "#333");
  g.text(60, ly + 32, "Assumed, not measurable: the entrance opening, the back-room layout (your instruction: same footprint), the door width. The store stands on the first floor of a mall atrium; see the mall drawing.", 11, "start", "#a33");
  return g.done();
}

// =====================================================================
// The mall around the store, drawn at a much smaller scale: the concourse
// along the glass front, neighbouring and opposite shops, the mezzanine, and
// the routes people take.
// =====================================================================
export function renderMallPlan(): string {
  const S = 22;
  const half = 36;
  const zTop = FLOOR.minZ + 1.7;
  const zBottom = MALL.farZ - 2.2;
  const W = Math.round(half * 2 * S + 120);
  const H = Math.round((zTop - zBottom) * S + 190);
  const cx = 60 + half * S;
  const px = (x: number): number => cx - x * S; // +x on the left, as in the shop plan
  const py = (z: number): number => 60 + (zTop - z) * S;
  const g = new Svg();
  g.head(W, H);
  g.text(60, 28, "The mall around the store: concourse, shops, mezzanine and routes (metres; +x on the LEFT)", 16, "start", "#111", "700");
  const R = (x: number, z: number, w: number, d: number, fill: string, stroke = "#888", sw = 1, extra = ""): void =>
    g.rect(px(x + w / 2), py(z + d / 2), w * S, d * S, fill, stroke, sw, extra);
  // concourse
  R(0, (MALL.walkwayZ + MALL.farZ) / 2, MALL.maxX - MALL.minX, MALL.walkwayZ - MALL.farZ, "#eef0f2", "#b0b5ba", 1, 'stroke-dasharray="4 3"');
  g.text(px(0), py(MALL.walkwayZ - 1.4), `GROUND-FLOOR CONCOURSE: the atrium floor, ${MALL.maxX - MALL.minX} m long, ${(MALL.walkwayZ - MALL.farZ).toFixed(1)} m wide, roof at ${MALL.ceilingY} m`, 12, "middle", "#555", "600");
  // the first-floor walkway outside the glass, with its balustrade
  R(0, (MALL.frontZ + MALL.walkwayZ) / 2, MALL.maxX - MALL.minX, MALL.frontZ - MALL.walkwayZ, "#e9e5d8", "#9a9484", 1.2, 'stroke-dasharray="6 3"');
  g.line(px(MALL.minX), py(MALL.walkwayZ), px(MALL.maxX), py(MALL.walkwayZ), "#2a6a95", 3);
  g.text(px(0), py((MALL.frontZ + MALL.walkwayZ) / 2) + 4, `FIRST-FLOOR WALKWAY outside the glass (floor at ${STORE_Y} m); glass balustrade at its edge, you can step out and look down`, 11, "middle", "#6b6556");
  // mezzanine strip above the far shopfronts
  R(0, (MALL.mezzanineZ0 + MALL.mezzanineZ1) / 2, MALL.maxX - MALL.minX, MALL.mezzanineZ1 - MALL.mezzanineZ0, "#e4e0d4", "#9a9484", 1.2, 'stroke-dasharray="6 3"');
  g.text(px(0), py((MALL.mezzanineZ0 + MALL.mezzanineZ1) / 2) + 4, `FIRST-FLOOR walkway opposite (floor at ${MALL.mezzanineY} m, level with the store), glass balustrade on the atrium side`, 11, "middle", "#6b6556");
  g.text(px(0), py(MALL.farZ) + 16, "opposite shopfronts: ground floor and first floor", 11, "middle", "#555");
  // the store and its neighbours along the near side
  const storeD = zTop - (FLOOR.minZ - 0.5);
  R(0, (zTop + (FLOOR.minZ - 0.5)) / 2, FLOOR.maxX - FLOOR.minX + 1, storeD, "#f6f7f8", "#111", 2);
  g.text(px(0), py(FLOOR.minZ + 0.7), "THE STORE", 12, "middle", "#111", "700");
  g.text(px(0), py(FLOOR.minZ + 1.25), "(see the shop plan)", 10, "middle", "#555");
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = sd * (FLOOR.maxX + 5.1 + k * 9);
      R(x, FLOOR.minZ + 0.15, 9, 0.6, "#d3d6da", "#888", 1);
      g.text(px(x), py(FLOOR.minZ) - 14, "shop", 9, "middle", "#777");
    }
  }
  R(0, FLOOR.minZ - 0.15, GLASS.entranceX[1] - GLASS.entranceX[0], 0.5, "#ffffff", "#2a6a95", 2, 'stroke-dasharray="5 3"');
  g.text(px(0), py(FLOOR.minZ - 0.5) + 12, "entrance opening", 10, "middle", "#2a6a95", "700");
  // columns holding up the mezzanine
  for (const x of Array.from({ length: 9 }, (_, k) => -32 + k * 8)) g.circle(px(x), py(MALL.mezzanineZ1 + 0.3), 0.28 * S, "#b9bdc2", "#6b7076");
  // routes
  const colours = { passer: "#4a8f7a", shopper: "#d1495b", upper: "#7a6a3a" } as const;
  for (const r of ROUTES) {
    const pts = r.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const za = Math.min(a.z, zTop);
      const zb = Math.min(b.z, zTop);
      if (a.z > zTop && b.z > zTop) continue; // wholly inside the store: see the shop plan
      g.line(px(a.x), py(za), px(b.x), py(zb), colours[r.kind], r.kind === "shopper" ? 2 : 1.2, 'stroke-dasharray="6 4"');
    }
    const p0 = pts[0];
    if (p0.z <= zTop) g.circle(px(p0.x), py(p0.z), 3, colours[r.kind]);
  }
  const ly = H - 70;
  g.text(60, ly, "Green: people on the ground floor below, and two window-shoppers on the walkway. Red: customers who come along the walkway, in through the opening, look at tables and leave. Olive: people on the opposite first-floor walkway.", 11, "start", "#333");
  g.text(60, ly + 16, "Everyone is placed by the shared server clock, so all visitors see the same people in the same places. The opposite walkway and neighbouring shops are not enterable.", 11, "start", "#333");
  g.text(60, ly + 32, `Sizes of the concourse, the neighbours and the mezzanine are assumed; only the store itself comes from the reference photographs.`, 11, "start", "#a33");
  return g.done();
}

// =====================================================================
// Wall elevations, each seen from inside the shop, looking at the wall.
// =====================================================================
// Width of the wall drawings: the longest wall plus the margins and the
// dimension labels at the right-hand end.
export function wallsWidth(): number {
  const sideLen = WALL_FACE_Z - (FLOOR.minZ - 0.5);
  const backLen = FLOOR.maxX - FLOOR.minX + 1;
  return Math.round(Math.max(sideLen, backLen) * 62 + 70 * 2 + 150);
}

export function renderWalls(): string {
  const ES = 62; // pixels per metre
  const MX = 70; // left margin
  const PANEL_H = Math.round(CEILING * ES + 200);
  const W = wallsWidth();
  const H = Math.round(PANEL_H * 4 + 120);
  const g = new Svg();
  g.head(W, H);
  g.text(MX, 28, "Wall elevations: each wall seen from inside the shop, as you stand facing it (metres)", 16, "start", "#111", "700");

  const BAND = [
    { y0: 0, y1: WALL_BANDS.low, c: "#8c9096" },
    { y0: WALL_BANDS.low, y1: WALL_BANDS.mid, c: "#a8acb1" },
    { y0: WALL_BANDS.mid, y1: CEILING, c: "#cdd0d4" },
  ];

  // a side wall: z runs along the horizontal axis; `dir` 1 puts the glass
  // front on the left (the +x wall), -1 puts it on the right (the -x wall)
  function sideWall(panel: number, title: string, dir: 1 | -1, wall: "+x" | "-x"): void {
    const top = 110 + panel * PANEL_H;
    const base = top + CEILING * ES; // floor line
    const z0 = FLOOR.minZ - 0.5;
    const z1 = WALL_FACE_Z;
    const len = z1 - z0;
    const hx = (z: number): number => (dir === 1 ? MX + (z - z0) * ES : MX + (z1 - z) * ES);
    const hy = (y: number): number => base - y * ES;
    const wRect = (za: number, zb: number, ya: number, yb: number, fill: string, stroke = "none", sw = 1): void => {
      const xa = Math.min(hx(za), hx(zb));
      g.rect(xa, hy(yb), Math.abs(hx(zb) - hx(za)), (yb - ya) * ES, fill, stroke, sw);
    };
    g.text(MX, top - 46, title, 13, "start", "#111", "700");
    for (const b of BAND) wRect(z0, z1, b.y0, b.y1, b.c);
    // piers from the bench up; below the bench the grey panel runs unbroken
    // to the floor, with a dark reveal at the bottom
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zc = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      wRect(zc - PIER_W / 2, zc + PIER_W / 2, BAY_SHELVES.panelBottom, CEILING, "#b9bdc2", "#7b8087");
    }
    wRect(z0, z1, 0, FLOOR_REVEAL, "#15171a");
    for (let i = 0; i < BAY_COUNT; i++) {
      const zc = bayCentre(i);
      wRect(zc - BAY_W / 2, zc + BAY_W / 2, BAY_SHELVES.panelBottom, BAY_SHELVES.panelTop, "#3b3f45", "#222");
      for (let k = 0; k < BAY_SHELVES.count; k++) {
        const y = BAY_SHELVES.first + k * BAY_SHELVES.step;
        wRect(zc - BAY_W / 2 + 0.03, zc + BAY_W / 2 - 0.03, y, y + 0.025, "#8b9096");
        const style = i % 3;
        const cols = style === 0 ? 9 : style === 1 ? 5 : 0;
        for (let j = 0; j < cols; j++) {
          const bz = zc - BAY_W / 2 + 0.1 + (j * (BAY_W - 0.2)) / Math.max(1, cols - 1);
          wRect(bz - 0.04, bz + 0.04, y + 0.025, y + 0.025 + (style === 0 ? 0.22 : 0.24), style === 0 ? "#f4f4f2" : j % 2 ? "#2f4c7a" : "#c0392b");
        }
      }
      wRect(zc - 0.55, zc + 0.55, BAY_SIGN_Y - 0.13, BAY_SIGN_Y + 0.13, "#ffffff", "#999");
    }
    // what hangs on this wall, front to back
    for (const f of SIDE_WALL[wall]) {
      if (f.kind === "lightbox") {
        wRect(f.z - f.w / 2, f.z + f.w / 2, LIGHTBOX_BOTTOM, LIGHTBOX_BOTTOM + LIGHTBOX_H, "#ffffff", "#9ab", 1.5);
      } else if (f.kind === "display") {
        wRect(f.z - f.w / 2, f.z + f.w / 2, LIGHTBOX_BOTTOM, LIGHTBOX_BOTTOM + f.h, "#101216", "#000", 2);
        g.text(hx(f.z), hy(LIGHTBOX_BOTTOM + f.h / 2) + 4, "large display", 10, "middle", "#fff");
      }
    }
    // bench slab (open underneath), devices laid on it, two monitors
    const bench = BENCHES[0];
    wRect(bench.z - bench.d / 2, bench.z + bench.d / 2, bench.h - 0.12, bench.h, "#e6cfa8", "#8a6a2f", 1.2);
    for (let z = bench.z - bench.d / 2 + 0.3; z <= bench.z + bench.d / 2 - 0.3; z += 0.22) wRect(z - 0.075, z + 0.075, bench.h, bench.h + 0.012, "#2d3f66");
    // the bench stops where the bays start; a short ledge in front of half of
    // a bay carries one product
    for (const l of BAY_LEDGES[wall]) {
      const c = bayCentre(l.bay);
      const [za, zb] = l.half === "front" ? [c - BAY_W / 2, c] : [c, c + BAY_W / 2];
      wRect(za, zb, bench.h - 0.12, bench.h, "#e6cfa8", "#8a6a2f", 1.2);
      wRect((za + zb) / 2 - 0.08, (za + zb) / 2 + 0.08, bench.h, bench.h + 0.18, "#2d3f66", "#0b1530");
    }
    for (const f of SIDE_WALL[wall]) {
      if (f.kind === "monitors") {
        for (const mz of f.zs) {
          wRect(mz - 0.03, mz + 0.03, bench.h, bench.h + MONITOR.standH, "#2a2d33");
          wRect(mz - MONITOR.w / 2, mz + MONITOR.w / 2, bench.h + MONITOR.standH - MONITOR.h / 2, bench.h + MONITOR.standH + MONITOR.h / 2, "#1a4fb8", "#0b2a6b");
        }
      } else if (f.kind === "desktops") {
        for (let k = 0; k < f.count; k++) {
          const dz = f.z0 + k * f.pitch;
          wRect(dz - 0.02, dz + 0.02, bench.h, bench.h + DESKTOP.standH, "#c9ced3");
          wRect(dz - DESKTOP.w / 2, dz + DESKTOP.w / 2, bench.h + DESKTOP.standH - DESKTOP.h / 2 + 0.1, bench.h + DESKTOP.standH + DESKTOP.h / 2 + 0.1, "#6b45d6", "#3a2a8a");
        }
      } else if (f.kind === "headphones") {
        for (let k = 0; k < f.count; k++) {
          const hz = f.z0 + k * f.pitch;
          wRect(hz - 0.12, hz + 0.12, bench.h, bench.h + 0.2, "#e8a98c", "#8a5a46");
        }
      }
    }
    // ceiling, track rail, floor
    g.line(MX, hy(CEILING), MX + len * ES, hy(CEILING), "#111", 2);
    g.line(MX, hy(TRACK_LIGHT_Y), MX + len * ES, hy(TRACK_LIGHT_Y), "#111", 3);
    g.line(MX, base, MX + len * ES, base, "#111", 2);
    g.text(hx(z0) + (dir === 1 ? 0 : 0), base + 44, "GLASS FRONT END", 10, dir === 1 ? "start" : "end", "#2a6a95", "700");
    g.text(hx(z1), base + 44, "BACK WALL END", 10, dir === 1 ? "end" : "start", "#444", "700");

    // dimensions
    vDim(g, hy(0), hy(CEILING), MX - 10, `${CEILING} m ceiling`);
    vDim(g, hy(0), hy(WALL_BANDS.low), MX + len * ES + 22, `${WALL_BANDS.low} m: bench top`);
    vDim(g, hy(WALL_BANDS.low), hy(WALL_BANDS.mid), MX + len * ES + 52, `to ${WALL_BANDS.mid} m: mid band`);
    const lb = SIDE_WALL[wall].find((f) => f.kind === "lightbox");
    if (lb && lb.kind === "lightbox") {
      hDim(g, hx(lb.z - lb.w / 2), hx(lb.z + lb.w / 2), hy(LIGHTBOX_BOTTOM + LIGHTBOX_H) - 8, `${lb.w} m x ${LIGHTBOX_H} m lightbox`);
    }
    vDim(g, hy(BAY_SHELVES.panelBottom), hy(BAY_SHELVES.panelTop), MX - 38, `bays ${BAY_SHELVES.panelBottom} to ${BAY_SHELVES.panelTop} m`);
    const b0 = bayCentre(0);
    hDim(g, hx(b0 - BAY_W / 2), hx(b0 + BAY_W / 2), hy(CEILING) - 10, `bay ${BAY_W} m`);
    const pz = b0 + BAY_W / 2 + PIER_W / 2;
    hDim(g, hx(pz - PIER_W / 2), hx(pz + PIER_W / 2), hy(CEILING) - 28, `pier ${PIER_W} m`);
    hDim(g, hx(z0), hx(z1), base + 26, `${len.toFixed(1)} m wall`);
  }

  sideWall(0, "1. LEFT WALL as you enter (the +x wall). Glass front on the left, back wall on the right.", 1, "+x");
  sideWall(1, "2. RIGHT WALL as you enter (the -x wall). Glass front on the right, back wall on the left.", -1, "-x");

  // ---- back wall, store side. Facing +z, +x is on your left.
  {
    const panel = 2;
    const top = 110 + panel * PANEL_H;
    const base = top + CEILING * ES;
    const x0 = FLOOR.maxX + 0.5; // left edge on screen
    const hx = (x: number): number => MX + (x0 - x) * ES;
    const hy = (y: number): number => base - y * ES;
    const wRect = (xa: number, xb: number, ya: number, yb: number, fill: string, stroke = "none", sw = 1): void =>
      g.rect(Math.min(hx(xa), hx(xb)), hy(yb), Math.abs(hx(xb) - hx(xa)), (yb - ya) * ES, fill, stroke, sw);
    g.text(MX, top - 46, `3. BACK WALL, shop side (z = +${WALL_FACE_Z.toFixed(1)}), seen facing it. The +x side is on the left.`, 13, "start", "#111", "700");
    wRect(-x0, x0, 0, CEILING, "#d9dcdf", "#7b8087");
    // the bar stands in front of the wall
    wRect(COUNTER.x - COUNTER.w / 2, COUNTER.x + COUNTER.w / 2, 0, COUNTER.h, "#e6cfa8", "#8a6a2f", 1.5);
    for (const p of PARTITIONS) wRect(p.x - 0.08, p.x + 0.08, 0, p.h, "#8a6a2f", "#5a4210");
    for (const st of BAR_STOOLS) {
      const sx = st.x;
      wRect(sx - 0.2, sx + 0.2, STOOL_SEAT_H - 0.05, STOOL_SEAT_H, "#e6cfa8", "#8a6a2f");
      wRect(sx - 0.02, sx + 0.02, 0, STOOL_SEAT_H - 0.05, "#8d9399");
    }
    g.text(hx(0), hy(COUNTER.h / 2), "service bar in front of the wall", 10, "middle", "#4a3510");
    // screens, marks, sign
    for (const sx of BACK_WALL.screenX) {
      wRect(sx - BACK_WALL.screenW / 2, sx + BACK_WALL.screenW / 2, BACK_WALL.screenY - BACK_WALL.screenH / 2, BACK_WALL.screenY + BACK_WALL.screenH / 2, "#101216", "#2a2d33", 2);
    }
    g.text(hx(0), hy(BACK_WALL.screenY) + 4, "screens", 10, "middle", "#fff");
    for (const mx of BACK_WALL.markX) {
      wRect(mx - BACK_WALL.markSize / 2, mx + BACK_WALL.markSize / 2, BACK_WALL.screenY - BACK_WALL.markSize / 2, BACK_WALL.screenY + BACK_WALL.markSize / 2, "#101216", "#2a2d33");
      g.circle(hx(mx), hy(BACK_WALL.screenY), 0.22 * ES, "none", "#ffffff");
    }
    wRect(-BACK_WALL.signW / 2, BACK_WALL.signW / 2, BACK_WALL.signY - 0.25, BACK_WALL.signY + 0.25, "#1f2430", "#000");
    g.text(hx(0), hy(BACK_WALL.signY) + 4, "SERVICE BAR", 11, "middle", "#fff", "700");
    // the staff door, flush with the wall, and its card reader
    wRect(DOOR.minX, DOOR.maxX, 0, DOOR_H, "#d3d6d9", "#a0a4a9", 1.5);
    g.text(hx((DOOR.minX + DOOR.maxX) / 2), hy(DOOR_H / 2), "staff door", 10, "middle", "#c0392b", "700");
    g.text(hx((DOOR.minX + DOOR.maxX) / 2), hy(DOOR_H / 2) + 13, "(flush, hairline gaps)", 9, "middle", "#c0392b");
    const crx = DOOR.maxX + CARD_READER.dx;
    wRect(crx - CARD_READER.w / 2, crx + CARD_READER.w / 2, CARD_READER.y - CARD_READER.h / 2, CARD_READER.y + CARD_READER.h / 2, "#2a2d33");
    g.line(MX, hy(CEILING), MX + 2 * x0 * ES, hy(CEILING), "#111", 2);
    g.line(MX, base, MX + 2 * x0 * ES, base, "#111", 2);
    vDim(g, hy(0), hy(CEILING), MX - 10, `${CEILING} m`);
    hDim(g, hx(COUNTER.x + COUNTER.w / 2), hx(COUNTER.x - COUNTER.w / 2), base + 26, `bar ${COUNTER.w} m`);
    hDim(g, hx(DOOR.minX), hx(DOOR.maxX), hy(DOOR_H) - 12, `door ${(DOOR.maxX - DOOR.minX).toFixed(1)} m x ${DOOR_H} m`);
    hDim(g, hx(BACK_WALL.screenX[0] - BACK_WALL.screenW / 2), hx(BACK_WALL.screenX[0] + BACK_WALL.screenW / 2), hy(BACK_WALL.screenY + BACK_WALL.screenH / 2) - 12, `screen ${BACK_WALL.screenW} x ${BACK_WALL.screenH} m`);
  }

  // ---- front glass wall, seen from inside facing -z (+x on your right)
  {
    const panel = 3;
    const top = 110 + panel * PANEL_H;
    const base = top + CEILING * ES;
    const x0 = FLOOR.maxX + 0.5;
    const hx = (x: number): number => MX + (x + x0) * ES;
    const hy = (y: number): number => base - y * ES;
    g.text(MX, top - 46, `4. FRONT GLASS WALL (z = ${(FLOOR.minZ - 0.5).toFixed(1)}), seen from inside facing it. The +x side is on the right.`, 13, "start", "#111", "700");
    g.rect(hx(-x0), hy(CEILING), 2 * x0 * ES, CEILING * ES, "#e6f2f8", "#5aa9d6", 2);
    // the entrance opening: no glass
    g.rect(hx(GLASS.entranceX[0]), hy(CEILING) + GLASS.headerH * ES, (GLASS.entranceX[1] - GLASS.entranceX[0]) * ES, (CEILING - GLASS.headerH) * ES, "#ffffff", "#2a6a95", 1.5, 'stroke-dasharray="5 3"');
    g.rect(hx(-x0), hy(CEILING), 2 * x0 * ES, GLASS.headerH * ES, "#b9bec4", "#7b8087", 1);
    for (const mx of GLASS.mullionX.filter((m) => m < GLASS.entranceX[0] || m > GLASS.entranceX[1])) g.line(hx(mx), hy(CEILING), hx(mx), base, "#7b8087", 3);
    for (const ex of GLASS.entranceX) g.line(hx(ex), hy(CEILING), hx(ex), base, "#2a6a95", 3);
    g.text(hx(0), hy(CEILING / 2), "entrance opening", 11, "middle", "#2a6a95", "700");
    g.text(hx(0), hy(CEILING / 2) + 14, `${GLASS.entranceX[1] - GLASS.entranceX[0]} m wide, assumed [TK]`, 10, "middle", "#2a6a95");
    g.text(hx(0), hy(CEILING) + 22, "header band", 9, "middle", "#444");
    g.line(MX, base, MX + 2 * x0 * ES, base, "#111", 2);
    vDim(g, hy(0), hy(CEILING), MX - 10, `${CEILING} m`);
    hDim(g, hx(-x0), hx(x0), base + 26, `${(2 * x0).toFixed(0)} m overall (shop ${FLOOR.maxX - FLOOR.minX} m between the side walls)`);
    hDim(g, hx(GLASS.mullionX[0]), hx(GLASS.mullionX[1]), hy(CEILING) - 12, `${GLASS.mullionX[1] - GLASS.mullionX[0]} m panes`);
  }

  g.text(MX, H - 22, "Not drawn: back-room walls (the shelving rows and repair benches are on the plan). Wall colours are the three tones in the first elevation.", 11, "start", "#a33");
  return g.done();
}

// =====================================================================
// Ceiling, looking up. Entrance at the bottom; the +x wall on the LEFT.
// =====================================================================
export function renderCeiling(): string {
  const S = 60;
  const fw = FLOOR.maxX - FLOOR.minX;
  const fd = FLOOR.maxZ - FLOOR.minZ;
  const W = Math.round((fw + 2) * S + 120);
  const H = Math.round((fd + 1.5) * S + 200);
  const cx = 60 + ((fw + 2) / 2) * S;
  const px = (x: number): number => cx - x * S;
  const py = (z: number): number => 90 + (FLOOR.maxZ - z) * S;
  const g = new Svg();
  g.head(W, H);
  g.text(60, 28, "Ceiling and lights, looking up from inside: +x wall on the LEFT, entrance at the bottom (metres)", 16, "start", "#111", "700");
  const w = FLOOR.maxX - FLOOR.minX;
  const d = FLOOR.maxZ - FLOOR.minZ;
  g.rect(px(FLOOR.maxX), py(FLOOR.maxZ), w * S, d * S, "#eceef0", "#111", 3);
  // slats run across the room, every slatPitch
  for (let z = FLOOR.minZ + CEILING_SPEC.slatPitch; z < FLOOR.maxZ; z += CEILING_SPEC.slatPitch) {
    g.line(px(FLOOR.maxX), py(z), px(FLOOR.minX), py(z), "#b9bec4", 1);
  }
  // light panels in paired rows either side of the centre
  for (const z of CEILING_SPEC.panelRowsZ) {
    for (const x of CEILING_SPEC.panelX) {
      g.rect(px(x + CEILING_SPEC.panelW / 2), py(z + CEILING_SPEC.panelD / 2), CEILING_SPEC.panelW * S, CEILING_SPEC.panelD * S, "#ffffff", "#1f6feb", 1.2);
    }
  }
  // track rails with spots: along the front and down both sides
  const inset = CEILING_SPEC.trackInset;
  const rails = [
    { x1: FLOOR.maxX - 0.2, z1: FLOOR.minZ + inset, x2: FLOOR.minX + 0.2, z2: FLOOR.minZ + inset },
    { x1: FLOOR.maxX - inset, z1: FLOOR.minZ + inset, x2: FLOOR.maxX - inset, z2: FLOOR.maxZ - 0.2 },
    { x1: FLOOR.minX + inset, z1: FLOOR.minZ + inset, x2: FLOOR.minX + inset, z2: FLOOR.maxZ - 0.2 },
  ];
  for (const r of rails) {
    g.line(px(r.x1), py(r.z1), px(r.x2), py(r.z2), "#23262b", 3);
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    for (let t = CEILING_SPEC.spotPitch / 2; t < len; t += CEILING_SPEC.spotPitch) {
      const f = t / len;
      g.circle(px(r.x1 + (r.x2 - r.x1) * f), py(r.z1 + (r.z2 - r.z1) * f), 4, "#ffcc33", "#23262b");
    }
  }
  // the hanging mark
  const m = CEILING_SPEC.hangingMark;
  g.rect(px(m.x + m.size / 2), py(m.z + 0.05), m.size * S, 0.1 * S, "#1f2430", "#000", 1);
  g.text(px(m.x), py(m.z) - 12, "hanging mark", 10, "middle", "#1f2430", "700");
  // dimensions
  const p0 = CEILING_SPEC.panelRowsZ[0];
  const p1 = CEILING_SPEC.panelRowsZ[1];
  g.line(px(CEILING_SPEC.panelX[0]) + 0.8 * S, py(p0), px(CEILING_SPEC.panelX[0]) + 0.8 * S, py(p1), "#1f6feb");
  g.text(px(CEILING_SPEC.panelX[0]) + 0.8 * S + 6, py((p0 + p1) / 2) + 4, `${(p1 - p0).toFixed(1)} m row pitch`, 10, "start", "#1f6feb", "600");
  g.text(px(0), py(CEILING_SPEC.panelRowsZ[5]) - 30, `panels ${CEILING_SPEC.panelW} x ${CEILING_SPEC.panelD} m, centred ${CEILING_SPEC.panelX[1]} m either side of the middle`, 11, "middle", "#1f6feb", "600");
  g.text(60, H - 60, `Slats run across the room (along x) every ${CEILING_SPEC.slatPitch} m. Spots every ${CEILING_SPEC.spotPitch} m on rails ${CEILING_SPEC.trackInset} m in from the walls.`, 11, "start", "#333");
  g.text(60, H - 44, `Ceiling height ${CEILING} m; the rails sit at ${TRACK_LIGHT_Y} m. Panel rows read from the front-on photograph; the exact count is an estimate.`, 11, "start", "#333");
  g.text(60, H - 28, "The hanging mark is an original service mark, not anyone's logo.", 11, "start", "#a33");
  return g.done();
}

// =====================================================================
// The printable document: one HTML page that Chrome prints to a single PDF
// (see scripts/blueprint.ts). Cover and tables, then the plan, the four
// walls and the ceiling.
// =====================================================================
const PRODUCT_WORDS: Record<string, string> = {
  phone: "phones",
  tablet: "tablets",
  tabletKb: "tablets with keyboards",
  laptop: "laptops",
  watch: "watches",
  earbuds: "earbuds",
  headphones: "headphones",
  speaker: "speakers",
  airtag: "trackers",
};

// A copy of an SVG showing only part of it, so a tall drawing can be split
// across printed pages without redrawing anything.
function crop(svg: string, x: number, y: number, w: number, h: number): string {
  return svg.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${Math.round(x)} ${Math.round(y)} ${Math.round(w)} ${Math.round(h)}">`,
  );
}

export function renderDocument(): string {
  // the walls, one panel each (see renderWalls)
  const wallPanelH = Math.round(CEILING * 62 + 200);
  const walls = renderWalls();
  const wallW = wallsWidth();
  // each panel: from just above its title to just below its dimension labels
  const panel = (i: number): string => crop(walls, 0, 110 + i * wallPanelH - 62, wallW, Math.round(CEILING * 62 + 135));
  const W = FLOOR.maxX - FLOOR.minX;
  const D = FLOOR.maxZ - FLOOR.minZ;
  const productsLeft = TABLES.filter((t) => !t.service && t.x === COLUMN_X[0]).sort((a, b) => a.z - b.z);
  const CLEAR_GAP = productsLeft[1].z - productsLeft[1].d / 2 - (productsLeft[0].z + productsLeft[0].d / 2);
  const CLEAR_ZONE = Math.min(...TABLES.map((t) => t.z - t.d / 2)) - FLOOR.minZ;
  const sideName = (x: number): string =>
    Math.abs(x) < 0.01 ? "centre" : x > 0 ? "left column (the +x side, as you enter)" : "right column (the -x side)";
  const rows = TABLES.map((t, i) => {
    const kinds = t.products;
    const words = t.service
      ? "nothing: a table to sit and talk with staff, two stools each side tucked under it"
      : [...new Set(kinds.map((k) => PRODUCT_WORDS[k] ?? k))].join(", ");
    const kind = t.service ? "service (square)" : "product";
    return `<tr><td>${t.id}</td><td>${sideName(t.x)}</td><td>${kind}</td><td>${t.x.toFixed(2)}</td><td>${t.z.toFixed(2)}</td><td>${t.w.toFixed(2)} x ${t.d.toFixed(2)}</td><td>${words}</td></tr>`;
  }).join("\n");
  const css = `
    @page { size: A3 portrait; margin: 12mm; }
    @page wide { size: A3 landscape; margin: 12mm; }
    section.wide { page: wide; }
    section.wide svg { max-height: 270mm; }
    * { box-sizing: border-box; }
    body { font: 12pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #15181d; margin: 0; }
    section { page-break-after: always; break-after: page; }
    section:last-child { page-break-after: auto; break-after: auto; }
    h1 { font-size: 26pt; margin: 0 0 4mm; }
    h2 { font-size: 15pt; margin: 6mm 0 2mm; }
    p, li { max-width: 95%; }
    table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 10.5pt; }
    th, td { border: 1px solid #c9ced6; padding: 2mm 3mm; text-align: left; vertical-align: top; }
    th { background: #f0f2f5; }
    svg { width: auto; height: auto; max-width: 100%; max-height: 345mm; display: block; margin: 0 auto; }
    section.walls svg { max-height: 170mm; margin-bottom: 8mm; }
    .small { color: #5b6370; font-size: 10pt; }
    .warn { color: #a33; }
  `;
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><title>Canberra-style store: blueprint</title><style>${css}</style></head><body>
<section>
  <h1>Canberra-style store: blueprint</h1>
  <p class="small">Drawn from the model's own constants (src/shared), so these pages cannot differ from the 3D scene. Metres. A visitor entering stands at the glass front facing the bar; the +x wall is on their left.</p>
  <h2>What the references say, and what changed</h2>
  <p>From the corners you set in the rectify tool (docs/blueprint/rectify.json) the references gave a shop about
  <b>10 m wide by 10 m deep</b> under a <b>3 m</b> wall (side walls 3.35 times as long as high, back wall 3.3 times as wide as high).
  You then asked for more room so the tables are spread out and people can move between them, and chose to keep the 3 m wall.
  The shop is now <b>${W} m wide by ${D} m deep by ${CEILING} m high</b>, so it is deliberately wider and much longer than the reference proportions.</p>
  <h2>Dimensions</h2>
  <table>
    <tr><th>Part</th><th>Value</th><th>Source</th></tr>
    <tr><td>Shop width x depth x height</td><td>${W} x ${D} x ${CEILING} m</td><td>Your choice (option A): more room than the 10 x 10 m the references gave</td></tr>
    <tr><td>Table columns</td><td>x = ${COLUMN_X.join(", ")}</td><td>About a quarter of the width either side of the middle (photo)</td></tr>
    <tr><td>Product tables</td><td>${TABLE_W} wide x ${TABLE_LEN} long (elongated, front to back), four in each side column and three in the middle, one product on each side, ${CLEAR_GAP.toFixed(1)} m clear between them front to back</td><td>Your description</td></tr>
    <tr><td>Service tables</td><td>${SERVICE_SIDE} m square (1.5 times the earlier 1.2 m side, on your request), one nearest the bar in each side column and one in the middle column, two stools tucked under each of its left and right sides, no products</td><td>Your description</td></tr>
    <tr><td>Bench along each side wall</td><td>${BENCHES[0].w} m deep, ${BENCHES[0].d} m long (it stops where the indented bays start), ${BENCHES[0].h} m high</td><td>Your instruction, from the references</td></tr>
    <tr><td>Ledges in front of the bays</td><td>one short ledge on the ${BAY_LEDGES["+x"][0].half} half of each of the three bays on each side, ${LEDGE_DEPTH} m out from the wall, one product on each</td><td class="warn">Which half and which product are [TK]: working defaults</td></tr>
    <tr><td>Where the store is</td><td>On the <b>first floor</b> of a mall atrium: a ${WALKWAY_DEPTH} m walkway outside the glass with a glass balustrade, the void down to the ground-floor concourse, and opposite shopfronts on both floors. Visitors can step out through the entrance and look down.</td><td>Your instruction and picture (2026-10-11)</td></tr>
    <tr><td>Entrance clear zone</td><td>${CLEAR_ZONE.toFixed(1)} m from the glass to the first table, kept empty: customers are received here</td><td>Your instruction</td></tr>
    <tr><td>Service bar</td><td>${COUNTER.w} m long x ${COUNTER.d} m deep, ${COUNTER.h} m high, ${BAR_STOOLS.length} stools tucked under the overhang</td><td>Almost from the far end of one service table to the far end of the other; 13 stools by your instruction</td></tr>
    <tr><td>Staff door</td><td>${(DOOR.maxX - DOOR.minX).toFixed(1)} m wide, left of the bar as you face it (+x)</td><td>Your description</td></tr>
    <tr><td>Entrance opening</td><td>${GLASS.entranceX[1] - GLASS.entranceX[0]} m wide, middle of the glass front</td><td class="warn">Assumed [TK]</td></tr>
    <tr><td>Back room</td><td>${D} m deep, same footprint, two shelving rows, two repair benches</td><td>Your instruction</td></tr>
  </table>
  <h2>Where the scale is uncertain</h2>
  <ul>
    <li><b>The 3 m wall height is the one absolute number.</b> The photographs fix the proportions; everything in metres follows from it. If the real ceiling is higher, the whole shop scales with it.</li>
    <li>Table length, the entrance opening and the back room are assumptions.</li>
    <li>Wall features (lightboxes, bays, monitors) are placed by their proportion of the wall in the close-up photographs.</li>
  </ul>
</section>
<section>
  <h1>Tables: position and orientation</h1>
  <p>Three columns across (the left column, the centre column and the right column as you enter). The <b>left and right columns</b> each have <b>four long product tables</b> and, nearest the bar, a larger <b>square service table</b> with two stools on its left and two on its right, tucked under the table, where a customer can sit and talk with staff. The <b>centre column</b> has <b>three product tables and one square service table</b>. Product tables carry a product on each of their four sides, facing outward; service tables carry nothing. There is no true top-down photograph of the tables, so positions come from your description and the proportions of the reference photographs.</p>
  <table>
    <tr><th>Table</th><th>Column</th><th>Kind</th><th>Centre x</th><th>Centre z</th><th>Size (x by z)</th><th>On it</th></tr>
    ${rows}
  </table>
  <p class="small">z is negative towards the glass front and positive towards the bar. A person standing at any side of a product table has a product in front of them; neighbouring sides are more than a metre apart.</p>
</section>
<section>
  <h1>Top-down plan: the shop and the staff-only back room</h1>
  ${renderPlan()}
</section>
<section class="wide">
  <h1>Top-down plan: the mall around the store</h1>
  ${renderMallPlan()}
</section>
<section class="walls">
  <h1>Walls: the side walls</h1>
  ${panel(0)}
  ${panel(1)}
</section>
<section class="walls">
  <h1>Walls: the back wall and the glass front</h1>
  ${panel(2)}
  ${panel(3)}
</section>
<section>
  <h1>Ceiling and lights</h1>
  ${renderCeiling()}
</section>
</body></html>
`;
}
