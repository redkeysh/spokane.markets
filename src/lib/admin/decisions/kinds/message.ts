import type { Decision, DecisionContext } from "../types";

/** Unread contact messages, one decision each, oldest first. P marks it read, X archives it. */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.messages ?? []).map((message) => {
    const title = message.subject ?? `Message from ${message.name}`;
    return {
      key: `message:${message.id}`,
      kind: "message" as const,
      lane: "public" as const,
      title,
      detail: `From ${message.name}`,
      rows: [{ type: "message" as const, id: message.id, title, status: "PENDING" }],
      settles: [],
      sentAt: message.createdAt.toISOString(),
      primary: { label: "Mark read", action: "approve" as const },
    };
  });
}
