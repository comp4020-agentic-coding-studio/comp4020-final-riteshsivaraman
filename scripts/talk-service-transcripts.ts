import { mkdirSync, writeFileSync } from "node:fs";
import { makeRng, type Rng } from "../src/shared/talk/core/rng.ts";
import { newScene } from "../src/shared/talk/scenes/service/bank.ts";
import { randomPersona, randomStaff, runConversation, type Persona, type StaffTraits } from "../src/shared/talk/scenes/service/npc.ts";

// Generates NPC-vs-NPC device-service conversations as plain readable
// transcripts, a lighter version of scripts/talk-transcripts.ts /
// talk-laptop-transcripts.ts's menu-trace format -- v1's point is to prove
// the engine's new shape (a pool of fault explanations, a staff-authored
// fact, a mandatory gate), not to run the full review-loop methodology yet.
//
//   node scripts/talk-service-transcripts.ts --n=20 --seed=2000 --out=.talk-runs/service-run1

const arg = (name: string, d: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? d;
const N = Number(arg("n", "20"));
const SEED0 = Number(arg("seed", "2000"));
const OUT = arg("out", `.talk-runs/service-run-${Date.now()}`);

function trace(seed: number): { md: string; outcome: string } {
  const rng: Rng = makeRng(seed);
  const persona: Persona = randomPersona(rng, `seed-${seed}`);
  const staff: StaffTraits = randomStaff(rng);
  const r = runConversation(persona, staff, rng, newScene());
  const lines: string[] = [`# Conversation, seed ${seed}`, "", `Persona: symptom=${persona.symptom}, wetExposure=${persona.wetExposure}, dataMatters=${persona.dataMatters}, wantsRepair=${persona.wantsRepair}`, ""];
  if (r.stuck) lines.push(`**STUCK: ${r.stuck}**`, "");
  for (const l of r.scene.log) lines.push(`**${l.who}** (${l.tone}): ${l.text}`);
  lines.push("", `Ended: ${JSON.stringify(r.scene.ended)}`, `Data-loss warned: ${r.scene.dataLossWarned}`);
  return { md: lines.join("\n"), outcome: r.stuck ? `STUCK: ${r.stuck}` : JSON.stringify(r.scene.ended) };
}

mkdirSync(OUT, { recursive: true });
const summary: string[] = [];
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i;
  const { md, outcome } = trace(seed);
  writeFileSync(`${OUT}/${seed}.md`, md);
  summary.push(`${seed}: ${outcome}`);
}
writeFileSync(`${OUT}/_summary.txt`, summary.join("\n"));
console.log(`Wrote ${N} transcripts to ${OUT}`);
console.log(summary.join("\n"));
