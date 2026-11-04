import type { Decision, DecisionContext } from "../types";

/** Markets waiting for verification, one decision each, longest waiting first. P verifies, X leaves it not verified. */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.markets ?? []).map((market) => ({
    key: `market-verification:${market.id}`,
    kind: "market-verification" as const,
    lane: "public" as const,
    title: `Verify ${market.name}?`,
    detail: market.owner ? `Asked by ${market.owner}` : "Waiting for verification",
    rows: [{ type: "market" as const, id: market.id, title: market.name, status: "PENDING" }],
    settles: [],
    sentAt: market.requestedAt.toISOString(),
    primary: { label: "Verify", action: "approve" as const },
  }));
}
