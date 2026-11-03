import type { Decision, DecisionContext, DecisionEvent, DecisionLane } from "../types";
import { byStart, firstDateOf, publishLabel } from "./shared";

function laneKey(lane: DecisionLane): string {
  return lane.startsWith("week:") ? lane.slice("week:".length) : lane;
}

/** "8 events, no pictures", naming a gap only when every event in the batch shares it. */
function batchDetail(ctx: DecisionContext, events: DecisionEvent[]): string {
  const everyone = (flag: string) => events.every((e) => ctx.readiness.get(e.id)?.warnings.some((w) => w.flag === flag));
  const gaps = [
    everyone("no-picture") ? "no pictures" : null,
    everyone("no-tags") ? "no tags" : null,
    everyone("no-features") ? "no features" : null,
  ].filter(Boolean);
  return [`${events.length} events`, ...gaps].join(", ");
}

/**
 * One batch per lane of the unclaimed waiting events that pass the ready
 * rule and are in no twin or maybe-twin pair. A lane with a single ready
 * event leaves it to the single kind.
 */
export function find(ctx: DecisionContext): Decision[] {
  const { twins, maybe } = ctx.twins();
  const paired = new Set([...twins, ...maybe].flatMap((pair) => pair.ids));
  const byLane = new Map<DecisionLane, DecisionEvent[]>();
  for (const event of ctx.unclaimedWaiting()) {
    if (paired.has(event.id) || !ctx.readiness.get(event.id)?.ready) continue;
    const lane = ctx.laneOf(event);
    byLane.set(lane, [...(byLane.get(lane) ?? []), event]);
  }
  const decisions: Decision[] = [];
  for (const [lane, unsorted] of byLane) {
    if (unsorted.length < 2) continue;
    const events = [...unsorted].sort(byStart);
    const notifies = ctx.notifies(events);
    decisions.push({
      key: `ready:${laneKey(lane)}`,
      kind: "ready",
      lane,
      title: `Publish the ${events.length} ready`,
      detail: batchDetail(ctx, events),
      rows: events.map((e) => ctx.row(e)),
      settles: events.map((e) => e.id),
      primary: { label: publishLabel(`Publish the ${events.length} ready`, notifies), action: "publish", notifies },
      firstDate: firstDateOf(ctx, events),
    });
  }
  return decisions;
}
