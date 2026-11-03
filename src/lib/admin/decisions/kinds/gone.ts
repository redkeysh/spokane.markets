import type { Decision, DecisionContext } from "../types";

/** Waiting events that already happened, as one "Archive n" decision. */
export function find(ctx: DecisionContext): Decision[] {
  const rows = ctx.unclaimedWaiting().filter((e) => ctx.ended(e));
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const count = sorted.length;
  return [
    {
      key: "gone",
      kind: "gone",
      lane: "gone",
      title: `Already happened: ${count} ${count === 1 ? "event" : "events"} still waiting`,
      detail: sorted.map((e) => e.title).join(", "),
      rows: sorted.map((e) => ctx.row(e)),
      settles: sorted.map((e) => e.id),
      primary: { label: `Archive ${count}`, action: "archive" },
    },
  ];
}
