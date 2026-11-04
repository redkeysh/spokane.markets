"use client";

import * as React from "react";
import type { EventListRow } from "@/lib/admin/events-query";

export type EventsListApi = {
  rows: ReadonlyMap<string, EventListRow>;
  ticked: ReadonlySet<string>;
  /** On phones, checkboxes show only in Select mode. */
  selecting: boolean;
  setTicked: (ids: readonly string[], on: boolean) => void;
  /** The editor for an event, carrying from=events and the list's query. */
  hrefFor: (id: string) => string;
  publish: (ids: string[]) => void;
  reject: (ids: string[]) => void;
  archive: (ids: string[]) => void;
  restore: (ids: string[]) => void;
  seriesIds: Readonly<Record<string, string[]>>;
  expanded: ReadonlySet<string>;
  toggleExpanded: (key: string) => void;
  busy: boolean;
};

const EventsListContext = React.createContext<EventsListApi | null>(null);

export const EventsListProvider = EventsListContext.Provider;

export function useEventsList(): EventsListApi {
  const value = React.useContext(EventsListContext);
  if (!value) throw new Error("useEventsList must be used inside the Events list");
  return value;
}

/** "Tick Emerge Holiday Market". */
export function tickLabel(title: string): string {
  return `Tick ${title}`;
}

/** Whether every id is ticked, some are, or none. */
export function tickState(ids: readonly string[], ticked: ReadonlySet<string>): "all" | "some" | "none" {
  const count = ids.filter((id) => ticked.has(id)).length;
  if (count === 0) return "none";
  return count === ids.length ? "all" : "some";
}
