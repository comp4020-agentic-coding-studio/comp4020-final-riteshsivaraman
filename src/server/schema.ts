import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Smallest schema that works (CLAUDE.md "Event log is load-bearing"): the
// `events` table is the single source of truth everything else (forward
// alerts, self-destruct notices, bounces, later stats/sorts/creepy-mirror)
// reads instead of a pile of bespoke notification tables.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  address: text("address").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fastMode: integer("fast_mode", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

// A sent email. Drafts (below) are a separate table until they're sent, at
// which point a row here is created and the draft is gone --- a sent email
// is immutable except for the self-destruct fields.
export const emails = sqliteTable(
  "emails",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // Snapshot of the quoted thread at compose time, independent of the
    // parent's current state (self-destruct/edits to the parent never
    // change what a reply already quoted).
    quotedBody: text("quoted_body"),
    threadId: text("thread_id"), // root email id; null means this IS the root
    // Not the immediate parent --- the very first email in the chain, so a
    // forward-of-a-forward still points back to the original sender.
    forwardRootId: text("forward_root_id"),
    forwardedFromId: text("forwarded_from_id"), // immediate parent, for display only
    hesitationMs: integer("hesitation_ms").notNull(),
    // Who edited this before it was sent (draft contributors), captured at
    // send time --- "nobody edits anonymously" (seen-spec §4).
    contributorsJson: text("contributors_json").notNull().default("[]"),
    sentAt: integer("sent_at").notNull(),
    selfDestructAt: integer("self_destruct_at"),
    destroyedAt: integer("destroyed_at"),
    fastMode: integer("fast_mode", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("emails_thread_idx").on(t.threadId), index("emails_sender_idx").on(t.senderId)],
);

export const emailRecipients = sqliteTable(
  "email_recipients",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["to", "cc", "bcc"] }).notNull(),
    openedAt: integer("opened_at"),
  },
  (t) => [index("email_recipients_email_idx").on(t.emailId), index("email_recipients_user_idx").on(t.userId)],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    quotedBody: text("quoted_body"), // hidden from the public board, same as emails.quotedBody
    threadId: text("thread_id"),
    forwardRootId: text("forward_root_id"),
    forwardedFromId: text("forwarded_from_id"),
    // recipients are stored as JSON here (not a join table) because the
    // public board must NEVER expose them --- one column is easier to keep
    // out of a public-facing query than policing a join everywhere.
    recipientsJson: text("recipients_json").notNull().default("[]"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    becamePublicAt: integer("became_public_at"),
    autoSendAt: integer("auto_send_at"),
    lastHeartbeatAt: integer("last_heartbeat_at").notNull(),
    lockedBy: text("locked_by").references(() => users.id),
    lockedAt: integer("locked_at"),
    fastMode: integer("fast_mode", { mode: "boolean" }).notNull().default(false),
    selfDestructDurationMs: integer("self_destruct_duration_ms"),
  },
  (t) => [index("drafts_owner_idx").on(t.ownerId), index("drafts_public_idx").on(t.isPublic)],
);

export const draftContributors = sqliteTable(
  "draft_contributors",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    firstContributedAt: integer("first_contributed_at").notNull(),
  },
  (t) => [index("draft_contributors_draft_idx").on(t.draftId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    at: integer("at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("events_user_idx").on(t.userId), index("events_type_idx").on(t.type)],
);
