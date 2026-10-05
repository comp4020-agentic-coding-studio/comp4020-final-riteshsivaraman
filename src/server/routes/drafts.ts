import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db.ts";
import type { Vars } from "../lib/context.ts";
import {
  acquireLock,
  catchUpAutoSend,
  catchUpHeartbeats,
  contributorsFor,
  createDraft,
  DraftError,
  heartbeat,
  listPublicDrafts,
  releaseLock,
  saveDraft,
  sendDraftNow,
} from "../lib/drafts.ts";
import { drafts, users } from "../schema.ts";
import { voiceLine } from "../lib/voice.ts";

export const draftRoutes = new Hono<{ Variables: Vars }>();

function userById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

draftRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ ok: false, error: "log in first" }, 401);
  // no background timers: both catch-ups run on every touch of the board
  catchUpHeartbeats();
  catchUpAutoSend();
  await next();
});

function serializePublicDraft(draft: typeof drafts.$inferSelect, viewerId: string) {
  const isOwner = draft.ownerId === viewerId;
  const contributors = contributorsFor(draft.id).map((id) => userById(id)?.address ?? "unknown");
  return {
    id: draft.id,
    creatorAddress: userById(draft.ownerId)?.address ?? "unknown",
    subject: draft.subject,
    // Strangers never see recipients, attachments, or the quoted thread
    // (seen-spec §4) --- only owner-facing fields include them.
    body: draft.body,
    recipients: isOwner ? (JSON.parse(draft.recipientsJson) as unknown[]) : undefined,
    quotedBody: isOwner ? draft.quotedBody : undefined,
    isOwner,
    contributors,
    autoSendAt: draft.autoSendAt,
    lockedBy: draft.lockedBy ? (userById(draft.lockedBy)?.address ?? "unknown") : null,
    fastMode: draft.fastMode,
  };
}

draftRoutes.get("/board", (c) => {
  const user = c.get("user")!;
  return c.json({ ok: true, drafts: listPublicDrafts().map((d) => serializePublicDraft(d, user.id)) });
});

draftRoutes.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    subject?: string;
    body?: string;
    recipients?: { address: string; kind: "to" | "cc" | "bcc" }[];
    quotedBody?: string | null;
    threadId?: string | null;
    forwardedFromId?: string | null;
    forwardRootId?: string | null;
  }>();
  const id = createDraft(user.id, { ...body, fastMode: user.fastMode });
  return c.json({ ok: true, id });
});

draftRoutes.post("/:id/heartbeat", (c) => {
  heartbeat(c.req.param("id"), c.get("user")!.id);
  return c.json({ ok: true });
});

draftRoutes.post("/:id/save", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    subject?: string;
    body?: string;
    recipients?: { address: string; kind: "to" | "cc" | "bcc" }[];
    selfDestructDurationMs?: number | null;
    publish?: boolean;
  }>();
  try {
    saveDraft(c.req.param("id"), user.id, body, body.publish === true);
    return c.json({ ok: true, voice: voiceLine(user.id, "draft_save") });
  } catch (err) {
    if (err instanceof DraftError) return c.json({ ok: false, error: err.message }, 400);
    throw err;
  }
});

draftRoutes.post("/:id/lock", (c) => {
  const ok = acquireLock(c.req.param("id"), c.get("user")!.id);
  return c.json({ ok });
});

draftRoutes.post("/:id/unlock", (c) => {
  releaseLock(c.req.param("id"), c.get("user")!.id);
  return c.json({ ok: true });
});

draftRoutes.post("/:id/send", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ hesitationMs: number }>();
  try {
    const emailId = sendDraftNow(c.req.param("id"), user.id, body.hesitationMs);
    return c.json({ ok: true, emailId });
  } catch (err) {
    if (err instanceof DraftError) return c.json({ ok: false, error: err.message }, 400);
    throw err;
  }
});
