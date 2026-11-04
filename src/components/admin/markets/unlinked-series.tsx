"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatTimeRange } from "@/lib/admin/format";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Field } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import type { RepeatView } from "@/lib/markets/board";
import { makeMarketAndRepeat, makeMarketFromDates } from "@/app/admin/_actions/markets";
import { SelectInput, TextInput } from "./controls";
import { LANE_GRID, focusRowSoon } from "./markets-board";
import { NewDatesStatus } from "./new-dates-status";
import { SeasonLane, type LaneScale } from "./season-lane";
import { useMarketAction } from "./use-market-action";

export type PlaceOption = { id: string; name: string; city: string };

/** Ended groups shown before "N more ran last season". */
const ENDED_SHOWN = 2;

function planHours(group: RepeatView): string {
  const hours = new Set(group.plan.map((p) => (p.allDay ? "all day" : formatTimeRange(p.startTime, p.endTime))));
  return hours.size === 1 ? `, ${[...hours][0]}` : "";
}

/**
 * "Make a market" and "Repeat for 2027": the market's name, home place and typical schedule come
 * prefilled from the dates and can be changed before the market is made and every date linked.
 */
function MakeMarketDialog({
  group,
  places,
  open,
  onOpenChange,
}: {
  group: RepeatView;
  places: readonly PlaceOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { run, busy } = useMarketAction();
  const [name, setName] = React.useState(group.draft.name);
  const [venueId, setVenueId] = React.useState(group.draft.venueId);
  const [schedule, setSchedule] = React.useState(group.draft.typicalSchedule ?? "");
  const [status, setStatus] = React.useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const repeat = group.ended && group.plan.length > 0;
  const n = group.plan.length;
  const known = places.some((p) => p.id === venueId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = { eventIds: group.eventIds, name, venueId, typicalSchedule: schedule || null };
    const result = await run("make", () => (repeat ? makeMarketAndRepeat({ ...input, status }) : makeMarketFromDates(input)));
    if (result.ok && result.marketId) {
      onOpenChange(false);
      router.push(`/admin/markets/${result.marketId}`);
    }
  };

  const formId = `make-${group.key}`;
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={repeat ? `Repeat ${group.name} for ${group.planYear}?` : `Make a market for ${group.name}?`}
      description={
        repeat
          ? `Makes the market, links last season's listing to it, and adds ${n} dates: ${group.planSummary}${planHours(group)}.`
          : `Makes the market and links all ${group.eventIds.length} of its dates to it.`
      }
      footer={
        <>
          <AdminButton variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            form={formId}
            variant={repeat && status === "PUBLISHED" ? "publish" : "ink"}
            busy={busy === "make"}
            busyLabel="Making"
            disabled={!name.trim() || !venueId}
          >
            {repeat ? `Make it and add ${n} ${n === 1 ? "date" : "dates"}` : "Make the market"}
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4 pb-2">
        <Field id={`${formId}-name`} label="Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </Field>
        <Field id={`${formId}-place`} label="Home place" help="New dates are listed here.">
          <SelectInput value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {!known && <option value={venueId}>{group.venueName}</option>}
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.city}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id={`${formId}-schedule`} label="Typical schedule" help='What the public page says, e.g. "Saturdays, 10:00 am to 1:00 pm".'>
          <TextInput value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        </Field>
        {repeat && <NewDatesStatus value={status} onChange={setStatus} />}
      </form>
    </AdminDialog>
  );
}

function RepeatRow({ group, scale, places }: { group: RepeatView; scale: LaneScale; places: readonly PlaceOption[] }) {
  const [open, setOpen] = React.useState(false);
  const repeat = group.ended && group.plan.length > 0;
  return (
    <li className={cn("sm-row border-b border-seam bg-sheet px-4 py-2.5 hover:bg-hover", LANE_GRID, "md:gap-y-1")}>
      <div className="min-w-0 md:col-start-1 md:row-span-2">
        <Link href={group.eventsHref} data-roving-item data-row-key={group.key} className="sm-row-link block text-sm font-medium text-basalt">
          {group.name}
        </Link>
        <p className="mt-0.5 text-xs text-ash">{group.description}</p>
      </div>
      <SeasonLane lane={group.lane} scale={scale} className="hidden md:col-start-2 md:row-start-1 md:block" />
      <div data-row-action className="mt-2 flex md:col-start-3 md:row-start-1 md:mt-0 md:justify-end">
        <AdminButton size="sm" variant="outline" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {repeat ? `Repeat for ${group.planYear}` : "Make a market"}
        </AdminButton>
      </div>
      {open && <MakeMarketDialog group={group} places={places} open={open} onOpenChange={setOpen} />}
    </li>
  );
}

/**
 * "Dates that repeat but have no market": listings with one title at one place on several dates,
 * or one listing that ran all last season. Each can become a market in one step.
 */
export function UnlinkedSeries({ groups, scale, places }: { groups: RepeatView[]; scale: LaneScale; places: readonly PlaceOption[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const ahead = groups.filter((g) => !g.ended);
  const ended = groups.filter((g) => g.ended);
  const shown = [...ahead, ...(showAll ? ended : ended.slice(0, ENDED_SHOWN))];
  const hidden = ended.length - (showAll ? ended.length : Math.min(ended.length, ENDED_SHOWN));
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="repeats-heading" className="mt-10">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <h2 id="repeats-heading" className="font-text text-[15px]/[20px] font-semibold text-basalt">
          Dates that repeat but have no market
        </h2>
        <span className="text-xs text-ash tabular-nums">
          {groups.length} {groups.length === 1 ? "group" : "groups"}
        </span>
      </div>
      <List label="Dates that repeat but have no market">
        {shown.map((group) => (
          <RepeatRow key={group.key} group={group} scale={scale} places={places} />
        ))}
      </List>
      {hidden > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-seam px-4 py-2.5">
          <p className="text-sm text-ash">
            {hidden} more ran last season as one listing each: {ended.slice(ENDED_SHOWN, ENDED_SHOWN + 3).map((g) => g.name).join(", ")}
            {hidden > 3 ? ", and others" : ""}.
          </p>
          <AdminButton
            size="sm"
            variant="quiet"
            onClick={() => {
              setShowAll(true);
              focusRowSoon(ended[ENDED_SHOWN].key);
            }}
          >
            Show
          </AdminButton>
        </div>
      )}
    </section>
  );
}
