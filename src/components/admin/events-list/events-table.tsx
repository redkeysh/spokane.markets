"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import type { EventListRow, EventsListFilters, EventsSort } from "@/lib/admin/events-query";
import { eventsListHref } from "@/lib/admin/events-query";
import { AdminButton } from "@/components/admin/kit/button";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { Table, TBody, TD, TH, THead, TR, type SortDirection } from "@/components/admin/kit/table";
import { useListKeys } from "./use-list-keys";

const COLUMNS: { sort: EventsSort; label: string; className?: string }[] = [
  { sort: "title", label: "Title" },
  { sort: "start", label: "Start" },
  { sort: "place", label: "Place", className: "hidden md:table-cell" },
  { sort: "market", label: "Market", className: "hidden md:table-cell" },
  { sort: "status", label: "Status" },
  { sort: "updated", label: "Updated", className: "hidden md:table-cell" },
];

const STATUS_WORD: Record<EventListRow["mark"], string> = {
  PUBLISHED: "Published",
  PENDING: "Pending",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

/** A spreadsheet cell; a leading =, +, - or @ is prefixed so spreadsheets do not run it as a formula. */
export function csvCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function eventsCsv(rows: EventListRow[], origin: string): string {
  const header = ["Title", "Start date", "Start", "Place", "Market", "Status", "Updated", "Page on the site", "Id"];
  const lines = rows.map((r) =>
    [
      r.title,
      r.firstDate,
      r.startLabel,
      r.placeLine,
      r.marketName ?? "",
      STATUS_WORD[r.mark],
      r.updatedLabel,
      `${origin}/events/${r.slug}`,
      r.id,
    ].map(csvCell)
  );
  return [header, ...lines].map((line) => line.join(",")).join("\r\n");
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Table mode: a plain sortable table of the filtered events, for lookup and export. */
export function EventsTable({
  rows,
  filters,
  today,
  hrefFor,
}: {
  rows: EventListRow[];
  filters: EventsListFilters;
  today: string;
  hrefFor: (id: string) => string;
}) {
  const { ref: listRef, onKeyDown, onFocus } = useListKeys({});
  const sortOf = (column: EventsSort): SortDirection =>
    filters.sort === column ? (filters.dir === "asc" ? "ascending" : "descending") : "none";
  const nextDir = (column: EventsSort) => (filters.sort === column && filters.dir === "asc" ? "desc" : "asc");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <p className="text-sm text-ash tabular-nums">
          {rows.length} {rows.length === 1 ? "event" : "events"}
        </p>
        <AdminButton
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={() => download(`events-${today}.csv`, eventsCsv(rows, window.location.origin))}
        >
          <Download strokeWidth={1.75} aria-hidden="true" />
          Export CSV
        </AdminButton>
      </div>
      <div ref={listRef} onKeyDown={onKeyDown} onFocus={onFocus}>
        <Table label="Events" className="px-2 md:px-3">
          <THead>
            {COLUMNS.map((column) => (
              <TH
                key={column.sort}
                sort={sortOf(column.sort)}
                href={eventsListHref(filters, { sort: column.sort, dir: nextDir(column.sort) })}
                className={column.className}
              >
                {column.label}
              </TH>
            ))}
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id} className={row.archived ? "text-ash-quiet" : undefined}>
                <TD className="md:min-w-48">
                  <Link
                    href={hrefFor(row.id)}
                    data-roving-item
                    data-row-key={row.id}
                    className="rounded-sm font-medium hover:underline focus-visible:outline-offset-[-2px]"
                  >
                    {row.title}
                  </Link>
                  <span className="block text-xs text-ash md:hidden">{row.placeLine}</span>
                </TD>
                <TD className="md:whitespace-nowrap">{row.startLabel}</TD>
                <TD className="hidden min-w-40 md:table-cell">{row.placeLine}</TD>
                <TD className="hidden min-w-32 md:table-cell">{row.marketName ?? ""}</TD>
                <TD className="whitespace-nowrap">
                  <StatusMark status={row.mark} size="sm" />
                </TD>
                <TD className="hidden whitespace-nowrap md:table-cell">{row.updatedLabel}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
