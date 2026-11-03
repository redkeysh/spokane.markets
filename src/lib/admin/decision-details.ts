/** Ties the audit entries of one admin decision together, for Done today, History and undo. */
export type DecisionRef = {
  /** From newDecisionId(); every entry of the decision carries it. */
  decisionId?: string;
  /** The decision's key, e.g. "ready:2026-11-07", for wording ("for the weekend of Nov 7"). */
  decisionKey?: string;
};

/** The audit `details` fields for a decision reference. */
export function decisionDetails(ref: DecisionRef): DecisionRef {
  return {
    ...(ref.decisionId ? { decisionId: ref.decisionId } : {}),
    ...(ref.decisionKey ? { decisionKey: ref.decisionKey } : {}),
  };
}
