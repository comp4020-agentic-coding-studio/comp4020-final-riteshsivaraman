import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import "./db.ts"; // open the database and create tables before anything else
import { renderMarkdown } from "./markdown.ts";
import { emitError } from "./eventlog.ts";
import { handleConnection } from "./presence.ts";

// A throw outside a socket handler is logged, not silent. The process keeps
// running: a store with people in it should not drop because one path failed.
process.on("uncaughtException", (err) => emitError("uncaught_exception", null, undefined, err));
process.on("unhandledRejection", (err) => emitError("unhandled_rejection", null, undefined, err));

const app = new Hono();

// /readme/: README.md rendered as plain HTML, so it reads without running a
// script (spec/README.md: the marker starts here).
app.get("/readme/", (c) => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  return c.html(
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>README</title></head><body><main>${renderMarkdown(readme)}</main></body></html>`,
  );
});

const staticDir = join(process.cwd(), "static");
if (existsSync(staticDir)) {
  app.use("/*", serveStatic({ root: "static" }));
  app.get("*", (c) => c.html(readFileSync(join(staticDir, "index.html"), "utf8")));
} else {
  app.get("/", (c) => c.text("Run `pnpm build` to produce static/ first."));
}

const port = Number(process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on http://0.0.0.0:${info.port}`);
});

// WebSocket on the same port, at /ws. Fly's proxy terminates TLS in front, so
// the app sees plain ws; clients use wss:// on the deployed URL.
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", handleConnection);
server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
