"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { addDays, formatDay } from "@/lib/admin/format";
import type { Area } from "@/lib/admin/regions";
import { useRail } from "@/components/admin/shell/rail-context";
import { recordHistory } from "@/app/admin/_actions/todo";
import { isWeekLane, weekKeyOf, type PileItem } from "./pile-model";
import { useTodo } from "./todo-context";
import type { TodoEvent, TodoHistoryLine, TodoLane } from "./types";

function Section({ title, children, folded }: { title: string; children: React.ReactNode; folded: boolean }) {
  return (
    <section className={folded ? "mt-6" : "mb-7"} aria-label={title}>
      <h3 className="mb-2 font-text text-[15px]/5 font-semibold text-basalt">{title}</h3>
      {children}
    </section>
  );
}

/** Other events at the same place in the same Monday to Sunday week. */
function sameWeekAtPlace(event: TodoEvent, lane: TodoLane, events: Record<string, TodoEvent>, exclude: Set<string>): TodoEvent[] {
  if (!lane.saturday) return [];
  const from = addDays(lane.saturday, -5);
  const to = addDays(lane.saturday, 1);
  return Object.values(events).filter(
    (e) => !exclude.has(e.id) && e.venue.id === event.venue.id && e.dates.some((d) => d >= from && d <= to)
  );
}

/** The record's latest history, read once the cursor rests on it. */
function RecordHistory({ targetType, targetId }: { targetType: "EVENT" | "SUBMISSION"; targetId: string }) {
  const [lines, setLines] = React.useState<TodoHistoryLine[] | null>(null);
  React.useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      recordHistory({ targetType, targetId })
        .then((result) => current && setLines(result))
        .catch(() => current && setLines([]));
    }, 400);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [targetType, targetId]);
  if (lines === null) return <p className="text-sm text-ash">Reading its history</p>;
  if (lines.length === 0) return <p className="text-sm text-ash">Nothing has changed here yet.</p>;
  return (
    <ul role="list" className="space-y-1.5">
      {lines.map((line) => (
        <li key={line.id} className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 text-sm">
          <span className="pt-0.5 text-xs text-ash tabular-nums" title={line.timestamp}>
            {line.time}
          </span>
          <span className="text-basalt">{line.sentence}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Beside the decision: what that weekend already shows visitors, live coverage by area (each area
 * narrows the lane), where its listings came from, what else happens at the same place, and the
 * record's history. Below 1280 px it folds under the decision's actions.
 */
export function ContextPane({
  item,
  area,
  onArea,
  folded = false,
}: {
  item: PileItem;
  area: Area | null;
  onArea: (area: Area | null) => void;
  folded?: boolean;
}) {
  const api = useTodo();
  const { rail } = useRail();
  const lane = api.lanes.find((l) => l.lane === item.lane);
  if (!lane) return null;
  const week = rail.weeks.find((w) => w.key === weekKeyOf(lane.lane));
  const live = week?.live ?? lane.live;
  const total = week ? week.live + week.pending + week.draft : lane.live + lane.waiting;
  const decision = item.type === "decision" ? item.decision : null;
  const rowEvents = decision ? decision.rows.filter((r) => r.type === "event").map((r) => api.events[r.id]).filter(Boolean) : [];
  const record =
    decision && decision.rows.length === 1
      ? decision.rows[0].type === "event"
        ? { targetType: "EVENT" as const, targetId: decision.rows[0].id }
        : decision.rows[0].type === "submission"
          ? { targetType: "SUBMISSION" as const, targetId: decision.rows[0].id }
          : null
      : null;
  const exclude = new Set(rowEvents.map((e) => e.id));
  const also = rowEvents.length === 1 && isWeekLane(lane.lane) ? sameWeekAtPlace(rowEvents[0], lane, api.events, exclude) : [];
  const weekend = isWeekLane(lane.lane) || lane.lane === "later";
  const laneNote: Partial<Record<string, string>> = {
    gone: "These ended before today. Nothing about them is on the site.",
    public: "People sent these from the site and are waiting on a reply.",
    places: "Places have no deadline. Fixing them keeps the map and the area filters right.",
  };

  return (
    <div className={cn(folded ? "mt-8 border-t border-seam pt-2" : "")}>
      {laneNote[lane.lane] && (
        <Section title={lane.label} folded={folded}>
          <p className="text-sm text-ash">{laneNote[lane.lane]}</p>
        </Section>
      )}
      {weekend && (
        <Section title={lane.lane === "later" ? "Later on the site" : "That weekend on the site"} folded={folded}>
          <p className="text-sm text-basalt tabular-nums">
            {total === 0 ? "Nothing listed" : `${live} of ${total} live`}
          </p>
          {lane.liveEventIds.length > 0 && (
            <ul role="list" className="mt-2 space-y-1.5">
              {lane.liveEventIds.slice(0, 8).map((id) => {
                const e = api.events[id];
                if (!e) return null;
                return (
                  <li key={id} className="text-sm">
                    <span className="text-basalt">{e.title}</span>
                    <span className="block text-xs text-ash">
                      {formatDay(e.firstDate, api.now)}, {e.venue.name}
                    </span>
                  </li>
                );
              })}
              {lane.liveEventIds.length > 8 && (
                <li className="text-xs text-ash tabular-nums">and {lane.liveEventIds.length - 8} more</li>
              )}
            </ul>
          )}
        </Section>
      )}

      {isWeekLane(lane.lane) && lane.areas.some((a) => a.total > 0) && (
        <Section title="By area" folded={folded}>
          <ul role="list" className="-mx-2">
            {lane.areas
              .filter((a) => a.total > 0)
              .map((a) => {
                const on = area === a.area;
                return (
                  <li key={a.area}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onArea(on ? null : a.area)}
                      className={cn(
                        "flex min-h-8 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-hover",
                        on && "bg-lilac-tint hover:bg-lilac-tint"
                      )}
                    >
                      <span className={cn("text-basalt", on && "font-medium")}>{a.area}</span>
                      <span className={cn("text-xs tabular-nums", a.live === 0 ? "text-honey-ink" : "text-ash")}>
                        {a.live} of {a.total}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <p className="mt-1 text-xs text-ash">{area ? "Showing one area. Press it again to show every area." : "Press an area to narrow the lane."}</p>
        </Section>
      )}

      {isWeekLane(lane.lane) && lane.origins.length > 0 && (
        <Section title="Where they come from" folded={folded}>
          <ul role="list" className="space-y-1 text-sm">
            {lane.origins.map((o) => (
              <li key={o.source} className="flex justify-between gap-3">
                <span className="text-basalt">{o.source}</span>
                <span className="shrink-0 text-xs text-ash tabular-nums">
                  {o.total} here{o.live ? `, ${o.live} live` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {also.length > 0 && (
        <Section title={`Also at ${rowEvents[0].venue.name} that week`} folded={folded}>
          <ul role="list" className="space-y-1.5">
            {also.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-basalt">{e.title}</span>
                <span className="block text-xs text-ash">
                  {formatDay(e.firstDate, api.now)}, {e.status === "PUBLISHED" ? "live" : "waiting"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {record && (
        <Section title="History" folded={folded}>
          <RecordHistory key={`${record.targetType}:${record.targetId}`} {...record} />
        </Section>
      )}
    </div>
  );
}
