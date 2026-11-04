"use client";

import * as React from "react";
import type { Area } from "@/lib/admin/regions";
import { Segmented } from "@/components/admin/kit/segmented";
import { DoneToday } from "./done-today";
import { Lane } from "./lane";
import { LaterList } from "./later-list";
import { PILE_SCOPES, type PileItem, type PileScope, type PileSection } from "./pile-model";
import type { TodoDoneItem, TodoSnoozed } from "./types";

/**
 * The pile of decisions, by lane, with Done today and Later at its foot. One tab stop: the
 * cursor row. Up and Down move inside the pile; j and k work from anywhere on To do.
 */
export function Pile({
  sections,
  items,
  cursor,
  scope,
  area,
  onScope,
  onClearArea,
  onSelect,
  onMove,
  onEdge,
  focusRequest,
  doneToday,
  snoozed,
  onUndo,
  busy,
}: {
  sections: PileSection[];
  items: PileItem[];
  cursor: string | null;
  scope: PileScope;
  area: Area | null;
  onScope: (scope: PileScope) => void;
  onClearArea: () => void;
  onSelect: (item: PileItem) => void;
  onMove: (delta: 1 | -1) => void;
  onEdge: (edge: "first" | "last") => void;
  focusRequest: { id: string; n: number } | null;
  doneToday: TodoDoneItem[];
  snoozed: TodoSnoozed[];
  onUndo: (decisionId: string) => void;
  busy: string | null;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!focusRequest || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(focusRequest.id)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [focusRequest]);

  const cursorShown = cursor && items.some((i) => i.id === cursor) ? cursor : (items[0]?.id ?? null);

  const shownOnce = React.useRef(false);
  React.useEffect(() => {
    if (shownOnce.current || !cursorShown || !ref.current) return;
    shownOnce.current = true;
    // In page mode the document scrolls, and the page should open at its top.
    if (!window.matchMedia("(min-width: 1024px) and (min-height: 600px)").matches) return;
    ref.current.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(cursorShown)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursorShown]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.target as HTMLElement).matches("[data-item-id]")) return;
    const keys: Record<string, () => void> = {
      ArrowDown: () => onMove(1),
      ArrowUp: () => onMove(-1),
      Home: () => onEdge("first"),
      End: () => onEdge("last"),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  return (
    <div ref={ref} className="pb-[calc(16px+var(--sm-bottom-bar-h,0px))] lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-3">
        <h2 className="font-text text-[15px]/5 font-semibold text-basalt">Waiting on you</h2>
        <Segmented label="Show" options={PILE_SCOPES} value={scope} onChange={onScope} />
      </div>
      <div onKeyDown={onKeyDown}>
        {sections.map((section) => (
          <Lane
            key={section.lane.lane}
            section={section}
            cursor={cursorShown}
            area={area}
            onSelect={onSelect}
            onClearArea={onClearArea}
          />
        ))}
        {sections.length === 0 && <p className="px-4 py-3 text-sm text-ash">Nothing here for this filter.</p>}
      </div>
      <div className="mt-4">
        <DoneToday items={doneToday} onUndo={onUndo} busy={busy !== null} />
        <LaterList items={snoozed} />
      </div>
    </div>
  );
}
