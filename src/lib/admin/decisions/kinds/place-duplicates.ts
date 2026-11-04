import { placeDuplicateDecisions } from "@/lib/venues/place-decisions";
import type { Decision, DecisionContext } from "../types";

/** Groups of places that look like one place, one decision each, by the next event at the group. */
export function find(ctx: DecisionContext): Decision[] {
  return placeDuplicateDecisions(ctx);
}
