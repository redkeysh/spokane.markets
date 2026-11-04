import type { PromotionType } from "@prisma/client";

export const PROMOTION_TYPE_WORDS: Record<PromotionType, string> = {
  FEATURED: "Featured",
  SPONSORED: "Sponsored",
  PARTNERSHIP: "Partner spotlight",
};

export type PromotionPhase = "now" | "upcoming" | "ended";

/** Showing now, coming up, or ended, by the promotion's own start and end instants. */
export function promotionPhase(start: Date, end: Date, now: Date): PromotionPhase {
  if (end.getTime() < now.getTime()) return "ended";
  if (start.getTime() > now.getTime()) return "upcoming";
  return "now";
}

/** Splits promotions into the three groups of the page. Ended ones come most recent first; the others keep their order. */
export function groupPromotions<T extends { startDate: Date; endDate: Date }>(
  promotions: readonly T[],
  now: Date
): Record<PromotionPhase, T[]> {
  const groups: Record<PromotionPhase, T[]> = { now: [], upcoming: [], ended: [] };
  for (const p of promotions) groups[promotionPhase(p.startDate, p.endDate, now)].push(p);
  groups.ended.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  return groups;
}
