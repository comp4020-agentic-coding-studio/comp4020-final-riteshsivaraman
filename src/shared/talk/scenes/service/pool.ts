import { FAULTS, faultById, type FaultRec, type Symptom } from "./data.ts";

// The pool here is candidate fault explanations, not products (the proposal's
// finding (a), docs/conversation-model/service-scene-proposal.md): "narrowed
// by constraints" generalises, "purchasable, demoed, picked" does not. A
// customer does not choose a fault; staff and the customer narrow which one
// is likely true, then choose an outcome from a small fixed set (scene.ts).

export interface Constraints {
  model?: string; // the device model, not a hard filter on the fault table itself
  excluded?: string[]; // faults ruled out (e.g. a check came back negative)
  maxPrice?: number; // required by EngineConstraints's bound; unused here (no price ceiling in this scene)
  symptom?: Symptom;
  wetExposure?: boolean;
  priorRepair?: boolean; // invented eligibility rule: may affect which outcomes are offered
  confirmedFault?: string; // set by the run_check staff move -- a fact, not a customer answer
}

export interface Signals {
  dataMatters?: boolean; // affects urgency framing (G1's own note), not the fault ranking
  onsetSudden?: boolean;
}

// The "Sku" for this scene: one candidate fault, in context. EngineConstraints
// requires `model`/`excluded`/`maxPrice` to exist on Constraints (core/engine.ts),
// not that the pool rows be purchasable.
export interface FaultCandidate {
  model: string; // carried through so Engine's `model` bound has something to read
  fault: string; // fault id
}

function faultPasses(f: FaultRec, c: Constraints): boolean {
  if (c.symptom !== undefined && f.symptom !== c.symptom) return false;
  if (c.excluded?.includes(f.id)) return false;
  if (c.confirmedFault !== undefined && f.id !== c.confirmedFault) return false;
  // Not-stated water exposure never eliminates a water-related fault; a
  // confirmed "no" does (the one real hard filter this scene has beyond the
  // symptom itself).
  if (c.wetExposure === false && f.waterRelated) return false;
  return true;
}

export function poolOf(c: Constraints): FaultCandidate[] {
  if (!c.symptom) return [];
  return FAULTS.filter((f) => faultPasses(f, c)).map((f) => ({ model: c.model ?? "unknown", fault: f.id }));
}

export const modelIds = (pool: FaultCandidate[]): string[] => [...new Set(pool.map((r) => r.fault))];

export function mergeConstraints(a: Constraints, b: Constraints): Constraints {
  const out: Constraints = { ...a, ...b };
  if (a.excluded || b.excluded) out.excluded = [...new Set([...(a.excluded ?? []), ...(b.excluded ?? [])])];
  return out;
}

export function mergeSignals(a: Signals, b: Signals): Signals {
  return { ...a, ...b };
}

// The ranking: most-likely cause first, read straight off the fault table's
// own likelihoodRank (real troubleshooting ordering -- see data.ts), with a
// confirmed fault from run_check always first regardless of rank.
export interface FaultModel {
  id: string; // fault id, doubles as "model" for the engine's generic Model slot
  fault: FaultRec;
}

export function rank(pool: FaultCandidate[], _s: Signals): FaultModel[] {
  return modelIds(pool)
    .map((id) => faultById(id))
    .sort((a, b) => a.likelihoodRank - b.likelihoodRank)
    .map((f) => ({ id: f.id, fault: f }));
}
