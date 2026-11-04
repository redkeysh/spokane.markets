import { reportReasonText } from "../../inbox/words";
import type { Decision, DecisionContext } from "../types";

const URGENCY: Record<string, number> = { CRITICAL: 2, HIGH: 1 };

/**
 * Open reports, one decision each. Critical and high reports carry an urgency, which puts them at
 * the top of From the public. P resolves, X dismisses.
 */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.reports ?? []).map((report) => {
    const title = `Report on ${report.target}`;
    const urgency = URGENCY[report.severity] ?? 0;
    const urgent = urgency ? `, ${report.severity === "CRITICAL" ? "critical" : "high severity"}` : "";
    return {
      key: `report:${report.id}`,
      kind: "report" as const,
      lane: "public" as const,
      title,
      detail: `${reportReasonText(report.reason)}${urgent}`,
      rows: [{ type: "report" as const, id: report.id, title, status: "PENDING" }],
      settles: [],
      sentAt: report.createdAt.toISOString(),
      ...(urgency ? { urgency } : {}),
      primary: { label: "Mark resolved", action: "approve" as const },
    };
  });
}
