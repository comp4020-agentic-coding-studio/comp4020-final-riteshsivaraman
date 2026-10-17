import { mkdirSync, writeFileSync } from "node:fs";
import { derive, newScene } from "../src/shared/talk/bank.ts";
import { modelById } from "../src/shared/talk/data.ts";
import { customerMove, randomPersona, randomStaff, staffMove, type Memory, type Persona, type StaffTraits } from "../src/shared/talk/npc.ts";
import { makeRng, type Rng } from "../src/shared/talk/rng.ts";
import { applyCustomer, applyStaff, customerMenu, staffActs } from "../src/shared/talk/scene.ts";
import type { Scene } from "../src/shared/talk/types.ts";

// Generates NPC-vs-NPC conversations and writes each as a readable transcript
// that includes the menu both sides saw on every turn, what they picked, what
// they said, the tone and face, and the state after. The transcripts are for
// reading (by a person or a reviewing agent) to find wording and flow problems
// that the specs have no rule for yet.
//
//   node scripts/talk-transcripts.ts --n=40 --seed=1000 --out=.talk-runs/run1

const arg = (name: string, d: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? d;
const N = Number(arg("n", "40"));
const SEED0 = Number(arg("seed", "1000"));
const OUT = arg("out", `.talk-runs/run-${Date.now()}`);

const short = (s: string, n = 90): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function trace(seed: number): { md: string; outcome: string; turns: number } {
  const rng: Rng = makeRng(seed);
  const persona: Persona = randomPersona(rng, `seed-${seed}`);
  const staff: StaffTraits = randomStaff(rng);
  const mem: Memory = { wants: persona.wants, conceded: new Set() };
  let sc: Scene = newScene();
  const out: string[] = [];
  out.push(`# Conversation, seed ${seed}`);
  out.push("");
  out.push("Hidden from the characters: the customer's goal and the staff member's habits.");
  out.push(`- Customer goal: ${persona.target ? `buy ${modelById(persona.target.model).name}, ${persona.target.storage}, ${persona.target.colour}` : "no phone fully satisfies them"}; hard wants ${JSON.stringify(persona.wants)}; opening: ${persona.opening}; would give up: ${persona.relax ? JSON.stringify(persona.relax) : "nothing"}; ticks: ${persona.signals.join(", ")}`);
  out.push(`- Staff habits: thorough ${staff.thorough.toFixed(2)}, salesy ${staff.salesy.toFixed(2)}, tones ${staff.tones.join("/")}`);
  out.push("");
  let stuck = "";
  while (!sc.ended && sc.turn < 80) {
    // ---- staff ----
    const legal = staffActs(sc);
    if (legal.length === 0) { stuck = "no legal staff move"; break; }
    const sm = staffMove(sc, staff, rng);
    const afterStaff = applyStaff(sc, sm.act, sm.tone);
    if ("error" in afterStaff) { stuck = `staff error: ${afterStaff.error}`; break; }
    const chosen = legal.find((v) => JSON.stringify(v.act) === JSON.stringify(sm.act));
    const sl = afterStaff.log.at(-1)!;
    out.push(`## Turn ${sl.turn}: STAFF · tone ${sl.tone} · face ${sl.expression}`);
    out.push(`Staff menu: ${legal.map((v) => (v === chosen ? `**[${v.label}]**` : v.label)).join(" | ")}`);
    out.push(`Said: "${sl.text}"`);
    out.push(`Pool after: ${sl.after.rows} options, ${sl.after.models.length} models${sl.after.models.length ? ` (${sl.after.models.slice(0, 4).map((i) => modelById(i).name.replace("iPhone ", "")).join(", ")})` : ""}`);
    out.push("");
    // ---- customer ----
    const menu = customerMenu(afterStaff);
    if (!menu) { stuck = "no customer menu"; sc = afterStaff; break; }
    const reply = customerMove(afterStaff, persona, rng, mem);
    const afterCust = applyCustomer(afterStaff, reply);
    if ("error" in afterCust) { stuck = `customer error: ${afterCust.error}`; sc = afterStaff; break; }
    const cl = afterCust.log.find((l) => l.who === "customer" && l.turn === afterStaff.turn + 1)!;
    const picked = new Set(reply.picks ?? []);
    out.push(`## Turn ${cl.turn}: CUSTOMER · tone ${cl.tone} · face ${cl.expression}`);
    if (menu.options.length) out.push(`Menu (${menu.multi ? "pick any" : "pick one"}): ${menu.options.map((o) => (picked.has(o.id) || [...picked].some((p) => o.param && p.startsWith(o.param.prefix)) ? `**[${o.label}]**` : o.label)).join(" | ")}`);
    if (menu.throwbacks.length) out.push(`Could also ask: ${menu.throwbacks.map((t) => (t.id === reply.throwback ? `**[${t.label}]**` : t.label)).join(" | ")}`);
    const act = reply.action;
    out.push(`Standing actions available: ${menu.actions.length} (demo/go with any phone, change an earlier answer, leave${menu.pending.kind === "free" ? ", carry on" : ""})${act ? ` · TOOK: ${menu.actions.find((a) => JSON.stringify(a.action) === JSON.stringify(act))?.label ?? act.t}` : ""}`);
    out.push(`Said: "${cl.text}"`);
    const c = derive(afterCust);
    out.push(`Pool after: ${c.pool.length} options, ${c.ranked.length} models${c.ranked.length ? ` (${c.ranked.slice(0, 4).map((m) => m.name.replace("iPhone ", "")).join(", ")})` : ""}`);
    out.push("");
    sc = afterCust;
    if (sc.ended) {
      const last = sc.log.at(-1)!;
      out.push(`## Turn ${last.turn}: STAFF · tone ${last.tone} · face ${last.expression} (sign-off)`);
      out.push(`Said: "${last.text}"`);
      out.push("");
    }
  }
  const e = sc.ended;
  const outcome = stuck ? `STUCK: ${stuck}` : e?.how === "bought" ? `SOLD ${modelById(e.sku.model).name}, ${e.sku.storage}, ${e.sku.colour}, A$${e.sku.price}` : e ? `LEFT: ${e.why}` : "UNFINISHED";
  out.push(`**Outcome: ${outcome}**`);
  return { md: out.join("\n"), outcome, turns: sc.turn };
}

mkdirSync(OUT, { recursive: true });
const index: string[] = [`# Run ${OUT}`, "", `${N} conversations, seeds ${SEED0} to ${SEED0 + N - 1}`, "", "| seed | turns | outcome |", "|---|---|---|"];
let sold = 0;
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i;
  const r = trace(seed);
  if (r.outcome.startsWith("SOLD")) sold++;
  writeFileSync(`${OUT}/${String(i + 1).padStart(3, "0")}-seed${seed}.md`, r.md + "\n");
  index.push(`| ${seed} | ${r.turns} | ${short(r.outcome, 70)} |`);
}
index.push("", `Sold: ${sold} of ${N}`);
writeFileSync(`${OUT}/INDEX.md`, index.join("\n") + "\n");
console.log(`wrote ${N} transcripts to ${OUT} (sold ${sold})`);
