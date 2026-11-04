import { spellingDecisions } from "@/lib/venues/place-decisions";
import type { Decision, DecisionContext } from "../types";

/** Place towns, states, ZIPs and addresses with spelling to tidy, as one decision. */
export function find(ctx: DecisionContext): Decision[] {
  return spellingDecisions(ctx);
}
