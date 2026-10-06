// Compose/send/inbox/threads/reply/forward/self-destruct, as plain TS so it
// stays testable without the framework (CLAUDE.md "Keep logic in plain TS").
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, inTransaction } from "../db.ts";
import { emailRecipients, emails, events, users } from "../schema.ts";
import { logEvent } from "./events.ts";

export type RecipientKind = "to" | "cc" | "bcc";
export interface ComposeInput {
  senderId: string;
  recipients: { address: string; kind: RecipientKind }[];
  subject: string;
  body: string;
  quotedBody?: string | null;
  threadId?: string | null;
  forwardedFromId?: string | null;
  forwardRootId?: string | null;
  hesitationMs: number;
  selfDestructDurationMs?: number | null;
  fastMode: boolean;
  contributorIds?: string[];
}

export interface SendResult {
  emailId: string;
  bounced: string[]; // addresses that didn't resolve to a user
}

/** Resolves addresses, creates the email + recipient rows, logs events.
 * Unknown addresses bounce privately to the sender only (seen-spec §2). */
export function sendEmail(input: ComposeInput): SendResult {
  const bounced: string[] = [];
  const resolved: { userId: string; kind: RecipientKind }[] = [];
  for (const r of input.recipients) {
    const user = db.select().from(users).where(eq(users.address, r.address.toLowerCase())).get();
    if (user) resolved.push({ userId: user.id, kind: r.kind });
    else bounced.push(r.address);
  }

  const emailId = randomUUID();
  const now = Date.now();
  inTransaction(() => {
    db.insert(emails)
      .values({
        id: emailId,
        senderId: input.senderId,
        subject: input.subject,
        body: input.body,
        quotedBody: input.quotedBody ?? null,
        threadId: input.threadId ?? null,
        forwardRootId: input.forwardRootId ?? null,
        forwardedFromId: input.forwardedFromId ?? null,
        hesitationMs: input.hesitationMs,
        contributorsJson: JSON.stringify(input.contributorIds ?? [input.senderId]),
        sentAt: now,
        selfDestructAt: input.selfDestructDurationMs ? now + input.selfDestructDurationMs : null,
        fastMode: input.fastMode,
      })
      .run();
    for (const r of resolved) {
      db.insert(emailRecipients)
        .values({ id: randomUUID(), emailId, userId: r.userId, kind: r.kind })
        .run();
    }
  });

  logEvent(input.senderId, "send", { emailId, subject: input.subject, recipients: resolved.length });
  for (const address of bounced) {
    logEvent(input.senderId, "bounce", { address, subject: input.subject });
  }
  if (input.forwardRootId) {
    const root = db.select().from(emails).where(eq(emails.id, input.forwardRootId)).get();
    if (root) {
      logEvent(root.senderId, "forward", {
        emailId,
        forwardRootId: input.forwardRootId,
        forwardedBy: input.senderId,
        toAddresses: input.recipients.map((r) => r.address),
      });
    }
  }
  return { emailId, bounced };
}

export interface InboxRow {
  email: typeof emails.$inferSelect;
  recipients: (typeof emailRecipients.$inferSelect)[];
  myKind: RecipientKind;
}

/** Everyone a recipient can see every other recipient --- BCC exposed both
 * ways is "decided" (seen-spec §6), so this never filters by kind. */
function recipientsFor(emailId: string) {
  return db.select().from(emailRecipients).where(eq(emailRecipients.emailId, emailId)).all();
}

export function getInbox(userId: string): InboxRow[] {
  const mine = db.select().from(emailRecipients).where(eq(emailRecipients.userId, userId)).all();
  return mine
    .map((m) => {
      const email = db.select().from(emails).where(eq(emails.id, m.emailId)).get();
      if (!email) return null;
      return { email, recipients: recipientsFor(email.id), myKind: m.kind as RecipientKind };
    })
    .filter((x): x is InboxRow => x !== null)
    .sort((a, b) => b.email.sentAt - a.email.sentAt);
}

export function getSent(userId: string): (typeof emails.$inferSelect)[] {
  return db
    .select()
    .from(emails)
    .where(eq(emails.senderId, userId))
    .all()
    .sort((a, b) => b.sentAt - a.sentAt);
}

