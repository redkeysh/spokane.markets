"use client";

import { useCallback, useContext, useRef, useState, type KeyboardEvent } from "react";
import { SingleKeysContext, isTypingTarget } from "./use-shortcuts";

export type RovingMove = "next" | "previous" | "first" | "last";

/** j and k are single-character keys, so they follow the shortcut preference; arrows always work. */
export function rovingMoveFor(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
  { singleKeys, orientation = "vertical" }: { singleKeys: boolean; orientation?: "vertical" | "horizontal" }
): RovingMove | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  switch (event.key) {
    case nextKey:
      return "next";
    case previousKey:
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "j":
    case "J":
      return singleKeys && orientation === "vertical" ? "next" : null;
    case "k":
    case "K":
      return singleKeys && orientation === "vertical" ? "previous" : null;
    default:
      return null;
  }
}

/** Clamped, not wrapping: the cursor stops at the first and last row. */
export function nextRovingIndex(current: number, move: RovingMove, count: number): number {
  if (count <= 0) return -1;
  switch (move) {
    case "next":
      return Math.min(current + 1, count - 1);
    case "previous":
      return Math.max(current - 1, 0);
    case "first":
      return 0;
    case "last":
      return count - 1;
  }
}

/**
 * Roving tabindex: one tab stop for the whole group, arrows (and j / k in vertical lists) move
 * real focus between items. Spread `getItemProps(i)` on each focusable item and put `onKeyDown`
 * on their container. `onMove` sees every move, with the Shift state, for range ticking.
 */
export function useRovingFocus<T extends HTMLElement = HTMLElement>({
  count,
  orientation = "vertical",
  onMove,
}: {
  count: number;
  orientation?: "vertical" | "horizontal";
  onMove?: (from: number, to: number, event: KeyboardEvent) => void;
}) {
  const singleKeys = useContext(SingleKeysContext);
  const [active, setActive] = useState(0);
  const items = useRef<(T | null)[]>([]);
  const current = Math.min(active, Math.max(count - 1, 0));

  const focusIndex = useCallback((index: number) => {
    setActive(index);
    items.current[index]?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const move = rovingMoveFor(event, { singleKeys, orientation });
    if (!move) return;
    const to = nextRovingIndex(current, move, count);
    if (to < 0) return;
    event.preventDefault();
    onMove?.(current, to, event);
    focusIndex(to);
  };

  const getItemProps = (index: number) => ({
    ref: (node: T | null) => {
      items.current[index] = node;
    },
    tabIndex: index === current ? 0 : -1,
    onFocus: () => setActive(index),
  });

  return { activeIndex: current, setActiveIndex: setActive, focusIndex, getItemProps, onKeyDown };
}
