import type { Decision, DecisionContext } from "../types";
import { pairDecisions } from "./twins";

/** Same date and place, titles sharing only part of their words. */
export function find(ctx: DecisionContext): Decision[] {
  return pairDecisions(ctx, ctx.twins().maybe, "maybe-twins");
}
