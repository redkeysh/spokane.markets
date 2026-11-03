"use client";

import { useEffect, useId, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SUGGEST_MIN_QUERY, type PublicVenue } from "@/lib/venues/suggest";

const DEBOUNCE_MS = 250;

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicVenue[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (q.length < SUGGEST_MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { venues?: PublicVenue[] };
        setResults(Array.isArray(json.venues) ? json.venues : []);
      } catch {
        // Aborted, offline, or rate limited: the field still works as free text.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const suggestions = query.trim().length >= SUGGEST_MIN_QUERY ? results : [];
  const showList = open && suggestions.length > 0;

  function pick(venue: PublicVenue) {
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
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Venues we already list"
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
