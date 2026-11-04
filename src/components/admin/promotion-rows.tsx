import type { PromotionType } from "@prisma/client";
import { dateColumnToIso, formatDayRange } from "@/lib/admin/format";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import { List, ListRow } from "@/components/admin/kit/list";
import { PromotionRowActions } from "@/components/admin/promotion-row-actions";
import { PROMOTION_TYPE_WORDS, type PromotionPhase } from "@/components/admin/promotion-words";

export type PromotionRowData = {
  id: string;
  type: PromotionType;
  sponsorName: string | null;
  sortOrder: number;
  startDate: Date;
  endDate: Date;
  event: { title: string; slug: string } | null;
  vendorProfile: { businessName: string; slug: string } | null;
};

const PHASE_STATUS: Record<PromotionPhase, { word: string; className: string }> = {
  now: { word: "On the homepage", className: "text-cedar" },
  upcoming: { word: "Coming up", className: "text-ash" },
  ended: { word: "Ended", className: "text-ash-quiet" },
};

/** One group of featured entries. The status word shows from `md` up. */
export function PromotionRows({
  promotions,
  phase,
  now,
}: {
  promotions: readonly PromotionRowData[];
  phase: PromotionPhase;
  now: Date;
}) {
  return (
    <List label={PHASE_STATUS[phase].word}>
      {promotions.map((p) => {
        const title = p.event?.title ?? p.vendorProfile?.businessName ?? "A listing that is gone";
        const publicHref = p.event ? `/events/${p.event.slug}` : p.vendorProfile ? `/vendors/${p.vendorProfile.slug}` : null;
        const start = dateColumnToIso(p.startDate);
        const end = dateColumnToIso(p.endDate);
        const meta = [
          p.event ? "Event" : "Vendor",
          PROMOTION_TYPE_WORDS[p.type].toLowerCase(),
          formatDayRange(start, end, now),
          p.sponsorName ? `sponsored by ${p.sponsorName}` : null,
          `order ${p.sortOrder}`,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <ListRow
            key={p.id}
            rowKey={p.id}
            href={`/admin/promotions/${p.id}/edit`}
            title={title}
            archived={phase === "ended"}
            leaf={<DateLeaf date={start} />}
            meta={<span className="tabular-nums">{meta}</span>}
            status={
              <span className={`hidden font-text text-sm font-medium md:inline ${PHASE_STATUS[phase].className}`}>
                {PHASE_STATUS[phase].word}
              </span>
            }
            action={<PromotionRowActions id={p.id} title={title} publicHref={publicHref} />}
          />
        );
      })}
    </List>
  );
}
