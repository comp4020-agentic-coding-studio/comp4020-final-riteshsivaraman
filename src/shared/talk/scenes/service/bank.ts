import * as engine from "../../core/engine.ts";
import { MODELS } from "../../data.ts";
import { COST_LABEL, SYMPTOM_LABEL, faultById, type Symptom } from "./data.ts";
import { mergeConstraints, mergeSignals, modelIds, poolOf, rank, type Constraints, type FaultCandidate, type FaultModel, type Signals } from "./pool.ts";
import type { Ctx, Option, Scene } from "./types.ts";

// v1 bank: 4 symptoms (service-scene-proposal.md section 3's recommended
// scope), the model, water exposure, data-matters (feeds the mandatory
// gate), and prior-repair-elsewhere ([TK] invented eligibility note, not
// acted on in v1 beyond being asked and recorded).

export interface Contribution {
  c?: Constraints;
  s?: Signals;
}

export interface QuestionDef {
  id: string;
  kind: "hard" | "soft" | "route" | "resolve";
  multi?: boolean;
  ask(ctx: Ctx, reopen: boolean): string;
  pre(ctx: Ctx): boolean;
  options(ctx: Ctx): Option[];
  apply(picks: string[]): Contribution;
}

export function newScene(): Scene {
  return {
    answers: {},
    order: [],
    excluded: [],
    turn: 0,
    toMove: "staff",
    pending: null,
    forced: null,
    dataLossWarned: false,
    ended: null,
    log: [],
  };
}

const NOTSURE: Option = { id: "notsure", label: "Not sure", neutral: true };
const valueOf = (picks: string[], prefix: string): string | undefined => picks.find((p) => p.startsWith(prefix))?.slice(prefix.length);

export const BANK: QuestionDef[] = [
  {
    id: "which_model",
    kind: "route",
    ask: () => "Hi, thanks for bringing it in. Which phone is this?",
    pre: (ctx) => ctx.sc.turn === 0 && !ctx.c.model,
    options: () => MODELS.map((m) => ({ id: `model:${m.id}`, label: m.name })),
    apply: (picks) => {
      const m = valueOf(picks, "model:");
      return m ? { c: { model: m } } : {};
    },
  },
  {
    id: "symptom",
    // route, not hard: core/engine.ts's optionsFor only offers a "hard"
    // option when it strictly narrows an ALREADY non-empty pool
    // (rowsIf < ctx.pool.length) -- true for phone/laptop, whose catalogue
    // starts full, but this scene's pool starts empty (pool.ts's poolOf
    // returns [] with no symptom) and symptom POPULATES it rather than
    // narrowing it. Same category as phone's own opening_intent/known_model,
    // which are "route" for the identical reason. Found by a failing smoke
    // run (staffActs went empty after the model question), not guessed.
    kind: "route",
    ask: () => "What's wrong with it?",
    pre: (ctx) => !!ctx.c.model && !ctx.c.symptom,
    options: () => [
      ...(Object.keys(SYMPTOM_LABEL) as Symptom[]).map((s) => ({ id: `symptom:${s}`, label: SYMPTOM_LABEL[s] })),
      { id: "symptom:other", label: "Something else" },
    ],
    apply: (picks) => {
      const s = valueOf(picks, "symptom:");
      return s && s !== "other" ? { c: { symptom: s as Symptom } } : {};
    },
  },
  {
    id: "wet_exposure",
    kind: "hard",
    ask: () => "Has it been dropped in water or any other liquid?",
    pre: (ctx) => !!ctx.c.symptom && ctx.c.wetExposure === undefined,
    options: () => [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes" ? { c: { wetExposure: true } } : picks[0] === "no" ? { c: { wetExposure: false } } : {}),
  },
  {
    id: "data_matters",
    kind: "soft",
    ask: () => "Is there data on it you can't afford to lose, and do you have a backup?",
    pre: (ctx) => !!ctx.c.symptom && ctx.s.dataMatters === undefined,
    options: () => [
      { id: "yes_no_backup", label: "Yes, and I don't have a backup" },
      { id: "yes_has_backup", label: "Yes, but I have a backup" },
      { id: "no", label: "Nothing I'm worried about" },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes_no_backup" ? { s: { dataMatters: true } } : picks[0] === "yes_has_backup" || picks[0] === "no" ? { s: { dataMatters: false } } : {}),
  },
  {
    // The run_check staff move's fact (service-scene-proposal.md finding
    // (b)): a staff-authored answer, written into sc.answers the same way a
    // customer pick is, so derive()'s fold narrows the pool from it without
    // any change to core/engine.ts. "route" kind: nothing here narrows an
    // existing hard filter, it pins the model exactly, so askable()'s
    // narrowing check does not apply (same category as which_model).
    // askable() would also offer this to the customer as a normal question
    // if its `pre` were ever true when toMove is "customer" -- it never is,
    // since only applyStaff's run_check branch writes it, so it is
    // effectively staff-only despite living in the same bank.
    id: "confirmed_fault",
    kind: "route",
    ask: () => "", // never asked through the normal question flow; see scene.ts's run_check
    pre: () => false,
    options: () => [],
    apply: (picks) => {
      const f = valueOf(picks, "fault:");
      return f ? { c: { confirmedFault: f } } : {};
    },
  },
  {
    id: "prior_repair",
    // [TK] invented eligibility question (service-scene-proposal.md section 2)
    // -- recorded for v1, not yet acted on by any outcome rule.
    kind: "soft",
    ask: () => "Has anyone other than an authorised repairer opened or worked on it before?",
    pre: (ctx) => !!ctx.c.symptom && ctx.c.priorRepair === undefined,
    options: () => [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      NOTSURE,
    ],
    apply: (picks) => (picks[0] === "yes" ? { c: { priorRepair: true } } : picks[0] === "no" ? { c: { priorRepair: false } } : {}),
  },
];

export const questionById = (id: string): QuestionDef => {
  const q = BANK.find((x) => x.id === id);
  if (!q) throw new Error(`no such question: ${id}`);
  return q;
};

export const describeFault = (id: string): string => {
  const f = faultById(id);
  return `${f.label} (${COST_LABEL[f.costBand]})`;
};

// ---- the scene as a fold over its answers: thin wrappers over core/engine.ts,
// same pattern as src/shared/talk/bank.ts and scenes/laptop/bank.ts ----

const deps: engine.EngineDeps<Constraints, Signals, FaultCandidate, FaultModel, Scene, Option, QuestionDef> = {
  bank: BANK,
  questionById,
  mergeConstraints,
  mergeSignals,
  poolOf,
  modelIds,
  rank,
  emptyConstraints: {},
  emptySignals: {},
  withAnswer: (sc, qid, picks) => {
    if (picks === null) {
      const next: Scene = { ...sc, answers: { ...sc.answers }, order: sc.order.filter((q) => q !== qid) };
      delete next.answers[qid];
      return next;
    }
    return { ...sc, answers: { ...sc.answers, [qid]: { picks, turn: sc.turn } }, order: sc.order.includes(qid) ? sc.order : [...sc.order, qid] };
  },
};

export const derive = (sc: Scene): Ctx => engine.derive(deps, sc);
export const askable = (ctx: Ctx): QuestionDef[] => engine.askable(deps, ctx, (q, c) => q.pre(c));
export const reopenable = (ctx: Ctx): QuestionDef[] => engine.reopenable(deps, ctx);
export const optionsFor = (ctx: Ctx, q: QuestionDef): Option[] => engine.optionsFor(deps, ctx, q);
export const gain = (ctx: Ctx, q: QuestionDef): number => engine.gain(deps, ctx, q);
