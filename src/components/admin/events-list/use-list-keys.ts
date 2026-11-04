"use client";

import * as React from "react";
import { SingleKeysContext, isTypingTarget } from "@/components/admin/kit/use-shortcuts";
import { normalizeTabStops, rowItems as itemsIn } from "@/components/admin/kit/list";
import { nextRovingIndex, rovingMoveFor } from "@/components/admin/kit/use-roving";

const ITEM = "[data-roving-item]";
/** The cursor row's own controls (its menu, Restore) are the tab stop after its link; other rows' are skipped. */
const CONTROL = "[data-row-control] button, [data-row-control] a";

/** The ids a roving item ticks, from its data-tick-ids. */
export function tickIdsOf(item: HTMLElement | undefined): string[] {
  return (item?.dataset.tickIds ?? "").split(" ").filter(Boolean);
}

/**
 * Keyboard for a list that spans several weekend groups: j / k or the arrows move the cursor
 * across groups, Home and End jump, Space ticks, Shift with a move ticks the row moved to,
 * Escape clears the ticks, and the Menu key (or Shift+F10) opens the cursor row's menu.
 */
export function useListKeys({
  onTick,
  onExtend,
  onClear,
}: {
  onTick?: (ids: string[]) => void;
  onExtend?: (fromIds: string[], toIds: string[]) => void;
  /** Returns true when there was something to clear. */
  onClear?: () => boolean;
}) {
  const singleKeys = React.useContext(SingleKeysContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (ref.current) normalizeTabStops(ref.current, lastFocused.current, CONTROL);
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    const container = ref.current;
    if (!container || isTypingTarget(event.target)) return;
    const target = event.target as HTMLElement;
    const items = itemsIn(container);
    const row = target.closest(".sm-row");
    let from = items.indexOf(target);
    const onItem = from >= 0;
    if (!onItem && row) from = items.findIndex((item) => row.contains(item));
    if (from < 0) return;

    if (event.key === "Escape") {
      if (onClear?.()) event.preventDefault();
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      const trigger = items[from].closest(".sm-row")?.querySelector<HTMLElement>("[data-row-control] [aria-haspopup]");
      if (trigger) {
        event.preventDefault();
        trigger.click();
      }
      return;
    }
    if (!onItem) return;
    if (event.key === " ") {
      if (!onTick) return;
      event.preventDefault();
      onTick(tickIdsOf(items[from]));
      return;
    }
    const move = rovingMoveFor(event, { singleKeys });
    if (!move) return;
    const to = nextRovingIndex(from, move, items.length);
    if (to < 0 || to === from) return;
    event.preventDefault();
    if (event.shiftKey && onExtend && (move === "next" || move === "previous")) {
      onExtend(tickIdsOf(items[from]), tickIdsOf(items[to]));
    }
    items[to].focus();
  };

  const onFocus = (event: React.FocusEvent) => {
    const target = event.target as HTMLElement;
    if (!target.matches(ITEM) || !ref.current) return;
    lastFocused.current = target;
    normalizeTabStops(ref.current, target, CONTROL);
  };

  return { ref, onKeyDown, onFocus };
}
