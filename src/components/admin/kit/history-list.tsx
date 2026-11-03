"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AdminButton } from "./button";
import { Empty } from "./empty";
import { GroupHeading } from "./list";
import { Tooltip } from "./tooltip";

/** One history line, already formatted by the caller (dates in America/Los_Angeles). */
export type HistoryListEntry = {
  id: string;
  /** Group heading, e.g. "Today, Tuesday Nov 3". Consecutive entries with the same day group together. */
  day: string;
  /** When it happened; a string must be an ISO 8601 date and time. */
  at: Date | string;
  /** "9:41 am". */
  time: string;
  /** "Nov 3, 2026 at 9:41 am": the tooltip, the accessible text of the time, and the top of Details. */
  timestamp: string;
  /** "You published 8 events for the weekend of Nov 7." The record name may be a link. */
  sentence: React.ReactNode;
  /** A second line, e.g. the records it touched. */
  detailLine?: React.ReactNode;
  /** Raw values, previous and new, shown as a two-column list under Details. */
  details?: ReadonlyArray<{ label: string; before?: string | null; after?: string | null }>;
  canUndo?: boolean;
};

function groupByDay(entries: readonly HistoryListEntry[]) {
  const groups: { day: string; entries: HistoryListEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.day === entry.day) last.entries.push(entry);
    else groups.push({ day: entry.day, entries: [entry] });
  }
  return groups;
}

/**
 * A day-grouped list of history sentences with Details and, where possible, Undo. Renders the
 * History page and the History section of every record.
 */
export function HistoryList({
  entries,
  onUndo,
  empty = "Nothing has changed here yet.",
  headingLevel = "h3",
  stickyHeadings = true,
  className,
}: {
  entries: readonly HistoryListEntry[];
  onUndo?: (id: string) => void | Promise<void>;
  empty?: React.ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
  /** false inside a record's History section, where nothing is sticky. */
  stickyHeadings?: boolean;
  className?: string;
}) {
  const [undoing, setUndoing] = React.useState<string | null>(null);

  if (entries.length === 0) return <Empty>{empty}</Empty>;

  return (
    <div className={cn("font-text", className)}>
      {groupByDay(entries).map((group) => (
        <section key={group.day} aria-label={group.day}>
          <GroupHeading as={headingLevel} sticky={stickyHeadings}>
            {group.day}
          </GroupHeading>
          <ul role="list">
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 border-b border-seam px-4 py-2.5"
              >
                <Tooltip content={entry.timestamp} placement="top-start">
                  <time dateTime={new Date(entry.at).toISOString()} className="pt-px text-xs text-ash tabular-nums">
                    <span aria-hidden="true">{entry.time}</span>
                    <span className="sr-only">{entry.timestamp}</span>
                  </time>
                </Tooltip>
                <div className="min-w-0">
                  <p className="text-sm text-basalt">{entry.sentence}</p>
                  {entry.detailLine && <p className="mt-0.5 text-xs text-ash">{entry.detailLine}</p>}
                  {entry.details && entry.details.length > 0 && (
                    <details className="mt-1">
                      <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-lilac">
                        Details
                      </summary>
                      <p className="mt-2 text-xs text-ash tabular-nums">{entry.timestamp}</p>
                      <table className="mt-2 w-full table-fixed text-left text-xs">
                        <thead>
                          <tr className="text-ash">
                            <th scope="col" className="w-28 pr-4 pb-1 font-semibold">
                              Field
                            </th>
                            <th scope="col" className="pr-4 pb-1 font-semibold">
                              Before
                            </th>
                            <th scope="col" className="pb-1 font-semibold">
                              After
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.details.map((d) => (
                            <tr key={d.label} className="align-top">
                              <th scope="row" className="pr-4 pb-1 font-normal text-ash">
                                {d.label}
                              </th>
                              <td className="pr-4 pb-1 break-words text-basalt">{d.before ?? "None"}</td>
                              <td className="pb-1 break-words text-basalt">{d.after ?? "None"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
                {entry.canUndo && onUndo ? (
                  <AdminButton
                    variant="quiet"
                    size="sm"
                    busy={undoing === entry.id}
                    busyLabel="Undoing"
                    onClick={async () => {
                      setUndoing(entry.id);
                      try {
                        await onUndo(entry.id);
                      } finally {
                        setUndoing(null);
                      }
                    }}
                  >
                    Undo
                  </AdminButton>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
