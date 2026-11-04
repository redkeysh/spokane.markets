"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SingleKeysContext, isTypingTarget } from "./use-shortcuts";
import { nextRovingIndex, rovingMoveFor } from "./use-roving";

const ITEM = "[data-roving-item]";

export function rowItems(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(ITEM));
}

/**
 * Keeps exactly one row link in the tab order: the focused one, else the first. With `controls`,
 * the matching controls in that link's `.sm-row` stay in the tab order and every other row's leave it.
 */
export function normalizeTabStops(list: HTMLElement, preferred: HTMLElement | null, controls?: string) {
  const items = rowItems(list);
  const stop = preferred && items.includes(preferred) ? preferred : items[0];
  for (const item of items) item.tabIndex = item === stop ? 0 : -1;
  if (!controls) return;
  const row = stop?.closest(".sm-row") ?? null;
  for (const control of list.querySelectorAll<HTMLElement>(controls)) control.tabIndex = row?.contains(control) ? 0 : -1;
}

/**
 * A work list: rows on sheet, one seam between rows, no outer card. One tab stop for the whole
 * list (roving tabindex); j / k or the arrows move, Space ticks, Shift with a move extends,
 * Enter opens, Escape clears the ticks.
 */
export function List({
  label,
  children,
  onTick,
  onExtend,
  onClearTicks,
  className,
}: {
  label: string;
  children: React.ReactNode;
  /** Space on a row. Without it, Space toggles the row's own checkbox. */
  onTick?: (rowKey: string) => void;
  /** Shift with a move: tick from one row to the other. */
  onExtend?: (fromKey: string, toKey: string) => void;
  onClearTicks?: () => void;
  className?: string;
}) {
  const singleKeys = React.useContext(SingleKeysContext);
  const ref = React.useRef<HTMLUListElement>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (ref.current) normalizeTabStops(ref.current, lastFocused.current);
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const list = ref.current;
    if (!list || isTypingTarget(event.target)) return;
    const items = rowItems(list);
    const from = items.findIndex((item) => item === document.activeElement);
    if (from < 0) return;
    const fromKey = items[from].dataset.rowKey ?? "";

    if (event.key === " ") {
      if (onTick) {
        event.preventDefault();
        onTick(fromKey);
        return;
      }
      const checkbox = items[from].closest("li")?.querySelector<HTMLInputElement>("input[type=checkbox]");
      if (!checkbox) return;
      event.preventDefault();
      checkbox.click();
      return;
    }
    if (event.key === "Escape" && onClearTicks) {
      event.preventDefault();
      onClearTicks();
      return;
    }
    const move = rovingMoveFor(event, { singleKeys });
    if (!move) return;
    const to = nextRovingIndex(from, move, items.length);
    if (to < 0 || to === from) return;
    event.preventDefault();
    if (event.shiftKey && onExtend) onExtend(fromKey, items[to].dataset.rowKey ?? "");
    items[to].focus();
  };

  return (
    <ul
      ref={ref}
      role="list"
      aria-label={label}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const target = event.target as HTMLElement;
        if (!target.matches(ITEM) || !ref.current) return;
        lastFocused.current = target;
        normalizeTabStops(ref.current, target);
      }}
      className={cn("border-t border-seam", className)}
    >
      {children}
    </ul>
  );
}

/**
 * One row. The title is a link stretched over the whole row, so the row opens on click or Enter;
 * controls passed in `checkbox` and `action` sit above it and do not open the row.
 */
export function ListRow({
  rowKey,
  href,
  title,
  meta,
  leaf,
  flags,
  status,
  action,
  ticked,
  onTickedChange,
  archived = false,
  className,
}: {
  rowKey: string;
  href: string;
  title: React.ReactNode;
  /** 12/16 ash, e.g. "Kootenai County Fairgrounds, Coeur d'Alene". */
  meta?: React.ReactNode;
  leaf?: React.ReactNode;
  /** At most two short words, e.g. "No picture", "Twin". */
  flags?: React.ReactNode;
  status?: React.ReactNode;
  /** One inline action ("Restore") or a row menu. */
  action?: React.ReactNode;
  /** Present when the row can be ticked for a bulk action. */
  ticked?: boolean;
  onTickedChange?: (ticked: boolean) => void;
  archived?: boolean;
  className?: string;
}) {
  const titleText = typeof title === "string" ? title : undefined;
  const tickedId = React.useId();
  const showTicked = Boolean(onTickedChange && ticked);
  return (
    <li
      className={cn(
        "sm-row flex min-h-[60px] items-center gap-3 border-b border-seam px-4 py-2",
        ticked ? "bg-lilac-tint" : "bg-sheet hover:bg-hover",
        archived && "text-ash-quiet",
        className
      )}
    >
      {onTickedChange && (
        <label data-row-action className="flex size-6 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            tabIndex={-1}
            checked={ticked ?? false}
            onChange={(e) => onTickedChange(e.target.checked)}
            aria-label={titleText ? `Tick ${titleText}` : "Tick this row"}
            className="size-4 cursor-pointer rounded-sm accent-basalt"
          />
        </label>
      )}
      {leaf}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          data-roving-item
          data-row-key={rowKey}
          aria-describedby={showTicked ? tickedId : undefined}
          className={cn("sm-row-link block text-sm font-medium", archived ? "text-ash-quiet" : "text-basalt")}
        >
          {title}
        </Link>
        {showTicked && (
          <span id={tickedId} hidden>
            Ticked
          </span>
        )}
        {meta && <div className="mt-0.5 text-xs text-ash">{meta}</div>}
      </div>
      {flags && <div className="hidden shrink-0 text-xs text-ash md:block">{flags}</div>}
      {status && <div className="shrink-0">{status}</div>}
      {action && (
        <div data-row-action className="shrink-0">
          {action}
        </div>
      )}
    </li>
  );
}

/**
 * A weekend, town or lane heading inside a list, sticky at the top of its scrolling pane unless
 * `sticky` is false (inside the editor nothing is sticky).
 */
export function GroupHeading({
  children,
  fact,
  action,
  as: Heading = "h3",
  sticky = true,
  className,
}: {
  children: React.ReactNode;
  /** "22 events, 1 live". */
  fact?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3" | "h4";
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-10 items-center gap-3 bg-fog px-4 py-2", sticky && "sticky top-[var(--sm-sticky-top)] z-10", className)}>
      <Heading className="min-w-0 flex-1 font-text text-[15px]/[20px] font-semibold text-basalt">{children}</Heading>
      {fact && <span className="shrink-0 text-xs text-ash tabular-nums">{fact}</span>}
      {action}
    </div>
  );
}
