import { scheduleProblems } from "@/lib/events/readiness";
import type { Decision, DecisionAction, DecisionContext, DecisionEvent } from "../types";
import { firstDateOf } from "./shared";

type Problem = { short: string; detail: string; action: DecisionAction; label: string };

const HOUR_WORDS: Record<string, string> = {
  "closes-before-opens": "closes before it opens",
  "opens-at-midnight": "opens at 12:00 am",
  "multi-day-no-hours": "no daily hours",
};

function problemOf(event: DecisionEvent): Problem | null {
  const hours = scheduleProblems(event)[0];
  if (hours) return { short: HOUR_WORDS[hours.flag] ?? "hours look wrong", detail: hours.message, action: "fix-hours", label: "Fix hours" };
  if (event.venue.deletedAt) {
    return { short: "place archived", detail: `Its place, ${event.venue.name}, is archived.`, action: "edit", label: "Change the place" };
  }
  if (!event.imageUrl?.trim()) {
    return { short: "no picture", detail: "Visitors see it without a picture.", action: "add-picture", label: "Add a picture" };
  }
  return null;
}

/** Live, upcoming events whose hours are wrong, whose place is archived, or that have no picture. */
export function find(ctx: DecisionContext): Decision[] {
  const decisions: Decision[] = [];
  for (const event of ctx.input.events) {
    if (event.status !== "PUBLISHED" || ctx.ended(event)) continue;
    const problem = problemOf(event);
    if (!problem) continue;
    decisions.push({
      key: `looks-wrong:${event.id}`,
      kind: "looks-wrong",
      lane: ctx.laneOf(event),
      title: `${event.title}: live, ${problem.short}`,
      detail: problem.detail,
      rows: [ctx.row(event)],
      settles: [],
      primary: { label: problem.label, action: problem.action },
      firstDate: firstDateOf(ctx, [event]),
    });
  }
  return decisions;
}
