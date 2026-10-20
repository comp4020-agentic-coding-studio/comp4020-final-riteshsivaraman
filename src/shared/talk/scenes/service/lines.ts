import { modelById } from "../../data.ts";
import { COST_LABEL, faultById } from "./data.ts";
import type { CustomerAction, CustomerReply, Ctx, Option, Outcome, Pending, StaffAct, Tone } from "./types.ts";

// Wording. Same discipline as src/shared/talk/lines.ts: every line is built
// from state and data, nothing is free text, and every customer-facing
// phrase here is a placeholder for Ritesh to rewrite in his own voice
// (CLAUDE.md's "Ritesh writes the prose"). Structural facts (what a fault
// actually is, what it costs/takes per data.ts) are not placeholders -- only
// their exact phrasing is.

export function greetLine(): string {
  return "Hi, thanks for bringing it in. Which phone is this?";
}

export function staffLine(act: StaffAct, ctx: Ctx, _tone: Tone, _turn: number, firstLine: boolean, confirmedFaultId?: string): string {
  if (firstLine) return greetLine();
  if (act.t === "ask") {
    const label: Record<string, string> = {
      symptom: "What's wrong with it?",
      wet_exposure: "Has it been dropped in water or any other liquid?",
      data_matters: "Is there data on it you can't afford to lose, and do you have a backup?",
      prior_repair: "Has anyone other than an authorised repairer opened or worked on it before?",
    };
    return label[act.qid] ?? `${act.qid}?`;
  }
  if (act.t === "run_check" && confirmedFaultId) {
    const f = faultById(confirmedFaultId);
    return `Let me run a quick check. ... That confirms it: ${f.label}.`;
  }
  return "";
}

export function dataLossLine(): string {
  // The mandatory line (service-scene-proposal.md finding (c)) -- its wording
  // is a placeholder, but the fact that it is said, and said before any
  // destructive outcome can be offered, is the real, tested invariant.
  return "Before I go any further, I need to be upfront: this repair could mean we lose whatever's on the phone. Do you want to go ahead?";
}

export function outcomeLine(ctx: Ctx): string {
  const fault = ctx.c.confirmedFault ? faultById(ctx.c.confirmedFault) : undefined;
  if (!fault) return "I'm not able to narrow this down from what you've told me.";
  if (!fault.fixable) return `It looks like ${fault.label}, and unfortunately that's not something we can fix.`;
  const cost = COST_LABEL[fault.costBand];
  const where = fault.location === "in_store" ? "here in store" : "sent away to a specialist";
  const eta = fault.etaDays !== null ? `, about ${fault.etaDays} day${fault.etaDays === 1 ? "" : "s"}` : "";
  return `It looks like ${fault.label}. That can be fixed ${where}${eta ? eta : ""}, for ${cost}. How would you like to proceed?`;
}

export function closingLine(ended: Outcome): string {
  if (ended.how === "fixed_now") return "All done — that should have it sorted.";
  if (ended.how === "booked") return ended.location === "in_store" ? "I've booked that in for you. We'll be in touch when it's ready." : "I've sent that off. We'll be in touch when it's back.";
  if (ended.how === "cannot_fix") return "I'm sorry we couldn't sort this one out today.";
  if (ended.how === "declines") return "No problem — let us know if you change your mind.";
  return "Thanks for coming in.";
}

export function customerLine(reply: CustomerReply, options: Option[], pending: Pending): string {
  if (reply.action) return actionLine(reply.action);
  const picks = reply.picks ?? [];
  if (pending.kind === "data_loss_ack") return picks[0] === "ack" ? "I understand, go ahead." : "I'd rather not risk it.";
  if (pending.kind === "outcome_choice") {
    if (picks[0] === "fix_now") return "Yes, let's do that now.";
    if (picks[0] === "book") return "OK, let's book it in.";
    return "Not right now, thanks.";
  }
  const labels = picks.map((p) => options.find((o) => o.id === p)?.label).filter((l): l is string => !!l);
  return labels.length ? labels.join(", ") : "Not sure.";
}

function actionLine(a: CustomerAction): string {
  if (a.t === "leave") return "Actually, I need to go — I'll come back another time.";
  if (a.t === "change") return "Actually, let me change that answer.";
  return "OK.";
}

// Kept for parity with the purchase scenes' naming convention; this scene has
// no model-name-mention-avoidance rule (service.md did not sketch one), so
// this is a direct passthrough rather than a real mechanism.
export const named = (_ctx: Ctx, id: string | null): string => (id ? modelById(id).name : "");
