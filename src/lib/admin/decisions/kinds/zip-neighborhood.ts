import { zipNeighborhoodDecisions } from "@/lib/venues/place-decisions";
import type { Decision, DecisionContext } from "../types";

/** Places without a neighborhood, one decision per ZIP. */
export function find(ctx: DecisionContext): Decision[] {
  return zipNeighborhoodDecisions(ctx);
}
