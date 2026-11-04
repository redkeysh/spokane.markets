"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/admin/format";
import { dayProblem, type HeldDay } from "./held-edits";

const TIME_INPUT =
  "h-[30px] w-[7.5rem] rounded-md border border-seam-strong bg-sheet px-2 text-sm tabular-nums text-basalt disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:text-base";

/**
 * Daily hours held in the pane until the decision saves them. A day whose hours would mislead
 * visitors gets the honey "check" ground and says why in words.
 */
export function HoursEditor({
  days,
  onChange,
  now,
  note,
}: {
  days: HeldDay[];
  onChange: (days: HeldDay[]) => void;
  now: Date;
  /** One line above the days, e.g. "Proposed from its start and end. Check them before saving." */
  note?: React.ReactNode;
}) {
  const id = React.useId();
  const update = (index: number, change: Partial<HeldDay>) =>
    onChange(days.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <div className="space-y-1">
      {note && <p className="mb-2 text-xs text-ash">{note}</p>}
      {days.map((day, i) => {
        const problem = dayProblem(day);
        const label = formatDay(day.date, now);
        return (
          <fieldset
            key={day.date}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm px-2 py-1.5",
              problem ? "bg-honey-tint text-honey-text" : "bg-transparent"
            )}
          >
            <legend className="sr-only">{label}</legend>
            <span aria-hidden="true" className="w-24 shrink-0 text-sm font-medium tabular-nums">
              {label}
            </span>
            <label className="sr-only" htmlFor={`${id}-${i}-start`}>
              {label} opens at
            </label>
            <input
              id={`${id}-${i}-start`}
              type="time"
              value={day.allDay ? "" : day.startTime}
              disabled={day.allDay}
              onChange={(e) => update(i, { startTime: e.target.value })}
              className={TIME_INPUT}
            />
            <span aria-hidden="true" className="text-sm">
              to
            </span>
            <label className="sr-only" htmlFor={`${id}-${i}-end`}>
              {label} closes at
            </label>
            <input
              id={`${id}-${i}-end`}
              type="time"
              value={day.allDay ? "" : day.endTime}
              disabled={day.allDay}
              onChange={(e) => update(i, { endTime: e.target.value })}
              className={TIME_INPUT}
            />
            <label className="ml-1 inline-flex min-h-6 cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={day.allDay}
                onChange={(e) =>
                  update(i, e.target.checked ? { allDay: true } : { allDay: false, startTime: day.startTime || "10:00", endTime: day.endTime || "16:00" })
                }
                className="size-4 accent-basalt"
              />
              All day
            </label>
            {problem && <span className="w-full text-xs font-medium sm:ml-auto sm:w-auto">Check: {problem}</span>}
          </fieldset>
        );
      })}
    </div>
  );
}

/** A picture link held in the pane until the decision saves it. */
export function PictureInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs text-ash">
        Link to a picture (https:// or an uploaded file)
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        placeholder="https://example.com/picture.jpg"
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full max-w-md rounded-md border border-seam-strong bg-sheet px-3 text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base"
      />
    </div>
  );
}
