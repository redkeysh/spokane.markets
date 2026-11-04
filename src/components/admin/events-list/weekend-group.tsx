"use client";

import { cn } from "@/lib/utils";
import type { WeekendGroup as WeekendGroupData } from "@/lib/admin/events-query";
import { itemIds } from "@/lib/admin/events-list-order";
import { AdminButton } from "@/components/admin/kit/button";
import { GroupHeading } from "@/components/admin/kit/list";
import { EventRow } from "./event-row";
import { tickState, useEventsList } from "./list-context";
import { SeriesRow } from "./series-row";
import { TwinBracket } from "./twin-bracket";

/** One weekend: a sticky heading with its fact and "Select week", then its rows. */
export function WeekendGroup({ group }: { group: WeekendGroupData }) {
  const api = useEventsList();
  const headingId = `week-${group.key}`;
  const tickable = group.items.flatMap(itemIds).filter((id) => !api.rows.get(id)?.archived);
  const state = tickState(tickable, api.ticked);

  return (
    <section aria-labelledby={headingId}>
      <GroupHeading
        as="h2"
        fact={group.fact}
        className="border-b border-seam px-4 md:px-6"
        action={
          tickable.length > 0 ? (
            <AdminButton
              variant="quiet"
              size="sm"
              className={cn(api.selecting ? "inline-flex" : "hidden md:inline-flex")}
              onClick={() => api.setTicked(tickable, state !== "all")}
            >
              {state === "all" ? "Untick week" : "Select week"}
            </AdminButton>
          ) : undefined
        }
      >
        <span id={headingId}>{group.heading}</span>
      </GroupHeading>
      <ul role="list" aria-labelledby={headingId}>
        {group.items.map((item) => {
          if (item.type === "twins") {
            return <TwinBracket key={item.key} entries={item.entries} groupKey={group.key} maybe={item.maybe} />;
          }
          if (item.type === "series") {
            return (
              <SeriesRow
                key={item.key}
                seriesKey={item.key}
                name={item.name}
                total={item.total}
                entries={item.entries}
                groupKey={group.key}
              />
            );
          }
          return <EventRow key={item.entry.id} entry={item.entry} groupKey={group.key} />;
        })}
      </ul>
    </section>
  );
}
