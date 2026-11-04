import { archivedInUseDecisions } from "@/lib/venues/place-decisions";
import type { Decision, DecisionContext } from "../types";

/** Archived places that upcoming events or active markets still use (archivedPlaceInUse in nav-signals.ts), one decision each. */
export function find(ctx: DecisionContext): Decision[] {
  return archivedInUseDecisions(ctx);
}
