import type Database from "better-sqlite3";

// A customer's goal, outliving any one conversation (SCOPE D42, ADR 4 option
// B): who owns it, what has been learned, and whether it is still open.
// `conversations` becomes one exchange inside a case; a handoff reassigns the
// case's owner, not anything on the conversation row, so the next owner's
// script can read every fact already learned instead of asking again.
//
// Pure data layer, same shape as stock.ts: no events row is written here.
// Wiring this into service.ts's claim/handOn/open flow is a later step, and
// that step is what writes the events row for a handoff (CLAUDE.md's
// invariant lives at the call site, same as takeOne's stock change does).

export interface CaseRow {
  id: string;
  visitorId: string;
  kind: string;
  status: string;
  ownerId: string | null;
  ownerKind: string | null;
  deadlineAt: number | null;
  createdAt: number;
  endedAt: number | null;
}

function toCase(r: Record<string, unknown>): CaseRow {
  return {
    id: r.id as string,
    visitorId: r.visitor_id as string,
    kind: r.kind as string,
    status: r.status as string,
    ownerId: (r.owner_id as string) ?? null,
    ownerKind: (r.owner_kind as string) ?? null,
    deadlineAt: (r.deadline_at as number) ?? null,
    createdAt: r.created_at as number,
    endedAt: (r.ended_at as number) ?? null,
  };
}

// The visitor's open case of this kind, or null. A visitor can have more than
// one open case at once (a phone purchase and a repair), never two open at
// once of the same kind.
export function openCaseOf(db: Database.Database, visitorId: string, kind: string): CaseRow | null {
  const row = db
    .prepare("SELECT * FROM cases WHERE visitor_id = ? AND kind = ? AND ended_at IS NULL")
    .get(visitorId, kind) as Record<string, unknown> | undefined;
  return row ? toCase(row) : null;
}

export function caseById(db: Database.Database, id: string): CaseRow | null {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toCase(row) : null;
}

// Opens a case, or returns the visitor's already-open one of this kind
// (idempotent on purpose: a customer re-approaching the same post should
// not fork a second case for the same goal).
export function openCase(
  db: Database.Database,
  args: { id: string; visitorId: string; kind: string; ownerId?: string | null; ownerKind?: string | null; now: number },
): CaseRow {
  const existing = openCaseOf(db, args.visitorId, args.kind);
  if (existing) return existing;
  db.prepare(
    "INSERT INTO cases (id, visitor_id, kind, status, owner_id, owner_kind, created_at) VALUES (?, ?, ?, 'open', ?, ?, ?)",
  ).run(args.id, args.visitorId, args.kind, args.ownerId ?? null, args.ownerKind ?? null, args.now);
  return caseById(db, args.id)!;
}

// Reassigns who owns a case — the thing a handoff actually does. Returns
// false if the case does not exist or is already closed, so a caller can
// tell "nothing to hand off" apart from a successful handoff.
export function handOffCase(db: Database.Database, caseId: string, ownerId: string | null, ownerKind: string | null): boolean {
  const r = db
    .prepare("UPDATE cases SET owner_id = ?, owner_kind = ? WHERE id = ? AND ended_at IS NULL")
    .run(ownerId, ownerKind, caseId);
  return r.changes === 1;
}

export function closeCase(db: Database.Database, caseId: string, status: string, now: number): boolean {
  const r = db.prepare("UPDATE cases SET status = ?, ended_at = ? WHERE id = ? AND ended_at IS NULL").run(status, now, caseId);
  return r.changes === 1;
}

// Learns, or overwrites, one fact on a case — the storage choice, the
// budget, whether they want a trade-in. Each fact remembers who learned it
// and when, so "did Dan already ask this" is answerable without re-reading
// every past conversation.
export function setFact(db: Database.Database, caseId: string, key: string, value: string, learnedBy: string | null, now: number): void {
  db.prepare(
    "INSERT INTO case_facts (case_id, key, value, learned_by, learned_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(case_id, key) DO UPDATE SET value = excluded.value, learned_by = excluded.learned_by, learned_at = excluded.learned_at",
  ).run(caseId, key, value, learnedBy, now);
}

// Every fact learned on a case so far, as a plain record an ordering policy
// can check ("is storage already known?") without touching SQL itself.
export function factsOf(db: Database.Database, caseId: string): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM case_facts WHERE case_id = ?").all(caseId) as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
