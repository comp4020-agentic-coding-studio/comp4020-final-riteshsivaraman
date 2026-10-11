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
