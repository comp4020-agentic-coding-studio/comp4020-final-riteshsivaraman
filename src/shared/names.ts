// Made-up first names for the entry screen's "random name". Generic, and
// grouped only so a chosen male/female look gets a matching suggestion; the
// visitor can type anything (cleanName() in profile.ts still applies).
export const FIRST_NAMES = {
  male: ["Sam", "Theo", "Marcus", "Dev", "Owen", "Felix", "Jonah", "Ravi", "Leo", "Kofi", "Mateo", "Hugo", "Arjun", "Ben", "Callum", "Nico", "Jasper", "Luca", "Declan", "Kai", "Rory", "Emeka", "Mason", "Oscar", "Finn"],
  female: ["Maya", "Priya", "Zoe", "Ines", "Hana", "Ruby", "Amara", "Freya", "Lena", "Noor", "Tessa", "Isla", "Mei", "Chloe", "Sana", "Elise", "Anika", "Yara", "Imogen", "Salma", "Talia", "Willa", "Dani", "Leila"],
} as const;

export type Gender = keyof typeof FIRST_NAMES;
export const GENDERS = ["male", "female"] as const satisfies readonly Gender[];

export const randomName = (gender: Gender, r: number = Math.random()): string => {
  const list = FIRST_NAMES[gender];
  return list[Math.floor(r * list.length)];
};

// Which list a first name came from, so a person called Priya is drawn as a woman
// and one called Theo as a man. Names outside the lists say nothing.
export const genderOfName = (name: string | undefined): Gender | undefined => {
  if (!name) return undefined;
  for (const g of GENDERS) if ((FIRST_NAMES[g] as readonly string[]).includes(name)) return g;
  return undefined;
};

const POOL = new Set([...FIRST_NAMES.male, ...FIRST_NAMES.female].map((n) => n.toLowerCase()));

// The name someone is shown by. An NPC carries an "NPC" tag, so sharing a first name with one is fine; only two real
// people in the store at once with the same name are told apart, with a number (Mason, Mason 2). A name that an earlier
// version had numbered only because it matched an NPC (a pool name with a " 2") goes back to the plain one.
export function uniqueName(wanted: string, otherPeopleLower: ReadonlySet<string>): string {
  const numbered = wanted.match(/^(.*\S) (\d{1,2})$/);
  let name = numbered && POOL.has(numbered[1]!.toLowerCase()) && !otherPeopleLower.has(numbered[1]!.toLowerCase()) ? numbered[1]! : wanted;
  for (let n = 2; otherPeopleLower.has(name.toLowerCase()) && n < 50; n++) name = `${wanted.replace(/ \d{1,2}$/, "")} ${n}`;
  return name;
}
