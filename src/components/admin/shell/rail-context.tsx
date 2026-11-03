"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { RailWeek, WeekendRail } from "@/lib/admin/weekends";

/** The publish fill, in ms; matches the sm-stall-fill animation in globals.css. */
const FILL_MS = 240;

type RailContextValue = {
  /** The layout's rail with optimistic publishes applied. */
  rail: WeekendRail;
  /** The week whose column carries the lilac outline. */
  selectedWeek: string | null;
  /** Event ids one keystroke on the focused decision will settle; their stalls get the reach ring. */
  reach: ReadonlySet<string>;
  /** Event ids whose stalls are playing the fill right now. */
  filling: ReadonlySet<string>;
  setReach: (eventIds: readonly string[] | null) => void;
  /** Starts the fill at once; counts and captions update when it ends, before the server refresh lands. */
  markLive: (eventIds: readonly string[]) => void;
  selectWeek: (weekKey: string | null) => void;
};

const RailContext = React.createContext<RailContextValue | null>(null);

const EMPTY: ReadonlySet<string> = new Set();

function withOverrides(rail: WeekendRail, live: ReadonlySet<string>): WeekendRail {
  if (live.size === 0) return rail;
  return {
    ...rail,
    weeks: rail.weeks.map((week): RailWeek => {
      if (!week.stalls.some((s) => live.has(s.id) && s.status !== "PUBLISHED")) return week;
      const stalls = week.stalls.map((s) => (live.has(s.id) ? { ...s, status: "PUBLISHED" as const } : s));
      return {
        ...week,
        stalls,
        live: stalls.filter((s) => s.status === "PUBLISHED").length,
        pending: stalls.filter((s) => s.status === "PENDING").length,
        draft: stalls.filter((s) => s.status === "DRAFT").length,
      };
    }),
  };
}

function union(a: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(a);
  for (const id of ids) next.add(id);
  return next;
}

function difference(a: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(a);
  for (const id of ids) next.delete(id);
  return next;
}

export function RailProvider({ rail, children }: { rail: WeekendRail; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reach, setReachState] = React.useState<ReadonlySet<string>>(EMPTY);
  const [filling, setFilling] = React.useState<ReadonlySet<string>>(EMPTY);
  const [live, setLive] = React.useState<ReadonlySet<string>>(EMPTY);
  const [explicitWeek, setExplicitWeek] = React.useState<string | null>(null);
  const [baseRail, setBaseRail] = React.useState(rail);

  // Fresh layout data is the truth; optimistic publishes only bridge the gap until it arrives.
  if (rail !== baseRail) {
    setBaseRail(rail);
    setLive(EMPTY);
  }

  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const markLive = React.useCallback((eventIds: readonly string[]) => {
    if (eventIds.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLive((prev) => union(prev, eventIds));
      return;
    }
    setFilling((prev) => union(prev, eventIds));
    timers.current.push(
      window.setTimeout(() => {
        setFilling((prev) => difference(prev, eventIds));
        setLive((prev) => union(prev, eventIds));
      }, FILL_MS)
    );
  }, []);

  const setReach = React.useCallback((eventIds: readonly string[] | null) => {
    setReachState(eventIds && eventIds.length ? new Set(eventIds) : EMPTY);
  }, []);

  const urlWeek =
    pathname === "/admin" || pathname === "/admin/events" ? searchParams?.get("week") ?? null : null;

  const value = React.useMemo<RailContextValue>(
    () => ({
      rail: withOverrides(rail, live),
      selectedWeek: explicitWeek ?? urlWeek,
      reach,
      filling,
      setReach,
      markLive,
      selectWeek: setExplicitWeek,
    }),
    [rail, live, explicitWeek, urlWeek, reach, filling, setReach, markLive]
  );

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

export function useRail(): RailContextValue {
  const value = React.useContext(RailContext);
  if (!value) throw new Error("useRail must be used inside the admin shell");
  return value;
}

/** Outlines a week on the rail while the calling screen is mounted (the editor's record, a lane). */
export function useRailSelection(weekKey: string | null | undefined) {
  const { selectWeek } = useRail();
  React.useEffect(() => {
    if (!weekKey) return;
    selectWeek(weekKey);
    return () => selectWeek(null);
  }, [weekKey, selectWeek]);
}

/** Rings the stalls a decision will settle while it holds the keyboard cursor. */
export function useRailReach(eventIds: readonly string[] | null | undefined) {
  const { setReach } = useRail();
  const key = eventIds?.join("|") ?? "";
  React.useEffect(() => {
    setReach(key ? key.split("|") : null);
    return () => setReach(null);
  }, [key, setReach]);
}
