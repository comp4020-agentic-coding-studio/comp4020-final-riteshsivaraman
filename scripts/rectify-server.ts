#!/usr/bin/env node
// A tiny local server for the perspective-rectification tool (tools/rectify).
// It exists so the page can read pixels from the reference photos (a file://
// page cannot) and so corner positions can be saved back into the repo.
// Run: node scripts/rectify-server.ts   then open http://localhost:8123
// Binds to 127.0.0.1 only. Serves: the tool page, the maths (the TypeScript in
// src/shared/homography.ts with its types stripped), and the images in
// references/. Writes only docs/blueprint/rectify.json.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8123);
const SAVED = "docs/blueprint/rectify.json";
const CANDIDATES = "docs/blueprint/rectify.candidates.json";
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const send = (code: number, type: string, body: string | Buffer): void => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };

  if (req.method === "POST" && path === "/api/state") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 200_000) req.destroy();
    });
    req.on("end", () => {
      try {
        JSON.parse(body);
        writeFileSync(SAVED, body);
        send(200, "application/json", '{"ok":true}');
      } catch {
        send(400, "application/json", '{"ok":false}');
      }
    });
    return;
  }
  if (path === "/" || path === "/index.html") {
    return send(200, "text/html; charset=utf-8", readFileSync("tools/rectify/index.html"));
  }
  if (path === "/lib/homography.js") {
    const ts = readFileSync("src/shared/homography.ts", "utf8");
    return send(200, "text/javascript; charset=utf-8", stripTypeScriptTypes(ts));
  }
  if (path === "/api/state") {
    const file = existsSync(SAVED) ? SAVED : CANDIDATES;
    return send(200, "application/json", readFileSync(file));
  }
  if (path === "/api/candidates") return send(200, "application/json", readFileSync(CANDIDATES));
  if (path === "/ref-list") {
    const names = readdirSync("references").filter((n) => /^[\w.-]+\.(png|jpe?g)$/i.test(n));
    return send(200, "application/json", JSON.stringify(names));
  }
  const m = path.match(/^\/ref\/([\w.-]+\.(png|jpe?g))$/i);
  if (m && existsSync(`references/${m[1]}`)) {
    return send(200, TYPES[m[2].toLowerCase()], readFileSync(`references/${m[1]}`));
  }
  send(404, "text/plain", "not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rectify tool: http://localhost:${PORT}  (Ctrl-C to stop)`);
});
