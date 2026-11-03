"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SUGGEST_MIN_QUERY, type PublicVenue } from "@/lib/venues/suggest";

const DEBOUNCE_MS = 250;

/** The option index after an arrow key, kept inside the list; -1 when the list is empty. */
export function nextActiveIndex(current: number, key: "ArrowDown" | "ArrowUp", count: number): number {
  if (count === 0) return -1;
  return key === "ArrowDown" ? Math.min(count - 1, current + 1) : Math.max(0, current - 1);
}

/**
 * Suggestions for a query from /api/venues/suggest: [] when the request fails
 * or is rate limited, null when it was aborted for a newer query.
 */
export async function fetchVenueSuggestions(query: string, signal: AbortSignal): Promise<PublicVenue[] | null> {
  try {
    const res = await fetch(`/api/venues/suggest?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { venues?: unknown };
    return Array.isArray(json.venues) ? (json.venues as PublicVenue[]) : [];
  } catch {
    return signal.aborted ? null : [];
  }
}

/**
 * Venue name input that suggests existing venues from /api/venues/suggest. It
 * stays a free-text field registered with react-hook-form; picking a
 * suggestion calls onPick so the form can fill in the venue's fields.
 */
export function VenueTypeahead({
  id,
  placeholder,
  registration,
  onPick,
}: {
  id: string;
  placeholder?: string;
  registration: UseFormRegisterReturn;
  onPick: (venue: PublicVenue) => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicVenue[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (q.length < SUGGEST_MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const venues = await fetchVenueSuggestions(q, controller.signal);
      if (venues === null || controller.signal.aborted) return;
      setResults(venues);
      setActiveIndex(-1);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (activeIndex >= 0) listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const suggestions = query.trim().length >= SUGGEST_MIN_QUERY ? results : [];
  const showList = open && suggestions.length > 0;

  function pick(venue: PublicVenue) {
    onPick(venue);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const key = e.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      e.preventDefault();
      if (key === "ArrowDown") setOpen(true);
      setActiveIndex((i) => nextActiveIndex(i, key, suggestions.length));
    } else if (key === "Enter") {
      const venue = showList ? suggestions[activeIndex] : undefined;
      if (venue) {
        e.preventDefault();
        pick(venue);
      }
    } else if (key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        {...registration}
        id={id}
        type="text"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onChange={(e) => {
          void registration.onChange(e);
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          void registration.onBlur(e);
          setOpen(false);
        }}
        onKeyDown={handleKeyDown}
      />
      {/* max-h-80 (320px) fits SUGGEST_LIMIT options of two lines (48px each) without scrolling. */}
      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Venues we already list"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-md"
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
              className={cn("cursor-pointer rounded px-2 py-1.5 text-sm", i === activeIndex && "bg-muted")}
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
