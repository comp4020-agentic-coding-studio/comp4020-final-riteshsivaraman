// Terminal prototype of the store's interaction model (SCOPE D43, option
// B): a cheap, throwaway check that the loop/case/slot design (ADR 6,
// grilling session 2026-10-13) actually feels right before investing in the
// real engine. Not wired to the real server, SQLite, or the 3D client --
// run it with `pnpm sim`.
import type { Product } from "../../src/shared/catalogue.ts";
import { aiAvailable, interpret, interpretTurn, type OpenSlot } from "./ai.ts";
import { priceOf, SIM_PRODUCTS } from "./catalogue.ts";
import { closeCase, handOff, openCase, setFact, type SimCase } from "./case.ts";
import { ask, closeIo, log, menu, say } from "./io.ts";
import { type NpcCustomer, noticeDelay, runAmbientConversation, spawnCustomer } from "./npc.ts";
import { candidateLine, compareLine, shortlistFor, BUDGET_OPTIONS } from "./product.ts";
import { makeRng, roll, type Rng } from "./rng.ts";
import { nextSlot, npcAnswer, optionsFor, questionFor, SLOT_ORDER, type SlotKey } from "./slots.ts";
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
  say("Dan (phones)", `Hi ${name}, I'm Dan. So, what are you after?`);

  const product = await chooseProduct(c);
  await fillRemainingSlots(c, product);

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

