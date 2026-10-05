// The public draft board (seen-spec.md §4) --- the core mechanic: a draft
// goes public on manual save or on 30s of close-tab silence, strangers can
// edit the body (single-editor lock in v0.1, no Yjs yet), everyone who
// touched it is a contributor, and it auto-sends itself after a deadline
// with whatever's in it at that moment.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { draftContributors, drafts, type drafts as draftsTable } from "../schema.ts";
import { logEvent } from "./events.ts";
import { type RecipientKind, sendEmail } from "./mail.ts";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const AUTO_SEND_MS = 24 * 60 * 60 * 1000;
const AUTO_SEND_MS_FAST = 2 * 60 * 1000;
const LOCK_TTL_MS = 60_000; // a held lock expires if the editor goes quiet

export interface DraftRecipient {
  address: string;
  kind: RecipientKind;
}

export class DraftError extends Error {}

export function createDraft(
  ownerId: string,
  input: {
    subject?: string;
    body?: string;
    recipients?: DraftRecipient[];
    quotedBody?: string | null;
    threadId?: string | null;
    forwardedFromId?: string | null;
    forwardRootId?: string | null;
    selfDestructDurationMs?: number | null;
    fastMode: boolean;
  },
): string {
  const id = randomUUID();
  const now = Date.now();
  db.insert(drafts)
    .values({
      id,
      ownerId,
      subject: input.subject ?? "",
      body: input.body ?? "",
      quotedBody: input.quotedBody ?? null,
      threadId: input.threadId ?? null,
      forwardedFromId: input.forwardedFromId ?? null,
      forwardRootId: input.forwardRootId ?? null,
      recipientsJson: JSON.stringify(input.recipients ?? []),
      isPublic: false,
      createdAt: now,
      lastHeartbeatAt: now,
      fastMode: input.fastMode,
      selfDestructDurationMs: input.selfDestructDurationMs ?? null,
    })
    .run();
  return id;
}

/** The owner's own compose window calls this periodically while open. If it
 * stops for ~30s with an unsent draft, the next catch-up makes it public ---
 * browsers don't reliably report tab closes (seen-spec §4). */
export function heartbeat(draftId: string, userId: string): void {
  const draft = mustGetDraft(draftId);
  if (draft.ownerId !== userId) return;
  db.update(drafts).set({ lastHeartbeatAt: Date.now() }).where(eq(drafts.id, draftId)).run();
}

export function saveDraft(
  draftId: string,
  userId: string,
  fields: { subject?: string; body?: string; recipients?: DraftRecipient[]; selfDestructDurationMs?: number | null },
  makePublic = false,
): void {
  const draft = mustGetDraft(draftId);
  if (draft.isPublic && draft.ownerId !== userId) {
    assertLockHeld(draft, userId);
    recordContributor(draftId, userId);
    logEvent(userId, "draft_edit", { draftId });
    // strangers edit the body only --- never subject/recipients (seen-spec §4)
    db.update(drafts).set({ body: fields.body ?? draft.body, lastHeartbeatAt: Date.now() }).where(eq(drafts.id, draftId)).run();
    return;
  }
  if (draft.ownerId !== userId) throw new DraftError("not your draft to edit yet");

  const updates: Partial<typeof draftsTable.$inferInsert> = { lastHeartbeatAt: Date.now() };
  if (fields.subject !== undefined) updates.subject = fields.subject;
  if (fields.body !== undefined) updates.body = fields.body;
  if (fields.recipients !== undefined) updates.recipientsJson = JSON.stringify(fields.recipients);
  if (fields.selfDestructDurationMs !== undefined) updates.selfDestructDurationMs = fields.selfDestructDurationMs;
  db.update(drafts).set(updates).where(eq(drafts.id, draftId)).run();
  logEvent(userId, "draft_save", { draftId });

  if (makePublic && !draft.isPublic) publicize(draftId, draft.fastMode);
}

function publicize(draftId: string, fastMode: boolean): void {
  const now = Date.now();
  const deadline = now + (fastMode ? AUTO_SEND_MS_FAST : AUTO_SEND_MS);
  db.update(drafts)
    .set({ isPublic: true, becamePublicAt: now, autoSendAt: deadline })
    .where(eq(drafts.id, draftId))
    .run();
  const draft = mustGetDraft(draftId);
  logEvent(draft.ownerId, "draft_public", { draftId });
}

export function listPublicDrafts(): (typeof draftsTable.$inferSelect)[] {
  return db.select().from(drafts).where(eq(drafts.isPublic, true)).all();
}

