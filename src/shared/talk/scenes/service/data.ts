// The fault table for phone intake/diagnosis (G1, conversation-types.md).
//
// Real vs invented, kept explicit per-field (CLAUDE.md's "don't invent" rule,
// and Ritesh's standing authorization from the laptop run to invent clearly-
// labelled parody policy where a fictional store genuinely needs one):
//
// REAL (general troubleshooting domain knowledge, not specific to any brand
// or store -- how "won't charge", "won't turn on", "cracked screen" and
// "battery drains fast" are commonly triaged by any phone repair service):
//   - which faults are plausible causes of which symptom
//   - that a cracked screen can mean just the glass, or touch/display
//     electronics too (usually signalled by unresponsive touch or display
//     artifacts, not just visible cracking)
//   - that water exposure raises suspicion of liquid damage and often means
//     an assessment rather than an on-the-spot fix
//   - that a repair touching the logic board, battery removal, or an
//     assessment after liquid exposure can risk the data on the device
//
// INVENTED (this fictional store's own policy, not a real repair chain's
// actual rules -- [TK]/[verify] the same way SCOPE.md marks invented policy
// elsewhere): exact turnaround days, cost bands, and the "prior repair
// elsewhere needs reassessment" eligibility rule. Nothing here is a real
// price or a real warranty term copied from anywhere.

export type Symptom = "wont_charge" | "wont_turn_on" | "cracked_screen" | "battery_drain";

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  wont_charge: "Won't charge",
  wont_turn_on: "Won't turn on",
  cracked_screen: "Cracked screen",
  battery_drain: "Battery drains fast",
};

export type CostBand = "free" | "low" | "mid" | "high";
// [TK] invented price ranges, not sourced from any real repairer -- Ritesh's
// call before this goes anywhere customer-facing.
export const COST_LABEL: Record<CostBand, string> = {
  free: "no charge",
  low: "a small fee",
  mid: "a moderate fee",
  high: "a significant fee",
};

export interface FaultRec {
  id: string;
  symptom: Symptom;
  label: string;
  // Lower = more likely cause of this symptom in general use, before any
  // check narrows it (real: general troubleshooting ordering).
  likelihoodRank: number;
  // This fault is the one a "yes" to water exposure makes likely (real).
  waterRelated: boolean;
  fixable: boolean;
  location: "in_store" | "send_away";
  // A fix for this fault can put the device's data at risk (real: liquid
  // assessment, logic-board work and some battery/charging-IC repairs can
  // require a wipe or a reset).
  destructive: boolean;
  // [TK] invented: not a real turnaround time from any repairer.
  etaDays: number | null;
  // [TK] invented: not a real price from any repairer.
  costBand: CostBand;
}

export const FAULTS: FaultRec[] = [
  // ---- won't charge ----
  { id: "port_debris", symptom: "wont_charge", label: "debris or lint blocking the charging port", likelihoodRank: 1, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: null, costBand: "low" },
  { id: "battery_degraded_charge", symptom: "wont_charge", label: "a worn battery no longer holding or accepting charge well", likelihoodRank: 2, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: 1, costBand: "mid" },
  { id: "charging_ic_failure", symptom: "wont_charge", label: "a fault in the charging circuitry", likelihoodRank: 3, waterRelated: false, fixable: true, location: "send_away", destructive: true, etaDays: 5, costBand: "high" },
  { id: "liquid_damage_charge", symptom: "wont_charge", label: "corrosion from liquid exposure around the charging port", likelihoodRank: 9, waterRelated: true, fixable: true, location: "send_away", destructive: true, etaDays: 5, costBand: "high" },

  // ---- won't turn on ----
  { id: "battery_depleted", symptom: "wont_turn_on", label: "the battery fully depleted and needs a long, uninterrupted charge", likelihoodRank: 1, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: null, costBand: "free" },
  { id: "liquid_damage_power", symptom: "wont_turn_on", label: "liquid damage affecting the power circuitry", likelihoodRank: 9, waterRelated: true, fixable: true, location: "send_away", destructive: true, etaDays: 5, costBand: "high" },
  { id: "logic_board_failure", symptom: "wont_turn_on", label: "a fault on the logic board", likelihoodRank: 3, waterRelated: false, fixable: true, location: "send_away", destructive: true, etaDays: 7, costBand: "high" },

  // ---- cracked screen ----
  { id: "screen_only", symptom: "cracked_screen", label: "cracked glass with the display and touch still working underneath", likelihoodRank: 1, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: null, costBand: "mid" },
  { id: "screen_and_internals", symptom: "cracked_screen", label: "damage reaching the display assembly and touch sensor, not just the glass", likelihoodRank: 2, waterRelated: false, fixable: true, location: "send_away", destructive: true, etaDays: 4, costBand: "high" },

  // ---- battery drains fast ----
  { id: "battery_health_drain", symptom: "battery_drain", label: "a worn battery past its healthy capacity", likelihoodRank: 1, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: 1, costBand: "mid" },
  { id: "background_usage", symptom: "battery_drain", label: "an app or setting using power in the background, not a hardware fault", likelihoodRank: 2, waterRelated: false, fixable: true, location: "in_store", destructive: false, etaDays: null, costBand: "free" },
];

export const faultById = (id: string): FaultRec => {
  const f = FAULTS.find((x) => x.id === id);
  if (!f) throw new Error(`no such fault: ${id}`);
  return f;
};

// The deterministic "run a check" result: given the symptom and whatever the
// customer has said about water exposure, the single most likely cause,
// read off this table -- not a dice roll (G1's own note: "a test result is a
// fact that enters the state, from data not chance"). Water exposure
// confirmed always points first at the water-related fault for that
// symptom, since that is the real diagnostic signal that most changes the
// likely cause; otherwise the lowest likelihoodRank among the non-water
// faults for that symptom wins.
export function runCheck(symptom: Symptom, wetExposure: boolean | undefined): FaultRec {
  const candidates = FAULTS.filter((f) => f.symptom === symptom && (wetExposure === true || !f.waterRelated));
  const water = candidates.find((f) => f.waterRelated);
  if (wetExposure === true && water) return water;
  const rest = candidates.filter((f) => !f.waterRelated).sort((a, b) => a.likelihoodRank - b.likelihoodRank);
  return rest[0] ?? candidates[0]!;
}
