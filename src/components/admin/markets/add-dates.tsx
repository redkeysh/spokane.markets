"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/admin/format";
import { AdminButton } from "@/components/admin/kit/button";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { TimeOptions } from "@/components/admin/kit/time-select";
import { Segmented } from "@/components/admin/kit/segmented";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import {
  DatePatternError,
  datesForPattern,
  listDates,
  MAX_NEW_DATES,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekdayOfMonth,
  type DateHours,
  type DatePattern,
} from "@/lib/markets/dates";
import { addMarketDates } from "@/app/admin/_actions/markets";
import { CheckLine, SelectInput, TextInput } from "./controls";
import { DateCalendar } from "./date-calendar";
import { NewDatesStatus } from "./new-dates-status";
import { useMarketAction } from "./use-market-action";

export type CopySource = { id: string; label: string; date: string; hours: DateHours };

type Kind = DatePattern["kind"];

const NTH_OPTIONS = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" },
];

function weekdayOf(date: string): number {
  return weekdayOfMonth(date).weekday;
}

/**
 * Add dates: copy a date the market already has, pick weekly days, a monthly weekday ("second
 * Saturday") or dates on a calendar, set the hours, and see every date it makes before creating
 * them. Every date becomes its own listing at the market's home place. With `inDialog` the dialog
 * carries the heading, so the form leaves out its own.
 */
