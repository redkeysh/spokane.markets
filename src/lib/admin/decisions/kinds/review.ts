import { starsText } from "../../inbox/words";
import type { Decision, DecisionContext } from "../types";

/** Waiting reviews, one decision each, oldest first. P approves (it shows on the site), X rejects. */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.reviews ?? []).map((review) => {
    const title = review.target ? `Review of ${review.target}` : "Review of a listing that is gone";
    return {
      key: `review:${review.id}`,
      kind: "review" as const,
      lane: "public" as const,
      title,
      detail: `${starsText(review.rating)}, by ${review.author}`,
      rows: [{ type: "review" as const, id: review.id, title, status: "PENDING" }],
      settles: [],
      sentAt: review.createdAt.toISOString(),
      primary: { label: "Approve", action: "approve" as const },
    };
  });
}
