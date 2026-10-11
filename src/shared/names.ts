// Made-up first names for the entry screen's "random name". Generic, and
// grouped only so a chosen male/female look gets a matching suggestion; the
// visitor can type anything (cleanName() in profile.ts still applies).
export const FIRST_NAMES = {
  male: ["Sam", "Theo", "Marcus", "Dev", "Owen", "Felix", "Jonah", "Ravi", "Leo", "Kofi", "Mateo", "Hugo", "Arjun", "Ben", "Callum", "Nico"],
  female: ["Maya", "Priya", "Zoe", "Ines", "Hana", "Ruby", "Amara", "Freya", "Lena", "Noor", "Tessa", "Isla", "Mei", "Chloe", "Sana", "Elise"],
} as const;

export type Gender = keyof typeof FIRST_NAMES;
export const GENDERS = ["male", "female"] as const satisfies readonly Gender[];

export const randomName = (gender: Gender, r: number = Math.random()): string => {
  const list = FIRST_NAMES[gender];
  return list[Math.floor(r * list.length)];
};
