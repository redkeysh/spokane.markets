"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { RowSelect } from "./controls";
import { VENUE_TOOLS, VENUE_VIEWS, viewHref, viewLabel, type VenueViewKey, type ViewCounts } from "./views";

function ItemLink({ view, current, count, work }: { view: VenueViewKey; current: VenueViewKey; count?: number; work?: boolean }) {
  const selected = view === current;
  return (
    <Link
      href={viewHref(view)}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center justify-between gap-3 rounded-md px-3 font-text text-sm transition-colors duration-[80ms]",
        selected ? "bg-sheet font-semibold text-basalt shadow-[inset_2px_0_0_var(--sm-lilac)]" : "text-ash hover:bg-hover hover:text-basalt"
      )}
    >
      <span>{viewLabel(view)}</span>
      {count !== undefined && (
        <span className={cn("text-xs tabular-nums", work && count > 0 ? "font-medium text-honey-ink" : "text-ash")}>{count}</span>
      )}
    </Link>
  );
}

/** The 232 px list of views on wide screens. */
export function ViewsNav({ current, counts }: { current: VenueViewKey; counts: ViewCounts }) {
  return (
    <nav aria-label="Venue views" className="flex flex-col gap-6">
      <p aria-hidden="true" className="px-3 font-display text-2xl/[30px] font-bold text-basalt">
        Venues
      </p>
      <ul className="flex flex-col gap-0.5">
        {VENUE_VIEWS.map((v) => (
          <li key={v.key}>
            <ItemLink view={v.key} current={current} count={counts[v.key]} work={v.work} />
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-0.5">
        {VENUE_TOOLS.map((v) => (
          <li key={v.key}>
            <ItemLink view={v.key} current={current} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The views as one select, above the content below 1280 px. */
export function ViewSelect({ current, counts, className }: { current: VenueViewKey; counts: ViewCounts; className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <label htmlFor="venue-view" className="font-text text-sm text-ash">
        Venues
      </label>
      <RowSelect id="venue-view" value={current} onChange={(e) => router.push(viewHref(e.target.value as VenueViewKey))} className="min-w-[220px]">
        {VENUE_VIEWS.map((v) => (
          <option key={v.key} value={v.key}>
            {counts[v.key] !== undefined ? `${v.label}, ${counts[v.key]}` : v.label}
          </option>
        ))}
        {VENUE_TOOLS.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </RowSelect>
    </div>
  );
}
