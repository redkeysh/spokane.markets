import type { Decision, DecisionContext } from "../types";
import { firstDateOf, publishLabel } from "./shared";

/** Waiting events whose public submission was approved under the old two-step flow. */
export function find(ctx: DecisionContext): Decision[] {
  return ctx
    .unclaimedWaiting()
    .filter((e) => e.submission?.status === "APPROVED" && !ctx.ended(e))
    .map((event) => {
      const notifies = ctx.notifies([event]);
      return {
        key: `approved-unpublished:${event.id}`,
        kind: "approved-unpublished" as const,
        lane: ctx.laneOf(event),
        title: `Approved but never published: ${event.title}`,
        detail: "The submission was approved under the old two-step flow.",
        rows: [ctx.row(event)],
        settles: [event.id],
        primary: { label: publishLabel("Publish", notifies), action: "publish" as const, notifies },
        firstDate: firstDateOf(ctx, [event]),
      };
    });
}
