// Draws the store's blueprints as SVG, from the same constants the 3D scene,
// the server and the checks use (world.ts, plan.ts, protocol.ts). Nothing here
// has numbers of its own, so a drawing cannot disagree with the model: change
// the model and the committed drawings fail a check until they are regenerated
// and approved again.
//
// Everything is drawn as a visitor standing at the entrance, facing in, would
// see it: the +x wall is on the visitor's LEFT, the -x wall on their right.
import { CEILING, FLOOR, SPAWN } from "./protocol.ts";
import {
  BACK_WALL,
  BAY_SHELVES,
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
  STOOLS,
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
  TABLE_LEN,
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
// Top-down plan. Entrance at the bottom; the +x wall on the LEFT.
// =====================================================================
export function renderPlan(): string {
  const S = 48;
  const zTop = BACK_ROOM_Z1 + 0.9;
  const zBottom = FLOOR.minZ - 1.3;
  const W = Math.round(9.4 * 2 * S + 120);
  const H = Math.round((zTop - zBottom) * S + 150);
  const cx = 60 + 9.4 * S;
  const px = (x: number): number => cx - x * S; // mirrored: +x is on the left
  const py = (z: number): number => 50 + (zTop - z) * S;
  const g = new Svg();
  g.head(W, H);
  g.text(60, 28, "Floor plan, as a visitor sees it entering: +x wall on the LEFT, entrance at the bottom (metres)", 16, "start", "#111", "700");

  const R = (x: number, z: number, w: number, d: number, fill: string, stroke = "#555", sw = 1, extra = ""): void =>
    g.rect(px(x + w / 2), py(z + d / 2), w * S, d * S, fill, stroke, sw, extra);
  const L = (x1: number, z1: number, x2: number, z2: number, stroke = "#222", sw = 1, extra = ""): void =>
    g.line(px(x1), py(z1), px(x2), py(z2), stroke, sw, extra);

  // back room
  const half = FLOOR.maxX + 0.6;
  R(0, (BACK_ROOM_Z0 + BACK_ROOM_Z1) / 2, half * 2, BACK_ROOM_Z1 - BACK_ROOM_Z0, "#f4f1e8", "#9a9484", 1.5, 'stroke-dasharray="6 4"');
  g.text(px(0), py(BACK_ROOM_Z1) + 16, "BACK ROOM (staff only): same footprint as the shop", 12, "middle", "#6b6556", "600");
  for (const u of BACK_SHELVES) R(u.x, u.z, u.w, u.d, "#cfd3d8", "#6b7280");
  g.text(px(0), py(BACK_SHELVES[0].z) + 4, "labelled shelving rows", 10, "middle", "#555");
  for (const d of SERVICE_DESKS) R(d.x, d.z, d.w, d.d, "#b7c4d0", "#355a7a", 1.2);
  g.text(px(0), py(SERVICE_DESKS[0].z) + 4, "REPAIR BENCHES (technicians stand behind)", 10, "middle", "#355a7a");
  R(0, BACK_ROOM_Z1 - 0.35, 15, 0.4, "#cfd3d8", "#6b7280");
  g.text(px(0), py(BACK_ROOM_Z1 - 0.35) + 3, "parts wall", 9, "middle", "#555");

  // shop floor
  R(0, (FLOOR.minZ + FLOOR.maxZ) / 2, FLOOR.maxX - FLOOR.minX, FLOOR.maxZ - FLOOR.minZ, "#f6f7f8", "none", 0);
  for (const b of BENCHES) R(b.x, b.z, b.w, b.d, "#e6cfa8", "#8a6a2f", 1.2);
  for (const side of [-1, 1]) {
    const x = side * (FLOOR.maxX + 0.35);
    for (const f of SIDE_WALL[side === 1 ? "+x" : "-x"]) {
      if (f.kind === "lightbox") R(x, f.z, 0.12, f.w, "#ffffff", "#8aa", 1.2);
      else if (f.kind === "display") R(x, f.z, 0.12, f.w, "#101216", "#000", 1.2);
      else if (f.kind === "monitors") for (const z of f.zs) R(side * 7.55, z, 0.12, MONITOR.w, "#1a4fb8", "#0b2a6b");
      else if (f.kind === "desktops")
        for (let k = 0; k < f.count; k++) R(side * 7.55, f.z0 + k * f.pitch, 0.12, DESKTOP.w, "#6b45d6", "#3a2a8a");
      else for (let k = 0; k < f.count; k++) g.circle(px(side * 7.55), py(f.z0 + k * f.pitch), 0.12 * S, "#e8a98c", "#8a5a46");
    }
    for (let i = 0; i <= BAY_COUNT; i++) {
      const zp = bayCentre(0) - BAY_W / 2 - PIER_W / 2 + i * (BAY_W + PIER_W);
      R(side * (FLOOR.maxX + 0.25), zp, 0.3, PIER_W, "#b4b8bd", "#555");
    }
    for (let i = 0; i < BAY_COUNT; i++) R(side * (FLOOR.maxX + 0.38), bayCentre(i), 0.04, BAY_W, "#3b3f45", "#222");
  }
  g.text(px(8.55), py(-3.3), "lightboxes", 9, "middle", "#678");
  g.text(px(8.55), py(7.5), "recessed bays", 9, "middle", "#555");

  // tables run front to back
  TABLES.forEach((t, i) => {
    R(t.x, t.z, TABLE_W, TABLE_LEN, "#e6cfa8", "#8a6a2f", 1.2);
    g.text(px(t.x), py(t.z) + 4, `T${i + 1}`, 11, "middle", "#5a4210", "700");
  });
  g.text(px(COLUMN_X[0]), py(-6.0), "phones / watches", 10, "middle", "#555");
  g.text(px(COLUMN_X[1]), py(-5.6), "laptops / tablets", 10, "middle", "#555");
  g.text(px(COLUMN_X[2]), py(-6.0), "audio / trackers", 10, "middle", "#555");

  // bar, stools, staff partitions
  R(COUNTER.x, COUNTER.z, COUNTER.w, COUNTER.d, "#d9b98c", "#8a6a2f", 1.5);
  g.text(px(0), py(COUNTER.z) + 4, "SERVICE BAR (checkout / repair desk)", 11, "middle", "#4a3510", "700");
  for (const sx of STOOLS.x) g.circle(px(sx), py(COUNTER.z - 0.95), 0.2 * S, "#e6cfa8", "#8a6a2f");
  for (const p of PARTITIONS) R(p.x, p.z, p.w, p.d, "#8a6a2f", "#5a4210");
  g.text(px(0), py(6.85) + 4, "staff space behind the bar", 10, "middle", "#555");

  // walls and glass
  L(FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, GLASS.entranceX[1], FLOOR.minZ - 0.5, "#5aa9d6", 4);
  L(GLASS.entranceX[0], FLOOR.minZ - 0.5, FLOOR.minX - 0.5, FLOOR.minZ - 0.5, "#5aa9d6", 4);
  g.text(px(0), py(FLOOR.minZ - 0.5) - 6, "entrance opening (3 m, assumed)", 10, "middle", "#2a6a95");
  for (const x of GLASS.mullionX) g.line(px(x), py(FLOOR.minZ - 0.7), px(x), py(FLOOR.minZ - 0.3), "#3a7ca5", 3);
  g.text(px(0), py(FLOOR.minZ - 0.5) + 18, "GLASS FRONT", 11, "middle", "#2a6a95", "700");
  L(FLOOR.minX - 0.5, FLOOR.minZ - 0.5, FLOOR.minX - 0.5, WALL_FACE_Z + 0.2, "#111", 3);
  L(FLOOR.maxX + 0.5, FLOOR.minZ - 0.5, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.2, "#111", 3);
  L(FLOOR.minX - 0.5, WALL_FACE_Z + 0.1, DOOR.minX, WALL_FACE_Z + 0.1, "#111", 3);
  L(DOOR.maxX, WALL_FACE_Z + 0.1, FLOOR.maxX + 0.5, WALL_FACE_Z + 0.1, "#111", 3);
  L(DOOR.minX, WALL_FACE_Z + 0.1, DOOR.maxX, WALL_FACE_Z + 0.1, "#c0392b", 4, 'stroke-dasharray="4 3"');
  g.text(px((DOOR.minX + DOOR.maxX) / 2), py(WALL_FACE_Z + 0.1) - 8, "staff door, left of the bar as you face it", 10, "middle", "#c0392b", "700");

  // spawn
  g.circle(px(SPAWN.x), py(SPAWN.z), 6, "#2a9d8f");
  g.text(px(SPAWN.x) - 10, py(SPAWN.z) + 4, "visitor spawn (faces the shop)", 10, "end", "#2a9d8f", "600");

  // dimensions
  const SW = FLOOR.maxX - FLOOR.minX;
  hDim(g, px(FLOOR.maxX), px(FLOOR.minX), py(FLOOR.minZ - 1.25), `${SW} m wide`);
  vDim(g, py(FLOOR.maxZ), py(FLOOR.minZ), px(FLOOR.maxX) - 0.95 * S, `${FLOOR.maxZ - FLOOR.minZ} m deep`);
  vDim(g, py(BACK_ROOM_Z1), py(BACK_ROOM_Z0), px(FLOOR.maxX) - 0.95 * S, `${(BACK_ROOM_Z1 - BACK_ROOM_Z0).toFixed(0)} m deep`);
  hDim(g, px(COLUMN_X[2] + TABLE_W / 2), px(COLUMN_X[2] - TABLE_W / 2), py(FLOOR.minZ + 0.35), `${TABLE_W} m`);
  hDim(g, px(COLUMN_X[2] - TABLE_W / 2), px(COLUMN_X[1] + TABLE_W / 2), py(FLOOR.minZ + 0.35), `${(COLUMN_X[2] - COLUMN_X[1] - TABLE_W).toFixed(1)} m aisle`);
  hDim(g, px(COUNTER.x + COUNTER.w / 2), px(COUNTER.x - COUNTER.w / 2), py(7.72), `bar ${COUNTER.w} m`);
  const t0 = TABLES[0];
  vDim(g, py(t0.z + TABLE_LEN / 2), py(t0.z - TABLE_LEN / 2), px(t0.x + TABLE_W / 2) - 0.4 * S, `${TABLE_LEN} m long`);

  const ly = H - 62;
  g.text(60, ly, `Ceiling ${CEILING} m. Tables ${TABLE_W} wide x ${TABLE_LEN} long, six products each, 1.1 m apart. Columns at x = ${COLUMN_X.join(", ")}.`, 11, "start", "#333");
  g.text(60, ly + 16, "From the photos: three table columns, wall benches, glass front about 3.8x as wide as it is tall. Bar shortened to half the wall at your request.", 11, "start", "#333");
  g.text(60, ly + 32, "Assumed, not measurable: shop depth (15 m), back-room size (your instruction: same as the shop), door position (your note: left of the bar), real table sizes.", 11, "start", "#a33");
  return g.done();
}

// =====================================================================
// Wall elevations, each seen from inside the shop, looking at the wall.
// =====================================================================
export function renderWalls(): string {
  const ES = 62; // pixels per metre
  const MX = 70; // left margin
  const PANEL_H = Math.round(CEILING * ES + 200);
  const W = Math.round(17.2 * ES + MX * 2 + 40);
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
    wRect(-bench.d / 2, bench.d / 2, bench.h - 0.12, bench.h, "#e6cfa8", "#8a6a2f", 1.2);
    for (let z = -6.0; z <= 6.0; z += 0.26) wRect(z - 0.075, z + 0.075, bench.h, bench.h + 0.012, "#2d3f66");
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
    g.text(MX, top - 46, "3. BACK WALL, shop side (z = +7.9), seen facing it. The +x side is on the left.", 13, "start", "#111", "700");
    wRect(-x0, x0, 0, CEILING, "#d9dcdf", "#7b8087");
    // the bar stands in front of the wall
    wRect(COUNTER.x - COUNTER.w / 2, COUNTER.x + COUNTER.w / 2, 0, COUNTER.h, "#e6cfa8", "#8a6a2f", 1.5);
    for (const p of PARTITIONS) wRect(p.x - 0.08, p.x + 0.08, 0, p.h, "#8a6a2f", "#5a4210");
    for (const sx of STOOLS.x) {
      wRect(sx - 0.2, sx + 0.2, STOOLS.seatH - 0.05, STOOLS.seatH, "#e6cfa8", "#8a6a2f");
      wRect(sx - 0.02, sx + 0.02, 0, STOOLS.seatH - 0.05, "#8d9399");
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
    g.text(MX, top - 46, "4. FRONT GLASS WALL (z = -8), seen from inside facing it. The +x side is on the right.", 13, "start", "#111", "700");
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
  const S = 52;
  const W = Math.round(17.4 * S + 120);
  const H = Math.round(16.5 * S + 200);
  const cx = 60 + 8.7 * S;
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
