import Database from "better-sqlite3";
import { beforeEach, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { caseById, closeCase, factsOf, handOffCase, openCase, openCaseOf, setFact } from "../src/server/cases.ts";

// Promise (SCOPE D42): a case outlives any one conversation, a handoff
// reassigns its owner, and a fact learned by one owner is readable by the
// next without re-asking.

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES ('v1','t','Aisha','blue',1,1)").run();
});

it("opens a case, and opening the same kind again returns the existing one", () => {
  const a = openCase(db, { id: "c1", visitorId: "v1", kind: "phone", ownerId: "mira", ownerKind: "npc", now: 10 });
  const b = openCase(db, { id: "c2", visitorId: "v1", kind: "phone", now: 20 });
  expect(a.id).toBe("c1");
  expect(b.id).toBe("c1");
  expect(caseById(db, "c2")).toBeNull();
});

it("a visitor can hold two open cases of different kinds at once", () => {
  openCase(db, { id: "c1", visitorId: "v1", kind: "phone", now: 10 });
  openCase(db, { id: "c2", visitorId: "v1", kind: "repair", now: 10 });
  expect(openCaseOf(db, "v1", "phone")?.id).toBe("c1");
  expect(openCaseOf(db, "v1", "repair")?.id).toBe("c2");
});

it("a handoff reassigns the owner, and the next owner reads what was already learned", () => {
  const c = openCase(db, { id: "c1", visitorId: "v1", kind: "phone", ownerId: "mira", ownerKind: "npc", now: 10 });
  setFact(db, c.id, "budget", "1100", "mira", 11);
  setFact(db, c.id, "use_case", "photos", "mira", 11);
  expect(handOffCase(db, c.id, "dan", "staff")).toBe(true);
  expect(caseById(db, c.id)?.ownerId).toBe("dan");
  expect(factsOf(db, c.id)).toEqual({ budget: "1100", use_case: "photos" });
});

it("a later fact overwrites an earlier one, and remembers who set it last", () => {
  const c = openCase(db, { id: "c1", visitorId: "v1", kind: "phone", now: 10 });
  setFact(db, c.id, "storage", "128", "dan", 10);
  setFact(db, c.id, "storage", "256", "dan", 12);
  expect(factsOf(db, c.id).storage).toBe("256");
});

it("handing off a closed case does nothing, and says so", () => {
  const c = openCase(db, { id: "c1", visitorId: "v1", kind: "phone", now: 10 });
  expect(closeCase(db, c.id, "fulfilled", 20)).toBe(true);
  expect(handOffCase(db, c.id, "dan", "staff")).toBe(false);
  expect(caseById(db, c.id)?.ownerId).toBeNull();
});

it("handing off a case that does not exist does nothing", () => {
  expect(handOffCase(db, "nope", "dan", "staff")).toBe(false);
});
