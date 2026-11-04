"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { findFacts } from "@/lib/events/description-facts";
import { formatDay, formatTime, formatTimeRange, formatWeekday } from "@/lib/admin/format";
import { proposeDailyHours, type EditorDay, type Stretch } from "./model";

/** "Sat 10:00 am to 4:00 pm and Sun 10:00 am to 4:00 pm". */
export function describeDays(days: EditorDay[]): string {
  const parts = days.map((d) => `${formatWeekday(d.date)} ${d.allDay ? "all day" : formatTimeRange(d.startTime, d.endTime)}`);
  if (parts.length <= 2) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * For an event that runs over several days as one stretch with no daily hours: says so, and
 * proposes daily hours (the stated ones when the description has them). Nothing changes until the
 * owner splits it.
 */
export function SplitDailyHours({
  stretch,
  description,
  onSplit,
  readOnly,
}: {
  stretch: Stretch;
  description: string;
  onSplit: (days: EditorDay[]) => void;
  readOnly: boolean;
}) {
  const stated = React.useMemo(() => findFacts(description).flatMap((f) => (f.kind === "hours" ? f.days : [])), [description]);
  const proposal = proposeDailyHours(stretch, stated);
  return (
    <div className="space-y-2">
      <p className="text-sm text-basalt">
        Runs {formatDay(stretch.startDate)} at {formatTime(stretch.startTime)} to {formatDay(stretch.endDate)} at {formatTime(stretch.endTime)} as one
        stretch, with no daily hours.
      </p>
      <p className="text-xs text-ash">
        Visitors see one long stretch, as if it never closed. Split it into {describeDays(proposal)}
        {stated.length > 0 ? ", the hours the description gives." : "."}
      </p>
      {!readOnly && (
        <AdminButton variant="outline" size="sm" onClick={() => onSplit(proposal)}>
          Split into daily hours
        </AdminButton>
      )}
    </div>
  );
}
