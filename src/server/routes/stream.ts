// Live draft preview transport (ADR 2): a single authenticated SSE endpoint,
// one per logged-in user. The sender's saveDraft() calls livePreview.publish
// straight into this user's channel; we just relay it over the wire.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Vars } from "../lib/context.ts";
import { subscribe } from "../lib/livePreview.ts";

export const streamRoutes = new Hono<{ Variables: Vars }>();

streamRoutes.get("/", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ ok: false, error: "log in first" }, 401);
  const userId = user.id;

  return streamSSE(c, async (stream) => {
    let resolveDone: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const unsubscribe = subscribe(userId, (event) => {
      void stream.writeSSE({ event: "draft", data: JSON.stringify(event) });
    });

    stream.onAbort(() => {
      unsubscribe();
      resolveDone();
    });

    await done;
  });
});
