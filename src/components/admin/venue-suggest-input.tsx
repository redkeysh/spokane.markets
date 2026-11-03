"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type VenueOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

const MAX_SUGGESTIONS = 6;

/** Venues whose name or street address contains the query; name-prefix matches first. */
export function matchVenues(venues: VenueOption[], query: string): VenueOption[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return venues
    .filter((v) => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))
    )
    .slice(0, MAX_SUGGESTIONS);
}

export function VenueSuggestInput({
  id,
  value,
  venues,
  onChange,
  onPick,
  className,
}: {
  id: string;
  value: string;
  venues: VenueOption[];
  onChange: (value: string) => void;
  onPick: (venue: VenueOption) => void;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => matchVenues(venues, value), [venues, value]);
  const showList = open && suggestions.length > 0;

  function pick(venue: VenueOption) {
    onPick(venue);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && showList && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Existing venues"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-md"
        >
          {suggestions.map((venue, i) => (
            <li
              key={venue.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(venue)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-sm",
                i === activeIndex && "bg-muted"
              )}
            >
              <span className="block font-medium text-foreground">{venue.name}</span>
              <span className="block text-xs text-muted-foreground">
                {venue.address}, {venue.city}, {venue.state} {venue.zip}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
