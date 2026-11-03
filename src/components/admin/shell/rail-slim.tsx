"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { weekHref } from "@/lib/admin/nav";
import { StallGlyph } from "@/components/admin/kit/stall";
import { useRail } from "./rail-context";
import { columnLabel, slimCaption, summaryStatus } from "./rail-labels";
import { CAPTION_TONE } from "./rail";

/**
 * The slim rail on every screen but To do: per week one summary stall, the date and "1 of 22".
 * The week holding the current record or filter carries the lilac outline.
 */
export function RailSlim({ className }: { className?: string }) {
  const pathname = usePathname();
  const { rail, selectedWeek } = useRail();

  return (
    <nav aria-label="Coming weekends" className={cn("border-b border-seam bg-fog px-4 md:px-6", className)}>
      <ol className="grid h-9 grid-cols-8">
        {rail.weeks.map((week, i) => {
          const caption = slimCaption(week);
          const selected = selectedWeek === week.key;
          return (
            <li key={week.key} className="min-w-0">
              <Link
                href={weekHref(pathname, week.key)}
                aria-label={columnLabel(week, i === 0 ? rail.today : undefined)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex h-full min-w-0 items-center gap-1.5 rounded-md border-2 px-1.5 transition-colors duration-[80ms] hover:bg-hover focus-visible:outline-offset-[-2px]",
                  selected ? "border-lilac forced-colors:border-[Highlight]" : "border-transparent forced-colors:border-[Canvas]"
                )}
              >
                <StallGlyph status={summaryStatus(week)} size="md" />
                <span className="flex min-w-0 flex-col xl:flex-row xl:items-baseline xl:gap-1.5">
                  <span className="truncate font-display text-[13px]/4 font-bold text-basalt tabular-nums">
                    {week.label}
                  </span>
                  <span className={cn("truncate text-xs/4 tabular-nums", CAPTION_TONE[caption.tone])}>
                    {caption.text}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
