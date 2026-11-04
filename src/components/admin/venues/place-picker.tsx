"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { searchPlaces, type PlaceSearchRow } from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { usesText } from "@/lib/venues/words";
import { TextInput } from "./controls";

/**
 * Search for a place by name, address or town and pick one. Results are buttons under the field;
 * the count is announced as it changes.
 */
export function PlacePicker({
  id,
  label,
  onPick,
  excludeIds = [],
  includeArchived = false,
  placeholder = "Search name, address or town",
  autoFocus = false,
  className,
}: {
  id: string;
  label: string;
  onPick: (row: PlaceSearchRow) => void;
  excludeIds?: string[];
  includeArchived?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState<{ query: string; rows: PlaceSearchRow[] } | null>(null);
  const exclude = excludeIds.join(",");
  const searched = found !== null && found.query === q.trim() && q.trim().length >= 2;
  const rows = searched ? found.rows : [];

  React.useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let live = true;
    const timer = window.setTimeout(() => {
      void searchPlaces({ q: query, excludeIds: exclude ? exclude.split(",") : [], includeArchived }).then((result) => {
        if (live) setFound({ query, rows: result });
      });
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, exclude, includeArchived]);

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-basalt">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ash" strokeWidth={1.75} aria-hidden="true" />
        <TextInput
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          aria-describedby={`${id}-count`}
          className="pl-8"
        />
      </div>
      <p id={`${id}-count`} aria-live="polite" className="text-xs text-ash">
        {searched ? (rows.length ? `${rows.length} ${rows.length === 1 ? "place" : "places"} found` : `Nothing matches "${q.trim()}".`) : ""}
      </p>
      {rows.length > 0 && (
        <ul className="divide-y divide-seam border-y border-seam">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(row);
                  setQ("");
                }}
                className="flex w-full flex-col items-start px-2 py-2 text-left hover:bg-hover"
              >
                <span className="text-sm font-medium text-basalt">
                  {row.name}
                  {row.archived && <span className="ml-2 text-xs font-normal text-ash-quiet">Archived</span>}
                </span>
                <span className="text-xs text-ash">
                  {row.address}, {row.city} {row.zip}, {row.events || row.markets ? usesText(row) : "nothing uses it"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
