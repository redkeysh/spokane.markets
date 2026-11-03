import type { Decision, DecisionContext } from "../types";
import { publishLabel } from "./shared";

/** Pending public submissions, one decision each, oldest first. */
export function find(ctx: DecisionContext): Decision[] {
  return [...ctx.input.submissions]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((submission) => {
      const notifies = submission.submitterHasAccount ? [submission.submitterName] : [];
      const firstDate = submission.dates.find((d) => d >= ctx.today) ?? submission.dates[0];
      return {
        key: `submission:${submission.id}`,
        kind: "submission" as const,
        lane: "public" as const,
        title: submission.title,
        detail: `Sent by ${submission.submitterName}`,
        rows: [{ type: "submission" as const, id: submission.id, title: submission.title, status: "PENDING", firstDate }],
        settles: [],
        primary: { label: publishLabel("Publish", notifies), action: "publish-submission" as const, notifies },
        firstDate,
      };
    });
}
