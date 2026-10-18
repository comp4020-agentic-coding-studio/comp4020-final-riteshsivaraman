import { NPCS, npcPose } from "./npcs.ts";
import { resolveCollisions } from "./world.ts";

// Who holds which post. Every NPC has a designation, and so does every
// employee a user controls. While a person holds a post the NPC for it is off
// duty; with two people on the same post, two NPCs of that post are (D35).

export const NPC_DESIGNATION: Record<string, string> = {
  "greeter-1": "greeter",
  "spec-phones": "specialist:phones",
  "spec-laptops": "specialist:laptops",
  "spec-tablets": "specialist:tablets",
  "spec-audio": "specialist:audio",
  "genius-1": "genius",
  "genius-2": "genius",
  "stock-runner": "stock",
  "stock-1": "stock",
  "stock-2": "stock",
  "tech-1": "technician",
  "tech-2": "technician",
};

// The NPCs that stand down, given the designation each employed person holds.
// The first NPCs of a post, in the table's order, go first.
export function npcsOffDuty(held: ReadonlyArray<string>): string[] {
  const count = new Map<string, number>();
  for (const d of held) count.set(d, (count.get(d) ?? 0) + 1);
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
const STAFF_NAMES = ["Maya", "Theo", "Priya", "Marcus", "Zoe", "Dev", "Ines", "Owen", "Felix", "Hana", "Jonah", "Ruby"];
const CUSTOMER_NAMES = ["Ravi", "Amara", "Leo", "Freya", "Kofi", "Lena", "Mateo", "Noor", "Hugo", "Isla", "Arjun", "Mei", "Ben", "Sana"];
export const NPC_NAME: Record<string, string> = {
  ...Object.fromEntries(Object.keys(NPC_DESIGNATION).map((id, i) => [id, STAFF_NAMES[i]])),
  ...Object.fromEntries(CUSTOMER_NAMES.map((n, i) => [`cust-${i + 1}`, n])),
};

export const NPC_LABEL: Record<string, string> = {
  "greeter-1": "the greeter",
  "spec-phones": "the phones specialist",
  "spec-laptops": "the laptops specialist",
  "spec-tablets": "the tablets specialist",
  "spec-audio": "the audio specialist",
  "genius-1": "a genius",
  "genius-2": "a genius",
  "stock-runner": "the stock runner",
  "stock-1": "stock",
  "stock-2": "stock",
  "tech-1": "a technician",
  "tech-2": "a technician",
};
