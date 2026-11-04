"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  AREA_OPTIONS,
  areaParam,
  clearedFiltersHref,
  EVENTS_NEEDS,
  EVENTS_ONLY,
  EVENTS_SHOW,
  EVENTS_WHEN,
  eventsListHref,
  hasActiveFilters,
  NEED_LABELS,
  ONLY_LABELS,
  SHOW_LABELS,
  WHEN_LABELS,
  type EventsListFilters,
  type EventsNeed,
  type EventsOnly,
} from "@/lib/admin/events-query";
import { AREAS, type Area } from "@/lib/admin/regions";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { FilterBar, FilterChipRow, FilterSearch, FilterSelect } from "@/components/admin/kit/filter-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import { useMediaQuery } from "@/components/admin/shell/use-media";

type Option = { value: string; label: string };

const ANY = "";

function toggled<T extends string>(list: readonly T[], value: T, on: boolean, order: readonly T[]): T[] {
  const next = new Set(list);
  if (on) next.add(value);
  else next.delete(value);
  return order.filter((v) => next.has(v));
}

/** The number of filters on beyond the search, for the phone's Filters button. */
export function countFilters(filters: EventsListFilters): number {
  return (
    Number(filters.show !== "waiting") +
    Number(filters.whenSet) +
    Number(!!filters.area) +
    Number(!!filters.source) +
    filters.needs.length +
    filters.only.length +
    Number(!!filters.week)
  );
}

