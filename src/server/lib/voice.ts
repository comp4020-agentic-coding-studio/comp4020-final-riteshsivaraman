// Passive-aggressive app copy, escalating by action count (seen-spec.md
// section 10). Counts come from the event log (events of this type by this
// user), never a separate counter column --- the event log is the source of
// truth. Fast mode escalates faster (CLAUDE.md: no background timers, but
// this is just arithmetic, no timer involved).
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db.ts";
import { events, users } from "../schema.ts";
import type { EventType } from "./events.ts";

const LADDERS: Record<string, string[]> = {
  draft_save: ["Draft saved.", "Draft saved. Publicly, but saved.", "Draft saved again. Everyone's going to see this one too."],
  send: ["Sent.", "Sent. No unsend, you know.", "Sent. Again. Bold of you."],
  draft_edit: ["Edit saved.", "Someone's going to notice that edit.", "That's a lot of other people's words you're changing."],
  forward: ["Forwarded.", "Forwarded. They'll hear about it.", "Forwarding again? At this point it's a hobby."],
};

function countSince(userId: string, type: EventType, since: number): number {
  const row = db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.type, type), gte(events.at, since)))
    .all();
  return row.length;
}

/** Escalation window: 10 minutes real, or 1 minute in fast mode, matching
 * seen-spec's "10-minute session reaches full snark by minute 5" pace. */
export function voiceLine(userId: string, type: EventType): string {
  const ladder = LADDERS[type];
  if (!ladder) return "";
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const windowMs = user?.fastMode ? 60_000 : 10 * 60_000;
  const count = countSince(userId, type, Date.now() - windowMs);
  const level = Math.min(count, ladder.length - 1);
  return ladder[level] ?? ladder[ladder.length - 1];
}
