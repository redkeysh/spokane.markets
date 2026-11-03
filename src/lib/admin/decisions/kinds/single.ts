import type { Decision, DecisionContext } from "../types";
import { firstDateOf, publishLabel } from "./shared";

/** Every waiting event no other decision took: one decision each, with what keeps it out of a batch. */
export function find(ctx: DecisionContext): Decision[] {
  return ctx.unclaimedWaiting().map((event) => {
    const readiness = ctx.readiness.get(event.id);
    const notifies = ctx.notifies([event]);
    const reason = readiness?.blocking[0]?.message;
    return {
      key: `single:${event.id}`,
      kind: "single" as const,
      lane: ctx.laneOf(event),
      title: event.title,
      detail: reason ?? (readiness?.warnings.length ? `Ready. ${readiness.warnings.map((w) => w.message).join(". ")}.` : "Ready to publish"),
      rows: [ctx.row(event)],
      settles: [event.id],
      primary: { label: publishLabel("Publish", notifies), action: "publish" as const, notifies },
      firstDate: firstDateOf(ctx, [event]),
    };
  });
}
