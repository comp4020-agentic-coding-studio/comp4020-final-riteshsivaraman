// Terminal prototype of the store's interaction model (SCOPE D43, option
// B): a cheap, throwaway check that the loop/case/slot design (ADR 6,
// grilling session 2026-10-13) actually feels right before investing in the
// real engine. Not wired to the real server, SQLite, or the 3D client --
// run it with `pnpm sim`.
import type { Product } from "../../src/shared/catalogue.ts";
import { aiAvailable, interpret } from "./ai.ts";
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

  let slot: SlotKey | null;
  while ((slot = nextSlot(c.facts))) {
    await askSlot(c, slot, product);
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

// Fact-string summary for the AI's context -- only what's really known, so
// it has nothing to invent beyond.
function contextLine(facts: Record<string, string>): string {
  const known = Object.entries(facts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return known || "nothing yet";
}

// Every other not-yet-filled slot, with its real options -- what a
// customer who volunteers more than was asked (T7) can have captured
// alongside the question actually asked.
function otherOpenSlots(c: SimCase, product: Product, exclude: SlotKey): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const k of SLOT_ORDER) if (k !== exclude && c.facts[k] === undefined) out[k] = optionsFor(k, product);
  return out;
}

// Only keeps an extra that's a real option for its own slot -- the
// interpreter's output is never trusted into state unchecked.
function applyValidExtras(c: SimCase, product: Product, extra: Record<string, string> | undefined): void {
  if (!extra) return;
  for (const [key, value] of Object.entries(extra)) {
    if ((SLOT_ORDER as string[]).includes(key) && c.facts[key] === undefined && optionsFor(key as SlotKey, product).includes(value)) {
      setFact(c, key as SlotKey, value);
    }
  }
}

// Asks one slot. With no AI key, this is the plain menu it always was
// (SCOPE D8's fallback). With one, you can type freely: answer, say "not
// sure" and get a real default explained rather than forced, ask Dan
// something back and have the same question put to you again afterward,
// or volunteer other facts in the same breath and have them land too.
async function askSlot(c: SimCase, slot: SlotKey, product: Product): Promise<void> {
  const question = questionFor(slot, c.facts);
  const options = optionsFor(slot, product);
  if (!aiAvailable()) {
    setFact(c, slot, await menu(question, options));
    return;
  }

  say("Dan", `${question} (type freely, or say you're not sure)`);
  for (;;) {
    const utterance = await ask("> ");
    const result = await interpret({ question, options, utterance, context: contextLine(c.facts), otherSlots: otherOpenSlots(c, product, slot) });
    if (!result) {
      log("the AI call timed out or failed -- switching to the menu for this one");
      setFact(c, slot, await menu(question, options)); // AI failed mid-turn -- clean fallback, not a crash
      return;
    }
    applyValidExtras(c, product, result.extra);

    if (result.type === "answer" && result.value && options.includes(result.value)) {
      setFact(c, slot, result.value);
      return;
    }

    if (result.type === "not_sure") {
      const suggestion = options[Math.floor(options.length / 2)];
      say("Dan", result.reply || `No worries -- most people go with ${suggestion}. Sound alright, or did you want something else?`);
      const follow = await ask("> ");
      const second = await interpret({ question, options, utterance: follow, context: contextLine(c.facts) });
      applyValidExtras(c, product, second?.extra);
      setFact(c, slot, second?.type === "answer" && second.value && options.includes(second.value) ? second.value : suggestion);
      return;
    }

    if (result.type === "question" || result.type === "unclear") {
      say("Dan", result.reply || "Sorry, could you say that a different way?");
      continue; // same question stands; nothing's been answered yet
    }

    say("Dan", `I don't think I've got that -- it's one of: ${options.join(", ")}.`);
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
        say("Dan", `Good choice, the ${match.name}.`);
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
      for (;;) {
        const follow = await ask("> ");
        const pick = await interpret({ question: "which model", options: [a.name, b.name], utterance: follow, context: compareLine(a, b) });
        if (!pick) {
          log("the AI call timed out or failed -- switching to the menu for this one");
          const choice = await menu(`Shall we go with the ${a.name}, or the ${b.name}?`, [a.name, b.name]);
          return choice === a.name ? a : b;
        }
        if (pick.type === "answer" && pick.value === a.name) return a;
        if (pick.type === "answer" && pick.value === b.name) return b;
        if (pick.type === "question" || pick.type === "unclear") {
          say("Dan", pick.reply || compareLine(a, b));
          continue;
        }
        say("Dan", `Shall we go with the ${a.name}, or the ${b.name}?`);
      }
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
