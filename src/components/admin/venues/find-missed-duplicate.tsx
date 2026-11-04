"use client";

import * as React from "react";
import { X } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import { planDuplicateGroup, type PlaceRecord } from "@/lib/venues/place-review";
import { loadPlacesForMerge, type PlaceSearchRow } from "@/app/admin/_actions/venues";
import { DuplicateGroup } from "./duplicate-group";
import { PlacePicker } from "./place-picker";

const MAX = 6;

/**
 * Pick two or more places the finder missed, then merge them with the same table. A merge made
 * here is remembered as "same place" pairs that feed the finder.
 */
export function FindMissedDuplicate({ neighborhoods, now }: { neighborhoods: NeighborhoodRow[]; now: string }) {
  const [picked, setPicked] = React.useState<PlaceSearchRow[]>([]);
  const [loaded, setLoaded] = React.useState<{ ids: string; records: PlaceRecord[] } | null>(null);
  const ids = picked.map((p) => p.id).join(",");
  const records = loaded?.ids === ids ? loaded.records : null;

  React.useEffect(() => {
    const list = ids ? ids.split(",") : [];
    if (list.length < 2) return;
    let live = true;
    void loadPlacesForMerge({ ids: list }).then((rows) => {
      if (live) setLoaded({ ids, records: rows });
    });
    return () => {
      live = false;
    };
  }, [ids]);

  const plan = records && records.length >= 2 ? planDuplicateGroup(records) : null;

  return (
    <div className="space-y-6">
      <div className="max-w-[560px] space-y-3">
        <PlacePicker
          id="missed-duplicate-search"
          label={picked.length === 0 ? "First place" : "Another place"}
          excludeIds={picked.map((p) => p.id)}
          onPick={(row) => setPicked((prev) => (prev.length >= MAX ? prev : [...prev, row]))}
        />
        {picked.length > 0 && (
          <ul aria-label="Picked places" className="divide-y divide-seam border-y border-seam">
            {picked.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-basalt">{p.name}</span>
                  <span className="block text-xs text-ash">
                    {p.address}, {p.city} {p.zip}
                  </span>
                </span>
                <AdminButton variant="quiet" size="icon-sm" aria-label={`Remove ${p.name}`} onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}>
                  <X strokeWidth={1.75} aria-hidden="true" />
                </AdminButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picked.length < 2 ? (
        <Empty detail="Search by name, street or town. Archived places are left out.">Pick at least two places that are one place.</Empty>
      ) : plan ? (
        <DuplicateGroup key={plan.key} plan={plan} neighborhoods={neighborhoods} byHand now={now} onDone={() => setPicked([])} />
      ) : (
        <p className="text-sm text-ash">Loading the picked places.</p>
      )}
    </div>
  );
}
