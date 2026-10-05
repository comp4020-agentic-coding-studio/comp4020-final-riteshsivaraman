import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";
import { users } from "../schema.ts";
import type { Vars } from "../lib/context.ts";
import { catchUpUserEmails, getInbox, getNotices, getSent, openEmail, sendEmail } from "../lib/mail.ts";
import { voiceLine } from "../lib/voice.ts";

export const mailRoutes = new Hono<{ Variables: Vars }>();

function userById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function serializeEmail(row: ReturnType<typeof getInbox>[number] | { email: ReturnType<typeof getSent>[number]; recipients: []; myKind: null }) {
  const { email, recipients } = row;
  const tombstone = email.destroyedAt != null;
  return {
    id: email.id,
    senderId: email.senderId,
    senderAddress: userById(email.senderId)?.address ?? "unknown",
    subject: email.subject,
    body: tombstone ? null : email.body,
    quotedBody: tombstone ? null : email.quotedBody,
    threadId: email.threadId,
    forwardRootId: email.forwardRootId,
    hesitationMs: email.hesitationMs,
    sentAt: email.sentAt,
    selfDestructAt: email.selfDestructAt,
    destroyedAt: email.destroyedAt,
    fastMode: email.fastMode,
    contributors: (JSON.parse(email.contributorsJson) as string[]).map((id) => userById(id)?.address ?? "unknown"),
    recipients: recipients.map((r) => ({ address: userById(r.userId)?.address ?? "unknown", kind: r.kind, openedAt: r.openedAt })),
    tombstone: tombstone
      ? recipients.map((r) => ({ address: userById(r.userId)?.address ?? "unknown", read: r.openedAt != null }))
      : null,
  };
}

mailRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ ok: false, error: "log in first" }, 401);
  catchUpUserEmails(user.id); // no background timers: catch up on every touch
  await next();
});

mailRoutes.get("/inbox", (c) => {
  const user = c.get("user")!;
  return c.json({ ok: true, emails: getInbox(user.id).map(serializeEmail) });
});

mailRoutes.get("/notices", (c) => {
  const user = c.get("user")!;
  return c.json({ ok: true, notices: getNotices(user.id) });
});

mailRoutes.get("/sent", (c) => {
  const user = c.get("user")!;
  const sent = getSent(user.id).map((email) => serializeEmail({ email, recipients: [], myKind: null }));
  return c.json({ ok: true, emails: sent });
});

mailRoutes.post("/:id/open", (c) => {
  const user = c.get("user")!;
  openEmail(c.req.param("id"), user.id);
  return c.json({ ok: true });
});

mailRoutes.post("/send", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    quotedBody?: string | null;
    threadId?: string | null;
    forwardedFromId?: string | null;
    forwardRootId?: string | null;
    hesitationMs: number;
    selfDestructDurationMs?: number | null;
  }>();
  const recipients = [
    ...body.to.map((address) => ({ address, kind: "to" as const })),
    ...(body.cc ?? []).map((address) => ({ address, kind: "cc" as const })),
    ...(body.bcc ?? []).map((address) => ({ address, kind: "bcc" as const })),
  ];
  const result = sendEmail({
    senderId: user.id,
    recipients,
    subject: body.subject,
    body: body.body,
    quotedBody: body.quotedBody,
    threadId: body.threadId,
    forwardedFromId: body.forwardedFromId,
    forwardRootId: body.forwardRootId,
    hesitationMs: body.hesitationMs,
    selfDestructDurationMs: body.selfDestructDurationMs,
    fastMode: user.fastMode,
  });
  const line = voiceLine(user.id, "send");
  return c.json({ ok: true, ...result, voice: line });
});