/** Marks the email opened by this recipient (first open only), runs the
 * self-destruct catch-up (CLAUDE.md "no background processes" --- this is
 * the "next request that touches it" that applies the deadline). */
export function openEmail(emailId: string, userId: string): void {
  const rec = db
    .select()
    .from(emailRecipients)
    .where(and(eq(emailRecipients.emailId, emailId), eq(emailRecipients.userId, userId)))
    .get();
  if (rec && rec.openedAt == null) {
    db.update(emailRecipients).set({ openedAt: Date.now() }).where(eq(emailRecipients.id, rec.id)).run();
    logEvent(userId, "open", { emailId });
  }
  catchUpSelfDestruct(emailId);
}

/** Applies self-destruct if the deadline has passed and it hasn't fired yet.
 * Safe to call on every read --- idempotent once destroyedAt is set. */
export function catchUpSelfDestruct(emailId: string): void {
  const email = db.select().from(emails).where(eq(emails.id, emailId)).get();
  if (!email || !email.selfDestructAt || email.destroyedAt) return;
  if (Date.now() < email.selfDestructAt) return;

  db.update(emails).set({ destroyedAt: Date.now() }).where(eq(emails.id, emailId)).run();
  const recipients = recipientsFor(emailId);
  let notified = false;
  for (const r of recipients) {
    if (r.openedAt == null) {
      logEvent(email.senderId, "self_destruct", { emailId, recipientId: r.userId, opened: false });
      logEvent(r.userId, "self_destruct", { emailId, senderId: email.senderId, opened: false });
      notified = true;
    }
  }
  // Every recipient had already opened it before the deadline, so nobody
  // gets (or needs) a notice --- but the tombstone write above is still a
  // state change, and CLAUDE.md's event-log invariant doesn't carve out an
  // exception for "nobody needs telling." userId: null keeps this out of
  // every getNotices() feed (which always filters by a specific userId) so
  // product behavior is unchanged; it exists purely so the destroy action
  // itself always has a row. Not asserted in spec/ --- there's no HTTP-
  // observable consequence to check (that's the point), so this is verified
  // by direct inspection, same tier as the draft-auto-send-deadline check.
  if (!notified) logEvent(null, "self_destruct", { emailId, opened: true });
}

/** Sweeps every email this user sent or received for a passed self-destruct
 * deadline. Call once per inbox/sent load (no setInterval --- the machine
 * sleeps). */
export interface Notice {
  type: string;
  at: number;
  payload: Record<string, unknown>;
}

/** Forward alerts, self-destruct notices, bounces: all views over the event
 * log (CLAUDE.md "Event log is load-bearing"), not a separate table. */
export function getNotices(userId: string): Notice[] {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), inArray(events.type, ["forward", "self_destruct", "bounce"])))
    .orderBy(desc(events.at))
    .limit(50)
    .all()
    .map((e) => ({ type: e.type, at: e.at, payload: JSON.parse(e.payloadJson) as Record<string, unknown> }));
}

/** Addresses this user has recently sent to, most-recent-first, deduped,
 * capped at 20 --- feeds the compose autocomplete. Read-only, no events row
 * (not a user action, just a query). */
export function recentRecipients(userId: string): string[] {
  const sent = db.select().from(emails).where(eq(emails.senderId, userId)).orderBy(desc(emails.sentAt)).all();
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const email of sent) {
    const recipients = recipientsFor(email.id);
    for (const r of recipients) {
      const user = userById(r.userId);
      if (!user || seen.has(user.address)) continue;
      seen.add(user.address);
      addresses.push(user.address);
      if (addresses.length >= 20) return addresses;
    }
  }
  return addresses;
}

function userById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function catchUpUserEmails(userId: string): void {
  const asSender = db.select().from(emails).where(eq(emails.senderId, userId)).all();
  const asRecipient = db.select().from(emailRecipients).where(eq(emailRecipients.userId, userId)).all();
  const ids = new Set([...asSender.map((e) => e.id), ...asRecipient.map((r) => r.emailId)]);
  for (const id of ids) catchUpSelfDestruct(id);
}
