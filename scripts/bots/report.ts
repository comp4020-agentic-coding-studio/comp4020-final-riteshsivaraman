// The shared report shape every scenario returns, and the table printer
// SKILL.md #4 asks for: scenario name, bot count, failures, p95 round trip.
import type { RttSample } from "./client.ts";

export interface ScenarioResult {
  scenario: string; // e.g. "S1 happy path"
  bots: number;
  failures: string[]; // empty = passed; each entry is a human-readable repro, one per distinct failure
  rtts: RttSample[]; // every timed round trip this scenario measured
  notes?: string[]; // non-failure observations worth a reader's attention
}

function p95(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx]!;
}

export function printReport(results: ScenarioResult[], meta: { target: string; latencyLabel: string }): boolean {
  const lines: string[] = [];
  lines.push("");
  lines.push("=== bot-stress report ===");
  lines.push(`target: ${meta.target}   latency: ${meta.latencyLabel}`);
  lines.push("");
  const header = ["scenario", "bots", "failures", "p95 rtt (ms)"];
  const rows = results.map((r) => {
    const samples = r.rtts.map((s) => s.ms);
    const p = p95(samples);
    return [r.scenario, String(r.bots), String(r.failures.length), p === null ? "n/a" : String(p)];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const pad = (s: string, w: number): string => s + " ".repeat(w - s.length);
  lines.push(header.map((h, i) => pad(h, widths[i]!)).join("  "));
  lines.push(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) lines.push(row.map((c, i) => pad(c, widths[i]!)).join("  "));
  lines.push("");

  let anyFailure = false;
  for (const r of results) {
    if (r.notes?.length) {
      lines.push(`[${r.scenario}] notes:`);
      for (const n of r.notes) lines.push(`  - ${n}`);
    }
    if (r.failures.length > 0) {
      anyFailure = true;
      lines.push(`[${r.scenario}] FAILURES:`);
      for (const f of r.failures) lines.push(`  - ${f}`);
    }
  }
  lines.push("");
  const totalBots = results.reduce((a, r) => a + r.bots, 0);
  const totalFailures = results.reduce((a, r) => a + r.failures.length, 0);
  const allRtts = results.flatMap((r) => r.rtts.map((s) => s.ms));
  lines.push(`TOTAL: ${results.length} scenarios, ${totalBots} bots, ${totalFailures} failures, overall p95 ${p95(allRtts) ?? "n/a"} ms`);
  lines.push("");
  console.log(lines.join("\n"));
  return !anyFailure;
}
