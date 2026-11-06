"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { TimeOptions } from "@/components/admin/kit/time-select";
import { addDays, formatDay, formatWeekday } from "@/lib/admin/format";
import { generateRecurringSchedule, MAX_RECURRING_DAYS } from "@/lib/recurring-schedule";
import { cn } from "@/lib/utils";
import { EditorCheckbox, EditorInput, EditorSelect, LinkButton } from "./controls";
import { dayProblems, makeDay, repeatedDates, type EditorDay } from "./model";

function TimeSelect({
  id,
  value,
  onChange,
  label,
  disabled,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** The accessible name when no visible label points at `id`. */
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <EditorSelect id={id} aria-label={label} value={value} disabled={disabled} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className="tabular-nums">
      <TimeOptions value={value} />
    </EditorSelect>
  );
}

const ROW_GRID = "grid grid-cols-2 gap-x-3 gap-y-2 @min-[540px]/days:grid-cols-[176px_120px_120px_56px_32px] @min-[540px]/days:items-center";

function DayRow({
  day,
  index,
  onChange,
  onRemove,
  canRemove,
  readOnly,
  repeated,
}: {
  day: EditorDay;
  index: number;
  onChange: (patch: Partial<EditorDay>) => void;
  onRemove: () => void;
  canRemove: boolean;
  readOnly: boolean;
  repeated: boolean;
}) {
  const named = day.date ? formatDay(day.date) : `day ${index + 1}`;
  const problems = dayProblems(day);
  const errorId = `ed-day-${day.key}-problems`;
  return (
    <li>
      <div className={ROW_GRID}>
        <div className="col-span-2 flex min-w-0 items-center gap-2 @min-[540px]/days:col-span-1">
          <span aria-hidden="true" className="w-8 shrink-0 text-sm font-medium text-ash tabular-nums">
            {day.date ? formatWeekday(day.date) : ""}
          </span>
          <EditorInput
            type="date"
            aria-label={`Date of day ${index + 1}`}
            value={day.date}
            readOnly={readOnly}
            aria-describedby={problems.length ? errorId : undefined}
            aria-invalid={!day.date || undefined}
            onChange={(e) => onChange({ date: e.target.value })}
            className="tabular-nums"
          />
        </div>
        <TimeSelect
          label={`Opens on ${named}`}
          value={day.allDay ? "" : day.startTime}
          disabled={day.allDay || readOnly}
          invalid={problems.some((p) => p.kind === "error" && p.message !== "Choose a date.")}
          onChange={(startTime) => onChange({ startTime })}
        />
        <TimeSelect
          label={`Closes on ${named}`}
          value={day.allDay ? "" : day.endTime}
          disabled={day.allDay || readOnly}
          invalid={problems.some((p) => p.kind === "error" && p.message !== "Choose a date.")}
          onChange={(endTime) => onChange({ endTime })}
        />
        <div className="col-span-2 flex items-center justify-between gap-2 @min-[540px]/days:contents">
          <EditorCheckbox
            checked={day.allDay}
            disabled={readOnly}
            aria-label={`All day on ${named}`}
            onChange={(allDay) => onChange(allDay ? { allDay } : { allDay, startTime: day.startTime || "10:00", endTime: day.endTime || "16:00" })}
          >
            <span className="@min-[540px]/days:sr-only">All day</span>
          </EditorCheckbox>
          {canRemove && !readOnly ? (
            <Tooltip content="Remove this day">
              <AdminButton variant="quiet" size="icon" aria-label={`Remove ${named}`} onClick={onRemove}>
                <X strokeWidth={1.75} aria-hidden="true" />
              </AdminButton>
            </Tooltip>
          ) : (
            <span />
          )}
        </div>
      </div>
      {(problems.length > 0 || repeated) && (
        <ul id={errorId} className="mt-1 space-y-0.5">
          {problems.map((p) => (
            <li key={p.message} className={cn("text-xs", p.kind === "error" ? "text-ponderosa" : "text-ash")}>
              {p.message}
            </li>
          ))}
          {repeated && <li className="text-xs text-ash">Another row has this date too; they are saved as one day.</li>}
        </ul>
      )}
    </li>
  );
}

