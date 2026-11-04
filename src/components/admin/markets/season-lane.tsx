"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useElementWidth, useMediaQuery } from "@/components/admin/shell/use-media";
import { daysBetween } from "@/lib/admin/format";
import { StallGlyph } from "@/components/admin/kit/stall";
import { Tooltip } from "@/components/admin/kit/tooltip";
import type { Lane, LaneStall, LaneStatus } from "@/lib/markets/board";

export type LaneScale = {
  months: { label: string; date: string; x: number }[];
  todayX: number;
};

function pct(x: number): string {
  return `${(Math.min(Math.max(x, 0), 1) * 100).toFixed(3)}%`;
}

/** Dates no more than this many days apart sit side by side in one run (a Friday to Sunday weekend). */
const RUN_GAP_DAYS = 3;

function runsOf(stalls: readonly LaneStall[]): LaneStall[][] {
  const runs: LaneStall[][] = [];
  for (const stall of stalls) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (last && daysBetween(last.date, stall.date) <= RUN_GAP_DAYS) run.push(stall);
    else runs.push([stall]);
  }
  return runs;
}

/**
 * Left edges in px for each run: at its date, or just after the run before it when the two would
 * overlap, and never past the lane's end.
 */
export function packRuns(runs: readonly LaneStall[][], width: number, stallWidth: number): number[] {
  const lefts: number[] = [];
  let end = -Infinity;
  for (const run of runs) {
    const runWidth = run.length * stallWidth + (run.length - 1);
    const left = Math.min(Math.max(run[0].x * width, end + 4), Math.max(width - runWidth, 0));
    lefts.push(left);
    end = left + runWidth;
  }
  return lefts;
}

const BAR_TONE: Record<LaneStatus, string> = {
  PUBLISHED: "bg-cedar",
  PENDING: "border border-honey-ink bg-honey",
  DRAFT: "border border-dashed border-honey-ink",
  CANCELLED: "border border-ponderosa",
};

/** The month names over the lanes, with the current month in basalt. */
export function MonthScale({ scale, className }: { scale: LaneScale; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative h-4 font-text text-xs text-ash tabular-nums", className)}>
      {scale.months.map((m, i) => (
        <span key={m.date} className={cn("absolute top-0 pl-1", i === 0 && "font-medium text-basalt")} style={{ left: pct(m.x) }}>
          {m.label}
        </span>
      ))}
    </div>
  );
}

/**
 * One market's season, from this month to the same month next year: a stall per date (live cedar,
 * waiting honey), a thin bar for a listing that runs all season, last season as faint ash dots,
 * next season's planned dates as lilac hatched ticks, and the lilac today line. Decorative: the
 * row around it carries the same facts in words.
 */
export function SeasonLane({
  lane,
  scale,
  preview,
  className,
}: {
  lane: Lane;
  scale: LaneScale;
  /** Next season's dates, before they are created. */
  preview?: readonly { date: string; x: number }[];
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const runs = runsOf(lane.stalls);
  const lefts = width ? packRuns(runs, width, wide ? 12 : 10) : null;
  return (
    <div ref={ref} aria-hidden="true" className={cn("relative h-7", className)}>
      {scale.months.slice(1).map((m) => (
        <span key={m.date} className="absolute inset-y-1 w-px bg-seam" style={{ left: pct(m.x) }} />
      ))}
      {!preview?.length && lane.ghostBars.map((g) => (
        <span
          key={`${g.from}-${g.to}`}
          className="absolute top-1/2 h-0 -translate-y-1/2 border-t-2 border-dotted border-ash-quiet"
          style={{ left: pct(g.x0), width: pct(g.x1 - g.x0) }}
        />
      ))}
      {!preview?.length && lane.ghosts.map((g) => (
        <span key={g.date} className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ash-quiet" style={{ left: pct(g.x) }} />
      ))}
      {lane.bars.map((bar) => (
        <span
          key={bar.eventId}
          data-row-action
          className="absolute top-1/2 h-2 -translate-y-1/2"
          style={{ left: pct(bar.x0), width: `max(4px, ${pct(bar.x1 - bar.x0)})` }}
        >
          <Tooltip content={bar.label} placement="top">
            <span className={cn("block h-2 w-full rounded-sm forced-colors:border forced-colors:border-[CanvasText]", BAR_TONE[bar.status])} style={{ width: "100%" }} />
          </Tooltip>
        </span>
      ))}
      {preview?.map((p) => (
        <span
          key={p.date}
          className="absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-lilac bg-[repeating-linear-gradient(135deg,var(--sm-lilac)_0_1px,transparent_1px_3px)] forced-colors:border-[Highlight]"
          style={{ left: pct(p.x) }}
        />
      ))}
      {runs.map((run, i) => (
        <span
          key={run[0].date + run[0].eventId}
          data-row-action
          className="absolute top-1/2 flex -translate-y-1/2 gap-px"
          style={{ left: lefts ? `${lefts[i]}px` : pct(run[0].x) }}
        >
          {run.map((stall) => (
            <Tooltip key={stall.eventId} content={stall.label} placement="top">
              <span className="block">
                <StallGlyph status={stall.status} size="rail" />
              </span>
            </Tooltip>
          ))}
        </span>
      ))}
      <span
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-lilac forced-colors:bg-[Highlight]"
        style={{ left: pct(scale.todayX) }}
      />
      {lane.later > 0 && (
        <span className="absolute top-1/2 right-0 -translate-y-1/2 bg-inherit pl-1 text-xs text-ash tabular-nums">+{lane.later}</span>
      )}
    </div>
  );
}
