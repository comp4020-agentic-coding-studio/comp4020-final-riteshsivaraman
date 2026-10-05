// The append-only log every other feature reads (CLAUDE.md "Event log is
// load-bearing"). Every state-changing action in this app calls logEvent.
// Plain TS, no framework dependency, so it's trivially testable.
import { randomUUID } from "node:crypto";
import { db } from "../db.ts";
import { events } from "../schema.ts";

export type EventType =
  | "signup"
  | "send"
  | "open"
  | "draft_save"
  | "draft_edit"
  | "draft_public"
  | "draft_auto_send"
  | "forward"
  | "bounce"
  | "self_destruct"
  | "fast_mode_toggle";

export function logEvent(userId: string | null, type: EventType, payload: Record<string, unknown> = {}): void {
  db.insert(events)
    .values({
      id: randomUUID(),
      userId,
      type,
      payloadJson: JSON.stringify(payload),
      at: Date.now(),
    })
    .run();
}
