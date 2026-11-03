"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { cn } from "@/lib/utils";
import { weekHref } from "@/lib/admin/nav";
import type { RailStall, RailWeek } from "@/lib/admin/weekends";
import { StallGlyph } from "@/components/admin/kit/stall";
import { LayerPortal } from "@/components/admin/kit/layer";
import { useRail } from "./rail-context";
import {
  columnLabel,
  railCaption,
  stallTooltip,
  stallsPerRow,
  todayLineLeft,
  visibleStalls,
  type CaptionTone,
} from "./rail-labels";
import { useElementWidth, useMediaQuery } from "./use-media";

export const CAPTION_TONE: Record<CaptionTone, string> = {
  ash: "text-ash",
  honey: "text-honey-ink",
  cedar: "text-cedar",
};

/** At 1280 and up: 12 x 14 stalls in at most 2 rows. Below: dense stalls in at most 3 rows. */
function useStallMetrics(width: number | null) {
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const size = wide ? 12 : 10;
  const rows = wide ? 2 : 3;
  const perRow = width === null ? (wide ? 11 : 9) : stallsPerRow(width, size);
  return { size, rows, perRow, capacity: perRow * rows };
}

function StallTooltip({ stall, anchor }: { stall: RailStall; anchor: Element }) {
  const [floating, setFloating] = React.useState<HTMLDivElement | null>(null);
  const { floatingStyles } = useFloating({
    placement: "bottom",
    strategy: "fixed",
    elements: { reference: anchor, floating },
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  return (
    <LayerPortal>
      <div
        ref={setFloating}
        aria-hidden="true"
        style={floatingStyles}
        className="sm-float pointer-events-none z-40 max-w-72 rounded-lg px-2 py-1 font-text text-xs font-medium text-basalt"
      >
        {stallTooltip(stall)}
      </div>
    </LayerPortal>
  );
}

function RailColumn({
  week,
  href,
  today,
  todayWeekday,
  selected,
  metrics,
  blockRef,
  blockWidth,
  onHoverStall,
}: {
  week: RailWeek;
  href: string;
  today: string | null;
  todayWeekday: number;
  selected: boolean;
  metrics: ReturnType<typeof useStallMetrics>;
  blockRef?: React.Ref<HTMLDivElement>;
  blockWidth: number | null;
  onHoverStall: (stall: RailStall | null, anchor: Element | null) => void;
}) {
  const { reach, filling } = useRail();
  const caption = railCaption(week);
  const { shown, more } = visibleStalls(week.stalls.length, metrics.capacity);

  return (
    <li className="min-w-0">
      <Link
        href={href}
        aria-label={columnLabel(week, today ?? undefined)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "block h-full rounded-md px-1 transition-colors duration-[80ms] hover:bg-hover",
          selected && "outline-2 outline-lilac forced-colors:outline-[Highlight]"
        )}
      >
        <span className="block font-display text-lg/[22px] font-extrabold text-basalt tabular-nums">{week.label}</span>
        <span className="block h-4 truncate text-xs text-ash" title={week.name ?? undefined}>
          {week.name}
        </span>
        <div
          ref={blockRef}
          className="relative mt-1.5 flex h-[42px] flex-wrap content-start gap-[3px] overflow-clip [overflow-clip-margin:4px] xl:h-8"
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const target = (e.target as Element).closest("[data-stall]");
            const stall = target ? week.stalls[Number(target.getAttribute("data-stall"))] : undefined;
            onHoverStall(stall ?? null, stall ? target : null);
          }}
          onPointerLeave={() => onHoverStall(null, null)}
        >
          {week.stalls.slice(0, shown).map((stall, i) => (
            <span key={stall.id} data-stall={i} className="flex">
              <StallGlyph
                status={stall.status}
                size="rail"
                reach={reach.has(stall.id)}
                filling={filling.has(stall.id)}
              />
            </span>
          ))}
          {more > 0 && (
            <span className="flex h-3.5 items-center text-xs/none text-ash tabular-nums" aria-hidden="true">
              +{more}
            </span>
          )}
          {today && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 w-0 border-l-2 border-lilac"
              style={{
                left:
                  blockWidth === null
                    ? `${(todayWeekday / 7) * 100}%`
                    : todayLineLeft(todayWeekday, blockWidth, metrics.size),
              }}
            />
          )}
        </div>
        <span className={cn("mt-1.5 block text-xs tabular-nums", CAPTION_TONE[caption.tone])}>{caption.text}</span>
      </Link>
    </li>
  );
}

/**
 * The full rail, on To do only: the next seven Saturdays and Later, one stall per event. Each
 * column is one link; stalls are hidden from assistive tech and show a tooltip to the mouse.
 */
export function Rail({ className }: { className?: string }) {
  const pathname = usePathname();
  const { rail, selectedWeek } = useRail();
  const blockRef = React.useRef<HTMLDivElement>(null);
  const blockWidth = useElementWidth(blockRef);
  const metrics = useStallMetrics(blockWidth);
  const [hovered, setHovered] = React.useState<{ stall: RailStall; anchor: Element } | null>(null);

  return (
    <nav aria-label="Coming weekends" className={cn("border-b border-seam bg-fog px-4 py-2 md:px-6", className)}>
      <ol className="grid grid-cols-8">
        {rail.weeks.map((week, i) => (
          <RailColumn
            key={week.key}
            week={week}
            href={weekHref(pathname, week.key)}
            today={i === 0 ? rail.today : null}
            todayWeekday={rail.todayWeekday}
            selected={selectedWeek === week.key}
            metrics={metrics}
            blockRef={i === 0 ? blockRef : undefined}
            blockWidth={blockWidth}
            onHoverStall={(stall, anchor) =>
              setHovered((prev) => {
                if (!stall || !anchor) return null;
                return prev?.stall === stall ? prev : { stall, anchor };
              })
            }
          />
        ))}
      </ol>
      {hovered && <StallTooltip stall={hovered.stall} anchor={hovered.anchor} />}
    </nav>
  );
}
