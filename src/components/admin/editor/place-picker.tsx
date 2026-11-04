"use client";

import * as React from "react";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react-dom";
import { Plus } from "lucide-react";
import { LayerPortal } from "@/components/admin/kit/layer";
import { matchVenues } from "@/components/admin/venue-suggest-input";
import { cn } from "@/lib/utils";
import { EditorInput } from "./controls";
import type { PlaceOption } from "./place-checks";

const ADD_NEW = "__add-new__";

/** "4056 N Government Way, Coeur d'Alene" */
export function placeLine(place: Pick<PlaceOption, "address" | "city">): string {
  return [place.address, place.city].filter((p) => p?.trim()).join(", ");
}

export function eventsHere(count: number): string {
  return count === 0 ? "No events" : count === 1 ? "1 event" : `${count} events`;
}

/** Places matching a query, name-prefix matches first; the busiest places when the query is too short. */
export function placeMatches(places: readonly PlaceOption[], query: string, limit = 8): PlaceOption[] {
  const active = places.filter((p) => !p.archived);
  if (query.trim().length < 2) return [...active].sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name)).slice(0, 6);
  const byId = new Map(active.map((p) => [p.id, p]));
  const matched = matchVenues(active, query).map((v) => byId.get(v.id)!);
  if (matched.length >= limit) return matched.slice(0, limit);
  const q = query.trim().toLowerCase();
  const more = active.filter((p) => !matched.includes(p) && p.city.toLowerCase().includes(q));
  return [...matched, ...more].slice(0, limit);
}

/**
 * A combobox over the active places. Each option shows the name, street and town, and how many
 * events use it; "Add a new place" is always the last option. The list portals into the admin
 * layer and opens above the field when there is no room below (over the action bar).
 */
export function PlacePicker({
  id,
  places,
  value,
  onPick,
  onAddNew,
  placeholder = "Search places by name or street",
  describedBy,
  invalid,
  disabled,
  inputRef,
}: {
  id: string;
  places: readonly PlaceOption[];
  /** The chosen place id, or "". */
  value: string;
  onPick: (place: PlaceOption) => void;
  /** Omitted, there is no "Add a new place" option. Receives what was typed, as the new place's name. */
  onAddNew?: (typed: string) => void;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const selected = places.find((p) => p.id === value) ?? null;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [reference, setReference] = React.useState<HTMLDivElement | null>(null);
  const [floating, setFloating] = React.useState<HTMLDivElement | null>(null);
  const listId = React.useId();
  const { floatingStyles } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    open,
    elements: { reference, floating },
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.width = `${Math.max(rects.reference.width, 280)}px`;
          elements.floating.style.maxHeight = `${Math.min(availableHeight, 360)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const text = query ?? selected?.name ?? "";
  const matches = open ? placeMatches(places, query ?? "") : [];
  const optionIds = [...matches.map((m) => m.id), ...(onAddNew ? [ADD_NEW] : [])];
  const activeIndex = Math.min(active, Math.max(optionIds.length - 1, 0));

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(0);
  };

  const choose = (optionId: string) => {
    if (optionId === ADD_NEW) {
      const typed = (query ?? "").trim();
      close();
      onAddNew?.(typed);
      return;
    }
    const place = places.find((p) => p.id === optionId);
    if (place) onPick(place);
    close();
  };

  return (
    <div ref={setReference}>
      <EditorInput
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && optionIds.length ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          e.currentTarget.select();
          setOpen(true);
        }}
        onBlur={() => close()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive(Math.min(activeIndex + 1, optionIds.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
          } else if (e.key === "Enter" && open && optionIds.length) {
            e.preventDefault();
            choose(optionIds[activeIndex]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
      />
      {open && optionIds.length > 0 && (
        <LayerPortal>
          <div ref={setFloating} style={floatingStyles} className="sm-float z-40 overflow-y-auto rounded-lg p-1">
            <ul id={listId} role="listbox" aria-label="Places" className="font-text">
              {matches.map((place, i) => (
                <li
                  key={place.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(place.id)}
                  onPointerMove={() => setActive(i)}
                  className={cn("flex cursor-default items-start justify-between gap-3 rounded-md px-2 py-1.5", i === activeIndex && "bg-lilac-tint")}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-basalt">{place.name}</span>
                    <span className="block text-xs text-ash">{placeLine(place)}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs text-ash tabular-nums">{eventsHere(place.eventCount)}</span>
                </li>
              ))}
              {onAddNew && (
                <li
                  id={`${listId}-${matches.length}`}
                  role="option"
                  aria-selected={activeIndex === matches.length}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(ADD_NEW)}
                  onPointerMove={() => setActive(matches.length)}
                  className={cn(
                    "mt-1 flex cursor-default items-center gap-2 rounded-md border-t border-seam px-2 py-2 text-sm font-medium text-lilac",
                    activeIndex === matches.length && "bg-lilac-tint"
                  )}
                >
                  <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Add a new place
                </li>
              )}
            </ul>
          </div>
        </LayerPortal>
      )}
    </div>
  );
}
