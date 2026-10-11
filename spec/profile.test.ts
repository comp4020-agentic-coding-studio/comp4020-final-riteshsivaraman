import { describe, expect, it } from "vitest";
import { NPC_DESIGNATION, npcsOffDuty, scriptFor } from "../src/shared/duty.ts";
import { HAIR_COLOURS, SKIN_TONES } from "../src/shared/look.ts";
import { designationOf, validateProfile } from "../src/shared/profile.ts";
import { NPCS } from "../src/shared/npcs.ts";

// Promise: whatever a client sends for "who I am", only an allowed choice
// reaches the database and other visitors; and the posts people hold decide
// which NPCs stand down. Pure functions.

describe("a profile", () => {
  it("falls back to a plain customer for anything it does not recognise", () => {
    for (const raw of [undefined, null, 5, "x", [], { kind: "emperor" }, { kind: 7 }]) {
      expect(validateProfile(raw)).toEqual({ kind: "customer" });
    }
  });

  it("keeps a valid employee kind, and a specialist always has a lane", () => {
    expect(validateProfile({ kind: "genius" })).toEqual({ kind: "genius" });
    expect(validateProfile({ kind: "specialist" })).toEqual({ kind: "specialist", specialty: "phones" });
    expect(validateProfile({ kind: "specialist", specialty: "audio" })).toEqual({ kind: "specialist", specialty: "audio" });
    expect(validateProfile({ kind: "specialist", specialty: "weapons" }).specialty).toBe("phones");
    expect(validateProfile({ kind: "customer", specialty: "audio" }).specialty).toBeUndefined();
  });

  it("cleans a name: no control characters or markup, trimmed and capped", () => {
    expect(validateProfile({ name: "  Sam\u0000 <b>the</b>   Great  " }).name).toBe("Sam bthe/b Great");
    expect(validateProfile({ name: "x".repeat(100) }).name).toHaveLength(24);
    expect(validateProfile({ name: "   " }).name).toBeUndefined();
    expect(validateProfile({ name: 12 }).name).toBeUndefined();
  });

  it("drops any look value that is not on the list, keeps the ones that are", () => {
    const p = validateProfile({
      look: { body: "toon", eyes: "sparkle", face: "square", beard: "goatee", hairStyle: "bun", hairColour: HAIR_COLOURS[2], skin: SKIN_TONES[1], shirt: "#2f62b5" },
    });
    expect(p.look).toEqual({ body: "toon", eyes: "sparkle", face: "square", beard: "goatee", hairStyle: "bun", hairColour: HAIR_COLOURS[2], skin: SKIN_TONES[1], shirt: "#2f62b5" });
    const bad = validateProfile({ look: { body: "<script>", eyes: 3, hairColour: "red; background:url(x)", skin: "#123456", shirt: "javascript:1" } });
    expect(bad.look).toBeUndefined();
  });

  it("names the post an employee holds", () => {
    expect(designationOf({ kind: "customer" })).toBeNull();
    expect(designationOf({ kind: "greeter" })).toBe("greeter");
    expect(designationOf({ kind: "specialist", specialty: "laptops" })).toBe("specialist:laptops");
  });
});

describe("posts", () => {
  it("gives every member of staff a post, and a post a customer script only where one exists", () => {
    for (const n of NPCS.filter((x) => x.role !== "customer")) expect(NPC_DESIGNATION[n.id], n.id).toBeDefined();
    for (const n of NPCS.filter((x) => x.role === "customer")) expect(NPC_DESIGNATION[n.id], n.id).toBeUndefined();
    expect(scriptFor("greeter")).toBe("greeter");
    expect(scriptFor("specialist:phones")).toBe("phones");
    expect(scriptFor("genius")).toBeNull();
    expect(scriptFor("technician")).toBeNull();
  });

  it("stands one NPC down for each person holding the post, and no more", () => {
    expect(npcsOffDuty([])).toEqual([]);
    expect(npcsOffDuty(["greeter"])).toEqual(["greeter-1"]);
    expect(npcsOffDuty(["greeter", "greeter"])).toEqual(["greeter-1"]); // only one NPC greeter to stand down
    expect(npcsOffDuty(["genius"])).toEqual(["genius-1"]);
    expect(npcsOffDuty(["genius", "genius"]).sort()).toEqual(["genius-1", "genius-2"]);
    expect(npcsOffDuty(["genius", "specialist:phones"]).sort()).toEqual(["genius-1", "spec-phones"]);
  });
});
