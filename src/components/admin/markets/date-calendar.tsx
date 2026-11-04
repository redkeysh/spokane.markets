"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, formatLongDay, weekdayIndex } from "@/lib/admin/format";
import { AdminButton } from "@/components/admin/kit/button";
import { WEEKDAY_SHORT, shiftMonth } from "@/lib/markets/dates";

const MONTH_TITLE = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Monday-first weeks covering the month, with null for days outside it. */
function weeksOf(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)]);
  return weeks;
}

/**
 * "Pick on a calendar": a month of day buttons that toggle. One tab stop; the arrows move a day or
 * a week, Page Up and Page Down a month. Days the market already lists are marked and cannot be
 * picked.
 */
export function DateCalendar({
  selected,
  onToggle,
  taken,
  today,
  label,
}: {
  selected: readonly string[];
  onToggle: (date: string) => void;
  taken: ReadonlySet<string>;
  today: string;
  label: string;
}) {
  const chosen = new Set(selected);
  const [focusDate, setFocusDate] = React.useState(today);
  const [month, setMonth] = React.useState(monthOf(today));
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const moved = React.useRef(false);

  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    buttons.current.get(focusDate)?.focus();
  }, [focusDate, month]);

  const moveTo = (date: string) => {
    moved.current = true;
    setFocusDate(date);
    setMonth(monthOf(date));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(focusDate, -1),
      ArrowRight: () => addDays(focusDate, 1),
      ArrowUp: () => addDays(focusDate, -7),
      ArrowDown: () => addDays(focusDate, 7),
      PageUp: () => addDays(focusDate, -28),
      PageDown: () => addDays(focusDate, 28),
      Home: () => addDays(focusDate, -weekdayIndex(focusDate)),
      End: () => addDays(focusDate, 6 - weekdayIndex(focusDate)),
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    moveTo(step());
  };

  const visibleFocus = monthOf(focusDate) === month ? focusDate : `${month}-01`;

  return (
    <div className="w-fit max-w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <AdminButton variant="quiet" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft strokeWidth={1.75} aria-hidden="true" />
        </AdminButton>
        <p aria-live="polite" className="font-text text-sm font-semibold text-basalt">
          {MONTH_TITLE.format(new Date(`${month}-01T12:00:00Z`))}
        </p>
        <AdminButton variant="quiet" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight strokeWidth={1.75} aria-hidden="true" />
        </AdminButton>
      </div>
      <table role="grid" aria-label={label} className="border-collapse font-text text-sm tabular-nums" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((d) => (
              <th key={d} scope="col" className="h-6 w-10 text-center text-xs font-medium text-ash">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(month).map((week, i) => (
            <tr key={i}>
              {week.map((date, j) => {
                if (!date) return <td key={j} />;
                const isTaken = taken.has(date);
                const on = chosen.has(date);
                const past = date < today;
                return (
                  <td key={date} className="p-0.5 text-center">
                    <button
                      ref={(node) => {
                        if (node) buttons.current.set(date, node);
                        else buttons.current.delete(date);
                      }}
                      type="button"
                      tabIndex={date === visibleFocus ? 0 : -1}
                      aria-pressed={on}
                      aria-disabled={isTaken || past || undefined}
                      aria-label={`${formatLongDay(date)}${isTaken ? ", already listed" : ""}${date === today ? ", today" : ""}`}
                      onClick={() => {
                        setFocusDate(date);
                        if (!isTaken && !past) onToggle(date);
                      }}
                      className={cn(
                        "inline-flex size-9 items-center justify-center rounded-md border text-basalt pointer-coarse:size-11",
                        on ? "border-seam-strong bg-lilac-tint font-semibold" : "border-transparent hover:bg-hover",
                        (isTaken || past) && "cursor-default text-ash-quiet hover:bg-transparent",
                        isTaken && "line-through",
                        date === today && !on && "border-lilac"
                      )}
                    >
                      {Number(date.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
