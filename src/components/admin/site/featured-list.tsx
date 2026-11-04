import type { EventStatus, PromotionType } from "@prisma/client";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import { Empty } from "@/components/admin/kit/empty";
import { List, ListRow } from "@/components/admin/kit/list";
import { formatMonthDay, pacificDate } from "@/lib/admin/format";
import { splitFeatured } from "@/lib/site/settings-input";

export type FeaturedEntry = {
  id: string;
  type: PromotionType;
  startDate: Date;
  endDate: Date;
  event: { id: string; title: string; status: EventStatus; deletedAt: Date | null; startDate: Date };
};

const TYPE_WORDS: Record<PromotionType, string> = {
  FEATURED: "Featured",
  SPONSORED: "Sponsored",
  PARTNERSHIP: "Partner spotlight",
};

function windowText(entry: FeaturedEntry, now: Date) {
  return `${formatMonthDay(pacificDate(entry.startDate), now)} to ${formatMonthDay(pacificDate(entry.endDate), now)}`;
}

function Status({ entry, now, ended }: { entry: FeaturedEntry; now: Date; ended?: boolean }) {
  if (ended) return <span className="text-xs text-ash">Ended</span>;
  if (entry.event.deletedAt || entry.event.status !== "PUBLISHED") {
    return <span className="text-xs font-medium text-honey-ink">Not shown: the event is not published</span>;
  }
  if (entry.startDate > now) {
    return <span className="text-xs text-ash tabular-nums">Starts {formatMonthDay(pacificDate(entry.startDate), now)}</span>;
  }
  return <span className="text-xs font-medium text-cedar">On the homepage now</span>;
}

function Rows({ label, entries, now, ended }: { label: string; entries: FeaturedEntry[]; now: Date; ended?: boolean }) {
  return (
    <List label={label}>
      {entries.map((entry) => (
        <ListRow
          key={entry.id}
          rowKey={entry.id}
          href={`/admin/promotions/${entry.id}/edit`}
          leaf={<DateLeaf date={pacificDate(entry.event.startDate)} />}
          title={entry.event.title}
          meta={
            <>
              <span className="tabular-nums">
                {TYPE_WORDS[entry.type]} {windowText(entry, now)}
              </span>
              <span className="mt-0.5 block sm:hidden">
                <Status entry={entry} now={now} ended={ended} />
              </span>
            </>
          }
          status={
            <span className="max-sm:hidden">
              <Status entry={entry} now={now} ended={ended} />
            </span>
          }
          archived={ended}
        />
      ))}
    </List>
  );
}

/** Events featured on the homepage: showing now and coming up, with ended ones folded away. */
export function FeaturedList({ entries, now }: { entries: FeaturedEntry[]; now: Date }) {
  const { current, upcoming, ended } = splitFeatured(entries, now);
  const live = [...current, ...upcoming];

  return (
    <div className="space-y-3">
      {live.length > 0 ? (
        <Rows label="Featured now and coming up" entries={live} now={now} />
      ) : (
        <Empty
          className="py-2"
          detail="Featured events show in a row near the top of the homepage while their dates last."
        >
          Nothing is featured on the homepage right now.
        </Empty>
      )}
      {ended.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-lilac">
            Ended <span className="text-ash tabular-nums">({ended.length})</span>
          </summary>
          <div className="mt-2">
            <Rows label="Ended" entries={ended} now={now} ended />
          </div>
        </details>
      )}
    </div>
  );
}
