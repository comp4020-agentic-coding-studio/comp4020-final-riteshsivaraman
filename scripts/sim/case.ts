// Standalone, in-memory mirror of src/server/cases.ts's shape (SCOPE D42) --
// deliberately not the real module. This is SCOPE D43's option B: a cheap,
// throwaway prototype to check the loop/case/slot design feels right before
// building the real thing, not the shipped engine. Nothing here touches
// SQLite, service.ts, or an events table.
export interface SimCase {
  id: string;
  visitorId: string;
  kind: string;
  ownerId: string;
  facts: Record<string, string>;
  status: "open" | "fulfilled" | "abandoned";
}

let n = 0;

export function openCase(visitorId: string, kind: string, ownerId: string): SimCase {
  return { id: `case-${++n}`, visitorId, kind, ownerId, facts: {}, status: "open" };
}

export function setFact(c: SimCase, key: string, value: string): void {
  c.facts[key] = value;
}

// The thing a handoff actually does: reassign the owner. The facts already
// on the case travel with it for free -- nothing to carry separately.
export function handOff(c: SimCase, newOwnerId: string): void {
  c.ownerId = newOwnerId;
}

export function closeCase(c: SimCase, status: "fulfilled" | "abandoned"): void {
  c.status = status;
}
