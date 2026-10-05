import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import "./db.ts"; // boot: open the DB, run migrations, before anything else
import { getUserForSession } from "./lib/auth.ts";
import type { Vars } from "./lib/context.ts";
import { renderMarkdown } from "./lib/markdown.ts";
import { authRoutes, readSessionCookie } from "./routes/auth.ts";
import { draftRoutes } from "./routes/drafts.ts";
import { mailRoutes } from "./routes/mail.ts";

const app = new Hono<{ Variables: Vars }>();

app.use("*", async (c, next) => {
  const sessionId = readSessionCookie(c);
  c.set("user", getUserForSession(sessionId));
  await next();
});

app.route("/api/auth", authRoutes);
app.route("/api/mail", mailRoutes);
app.route("/api/drafts", draftRoutes);

// /readme/: README.md rendered verbatim, same contract the placeholder
// Dockerfile proved (spec/README.md: "no script runs").
app.get("/readme/", (c) => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  const body = renderMarkdown(readme);
  return c.html(
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Seen — README</title></head><body><main>${body}</main></body></html>`,
  );
});

const staticDir = join(process.cwd(), "static");
if (existsSync(staticDir)) {
  app.use("/*", serveStatic({ root: "static" }));
  // SPA fallback: anything not an API route or a real static asset gets the
  // app shell, so client-side routing (preact-router) owns the URL.
  app.get("*", (c) => {
    const index = readFileSync(join(staticDir, "index.html"), "utf8");
    return c.html(index);
  });
} else {
  app.get("/", (c) => c.text("Seen: run `pnpm build` to produce static/ first."));
}

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Seen listening on http://0.0.0.0:${info.port}`);
});
