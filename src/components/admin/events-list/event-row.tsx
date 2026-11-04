"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EventListRow, GroupEntry } from "@/lib/admin/events-query";
import { AdminButton } from "@/components/admin/kit/button";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { StallGlyph } from "@/components/admin/kit/stall";
import { STATUS_MARKS, StatusMark } from "@/components/admin/kit/status-mark";
import { tickLabel, useEventsList, type EventsListApi } from "./list-context";

/** Where a row sits in a twin bracket. */
export type BracketPosition = "first" | "middle" | "last";

export const ROW_CLASS = "sm-row group/row flex items-stretch border-b border-seam px-2 md:px-4";

export function rowGround(ticked: boolean): string {
  return ticked ? "bg-lilac-tint" : "bg-sheet hover:bg-hover";
}

/** "+1 day", "+2 days". */
export function extraDaysText(extraDays: number): string {
  return extraDays > 0 ? `+${extraDays} ${extraDays === 1 ? "day" : "days"}` : "";
}

export function joinMeta(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p).join(", ");
}

/** The meta line under a title; what it holds changes with the width. */
export function MetaLine({ phone, md, lg, xl }: { phone: string; md: string; lg: string; xl: string }) {
  if (!phone && !md && !lg && !xl) return null;
  return (
    <p className="mt-0.5 text-xs text-ash tabular-nums">
      <span className="md:hidden">{phone}</span>
      <span className="hidden md:inline lg:hidden">{md}</span>
      <span className="hidden lg:inline xl:hidden">{lg}</span>
      <span className="hidden xl:inline">{xl}</span>
    </p>
  );
}

export function TickCell({
  label,
  state,
  onChange,
  selecting,
}: {
  label: string;
  /** null leaves the cell empty (archived rows cannot be ticked). */
  state: "all" | "some" | "none" | null;
  onChange: (on: boolean) => void;
  selecting: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <div className={cn("w-8 shrink-0 items-center justify-center", selecting ? "flex" : "hidden md:flex")}>
      {state !== null && (
        <label data-row-action className="flex size-6 cursor-pointer items-center justify-center">
          <input
            ref={ref}
            type="checkbox"
            tabIndex={-1}
            checked={state === "all"}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={label}
            className="size-4 cursor-pointer rounded-sm accent-basalt"
          />
        </label>
      )}
    </div>
  );
}

export function LeafCell({ day }: { day: string }) {
  return (
    <div className="flex w-14 shrink-0 items-center justify-center py-1">
      <DateLeaf date={day} />
    </div>
  );
}

export function FlagsCell({ flags }: { flags: string[] }) {
  return (
    <div className="hidden w-[132px] shrink-0 flex-col justify-center py-1 pr-3 text-xs text-ash xl:flex">
      {flags.map((flag) => (
        <span key={flag}>{flag}</span>
      ))}
    </div>
  );
}

export function PlaceCell({ text }: { text: string }) {
  return (
    <div className="hidden shrink-0 items-center py-1 pr-3 text-sm text-ash lg:flex lg:w-[260px] xl:w-[300px]">
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

export function MarketCell({ text }: { text: string | null }) {
  return (
    <div className="hidden w-[180px] shrink-0 items-center py-1 pr-3 text-sm text-ash xl:flex">
      {text && <span className="line-clamp-2">{text}</span>}
    </div>
  );
}

export function StatusCell({ mark }: { mark: EventListRow["mark"] | null }) {
  const glyph = mark ? STATUS_MARKS[mark].glyph : null;
  return (
    <>
      <div className="hidden w-28 shrink-0 items-center md:flex">
        {mark ? <StatusMark status={mark} /> : <span className="text-sm text-ash">Mixed</span>}
      </div>
      <div className="flex shrink-0 items-center px-2 md:hidden">
        {glyph ? <StallGlyph status={glyph} /> : null}
        <span className="sr-only">{mark ? STATUS_MARKS[mark].word : "Mixed"}</span>
      </div>
    </>
  );
}

/** The cursor row's menu: always there, faded in on hover and focus where a mouse is used. */
export function ControlCell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      data-row-control
      data-row-action
      className={cn(
        "flex shrink-0 items-center justify-end",
        wide ? "pl-2" : "w-8",
        !wide &&
          "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:has-[[aria-expanded=true]]:opacity-100"
      )}
    >
      {children}
    </div>
  );
}

function titleTone(row: EventListRow): string {
  if (row.archived) return "text-ash-quiet";
  if (row.mark === "REJECTED") return "text-ash";
  if (row.mark === "CANCELLED") return "text-basalt line-through";
  return "text-basalt";
}

