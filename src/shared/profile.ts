import { validateLook, type LookChoice } from "./look.ts";

// Who a visitor chose to be when they opened the link: a customer, or an
// employee of a kind, with a look and a name. An employee is a role a user
// controls; the choice is trusted for now (no accounts, D35).

export const EMPLOYEE_KINDS = ["greeter", "specialist", "genius", "stock", "technician"] as const;
export type EmployeeKind = (typeof EMPLOYEE_KINDS)[number];
export const SPECIALTIES = ["phones", "laptops", "tablets", "audio"] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export type Kind = "customer" | EmployeeKind;

export interface Profile {
  kind: Kind;
  specialty?: Specialty; // a specialist's lane
  name?: string;
  look?: LookChoice;
}

export const isEmployee = (p: Pick<Profile, "kind">): boolean => p.kind !== "customer";

// A designation names a post that a person or an NPC can hold:
// "greeter", "specialist:phones", "genius", "stock", "technician".
export function designationOf(p: Pick<Profile, "kind" | "specialty">): string | null {
  if (p.kind === "customer") return null;
  if (p.kind === "specialist") return `specialist:${p.specialty ?? "phones"}`;
  return p.kind;
}

export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return s.length > 0 ? s : undefined;
}

// Always returns something safe: unknown kinds become customer, a specialist
// without a valid lane gets phones, and the look keeps only allowed values.
export function validateProfile(raw: unknown): Profile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind: Kind = (EMPLOYEE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as EmployeeKind) : "customer";
  const profile: Profile = { kind };
  if (kind === "specialist") {
    profile.specialty = (SPECIALTIES as readonly string[]).includes(r.specialty as string) ? (r.specialty as Specialty) : "phones";
  }
  const name = cleanName(r.name);
  if (name) profile.name = name;
  const look = validateLook(r.look);
  if (Object.keys(look).length > 0) profile.look = look;
  return profile;
}
