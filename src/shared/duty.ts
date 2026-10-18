import { NPCS, npcPose } from "./npcs.ts";
import { resolveCollisions } from "./world.ts";

// Who holds which post. Every NPC has a designation, and so does every
// employee a user controls. While a person holds a post the NPC for it is off
// duty; with two people on the same post, two NPCs of that post are (D35).

export const NPC_DESIGNATION: Record<string, string> = {
  "greeter-1": "greeter",
  // two specialists to start with; real users who join are extra ones, and
  // never stand these down (Ritesh, 2026-10-19)
  "spec-phones": "specialist:phones",
  "spec-phones-2": "specialist:phones",
  "genius-1": "genius",
  "genius-2": "genius",
  "stock-runner": "stock",
  "stock-1": "stock",
  "stock-2": "stock",
  "tech-1": "technician",
  "tech-2": "technician",
};

// The NPCs that stand down, given the designation each employed person holds.
// The first NPCs of a post, in the table's order, go first. A person joining as
// a specialist does not displace one: they are an extra pair of hands.
export function npcsOffDuty(held: ReadonlyArray<string>): string[] {
  const count = new Map<string, number>();
  for (const d of held) if (!d.startsWith("specialist:")) count.set(d, (count.get(d) ?? 0) + 1);
  const off: string[] = [];
  for (const [d, n] of count) {
    const npcs = Object.entries(NPC_DESIGNATION).filter(([, des]) => des === d).map(([id]) => id);
    off.push(...npcs.slice(0, n));
  }
  return off;
}

// The conversation script a post can hold, if it has one yet.
export function scriptFor(designation: string): "greeter" | "phones" | null {
  if (designation === "greeter") return "greeter";
  if (designation === "specialist:phones") return "phones";
  return null;
}

// Where a customer is told to wait for someone to fetch them: near the area
// the post covers, clear of the furniture. A post without one is not asked to
// wait (the helper comes straight away).
export function waitSpotFor(post: string): { x: number; z: number; label: string } | null {
  if (post !== "specialist:phones") return null;
  const def = NPCS.find((n) => n.id === "spec-phones");
  if (!def) return null;
  const station = npcPose(def, 1000);
  const p = resolveCollisions(station.x + 1.8, station.z);
  return { x: p.x, z: p.z, label: "the phones area" };
}

// Every NPC is a named person, so "Theo will come and get you" is Theo and
// nobody else (Ritesh, 2026-10-19). Names are drawn from the entry screen's
// existing pool (names.ts), not invented; NPC_LABEL below stays the role
// description used where a name would read oddly.
const STAFF_NAMES: Record<string, string> = {
  "greeter-1": "Maya",
  "spec-phones": "Theo",
  "spec-phones-2": "Priya",
  "genius-1": "Dev",
  "genius-2": "Ines",
  "stock-runner": "Owen",
  "stock-1": "Felix",
  "stock-2": "Hana",
  "tech-1": "Jonah",
  "tech-2": "Ruby",
};
const CUSTOMER_NAMES = ["Ravi", "Amara", "Leo", "Freya", "Kofi", "Lena", "Mateo", "Noor", "Hugo", "Isla", "Arjun", "Mei", "Ben", "Sana"];
export const NPC_NAME: Record<string, string> = {
  ...STAFF_NAMES,
  ...Object.fromEntries(CUSTOMER_NAMES.map((n, i) => [`cust-${i + 1}`, n])),
};

export const NPC_LABEL: Record<string, string> = {
  "greeter-1": "the greeter",
  "spec-phones": "a phones specialist",
  "spec-phones-2": "a phones specialist",
  "genius-1": "a genius",
  "genius-2": "a genius",
  "stock-runner": "the stock runner",
  "stock-1": "stock",
  "stock-2": "stock",
  "tech-1": "a technician",
  "tech-2": "a technician",
};