// Fact-string summary for the AI's context -- only what's really known, so
// it has nothing to invent beyond.
function contextLine(facts: Record<string, string>): string {
  const known = Object.entries(facts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return known || "nothing yet";
}

// Every not-yet-filled slot, with its real question and options -- the
// whole table a single turn can draw from. Rebuilt every turn, since
// what's open shrinks as things get settled.
function openSlotList(c: SimCase, product: Product): OpenSlot[] {
  return SLOT_ORDER.filter((k) => c.facts[k] === undefined).map((k) => ({ key: k, question: questionFor(k, c.facts), options: optionsFor(k, product) }));
}

// The actual fix for "this isn't a non-linear conversation": not a
// for-loop over SLOT_ORDER asking one fixed question at a time, but one
// shared turn that puts every still-open item on the table at once. A
// single utterance can answer several of them, none of them, revisit
// nothing in particular, or just ask something back -- what happens next
// comes out of interpretTurn's own judgement, not a script walking a
// list. SLOT_ORDER still decides what the engine itself would ask next if
// nothing else were driving the conversation, but the model can route
// around it freely; it's a fallback shape, not the conversation's shape.
async function fillRemainingSlots(c: SimCase, product: Product): Promise<void> {
  if (!aiAvailable()) {
    let slot: SlotKey | null;
    while ((slot = nextSlot(c.facts))) setFact(c, slot, await menu(questionFor(slot, c.facts), optionsFor(slot, product)));
    return;
  }

  const first = openSlotList(c, product)[0];
  say("Dan", `${first.question} And feel free to bring up anything else, ask me something, or say you're not sure -- in any order.`);

  let staleTurns = 0;
  while (nextSlot(c.facts)) {
    const utterance = await ask("> ");
    const result = await interpretTurn({ openSlots: openSlotList(c, product), context: contextLine(c.facts), utterance });
    if (!result) {
      log("the AI call timed out or failed -- switching to the menu for the rest");
      let slot: SlotKey | null;
      while ((slot = nextSlot(c.facts))) setFact(c, slot, await menu(questionFor(slot, c.facts), optionsFor(slot, product)));
      return;
    }

    let settled = 0;
    for (const [key, value] of Object.entries(result.answers)) {
      if ((SLOT_ORDER as string[]).includes(key) && c.facts[key] === undefined && optionsFor(key as SlotKey, product).includes(value)) {
        setFact(c, key as SlotKey, value);
        settled++;
      }
    }
    say("Dan", result.reply || "Got it.");

    // A weak free model can keep missing every open item for several
    // turns in a row -- fall back to asking the single most pressing one
    // plainly rather than loop on nothing settling, ever.
    staleTurns = settled > 0 ? 0 : staleTurns + 1;
    if (staleTurns >= 4) {
      const slot = nextSlot(c.facts);
      if (slot) setFact(c, slot, await menu(questionFor(slot, c.facts), optionsFor(slot, product)));
      staleTurns = 0;
    }
  }
}

// The actual fix for "you don't even get asked if you had a particular
// model in mind": this runs before any other slot, the model is known to
// the player the moment it's decided (never a silent pick revealed at the
// till), and "help me choose" gets a real two-candidate compare, not a
// single recommendation.
async function chooseProduct(c: SimCase): Promise<Product> {
  if (!aiAvailable()) return chooseProductByMenu(c);

  say("Dan", "Do you have a particular model in mind, or would you like some help picking? (type freely)");
  const catalogueLine = SIM_PRODUCTS.map((p) => candidateLine(p)).join("; ");
  for (;;) {
    const utterance = await ask("> ");
    const result = await interpret({
      question: "Do you have a particular model in mind?",
      options: SIM_PRODUCTS.map((p) => p.name),
      utterance,
      context: `Models we carry: ${catalogueLine}`,
    });
    if (!result) {
      log("the AI call timed out or failed -- switching to the menu for this one");
      return chooseProductByMenu(c);
    }

    if (result.type === "answer" && result.value) {
      const match = SIM_PRODUCTS.find((p) => p.name === result.value);
      if (match) {
        say("Dan", result.reply || `Good choice, the ${match.name}.`);
        setFact(c, "use_case", "already decided"); // T7: already knowing what you want skips "what's it for"
        return match;
      }
    }

    if (result.type === "not_sure") {
      say("Dan", result.reply || "No worries, let's narrow it down. What's it mostly for, and roughly what's your budget?");
      const need = await ask("> ");
      const budgetGuess = await interpret({ question: "budget", options: BUDGET_OPTIONS, utterance: need, context: catalogueLine });
      const budgetAnswer = budgetGuess?.type === "answer" && budgetGuess.value ? budgetGuess.value : BUDGET_OPTIONS[1];
      setFact(c, "budget", budgetAnswer);
      const [a, b] = shortlistFor(budgetAnswer);
      say("Dan", `Two that'd suit: ${candidateLine(a)}, or ${candidateLine(b)}. ${compareLine(a, b)} Which sounds better -- or ask me anything first.`);
      for (let tries = 0; tries < 4; tries++) {
        const follow = await ask("> ");
        const pick = await interpret({ question: "which model", options: [a.name, b.name], utterance: follow, context: compareLine(a, b) });
        if (!pick) {
          log("the AI call timed out or failed -- switching to the menu for this one");
          const choice = await menu(`Shall we go with the ${a.name}, or the ${b.name}?`, [a.name, b.name]);
          return choice === a.name ? a : b;
        }
        if (pick.type === "answer" && pick.value === a.name) return a;
        if (pick.type === "answer" && pick.value === b.name) return b;
        if (pick.type === "question" || pick.type === "unclear" || pick.type === "not_sure") {
          say("Dan", pick.reply || compareLine(a, b));
          continue;
        }
        say("Dan", `Shall we go with the ${a.name}, or the ${b.name}?`);
      }
      const choice = await menu(`Shall we go with the ${a.name}, or the ${b.name}?`, [a.name, b.name]);
      return choice === a.name ? a : b;
    }

    if (result.type === "question" || result.type === "unclear") {
      say("Dan", result.reply || "Sure -- what would you like to know?");
      continue;
    }
  }
}

// The no-AI fallback: still asks model-first and still offers a real
// two-candidate compare, just through menus instead of free text.
async function chooseProductByMenu(c: SimCase): Promise<Product> {
  const choice = await menu("Do you have a particular model in mind?", ["Yes, I know what I want", "Help me choose"]);
  if (choice === "Yes, I know what I want") {
    const name = await menu("Which model?", SIM_PRODUCTS.map((p) => p.name));
    setFact(c, "use_case", "already decided");
    return SIM_PRODUCTS.find((p) => p.name === name)!;
  }
  const budgetAnswer = await menu("Roughly what's your budget?", BUDGET_OPTIONS);
  setFact(c, "budget", budgetAnswer);
  const [a, b] = shortlistFor(budgetAnswer);
  say("Dan", compareLine(a, b));
  const pick = await menu(`${candidateLine(a)}\n  ${candidateLine(b)}`, [a.name, b.name]);
  return pick === a.name ? a : b;
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