export function rowMenuItems(row: EventListRow, api: EventsListApi, extra: MenuItem[] = []): MenuItem[] {
  const items: MenuItem[] = [{ label: "Open", href: api.hrefFor(row.id) }];
  if (row.mark === "PUBLISHED") items.push({ label: "View on site", href: `/events/${row.slug}`, external: true });
  if (!row.archived && row.mark !== "PUBLISHED") items.push({ label: "Publish", onSelect: () => api.publish([row.id]) });
  if (!row.archived && row.mark !== "REJECTED") items.push({ label: "Reject…", onSelect: () => api.reject([row.id]) });
  items.push(...extra);
  if (!row.archived) items.push({ label: "Archive", description: "Out of every list. Can be restored.", onSelect: () => api.archive([row.id]) });
  return items;
}

/**
 * One event: tick, date leaf, title (the whole row opens the editor), flags, place, market,
 * status and the row menu. Archived rows offer Restore instead of a tick.
 */
export function EventRow({
  entry,
  groupKey,
  bracket,
  nested = false,
}: {
  entry: GroupEntry;
  groupKey: string;
  bracket?: { position: BracketPosition; maybe: boolean };
  nested?: boolean;
}) {
  const api = useEventsList();
  const row = api.rows.get(entry.id);
  if (!row) return null;
  const extra: MenuItem[] = [];
  if (row.twin) extra.push({ label: "Compare in To do", href: `/admin?d=${encodeURIComponent(row.twin.key)}` });
  const seriesIds = row.series ? api.seriesIds[row.series.key] : undefined;
  if (seriesIds) {
    extra.push({ label: `Tick the whole series (${seriesIds.length})`, onSelect: () => api.setTicked(seriesIds, true) });
  }
  const menu = rowMenuItems(row, api, extra);

  const ticked = api.ticked.has(row.id);
  const time = joinMeta([entry.time, extraDaysText(entry.extraDays)]);
  const twinWord = bracket?.position === "last" ? (bracket.maybe ? "Maybe the same" : "Same day and place") : null;
  let flags = row.flags;
  if (twinWord) flags = [twinWord, ...flags.filter((f) => f !== "Twin" && f !== "Maybe a twin")];
  flags = flags.slice(0, 2);

  return (
    <li className={cn(ROW_CLASS, rowGround(ticked))}>
      <TickCell
        label={tickLabel(row.title)}
        state={row.archived ? null : ticked ? "all" : "none"}
        onChange={(on) => api.setTicked([row.id], on)}
        selecting={api.selecting}
      />
      <LeafCell day={entry.day} />
      <div className={cn("relative flex min-w-0 flex-1 flex-col justify-center py-2 pr-3", (bracket || nested) && "pl-4")}>
        {bracket && <Bracket position={bracket.position} />}
        <Link
          href={api.hrefFor(row.id)}
          data-roving-item
          data-row-key={`${groupKey}:${row.id}`}
          data-tick-ids={row.archived ? "" : row.id}
          aria-describedby={ticked ? `${groupKey}-${row.id}-ticked` : undefined}
          className={cn("sm-row-link text-sm font-medium", titleTone(row))}
        >
          {row.title}
        </Link>
        {ticked && (
          <span id={`${groupKey}-${row.id}-ticked`} hidden>
            Ticked
          </span>
        )}
        <MetaLine
          phone={joinMeta([twinWord, time, row.placeLine])}
          md={joinMeta([time, row.placeLine, row.marketName, ...flags])}
          lg={joinMeta([time, row.marketName, ...flags])}
          xl={time}
        />
      </div>
      <FlagsCell flags={flags} />
      <PlaceCell text={row.placeLine} />
      <MarketCell text={row.marketName} />
      <StatusCell mark={row.mark} />
      {row.archived ? (
        <ControlCell wide>
          <AdminButton variant="outline" size="sm" onClick={() => api.restore([row.id])} disabled={api.busy}>
            Restore
          </AdminButton>
        </ControlCell>
      ) : (
        <ControlCell>
          <Menu items={menu} label={`More actions for ${row.title}`} />
        </ControlCell>
      )}
    </li>
  );
}

/** The 2 px seam line joining twins on the left of their titles. */
function Bracket({ position }: { position: BracketPosition }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1 w-0.5 bg-seam",
          position === "first" && "top-1/2 -bottom-px",
          position === "middle" && "-top-px -bottom-px",
          position === "last" && "-top-px bottom-1/2"
        )}
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1 h-0.5 w-2 -translate-y-1/2 bg-seam" />
    </>
  );
}
