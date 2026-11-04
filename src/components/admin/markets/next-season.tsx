"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDay, formatShortDate, formatTimeRange, formatWeekday } from "@/lib/admin/format";
import { AdminButton } from "@/components/admin/kit/button";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import type { PlannedDate } from "@/lib/markets/dates";
import { repeatLastSeason } from "@/app/admin/_actions/markets";
import { NewDatesStatus } from "./new-dates-status";
import { useMarketAction } from "./use-market-action";

function hoursOf(plan: readonly PlannedDate[]): string {
  const hours = new Set(plan.map((p) => (p.allDay ? "all day" : formatTimeRange(p.startTime, p.endTime))));
  return hours.size === 1 ? `, ${[...hours][0]}` : "";
}

/**
 * Last season moved 52 weeks, shown before anything is created: every planned date as a ticked
 * chip the owner can untick, then "Create 18 dates" as Draft or Published. The lane shows the same
 * dates as hatched ticks through `onPreview`.
 */
export function NextSeason({
  marketId,
  plan,
  summary,
  fromEventIds,
  headingLevel = "h3",
  onPreview,
  onClose,
  now,
  className,
}: {
  marketId: string;
  plan: readonly PlannedDate[];
  /** "Wednesdays May 19 to Sep 15, 2027". */
  summary: string;
  /** Only these listings' dates ("Repeat for 2027 as weekly dates"). */
  fromEventIds?: string[];
  headingLevel?: "h2" | "h3";
  onPreview?: (dates: string[]) => void;
  onClose: () => void;
  now: Date;
  className?: string;
}) {
  const { run, busy } = useMarketAction();
  const [left, setLeft] = React.useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = React.useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const headingId = React.useId();
  const chosen = plan.filter((p) => !left.has(p.date));
  const Heading = headingLevel;

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  React.useEffect(() => {
    onPreview?.(plan.filter((p) => !left.has(p.date)).map((p) => p.date));
  }, [plan, left, onPreview]);

  React.useEffect(() => () => onPreview?.([]), [onPreview]);

  const create = async () => {
    const result = await run("create", () =>
      repeatLastSeason({ marketId, status, dates: chosen.map((p) => p.date), fromEventIds })
    );
    if (result.ok) onClose();
  };

  const n = chosen.length;
  const oneYear = new Set(plan.map((p) => p.date.slice(0, 4))).size === 1;
  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <Heading ref={headingRef} id={headingId} tabIndex={-1} className="font-text text-[15px]/[20px] font-semibold text-basalt">
        Next season
      </Heading>
      <p className="max-w-[72ch] text-sm text-basalt">
        {plan.length} {plan.length === 1 ? "date" : "dates"}: {summary}
        {hoursOf(plan)}. Last season moved 52 weeks, so each weekday stays the same, and each new date copies the one it repeats.
      </p>
      <div role="group" aria-label="Dates to create" className="flex flex-wrap gap-1.5">
        {plan.map((p) => (
          <ToggleChip
            key={p.date}
            pressed={!left.has(p.date)}
            onPressedChange={(on) =>
              setLeft((prev) => {
                const next = new Set(prev);
                if (on) next.delete(p.date);
                else next.add(p.date);
                return next;
              })
            }
            className="tabular-nums"
          >
            {oneYear ? `${formatWeekday(p.date)} ${formatShortDate(p.date)}` : formatDay(p.date, now)}
          </ToggleChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <NewDatesStatus value={status} onChange={setStatus} />
        <div className="ml-auto flex flex-wrap gap-2">
          <AdminButton variant="quiet" onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton
            variant={status === "PUBLISHED" ? "publish" : "ink"}
            disabled={n === 0}
            busy={busy === "create"}
            busyLabel="Creating"
            onClick={create}
          >
            {status === "PUBLISHED" ? `Create and publish ${n}` : `Create ${n} ${n === 1 ? "date" : "dates"}`}
          </AdminButton>
        </div>
      </div>
    </section>
  );
}