export function AddDates({
  marketId,
  sources,
  taken,
  homePlace,
  firstFree,
  today,
  now,
  onClose,
  inDialog = false,
}: {
  marketId: string;
  /** The market's listings, newest first; the first is the default to copy. */
  sources: readonly CopySource[];
  /** Dates the market already lists. */
  taken: readonly string[];
  homePlace: string;
  /** The first day after the market's last date, or today. */
  firstFree: string;
  today: string;
  now: Date;
  onClose: () => void;
  inDialog?: boolean;
}) {
  const { run, busy } = useMarketAction();
  const first = sources[0] ?? null;
  const [copyFrom, setCopyFrom] = React.useState(first?.id ?? "");
  const source = sources.find((s) => s.id === copyFrom) ?? null;
  const [kind, setKind] = React.useState<Kind>("weekly");
  const [weekdays, setWeekdays] = React.useState<number[]>(first ? [weekdayOf(first.date)] : [5]);
  const [nth, setNth] = React.useState(first ? (weekdayOfMonth(first.date).last && weekdayOfMonth(first.date).nth > 4 ? -1 : Math.min(weekdayOfMonth(first.date).nth, 4)) : 1);
  const [monthWeekday, setMonthWeekday] = React.useState(first ? weekdayOf(first.date) : 5);
  const [from, setFrom] = React.useState(firstFree);
  const [to, setTo] = React.useState(addDays(firstFree, 27));
  const [picked, setPicked] = React.useState<string[]>([]);
  const [hours, setHours] = React.useState<DateHours>(first?.hours ?? { startTime: "10:00", endTime: "14:00", allDay: false });
  const [status, setStatus] = React.useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const takenSet = React.useMemo(() => new Set(taken), [taken]);

  React.useEffect(() => {
    if (!inDialog) headingRef.current?.focus();
  }, [inDialog]);

  const chooseSource = (id: string) => {
    setCopyFrom(id);
    const next = sources.find((s) => s.id === id);
    if (next) {
      setHours(next.hours);
      setWeekdays([weekdayOf(next.date)]);
      setMonthWeekday(weekdayOf(next.date));
    }
  };

  const pattern: DatePattern =
    kind === "weekly"
      ? { kind, weekdays, from, to }
      : kind === "monthly"
        ? { kind, nth, weekday: monthWeekday, from, to }
        : { kind, dates: picked };

  let dates: string[] = [];
  let problem: string | null = null;
  try {
    dates = datesForPattern(pattern);
  } catch (err) {
    problem = err instanceof DatePatternError ? err.message : "These dates do not work.";
  }
  const fresh = dates.filter((d) => !takenSet.has(d) && d >= today);
  const left = dates.length - fresh.length;
  if (!problem && fresh.length > MAX_NEW_DATES) problem = `That makes ${fresh.length} dates. Create at most ${MAX_NEW_DATES} at a time.`;
  if (!problem && !hours.allDay && hours.startTime >= hours.endTime) problem = "The closing time is before the opening time.";
  const n = fresh.length;
  const Root = inDialog ? "div" : "section";
  const kindWord = status === "PUBLISHED" ? "published" : "draft";

  const create = async () => {
    const result = await run("create", () =>
      addMarketDates({
        marketId,
        copyFromEventId: copyFrom || null,
        pattern: { kind: "dates", dates: fresh },
        hours,
        status,
      })
    );
    if (result.ok) onClose();
  };

  return (
    <Root
      aria-labelledby={inDialog ? undefined : "add-dates-heading"}
      className={cn("space-y-4", !inDialog && "border-t-2 border-lilac bg-sheet pt-4")}
    >
      {inDialog ? (
        <AdminButton variant="quiet" size="icon-sm" aria-label="Close add dates" onClick={onClose} className="absolute top-[18px] right-5">
          <X strokeWidth={1.75} aria-hidden="true" />
        </AdminButton>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h3 ref={headingRef} id="add-dates-heading" tabIndex={-1} className="font-text text-[15px]/[20px] font-semibold text-basalt">
            Add dates
          </h3>
          <AdminButton variant="quiet" size="icon-sm" aria-label="Close add dates" onClick={onClose}>
            <X strokeWidth={1.75} aria-hidden="true" />
          </AdminButton>
        </div>
      )}
      <p className="max-w-[72ch] text-sm text-ash">
        Each date becomes its own listing at {homePlace}, linked to this market, so the site always shows the next one.
      </p>

      <Field id="add-copy-from" label="Copy from" help="Title, description, picture, links, tags and vendor settings come from this date.">
        <SelectInput value={copyFrom} onChange={(e) => chooseSource(e.target.value)} data-autofocus={inDialog || undefined} className="sm:max-w-[480px]">
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          <option value="">Nothing, use the market&apos;s own details</option>
        </SelectInput>
      </Field>

      <div className="space-y-1.5">
        <p id="add-pattern-label" className="font-text text-sm font-medium text-basalt">
          Pattern
        </p>
        <Segmented<Kind>
          label="Pattern"
          value={kind}
          onChange={setKind}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "dates", label: "Pick on a calendar" },
          ]}
        />
      </div>

      {kind === "weekly" && (
        <div role="group" aria-labelledby="add-repeat-label" className="space-y-1.5">
          <p id="add-repeat-label" className="font-text text-sm font-medium text-basalt">
            Repeat on
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((label, day) => (
              <ToggleChip
                key={label}
                pressed={weekdays.includes(day)}
                onPressedChange={(on) => setWeekdays((prev) => (on ? [...prev, day].sort() : prev.filter((d) => d !== day)))}
              >
                <span aria-hidden="true">{label}</span>
                <span className="sr-only">{WEEKDAY_NAMES[day]}</span>
              </ToggleChip>
            ))}
          </div>
        </div>
      )}

      {kind === "monthly" && (
        <div role="group" aria-label="Day of the month" className="flex flex-wrap items-center gap-2 font-text text-sm text-basalt">
          <label htmlFor="add-nth">On the</label>
          <SelectInput id="add-nth" value={nth} onChange={(e) => setNth(Number(e.target.value))} className="w-auto">
            {NTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
          <label htmlFor="add-month-weekday" className="sr-only">
            Day of the week
          </label>
          <SelectInput id="add-month-weekday" value={monthWeekday} onChange={(e) => setMonthWeekday(Number(e.target.value))} className="w-auto">
            {WEEKDAY_NAMES.map((name, day) => (
              <option key={name} value={day}>
                {name}
              </option>
            ))}
          </SelectInput>
          <span>of each month</span>
        </div>
      )}

      {kind !== "dates" ? (
        <FieldRow className="max-w-[560px]">
          <Field id="add-from" label="From">
            <TextInput type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field id="add-to" label="To">
            <TextInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </FieldRow>
      ) : (
        <DateCalendar
          label="Dates to add"
          selected={picked}
          taken={takenSet}
          today={today}
          onToggle={(date) => setPicked((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date].sort()))}
        />
      )}

      <div className="space-y-2">
        <FieldRow className="max-w-[560px]">
          <Field id="add-opens" label="Opens">
            <SelectInput
              className="tabular-nums"
              value={hours.allDay ? "" : hours.startTime}
              disabled={hours.allDay}
              onChange={(e) => setHours({ ...hours, startTime: e.target.value })}
            >
              <TimeOptions value={hours.allDay ? "" : hours.startTime} />
            </SelectInput>
          </Field>
          <Field id="add-closes" label="Closes">
            <SelectInput
              className="tabular-nums"
              value={hours.allDay ? "" : hours.endTime}
              disabled={hours.allDay}
              onChange={(e) => setHours({ ...hours, endTime: e.target.value })}
            >
              <TimeOptions value={hours.allDay ? "" : hours.endTime} />
            </SelectInput>
          </Field>
        </FieldRow>
        <CheckLine checked={hours.allDay} onChange={(allDay) => setHours({ ...hours, allDay })}>
          All day
        </CheckLine>
        {source && <p className="text-xs text-ash">Hours come from {source.label}; change them here for every new date.</p>}
      </div>

      <div className="space-y-3 border-t border-seam pt-3">
        <p role="status" className="max-w-[72ch] text-sm text-basalt tabular-nums">
          {problem ? (
            <span className="text-ponderosa">{problem}</span>
          ) : n === 0 ? (
            kind === "dates" ? "Pick the dates on the calendar." : "These settings make no new dates."
          ) : (
            <>
              Makes {n} {kindWord} {n === 1 ? "date" : "dates"}: {listDates(fresh, now)}.
            </>
          )}
          {!problem && left > 0 && (
            <span className="text-ash">
              {" "}
              {left} {left === 1 ? "is" : "are"} already listed or gone by and {left === 1 ? "is" : "are"} left out.
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <NewDatesStatus value={status} onChange={setStatus} />
          <div className="ml-auto flex flex-wrap gap-2">
            <AdminButton variant="quiet" onClick={onClose}>
              Cancel
            </AdminButton>
            <AdminButton
              variant={status === "PUBLISHED" ? "publish" : "ink"}
              disabled={!!problem || n === 0}
              busy={busy === "create"}
              busyLabel="Creating"
              onClick={create}
            >
              {status === "PUBLISHED" ? `Create and publish ${n}` : `Create ${n} ${n === 1 ? "date" : "dates"}`}
            </AdminButton>
          </div>
        </div>
      </div>
    </Root>
  );
}
