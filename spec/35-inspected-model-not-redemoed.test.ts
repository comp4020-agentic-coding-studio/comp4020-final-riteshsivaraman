import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/server/migrate.ts";
import { enter, startInspect, startTalk, type Ctx, type Employee, type Outgoing } from "../src/server/service.ts";
import { demoCandidates, derive } from "../src/shared/talk/scene.ts";
import type { Scene } from "../src/shared/talk/types.ts";
import { npcPose, NPCS } from "../src/shared/npcs.ts";
import type { ServerMessage } from "../src/shared/protocol.ts";

// Issue #35. Promise: physical device inspection (D39, `startInspect`/`endInspect`
// in src/server/service.ts) and conversation-level demo tracking (`sc.demoed`,
// src/shared/talk/types.ts) are two systems that must agree for the one visit:
// a model the customer has already physically inspected at a table is not
// then offered to them again as a conversation demo. Out of scope (per the
// issue): remembering this across visits.
//
// Runs at the service layer with an in-memory database (no sockets), the same
// pattern as spec/service.test.ts's "the phones specialist, the new talk
// engine (NPC only)" describe block, which this reuses the NPC/position setup
// from.

const NOW = 1000;
let db: Database.Database;
const positions = new Map<string, { x: number; z: number }>();
const employees: Employee[] = [];
const present: string[] = [];

const ctx = (now = NOW): Ctx => ({ db, now, employees, present, position: (id) => positions.get(id) });
const npc = (id: string): { x: number; z: number } => {
  const def = NPCS.find((n) => n.id === id)!;
  return npcPose(def, NOW);
};
const messagesTo = (out: Outgoing[], to: string, type: ServerMessage["type"]): ServerMessage[] => out.filter((o) => o.to === to && o.message.type === type).map((o) => o.message);
const last = <T extends ServerMessage["type"]>(out: Outgoing[], to: string, type: T): Extract<ServerMessage, { type: T }> | undefined =>
  messagesTo(out, to, type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;

function addVisitor(id: string, at: { x: number; z: number }): void {
  db.prepare("INSERT INTO visitors (id, token, name, colour, created_at, last_seen) VALUES (?, ?, ?, ?, 0, 0)").run(id, `tok-${id}`, id, "#fff");
  positions.set(id, at);
  present.push(id);
  enter(ctx(), id, { kind: "customer" });
}

// A sceneful of a talk-engine conversation, read straight back out of
// conversations.data the way the server actually stored it, so this is the
// real persisted shape, not a hand-built stand-in.
function sceneOfConversation(conversationId: string): Scene {
  const row = db.prepare("SELECT data FROM conversations WHERE id = ?").get(conversationId) as { data: string };
  return (JSON.parse(row.data) as { scene: Scene }).scene;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  positions.clear();
  employees.length = 0;
  present.length = 0;
});

describe("a model inspected at the table is not offered again as a demo", () => {
  // T2:-x:0 is assigned "iphone-air" (src/shared/assignments.ts TABLE_ASSIGNMENTS.T2),
  // which is talk model id "air" (src/shared/talk/data.ts strips the "iphone "
  // prefix). It sits at x=-3.6, z=-4.25 -- right next to spec-phones' post
  // (npcPose("spec-phones", NOW)), so one visitor can inspect it and then walk
  // the short distance to start a phones conversation without moving the clock.
  const AIR_SLOT = "T2:-x:0";
  const AIR_SLOT_POS = { x: -3.6, z: -4.25 };

  it("excludes the physically-inspected model from demoCandidates, but still offers other models", () => {
    addVisitor("c1", AIR_SLOT_POS);
    const inspected = startInspect(ctx(), "c1", AIR_SLOT);
    expect(messagesTo(inspected, "all", "inspecting")).toHaveLength(1); // sanity: the inspection actually started

    const spec = npc("spec-phones");
    positions.set("c1", { x: spec.x + 0.5, z: spec.z });
    const opened = startTalk(ctx(), "c1", "spec-phones");
    const conversationId = last(opened, "c1", "turn")!.conversationId;

    const scene = sceneOfConversation(conversationId);
    const candidates = demoCandidates(derive(scene));
    expect(candidates).not.toContain("air");
    // not a wholesale exclusion: other models the customer never touched are still offerable
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("control: with nothing inspected, the same model IS a demo candidate (proves the above is a real exclusion, not a vacuous pass)", () => {
    const spec = npc("spec-phones");
    addVisitor("c2", { x: spec.x + 0.5, z: spec.z });
    const opened = startTalk(ctx(), "c2", "spec-phones");
    const conversationId = last(opened, "c2", "turn")!.conversationId;

    const scene = sceneOfConversation(conversationId);
    const candidates = demoCandidates(derive(scene));
    expect(candidates).toContain("air");
  });

  it("does not regress the existing demoed/declinedDemo tracking: a model a specialist already demoed in this same conversation still is not offered a second time", () => {
    const spec = npc("spec-phones");
    addVisitor("c3", { x: spec.x + 0.5, z: spec.z });
    const opened = startTalk(ctx(), "c3", "spec-phones");
    const conversationId = last(opened, "c3", "turn")!.conversationId;
    const scene = sceneOfConversation(conversationId);
    // Simulate what scene.ts's applyStaff already does when staff demo a model
    // (src/shared/talk/scene.ts:255's `next.demoed.push(act.model)`), without
    // needing to drive the full random NPC turn loop to get there.
    const demoedScene: Scene = { ...scene, demoed: [...scene.demoed, "17e"] };
    expect(demoCandidates(derive(demoedScene))).not.toContain("17e");
  });
});