/** The search field, kept in step with the URL; typing waits 300 ms before it filters. */
function SearchField({
  filters,
  navigate,
  focusKey,
  placeholder = "Search title, place, market or city",
  className,
}: {
  filters: EventsListFilters;
  navigate: (href: string) => void;
  /** Whether `f` focuses this field; only the one on screen takes it. */
  focusKey: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = React.useState(filters.q);
  const [submitted, setSubmitted] = React.useState(filters.q);
  const [seen, setSeen] = React.useState(filters.q);
  if (filters.q !== seen) {
    setSeen(filters.q);
    if (filters.q !== submitted) {
      setText(filters.q);
      setSubmitted(filters.q);
    }
  }

  React.useEffect(() => {
    const next = text.trim();
    if (next === submitted) return;
    const timer = window.setTimeout(() => {
      setSubmitted(next);
      navigate(eventsListHref(filters, { q: next }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, submitted, filters, navigate]);

  return (
    <FilterSearch
      label="Search events"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      focusKey={focusKey}
      className={className}
    />
  );
}

function ShowControl({ filters }: { filters: EventsListFilters }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="font-text text-sm text-ash">
        Show
      </span>
      <Segmented
        label="Show"
        value={filters.show}
        options={EVENTS_SHOW.map((show) => ({ value: show, label: SHOW_LABELS[show], href: eventsListHref(filters, { show }) }))}
      />
    </span>
  );
}

function Selects({
  filters,
  sourceOptions,
  navigate,
}: {
  filters: EventsListFilters;
  sourceOptions: Option[];
  navigate: (href: string) => void;
}) {
  return (
    <>
      <FilterSelect
        label="When"
        value={filters.when}
        options={EVENTS_WHEN.map((when) => ({ value: when, label: WHEN_LABELS[when] }))}
        onChange={(e) => navigate(eventsListHref(filters, { when: e.target.value as EventsListFilters["when"] }))}
      />
      <FilterSelect
        label="Area"
        value={filters.area ? areaParam(filters.area) : ANY}
        options={[{ value: ANY, label: "Any" }, ...AREA_OPTIONS]}
        onChange={(e) => {
          const area = AREAS.find((a) => areaParam(a) === e.target.value) ?? null;
          navigate(eventsListHref(filters, { area: area as Area | null }));
        }}
      />
      <FilterSelect
        label="Source"
        value={filters.source ?? ANY}
        options={[{ value: ANY, label: "Any" }, ...sourceOptions]}
        onChange={(e) => navigate(eventsListHref(filters, { source: e.target.value || null }))}
      />
    </>
  );
}

function Chips({ filters, navigate }: { filters: EventsListFilters; navigate: (href: string) => void }) {
  return (
    <>
      <FilterChipRow label="Needs">
        {EVENTS_NEEDS.map((need: EventsNeed) => (
          <ToggleChip
            key={need}
            pressed={filters.needs.includes(need)}
            onPressedChange={(on) => navigate(eventsListHref(filters, { needs: toggled(filters.needs, need, on, EVENTS_NEEDS) }))}
          >
            {NEED_LABELS[need]}
          </ToggleChip>
        ))}
      </FilterChipRow>
      <FilterChipRow label="Only">
        {EVENTS_ONLY.map((only: EventsOnly) => (
          <ToggleChip
            key={only}
            pressed={filters.only.includes(only)}
            onPressedChange={(on) => navigate(eventsListHref(filters, { only: toggled(filters.only, only, on, EVENTS_ONLY) }))}
          >
            {ONLY_LABELS[only]}
          </ToggleChip>
        ))}
      </FilterChipRow>
    </>
  );
}

function WeekChip({
  filters,
  weekLabel,
  navigate,
  className,
}: {
  filters: EventsListFilters;
  weekLabel: string | null;
  navigate: (href: string) => void;
  className?: string;
}) {
  if (!filters.week || !weekLabel) return null;
  return (
    <ToggleChip pressed onPressedChange={() => navigate(eventsListHref(filters, { week: null }))} className={className}>
      <span className="tabular-nums">{weekLabel}</span>
      <span className="sr-only">, press to show every weekend</span>
    </ToggleChip>
  );
}

export function ViewControl({ filters, className }: { filters: EventsListFilters; className?: string }) {
  return (
    <Segmented
      label="View"
      value={filters.view}
      className={className}
      options={[
        { value: "weekends", label: "Weekends", href: eventsListHref(filters, { view: "weekends" }) },
        { value: "table", label: "Table", href: eventsListHref(filters, { view: "table" }) },
      ]}
    />
  );
}

/**
 * One filter row (search, Show, When, Area, Source) and one row of Needs and Only toggles, all
 * kept in the URL. On phones the search stays and the rest, with the view switch, opens in a sheet.
 */
export function EventsFilters({
  filters,
  sourceOptions,
  weekLabel,
  navigate,
}: {
  filters: EventsListFilters;
  sourceOptions: Option[];
  weekLabel: string | null;
  navigate: (href: string) => void;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const wide = useMediaQuery("(min-width: 768px)", true);
  const active = hasActiveFilters(filters);
  const count = countFilters(filters);

  return (
    <>
      <div className="hidden space-y-2 md:block">
        <FilterBar active={active} clearHref={clearedFiltersHref(filters)} label="Filter events">
          <SearchField filters={filters} navigate={navigate} focusKey={wide} />
          <ShowControl filters={filters} />
          <Selects filters={filters} sourceOptions={sourceOptions} navigate={navigate} />
          <WeekChip filters={filters} weekLabel={weekLabel} navigate={navigate} className="xl:hidden" />
        </FilterBar>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Chips filters={filters} navigate={navigate} />
          <WeekChip filters={filters} weekLabel={weekLabel} navigate={navigate} className="hidden xl:inline-flex" />
        </div>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <SearchField filters={filters} navigate={navigate} focusKey={!wide} placeholder="Search events" className="min-w-0 flex-1" />
        <AdminButton
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-label={count > 0 ? `Filters, ${count} on` : "Filters"}
        >
          <SlidersHorizontal strokeWidth={1.75} aria-hidden="true" />
          Filters
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </AdminButton>
      </div>
      {filters.week && weekLabel && (
        <div className="mt-2 md:hidden">
          <WeekChip filters={filters} weekLabel={weekLabel} navigate={navigate} />
        </div>
      )}

      <AdminDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Filters"
        size="list"
        footer={
          <>
            {active && (
              <AdminLinkButton href={clearedFiltersHref(filters)} variant="quiet" onClick={() => setSheetOpen(false)}>
                Clear filters
              </AdminLinkButton>
            )}
            <AdminButton variant="ink" onClick={() => setSheetOpen(false)} data-autofocus>
              Done
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          <ShowControl filters={filters} />
          <div className="flex flex-col items-start gap-3">
            <Selects filters={filters} sourceOptions={sourceOptions} navigate={navigate} />
          </div>
          <div className="space-y-3">
            <Chips filters={filters} navigate={navigate} />
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sm text-ash">
              View
            </span>
            <ViewControl filters={filters} />
          </div>
        </div>
      </AdminDialog>
    </>
  );
}
