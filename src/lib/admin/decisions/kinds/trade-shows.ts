import { looksLikeTradeShow } from "@/lib/events/trade-shows";
import { REJECT_REASONS } from "@/lib/admin/reject-reasons";
import type { Decision, DecisionContext } from "../types";
import { byStart, firstDateOf } from "./shared";

/** Upcoming waiting events whose titles read like trade shows, as one batch in the lane of the first. */
export function find(ctx: DecisionContext): Decision[] {
  const rows = ctx
    .unclaimedWaiting()
    .filter((e) => !ctx.ended(e) && looksLikeTradeShow(e.title))
    .sort(byStart);
  if (rows.length === 0) return [];
  const count = rows.length;
  const notifies = ctx.notifies(rows);
  const tell = notifies.length === 0 ? "" : ` and tell ${notifies.length} ${notifies.length === 1 ? "organizer" : "organizers"}`;
  return [
    {
      key: "trade-shows",
      kind: "trade-shows",
      lane: ctx.laneOf(rows[0]),
      title: `${count} ${count === 1 ? "looks" : "look"} like ${count === 1 ? "a trade show" : "trade shows"}`,
      detail: count === 1 ? rows[0].title : `${rows[0].title} and ${count - 1} later`,
      rows: rows.map((e) => ctx.row(e)),
      settles: rows.map((e) => e.id),
      primary: { label: `Reject ${count}${tell}: "${REJECT_REASONS[0]}"`, action: "reject", notifies },
      firstDate: firstDateOf(ctx, rows),
    },
  ];
}
