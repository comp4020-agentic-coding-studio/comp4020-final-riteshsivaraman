#!/usr/bin/env node
// A tiny local server for the layout editor (tools/layout).
// Run: node scripts/layout-server.ts   then open http://localhost:8124
// Serves the editor page, hands it the fixed parts of the shop for context
// (walls, bar, partitions, door), and writes ONLY src/shared/layout.json, after
// checking its shape. Binds to 127.0.0.1 only.
//
// After saving, regenerate the drawings with `node scripts/blueprint.ts`;
// `pnpm test` fails until you do (the drawings are checked against the model).
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { CEILING, FLOOR, SPAWN } from "../src/shared/protocol.ts";
import { COUNTER, DOOR, PARTITIONS } from "../src/shared/world.ts";
import { GLASS } from "../src/shared/plan.ts";

const PORT = Number(process.env.PORT ?? 8124);
const FILE = "src/shared/layout.json";
const KINDS = ["phone", "tablet", "tabletKb", "laptop", "watch", "earbuds", "headphones", "speaker", "airtag"];

const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,12}$/.test(v);

// returns an error message, or null if the layout is acceptable
function check(l: any): string | null {
  if (!l || !Array.isArray(l.tables) || !Array.isArray(l.benches) || !Array.isArray(l.stools)) return "missing tables, benches or stools";
  if (l.tables.length > 60 || l.benches.length > 12 || l.stools.length > 80) return "too many items";
  const ids = new Set<string>();
  const bounds = { minX: FLOOR.minX - 0.01, maxX: FLOOR.maxX + 0.01, minZ: FLOOR.minZ - 0.01, maxZ: FLOOR.maxZ + 0.01 };
  const inside = (x: number, z: number): boolean => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  for (const t of l.tables) {
    if (!id(t.id) || ids.has(t.id)) return `bad or repeated id ${t.id}`;
    ids.add(t.id);
    if (!num(t.x, -20, 20) || !num(t.z, -20, 20) || !num(t.w, 0.2, 6) || !num(t.d, 0.2, 6)) return `table ${t.id}: bad position or size`;
    if (!inside(t.x, t.z)) return `table ${t.id} is outside the shop`;
    if (typeof t.service !== "boolean") return `table ${t.id}: service must be true or false`;
    if (!Array.isArray(t.products) || t.products.length > 4 || !t.products.every((k: unknown) => typeof k === "string" && KINDS.includes(k))) return `table ${t.id}: bad products`;
    if (!t.service && t.products.length !== 4) return `table ${t.id}: a product table needs four products`;
  }
  for (const b of l.benches) {
    if (!id(b.id) || ids.has(b.id)) return `bad or repeated id ${b.id}`;
    ids.add(b.id);
    if (!num(b.x, -20, 20) || !num(b.z, -20, 20) || !num(b.w, 0.2, 3) || !num(b.d, 0.5, 20)) return `bench ${b.id}: bad position or size`;
  }
  for (const s of l.stools) {
    if (!id(s.id) || ids.has(s.id)) return `bad or repeated id ${s.id}`;
    ids.add(s.id);
    if (!num(s.x, -20, 20) || !num(s.z, -20, 20)) return `stool ${s.id}: bad position`;
    if (!inside(s.x, s.z)) return `stool ${s.id} is outside the shop`;
    if (s.kind !== "bar" && s.kind !== "table") return `stool ${s.id}: kind must be bar or table`;
  }
  return null;
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const send = (code: number, type: string, body: string | Buffer): void => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  if (req.method === "POST" && path === "/api/layout") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 300_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const layout = JSON.parse(body);
        const problem = check(layout);
        if (problem) return send(400, "application/json", JSON.stringify({ ok: false, error: problem }));
        const r = (n: number): number => Math.round(n * 1000) / 1000;
        const clean = {
          tables: layout.tables.map((t: any) => ({ id: t.id, x: r(t.x), z: r(t.z), w: r(t.w), d: r(t.d), service: t.service, products: t.products })),
          benches: layout.benches.map((b: any) => ({ id: b.id, x: r(b.x), z: r(b.z), w: r(b.w), d: r(b.d) })),
          stools: layout.stools.map((s: any) => ({ id: s.id, x: r(s.x), z: r(s.z), kind: s.kind })),
        };
        writeFileSync(FILE, JSON.stringify(clean, null, 1) + "\n");
        send(200, "application/json", '{"ok":true}');
      } catch {
        send(400, "application/json", '{"ok":false,"error":"not JSON"}');
      }
    });
    return;
  }
  if (path === "/" || path === "/index.html") return send(200, "text/html; charset=utf-8", readFileSync("tools/layout/index.html"));
  if (path === "/api/layout") {
    const context = {
      floor: FLOOR,
      ceiling: CEILING,
      spawn: SPAWN,
      counter: COUNTER,
      partitions: PARTITIONS,
      door: DOOR,
      entranceX: GLASS.entranceX,
      kinds: KINDS,
    };
    return send(200, "application/json", JSON.stringify({ layout: JSON.parse(readFileSync(FILE, "utf8")), context }));
  }
  send(404, "text/plain", "not found");
});

server.listen(PORT, "127.0.0.1", () => console.log(`layout editor: http://localhost:${PORT}  (Ctrl-C to stop)`));
