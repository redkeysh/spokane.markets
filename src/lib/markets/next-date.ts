import { formatDay, formatFullDate, pacificDate } from "@/lib/admin/format";

/**
 * The public market page's "Next date": the first event of the market that is Published, not
 * archived, and starts now or later, by start (src/lib/services/market-series-service.ts). A listing
 * that runs several days drops out once its first day has started.
 */
export function publicNextDateWhere(now: Date) {
  return { status: "PUBLISHED" as const, startDate: { gte: now }, deletedAt: null };
}

export type NextDateEvent = {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  deletedAt?: Date | null;
};

const WAITING = new Set(["PENDING", "DRAFT"]);

function firstByStart<T extends NextDateEvent>(events: readonly T[], keep: (e: T) => boolean): T | null {
  let best: T | null = null;
  for (const e of events) {
    if (!keep(e)) continue;
    if (!best || e.startDate.getTime() < best.startDate.getTime()) best = e;
  }
  return best;
}

/** What visitors see as "Next date" on the market's public page, by publicNextDateWhere. */
export function nextDateOnSite<T extends NextDateEvent>(events: readonly T[], now: Date): T | null {
  return firstByStart(events, (e) => e.status === "PUBLISHED" && !e.deletedAt && e.startDate >= now);
}

/** Dates that would count as "Next date" once published: Pending or Draft, not archived, starting now or later. */
export function waitingAhead<T extends NextDateEvent>(events: readonly T[], now: Date): T[] {
  return events
    .filter((e) => WAITING.has(e.status) && !e.deletedAt && e.startDate >= now)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export type NextDateSummary<T extends NextDateEvent = NextDateEvent> =
  /** Visitors see `event`; `waiting` more could join it. */
  | { kind: "live"; event: T; waiting: number }
  /** Nothing on the site; publishing the waiting dates would make `ifPublished` the next date. */
  | { kind: "waiting"; waiting: number; ifPublished: T }
  /** Nothing ahead at all; `last` is the most recent published date before now, if any. */
  | { kind: "none"; last: T | null };

export function summarizeNextDate<T extends NextDateEvent>(events: readonly T[], now: Date): NextDateSummary<T> {
  const live = nextDateOnSite(events, now);
  const waiting = waitingAhead(events, now);
  if (live) return { kind: "live", event: live, waiting: waiting.length };
  if (waiting.length > 0) return { kind: "waiting", waiting: waiting.length, ifPublished: waiting[0] };
  let last: T | null = null;
  for (const e of events) {
    if (e.status !== "PUBLISHED" || e.deletedAt || e.startDate >= now) continue;
    if (!last || e.startDate > last.startDate) last = e;
  }
  return { kind: "none", last };
}

/** The board's "Next date on the site" column: "Sat Nov 14", "none, 6 waiting", "last Sep 26, 2026", "none". */
export function nextDateText(summary: NextDateSummary, now: Date): string {
  switch (summary.kind) {
    case "live":
      return formatDay(pacificDate(summary.event.startDate), now);
    case "waiting":
      return `none, ${summary.waiting} waiting`;
    case "none":
      return summary.last ? `last ${formatFullDate(pacificDate(summary.last.startDate))}` : "none";
  }
}

/** The market page's line: what visitors see now and what publishing would change. */
export function nextDateSentence(summary: NextDateSummary, now: Date): string {
  switch (summary.kind) {
    case "live": {
      const day = formatDay(pacificDate(summary.event.startDate), now);
      return `On the site, "Next date" shows ${day}.`;
    }
    case "waiting": {
      const day = formatDay(pacificDate(summary.ifPublished.startDate), now);
      return `On the site, "Next date" shows nothing. Publishing the waiting dates makes it ${day}.`;
    }
    case "none":
      return summary.last
        ? `On the site, "Next date" shows nothing. The last date was ${formatFullDate(pacificDate(summary.last.startDate))}.`
        : `On the site, "Next date" shows nothing. This market has no dates yet.`;
  }
}