export function contributorsFor(draftId: string): string[] {
  return db
    .select()
    .from(draftContributors)
    .where(eq(draftContributors.draftId, draftId))
    .all()
    .map((c) => c.userId);
}

function recordContributor(draftId: string, userId: string): void {
  const existing = db
    .select()
    .from(draftContributors)
    .where(and(eq(draftContributors.draftId, draftId), eq(draftContributors.userId, userId)))
    .get();
  if (!existing) {
    db.insert(draftContributors).values({ id: randomUUID(), draftId, userId, firstContributedAt: Date.now() }).run();
  }
}

export function acquireLock(draftId: string, userId: string): boolean {
  const draft = mustGetDraft(draftId);
  const now = Date.now();
  const lockFree = !draft.lockedBy || !draft.lockedAt || now - draft.lockedAt > LOCK_TTL_MS || draft.lockedBy === userId;
  if (!lockFree) return false;
  db.update(drafts).set({ lockedBy: userId, lockedAt: now }).where(eq(drafts.id, draftId)).run();
  return true;
}

export function releaseLock(draftId: string, userId: string): void {
  const draft = mustGetDraft(draftId);
  if (draft.lockedBy === userId) {
    db.update(drafts).set({ lockedBy: null, lockedAt: null }).where(eq(drafts.id, draftId)).run();
  }
}

function assertLockHeld(draft: typeof draftsTable.$inferSelect, userId: string): void {
  const now = Date.now();
  const held = draft.lockedBy === userId && draft.lockedAt != null && now - draft.lockedAt <= LOCK_TTL_MS;
  if (!held) throw new DraftError("acquire the edit lock first");
}

/** Owner can send early with whatever's in it (seen-spec §4: "owner's
 * rights: can send early"). */
export function sendDraftNow(draftId: string, userId: string, hesitationMs: number): string {
  const draft = mustGetDraft(draftId);
  if (draft.ownerId !== userId) throw new DraftError("only the owner can send");
  return finalizeSend(draft, hesitationMs);
}

/** The auto-send catch-up: call on every request that touches the public
 * board (no setInterval --- CLAUDE.md "no background processes"). Whatever
 * is in the draft at this moment is frozen and sent, from the owner. */
export function catchUpAutoSend(): void {
  const now = Date.now();
  const due = db.select().from(drafts).where(eq(drafts.isPublic, true)).all().filter((d) => d.autoSendAt != null && d.autoSendAt <= now);
  for (const draft of due) finalizeSend(draft);
}

function finalizeSend(draft: typeof draftsTable.$inferSelect, hesitationMsOverride?: number): string {
  const recipients: DraftRecipient[] = JSON.parse(draft.recipientsJson);
  const contributors = contributorsFor(draft.id);
  const allContributors = [draft.ownerId, ...contributors.filter((c) => c !== draft.ownerId)];
  const { emailId } = sendEmail({
    senderId: draft.ownerId,
    recipients,
    subject: draft.subject,
    body: draft.body,
    quotedBody: draft.quotedBody,
    threadId: draft.threadId,
    forwardedFromId: draft.forwardedFromId,
    forwardRootId: draft.forwardRootId,
    hesitationMs: hesitationMsOverride ?? Math.max(0, Date.now() - draft.lastHeartbeatAt),
    fastMode: draft.fastMode,
    contributorIds: allContributors,
    selfDestructDurationMs: draft.selfDestructDurationMs,
  });
  logEvent(draft.ownerId, "draft_auto_send", { draftId: draft.id, emailId });
  // draft_contributors references this draft --- delete it first or the FK
  // check fails (caught by testing the real early-send path, not just
  // reading the code).
  db.delete(draftContributors).where(eq(draftContributors.draftId, draft.id)).run();
  db.delete(drafts).where(eq(drafts.id, draft.id)).run();
  return emailId;
}

/** A private draft whose owner has gone quiet past the heartbeat timeout
 * becomes public --- browsers don't reliably report tab closes. */
export function catchUpHeartbeats(): void {
  const stale = db
    .select()
    .from(drafts)
    .where(eq(drafts.isPublic, false))
    .all()
    .filter((d) => Date.now() - d.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS);
  for (const draft of stale) publicize(draft.id, draft.fastMode);
}

function mustGetDraft(draftId: string): typeof draftsTable.$inferSelect {
  const draft = db.select().from(drafts).where(eq(drafts.id, draftId)).get();
  if (!draft) throw new DraftError("no such draft");
  return draft;
}
