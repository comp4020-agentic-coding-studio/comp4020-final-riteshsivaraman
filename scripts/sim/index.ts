// Terminal prototype of the store's interaction model (SCOPE D43, option
// B): a cheap, throwaway check that the loop/case/slot design (ADR 6,
// grilling session 2026-10-13) actually feels right before investing in the
// real engine. Not wired to the real server, SQLite, or the 3D client --
// run it with `pnpm sim`.
import { priceOf, SIM_PRODUCTS } from "./catalogue.ts";
import { closeCase, handOff, openCase, setFact } from "./case.ts";
import { ask, closeIo, log, menu, say } from "./io.ts";
import { type NpcCustomer, noticeDelay, runAmbientConversation, spawnCustomer } from "./npc.ts";
import { makeRng, pick, roll, type Rng } from "./rng.ts";
import { nextSlot, npcAnswer, optionsFor, questionFor, type SlotKey } from "./slots.ts";
import { rollTraits, type Traits } from "./traits.ts";

async function main(): Promise<void> {
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : Date.now() % 1_000_000;
  console.log(`(seed ${seed} -- pass --seed=${seed} to replay this exact run)`);
  const rng = makeRng(seed);

  console.log("\n=== the store (terminal prototype) ===\n");

  // Staff get their own traits too, rolled once per run so Mira and Dan's
  // own attentiveness stays consistent across every customer they see.
  const mira = rollTraits(rng);
  const dan = rollTraits(rng);

  // One or two customers doing their own thing in the background, whether
  // or not you're playing one of them -- this is "everyone else is an NPC."
  for (let i = 0; i < 2; i++) runAmbientConversation(rng, "Dan", dan, spawnCustomer(rng, 900 + i));

  const role = await menu("\nWho are you?", ["Customer", "Employee"]);
  if (role === "Customer") await playCustomer(rng, mira);
  else await playEmployee(rng, mira);

  closeIo();
}

async function playCustomer(rng: Rng, mira: Traits): Promise<void> {
  const name = (await ask("\nYour name? ")) || "Visitor";
  noticeDelay(rng, mira, "Mira");
  say("Mira (greeter)", `Hi, welcome in. Is there something in particular you're after today?`);
  const need = await menu("", ["I need a phone", "Just looking"]);
  if (need === "Just looking") {
    say("Mira", "No worries, have a look around.");
    return;
  }
  say("Mira", "Phones are on the left, Dan's there. I'll walk you over.");
  const c = openCase(name, "phone", "mira");
  setFact(c, "referred_by", "mira"); // the handoff carries a fact, not just a note
  handOff(c, "dan");
  const product = pick(rng, SIM_PRODUCTS);
  say("Dan (phones)", `Hi ${name}, I'm Dan. So, what are you after?`);

  let slot: SlotKey | null;
  while ((slot = nextSlot(c.facts))) {
    const answer = await menu(questionFor(slot, c.facts), optionsFor(slot, product));
    setFact(c, slot, answer);
  }

  const price = priceOf(product, c.facts.storage);
  say("Dan", `Good choices. That's the ${product.name}, ${c.facts.colour}, ${c.facts.storage} -- $${price}. Tap to pay?`);
  await ask("[press enter to pay] ");
  if (roll(rng, 0.08)) {
    say("Dan", "Hmm, that's not gone through. Let's try again.");
    await ask("[press enter to retry] ");
  }
  closeCase(c, "fulfilled");
  say("Dan", "Done. Enjoy it!");
}

async function playEmployee(rng: Rng, mira: Traits): Promise<void> {
  const myRole = await menu("Which post?", ["Greeter", "Specialist: phones"]);
  const customer = spawnCustomer(rng, 1);

  if (myRole === "Greeter") {
    // You're playing Mira's own post, so your own attentiveness is your
    // choice below, not a roll -- nothing here rolls against you.
    say("(system)", `${customer.name} walks in.`);
    const greet = await menu(`Greet ${customer.name}?`, ["Greet them", "Let someone else get it"]);
    if (greet !== "Greet them") {
      log(`${customer.name} waits... nobody comes over for a while.`);
      return;
    }
    say("you", "Hi, welcome in. What are you after?");
    say(customer.name, "A phone, please.");
    const c = openCase(customer.id, "phone", "you");
    setFact(c, "referred_by", "you");
    handOff(c, "dan (npc)");
    say("you", "I'll hand you to Dan on phones.");
    log("Case handed off to Dan, carrying: referred_by=you.");
    return;
  }

  noticeDelay(rng, mira, "Mira");
  say("Mira (NPC)", `Got one for you -- ${customer.name}, wants a phone.`);
  const c = openCase(customer.id, "phone", "mira");
  setFact(c, "referred_by", "mira");
  handOff(c, "you");
  say(customer.name, "Hi, I'm after a new phone.");

  await runHumanStaffConversation(rng, customer, c);

  const price = priceOf(customer.product, c.facts.storage);
  say("you", `That's $${price}. Tap to pay.`);
  if (roll(rng, 0.08)) say("(system)", "Payment didn't go through on the first try.");
  closeCase(c, "fulfilled");
  say("you", "All done!");
}

async function runHumanStaffConversation(rng: Rng, customer: NpcCustomer, c: ReturnType<typeof openCase>): Promise<void> {
  let slot: SlotKey | null;
  while ((slot = nextSlot(c.facts))) {
    say("you", questionFor(slot, c.facts));
    for (;;) {
      const answer = npcAnswer(slot, customer.product, customer.traits, rng);
      say(customer.name, answer);
      const confirm = await menu("Write this down and move on?", ["Yes, next question", "Ask again (they seemed unsure)"]);
      if (confirm === "Yes, next question") {
        setFact(c, slot, answer);
        break;
      }
    }
  }
  if (roll(rng, (1 - customer.traits.decisiveness) * 0.35)) {
    say(customer.name, "Actually -- could I also get a case for it?");
    setFact(c, "accessories", "case and charger");
  }
}

main();
