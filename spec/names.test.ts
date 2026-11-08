import { describe, expect, it } from "vitest";
import { uniqueName } from "../src/shared/names.ts";

describe("the name someone is shown by", () => {
  it("is left alone, even when it is the same as an NPC's (an NPC wears an NPC tag)", () => {
    expect(uniqueName("Mason", new Set())).toBe("Mason");
    expect(uniqueName("Nico", new Set(["sam"]))).toBe("Nico");
  });
  it("tells two real people with the same name apart, whichever case", () => {
    expect(uniqueName("Mason", new Set(["mason"]))).toBe("Mason 2");
    expect(uniqueName("MASON", new Set(["mason", "mason 2"]))).toBe("MASON 3");
  });
  it("puts a name an older version numbered back to plain, if no one else has it", () => {
    expect(uniqueName("Nico 2", new Set())).toBe("Nico");
    expect(uniqueName("Nico 2", new Set(["nico"]))).toBe("Nico 2");
  });
  it("does not touch a typed name that merely ends in a number", () => {
    expect(uniqueName("Agent 7", new Set())).toBe("Agent 7");
    expect(uniqueName("Player 2", new Set())).toBe("Player 2");
  });
});

describe("every timetable customer has a given name", () => {
  it("never leaves a raw id like cust-38 on a name tag, and never repeats a name", async () => {
    const { CAST } = await import("../src/shared/storeday.ts");
    const { NPC_NAME } = await import("../src/shared/duty.ts");
    for (const c of CAST) expect(NPC_NAME[c.id], c.id).toBeTruthy();
    const names = Object.values(NPC_NAME).map((n) => n.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
