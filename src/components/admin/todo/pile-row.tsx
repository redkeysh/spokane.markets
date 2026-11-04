"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import type { PileItem } from "./pile-model";

const ROW =
  "relative flex w-full items-start gap-3 px-4 py-2 text-left no-underline transition-colors duration-[80ms] hover:bg-hover focus-visible:outline-offset-[-2px] forced-colors:aria-[current=true]:outline forced-colors:aria-[current=true]:outline-1";

/** The address a row opens without script: To do with the decision, brief or weekend in the URL. */
export function itemHref(item: PileItem): string {
  if (item.type === "decision") return `/admin?d=${encodeURIComponent(item.decision.key)}`;
  if (item.type === "brief") return `/admin?d=${encodeURIComponent(item.id)}`;
  const week = item.lane.startsWith("week:") ? item.lane.slice(5) : item.lane === "later" ? "later" : null;
  return week ? `/admin?week=${week}` : `/admin?lane=${item.lane}`;
}

/**
 * One row of the pile. Every row is a link (one tab stop for the pile, roving); the cursor row
 * has the lilac-tint ground, and the focus ring when it holds focus.
 */
export function PileRow({
  item,
  cursor,
  title,
  detail,
  fact,
  date,
  onSelect,
}: {
  item: PileItem;
  cursor: boolean;
  title: React.ReactNode;
  detail?: React.ReactNode;
  /** Right-aligned fact of a collapsed lane, e.g. "14 waiting". */
  fact?: React.ReactNode;
  /** Date leaf for decisions. */
  date?: string | null;
  onSelect: (item: PileItem) => void;
}) {
  const decisionRow = item.type === "decision";
  return (
    <a
      href={itemHref(item)}
      data-item-id={item.id}
      data-leave-ok
      tabIndex={cursor ? 0 : -1}
      aria-current={cursor ? "true" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onSelect(item);
      }}
      className={cn(ROW, decisionRow ? "min-h-[60px]" : "min-h-11 items-center", cursor && "bg-lilac-tint hover:bg-lilac-tint")}
    >
      {decisionRow &&
        (date ? <DateLeaf date={date} /> : <span aria-hidden="true" className="h-11 w-10 shrink-0" />)}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-basalt">{title}</span>
        {detail && <span className="mt-0.5 line-clamp-2 block text-xs text-ash">{detail}</span>}
      </span>
      {fact && <span className="shrink-0 pt-0.5 text-xs text-ash tabular-nums">{fact}</span>}
    </a>
  );
}
