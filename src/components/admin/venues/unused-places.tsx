"use client";

import * as React from "react";
import Link from "next/link";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { List, ListRow } from "@/components/admin/kit/list";
import type { PlaceRecord } from "@/lib/venues/place-review";
import { archiveUnusedPlaces } from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/venues/words";
import { LINK } from "./controls";
import { useDecisionRow } from "./decision-row";
import { useVenueAction } from "./use-venue-action";

/**
 * Active places no event and no market uses, with "Archive N" behind a confirm that lists them.
 * Records that are the empty half of a duplicate group say so and start unticked: merging the
 * group handles them first. The rest start ticked.
 */
export function UnusedPlaces({ rows, decisionKey }: { rows: { place: PlaceRecord; duplicateOf: string | null }[]; decisionKey?: string }) {
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(rows.filter((r) => !r.duplicateOf).map((r) => r.place.id)));
  const [confirming, setConfirming] = React.useState(false);
  const { run, busy } = useVenueAction();
  const { primaryKeys, extra } = useDecisionRow();
  const chosen = rows.filter((r) => ticked.has(r.place.id));

  if (rows.length === 0) return <Empty>Every place is used by an event or a market.</Empty>;

  const tick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="ink" keys={primaryKeys} data-decision-primary disabled={chosen.length === 0 || !!busy} onClick={() => setConfirming(true)}>
          Archive {chosen.length}
        </AdminButton>
        {extra}
        <p className="text-sm text-ash">Untick any place to keep. Space ticks the row with the cursor.</p>
      </div>
      <List label="Places nothing uses" onClearTicks={() => setTicked(new Set())}>
        {rows.map(({ place, duplicateOf }) => (
          <ListRow
            key={place.id}
            rowKey={place.id}
            href={`/admin/venues/${place.id}`}
            title={place.name}
            meta={
              <>
                {place.address}, {place.city} {place.zip}
                {duplicateOf && (
                  <span className="block">
                    The empty half of a duplicate group with {duplicateOf}; merging handles it.{" "}
                    <span data-row-action>
                      <Link href="/admin/venues?view=duplicates" className={cn(LINK)}>
                        Duplicates
                      </Link>
                    </span>
                  </span>
                )}
              </>
            }
            ticked={ticked.has(place.id)}
            onTickedChange={(on) => tick(place.id, on)}
          />
        ))}
      </List>
      <AdminDialog
        open={confirming}
        onOpenChange={setConfirming}
        size="list"
        title={`Archive ${plural(chosen.length, "place")}?`}
        description="They leave every list and every place picker. Nothing uses them, so no listing changes. You can restore any of them."
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="ink"
              busy={busy === "archive"}
              busyLabel="Archiving"
              onClick={() =>
                void run("archive", () => archiveUnusedPlaces({ venueIds: chosen.map((r) => r.place.id), decisionKey }), {
                  onDone: () => setConfirming(false),
                })
              }
            >
              Archive {chosen.length}
            </AdminButton>
          </>
        }
      >
        <ul className="space-y-1 text-sm text-basalt">
          {chosen.map(({ place }) => (
            <li key={place.id}>
              {place.name}, <span className="text-ash">{place.address}</span>
            </li>
          ))}
        </ul>
      </AdminDialog>
    </div>
  );
}
