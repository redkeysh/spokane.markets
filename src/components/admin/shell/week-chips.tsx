"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { weekHref } from "@/lib/admin/nav";
import { StallGlyph } from "@/components/admin/kit/stall";
import { useRail } from "./rail-context";
import { chipDate, columnLabel, railCaption, visibleStalls } from "./rail-labels";
import { CAPTION_TONE } from "./rail";

/** Nine 8 px stalls fill a chip's row; with more, seven stay and the count takes the last slots. */
const CHIP_SLOTS = 9;

/**
 * Below 1024 px, To do and Events swap the rail for a strip of week chips under the top bar.
 * Tapping a chip filters the pile or list to that week.
 */
export function WeekChips({ className }: { className?: string }) {
  const pathname = usePathname();
  const { rail, selectedWeek } = useRail();
  const selectedRef = React.useRef<HTMLAnchorElement>(null);

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedWeek]);

  return (
    <nav aria-label="Coming weekends" className={cn("border-b border-seam bg-fog", className)}>
      <ol className="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        {rail.weeks.map((week, i) => {
          const caption = railCaption(week);
          const { shown, more } = visibleStalls(week.stalls.length, CHIP_SLOTS);
          const selected = selectedWeek === week.key;
          return (
            <li key={week.key} className="shrink-0 snap-start">
              <Link
                ref={selected ? selectedRef : undefined}
                href={weekHref(pathname, week.key)}
                aria-label={columnLabel(week, i === 0 ? rail.today : undefined, chipDate(week))}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex h-16 w-[104px] flex-col justify-between rounded-md border-2 bg-sheet px-1.5 py-1",
                  selected ? "border-lilac forced-colors:border-[Highlight]" : "border-seam"
                )}
              >
                <span className="font-display text-[13px]/4 font-bold text-basalt tabular-nums">{chipDate(week)}</span>
                <span className="flex h-2.5 items-center gap-px" aria-hidden="true">
                  {week.stalls.slice(0, shown).map((stall) => (
                    <StallGlyph key={stall.id} status={stall.status} size="xs" />
                  ))}
                  {more > 0 && <span className="ml-0.5 text-xs/none text-ash tabular-nums">+{more}</span>}
                </span>
                <span className={cn("text-xs tabular-nums", CAPTION_TONE[caption.tone])}>{caption.text}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
