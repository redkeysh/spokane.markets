import type { DecisionContext, DecisionEvent } from "../types";

/** The earliest date on or after today among the events, or their first date when all are past. */
export function firstDateOf(ctx: DecisionContext, events: DecisionEvent[]): string | undefined {
  const dates = events.map((e) => ctx.upcomingDates(e)[0]).filter((d): d is string => !!d).sort();
  return dates[0];
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Publish", "Publish and tell Dana", "Publish and tell 3 people". */
export function publishLabel(base: string, notifies: string[]): string {
  if (notifies.length === 0) return base;
  if (notifies.length === 1) return `${base} and tell ${firstName(notifies[0])}`;
  return `${base} and tell ${notifies.length} people`;
}

export function byStart(a: DecisionEvent, b: DecisionEvent): number {
  return a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}
