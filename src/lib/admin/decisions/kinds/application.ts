import { APPLICATION_FORM_WORDS, applicationTitle } from "../../inbox/words";
import type { Decision, DecisionContext } from "../types";

/** Waiting applications, one decision each, oldest first. P approves, X rejects. */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.applications ?? []).map((application) => {
    const title = applicationTitle(application.name, application.formType);
    return {
      key: `application:${application.id}`,
      kind: "application" as const,
      lane: "public" as const,
      title,
      detail: APPLICATION_FORM_WORDS[application.formType] ?? "Application",
      rows: [{ type: "application" as const, id: application.id, title, status: "PENDING" }],
      settles: [],
      sentAt: application.createdAt.toISOString(),
      primary: { label: "Approve", action: "approve" as const },
    };
  });
}
