import { formatClock, formatShortDate, pacificDate } from "@/lib/admin/format";

export type OriginKind = "submission" | "organizer" | "import" | "hand";

export type ImportCohort = {
  /** createdAt of the cohort's first event, as an ISO string. */
  key: string;
  /** "Import of Oct 30", with the time added when two imports share a date. */
  label: string;
  count: number;
  at: Date;
};

export type EventOrigin = {
  kind: OriginKind;
  /** "Sent from the site", "Organizer account", "Import of Oct 30 (47 events)", "Added by hand". */
  label: string;
  /** For imports: the cohort label without the count ("Import of Oct 30"). */
  source: string;
  cohort?: ImportCohort;
};

export type OriginRow = {
  id: string;
  createdAt: Date;
  /** The event was created from a public submission. */
  fromSubmission: boolean;
  submittedByRole: string | null;
};

/** Events created this close together belong to one import. */
const COHORT_GAP_MS = 60_000;

/** An import is at least this many events created together. */
export const IMPORT_MIN_EVENTS = 10;

/**
 * Groups creation times into imports: runs of events each created within a
 * minute of the previous one, at least IMPORT_MIN_EVENTS long. Returns a map
 * from event id to its cohort.
 */
export function importCohorts(rows: { id: string; createdAt: Date }[]): Map<string, ImportCohort> {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const runs: (typeof sorted)[] = [];
  for (const row of sorted) {
    const run = runs[runs.length - 1];
    if (run && row.createdAt.getTime() - run[run.length - 1].createdAt.getTime() <= COHORT_GAP_MS) run.push(row);
    else runs.push([row]);
  }
  const imports = runs.filter((run) => run.length >= IMPORT_MIN_EVENTS);
  const perDate = new Map<string, number>();
  for (const run of imports) {
    const date = pacificDate(run[0].createdAt);
    perDate.set(date, (perDate.get(date) ?? 0) + 1);
  }
  const byEvent = new Map<string, ImportCohort>();
  for (const run of imports) {
    const at = run[0].createdAt;
    const date = pacificDate(at);
    const label = `Import of ${formatShortDate(date)}${(perDate.get(date) ?? 0) > 1 ? ` at ${formatClock(at)}` : ""}`;
    const cohort: ImportCohort = { key: at.toISOString(), label, count: run.length, at };
    for (const row of run) byEvent.set(row.id, cohort);
  }
  return byEvent;
}

/**
 * Where an event came from, without a stored column: a public submission,
 * an organizer's account, an import (see importCohorts), or by hand.
 */
export function eventOrigin(row: OriginRow, cohorts: Map<string, ImportCohort>): EventOrigin {
  if (row.fromSubmission) return { kind: "submission", label: "Sent from the site", source: "Sent from the site" };
  if (row.submittedByRole === "ORGANIZER") {
    return { kind: "organizer", label: "Organizer account", source: "Organizer accounts" };
  }
  const cohort = cohorts.get(row.id);
  if (cohort) {
    return { kind: "import", label: `${cohort.label} (${cohort.count} events)`, source: cohort.label, cohort };
  }
  return { kind: "hand", label: "Added by hand", source: "Added by hand" };
}
