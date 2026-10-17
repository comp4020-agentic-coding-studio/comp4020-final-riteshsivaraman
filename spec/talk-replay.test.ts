import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCustomer, applyStaff, derive, newScene } from "../src/shared/talk/scene.ts";
import type { CustomerReply, Scene, StaffAct, Tone } from "../src/shared/talk/types.ts";

// Promise: the engine can reproduce the sample conversations. Each file in
// spec/talk-replays/ is one transcript from docs/conversation-model/transcripts/
// written as the menu picks both sides made, with the pool the transcript
// reported after each customer line. The engine must accept every move as legal
// and land on the same pool, so a gap between what the transcripts do and what
// the model can express shows up here, one step at a time.

interface Step {
  staff: StaffAct;
  staffTone?: Tone;
  customer: Omit<CustomerReply, "tone">;
  customerTone?: Tone;
  expect?: { models?: number; top?: string; rows?: number };
}
interface Replay {
  id: string;
  source: string;
  steps: Step[];
  ends: { how: "bought"; model: string; storage: string; colour: string } | { how: "left" };
}

const dir = new URL("./talk-replays/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("the sample conversations replay", () => {
  it("has replays to run", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const replay: Replay = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    it(`${replay.id}: ${replay.source}`, () => {
      let sc: Scene = newScene();
      replay.steps.forEach((step, i) => {
        const at = `${replay.id} step ${i + 1}`;
        const s = applyStaff(sc, step.staff, step.staffTone ?? "neutral");
        if ("error" in s) throw new Error(`${at}: staff ${JSON.stringify(step.staff)}: ${s.error}`);
        const c = applyCustomer(s, { tone: "neutral", ...step.customer, ...(step.customerTone ? { tone: step.customerTone } : {}) });
        if ("error" in c) throw new Error(`${at}: customer ${JSON.stringify(step.customer)}: ${c.error}`);
        sc = c;
        const ctx = derive(sc);
        if (step.expect?.models !== undefined) expect(ctx.ranked.length, `${at}: models left`).toBe(step.expect.models);
        if (step.expect?.rows !== undefined) expect(ctx.pool.length, `${at}: rows left`).toBe(step.expect.rows);
        if (step.expect?.top !== undefined) expect(ctx.ranked[0]?.id, `${at}: staff ranking leader`).toBe(step.expect.top);
      });
      if (replay.ends.how === "bought") {
        expect(sc.ended, `${replay.id}: ending`).toMatchObject({ how: "bought", sku: { model: replay.ends.model, storage: replay.ends.storage, colour: replay.ends.colour } });
      } else {
        expect(sc.ended, `${replay.id}: ending`).toMatchObject({ how: "left" });
      }
    });
  }
});
