"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupEntry } from "@/lib/admin/events-query";
import { formatDay } from "@/lib/admin/format";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import {
  ControlCell,
  EventRow,
  FlagsCell,
  LeafCell,
  MarketCell,
  MetaLine,
  PlaceCell,
  ROW_CLASS,
  StatusCell,
  TickCell,
  joinMeta,
  rowGround,
} from "./event-row";
import { tickLabel, tickState, useEventsList } from "./list-context";

/**
 * Dates of one series inside a weekend, collapsed into one row: "Kendall Yards Christmas Market,
 * 3 dates here (6 in all)". Enter or the chevron opens the dates; ticking the row ticks them all.
 */
export function SeriesRow({
  seriesKey,
  name,
  total,
  entries,
  groupKey,
}: {
  seriesKey: string;
  name: string;
  total: number;
  entries: GroupEntry[];
  groupKey: string;
}) {
  const api = useEventsList();
  const ids = entries.map((e) => e.id);
  const rows = ids.map((id) => api.rows.get(id)).filter((r) => r !== undefined);
  if (rows.length === 0) return null;
  const first = rows[0];
  const expandKey = `${groupKey}:${seriesKey}`;
  const open = api.expanded.has(expandKey);
  const state = tickState(ids, api.ticked);
  const marks = new Set(rows.map((r) => r.mark));
  const mark = marks.size === 1 ? first.mark : null;
  const title = `${name.trim()}, ${entries.length} dates here (${total} in all)`;
  const dates = entries.map((e) => formatDay(e.day)).join(", ");
  const flags = [first.series?.noMarket ? "Series, no market" : "Series"];
  const childrenId = `${expandKey}-dates`;
  const whole = api.seriesIds[seriesKey];

  const menu: MenuItem[] = [
    { label: "Open the first date", href: api.hrefFor(first.id) },
    ...(whole ? [{ label: `Tick the whole series (${whole.length})`, onSelect: () => api.setTicked(whole, true) }] : []),
    { label: open ? "Hide the dates" : "Show the dates", onSelect: () => api.toggleExpanded(expandKey) },
  ];

  return (
    <li>
      <div className={cn(ROW_CLASS, rowGround(state === "all"))}>
        <TickCell
          label={tickLabel(title)}
          state={state}
          onChange={(on) => api.setTicked(ids, on)}
          selecting={api.selecting}
        />
        <LeafCell day={entries[0].day} />
        <div className="relative flex min-w-0 flex-1 flex-col justify-center py-2 pr-3">
          <button
            type="button"
            data-roving-item
            data-row-key={`${groupKey}:series:${seriesKey}`}
            data-tick-ids={ids.join(" ")}
            aria-expanded={open}
            aria-controls={open ? childrenId : undefined}
            onClick={() => api.toggleExpanded(expandKey)}
            className="sm-row-link inline-flex items-start gap-1 text-left text-sm font-medium text-basalt"
          >
            <ChevronRight
              aria-hidden="true"
              strokeWidth={1.75}
              className={cn("mt-0.5 size-4 shrink-0 text-ash", open && "rotate-90")}
            />
            <span>{title}</span>
          </button>
          <MetaLine
            phone={joinMeta([dates, first.placeLine])}
            md={joinMeta([dates, first.placeLine, first.marketName, ...flags])}
            lg={joinMeta([dates, first.marketName, ...flags])}
            xl={dates}
          />
        </div>
        <FlagsCell flags={flags} />
        <PlaceCell text={first.placeLine} />
        <MarketCell text={first.marketName} />
        <StatusCell mark={mark} />
        <ControlCell>
          <Menu items={menu} label={`More actions for ${name.trim()}`} />
        </ControlCell>
      </div>
      {open && (
        <ul id={childrenId} role="list" aria-label={`Dates of ${name.trim()}`}>
          {entries.map((entry) => (
            <EventRow key={entry.id} entry={entry} groupKey={groupKey} nested />
          ))}
        </ul>
      )}
    </li>
  );
}