const PATTERN_DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function RepeatPattern({
  days,
  onApply,
  onClose,
  today,
}: {
  days: EditorDay[];
  onApply: (days: EditorDay[]) => void;
  onClose: () => void;
  today: string;
}) {
  const first = days.find((d) => d.date)?.date ?? today;
  const template = days[0];
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [from, setFrom] = React.useState(first);
  const [to, setTo] = React.useState(addDays(first, 84));
  const [allDay, setAllDay] = React.useState(template?.allDay ?? false);
  const [startTime, setStartTime] = React.useState(template?.startTime || "10:00");
  const [endTime, setEndTime] = React.useState(template?.endTime || "16:00");
  const [pending, setPending] = React.useState<EditorDay[] | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const filled = days.filter((d) => d.date).length;

  const make = () => {
    setWarning(null);
    const generated = generateRecurringSchedule(weekdays, from, to, allDay, allDay ? undefined : startTime, allDay ? undefined : endTime).map((d) =>
      makeDay(d.date, d.startTime ?? "", d.endTime ?? "", d.allDay)
    );
    if (generated.length === 0) {
      setWarning("No dates match. Pick at least one weekday and a range that holds it.");
      return;
    }
    if (generated.length >= MAX_RECURRING_DAYS) setWarning(`Stopped at ${MAX_RECURRING_DAYS} dates. Narrow the range for fewer.`);
    if (filled > 0) setPending(generated);
    else onApply(generated);
  };

  return (
    <div className="space-y-3 border-l-2 border-seam pl-4" role="group" aria-label="Repeat on a pattern">
      <div>
        <p className="text-sm font-medium text-basalt">Every</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PATTERN_DAYS.map((d) => (
            <ToggleChip
              key={d.value}
              pressed={weekdays.includes(d.value)}
              onPressedChange={(on) => setWeekdays((prev) => (on ? [...prev, d.value] : prev.filter((v) => v !== d.value)))}
            >
              {d.label}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[176px_176px]">
        <div>
          <label htmlFor="ed-pattern-from" className="block text-sm font-medium text-basalt">
            From
          </label>
          <EditorInput id="ed-pattern-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1.5 tabular-nums" />
        </div>
        <div>
          <label htmlFor="ed-pattern-to" className="block text-sm font-medium text-basalt">
            To
          </label>
          <EditorInput id="ed-pattern-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 tabular-nums" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <label htmlFor="ed-pattern-opens" className="block text-sm font-medium text-basalt">
            Opens
          </label>
          <div className="mt-1.5">
            <TimeSelect id="ed-pattern-opens" value={allDay ? "" : startTime} disabled={allDay} onChange={setStartTime} />
          </div>
        </div>
        <div className="w-28">
          <label htmlFor="ed-pattern-closes" className="block text-sm font-medium text-basalt">
            Closes
          </label>
          <div className="mt-1.5">
            <TimeSelect id="ed-pattern-closes" value={allDay ? "" : endTime} disabled={allDay} onChange={setEndTime} />
          </div>
        </div>
        <EditorCheckbox checked={allDay} onChange={setAllDay} className="h-9">
          All day
        </EditorCheckbox>
      </div>
      {warning && <p className="text-xs text-ponderosa">{warning}</p>}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="mr-2 text-sm text-basalt tabular-nums">
            This replaces the {filled} {filled === 1 ? "day" : "days"} above with {pending.length} {pending.length === 1 ? "date" : "dates"}.
          </p>
          <AdminButton variant="outline" size="sm" onClick={() => setPending(null)}>
            Keep mine
          </AdminButton>
          <AdminButton
            variant="outline"
            size="sm"
            onClick={() => {
              onApply(pending);
              setPending(null);
            }}
          >
            Replace
          </AdminButton>
        </div>
      ) : (
        <div className="flex gap-2">
          <AdminButton variant="outline" size="sm" onClick={make}>
            Make the dates
          </AdminButton>
          <AdminButton variant="quiet" size="sm" onClick={onClose}>
            Close
          </AdminButton>
        </div>
      )}
    </div>
  );
}

/** Schedule rows (date, opens, closes, all day, remove), "Add a day" and "Repeat on a pattern". */
export function ScheduleEditor({
  days,
  onChange,
  readOnly,
  today,
}: {
  days: EditorDay[];
  onChange: (days: EditorDay[]) => void;
  readOnly: boolean;
  today: string;
}) {
  const [patternOpen, setPatternOpen] = React.useState(false);
  const repeated = repeatedDates(days);
  const addDay = () => {
    const last = [...days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const date = last ? addDays(last.date, 1) : today;
    onChange([...days, makeDay(date, last?.startTime || "10:00", last?.endTime || "16:00", last?.allDay ?? false)]);
  };
  return (
    <div className="@container/days space-y-3">
      <div aria-hidden="true" className={cn(ROW_GRID, "hidden text-xs font-medium text-ash @min-[540px]/days:grid")}>
        <span className="pl-10">Date</span>
        <span>Opens</span>
        <span>Closes</span>
        <span>All day</span>
        <span />
      </div>
      <ul className="space-y-3">
        {days.map((day, i) => (
          <DayRow
            key={day.key}
            day={day}
            index={i}
            readOnly={readOnly}
            canRemove={days.length > 1}
            repeated={!!day.date && repeated.has(day.date)}
            onChange={(patch) => onChange(days.map((d) => (d.key === day.key ? { ...d, ...patch } : d)))}
            onRemove={() => onChange(days.filter((d) => d.key !== day.key))}
          />
        ))}
      </ul>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <LinkButton onClick={addDay}>
            <Plus className="mr-1 size-4" strokeWidth={1.75} aria-hidden="true" />
            Add a day
          </LinkButton>
          {!patternOpen && <LinkButton onClick={() => setPatternOpen(true)}>Repeat on a pattern</LinkButton>}
        </div>
      )}
      {patternOpen && !readOnly && (
        <RepeatPattern
          days={days}
          today={today}
          onApply={(next) => {
            onChange(next);
            setPatternOpen(false);
          }}
          onClose={() => setPatternOpen(false)}
        />
      )}
    </div>
  );
}
