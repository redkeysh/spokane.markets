import { unusedPlaceDecisions } from "@/lib/venues/place-decisions";
import type { Decision, DecisionContext } from "../types";

/** Active places no event or market uses, as one decision. */
export function find(ctx: DecisionContext): Decision[] {
  return unusedPlaceDecisions(ctx);
}
