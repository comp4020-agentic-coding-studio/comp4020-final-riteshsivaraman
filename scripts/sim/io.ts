import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

export async function ask(prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

export async function menu(prompt: string, options: readonly string[]): Promise<string> {
  if (prompt) console.log(prompt);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  for (;;) {
    const raw = await ask("> ");
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1];
    console.log(`Pick a number 1-${options.length}.`);
  }
}

export function say(speaker: string, line: string): void {
  console.log(`\n${speaker}: ${line}`);
}

export function log(line: string): void {
  console.log(`  [${line}]`);
}

export function closeIo(): void {
  rl.close();
}
