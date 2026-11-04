"use client";

import * as React from "react";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import { setPlacesNeighborhood } from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { RowSelect } from "./controls";
import { useVenueAction } from "./use-venue-action";

/** A place's neighborhood in a list row; choosing one saves it at once, with Undo in the toast. */
export function PlaceNeighborhoodSelect({
  placeId,
  placeName,
  value,
  neighborhoods,
  className,
}: {
  placeId: string;
  placeName: string;
  value: string | null;
  neighborhoods: NeighborhoodRow[];
  className?: string;
}) {
  const [current, setCurrent] = React.useState(value ?? "");
  const { run, busy } = useVenueAction();
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setCurrent(value ?? "");
  }
  const options = neighborhoods.filter((n) => n.isActive || n.slug === value);
  return (
    <RowSelect
      aria-label={`Neighborhood of ${placeName}`}
      value={current}
      disabled={!!busy}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        void run("set", () => setPlacesNeighborhood({ venueIds: [placeId], slug: next || null })).then((ok) => {
          if (!ok) setCurrent(value ?? "");
        });
      }}
      className={cn("w-[200px]", !current && "text-ash", className)}
    >
      <option value="">No neighborhood</option>
      {options.map((n) => (
        <option key={n.slug} value={n.slug}>
          {n.label}
        </option>
      ))}
    </RowSelect>
  );
}
