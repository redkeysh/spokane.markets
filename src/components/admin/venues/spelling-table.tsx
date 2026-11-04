"use client";

import * as React from "react";
import Link from "next/link";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { Table, TBody, TD, TH, THead, TR } from "@/components/admin/kit/table";
import type { PlaceProblem } from "@/lib/venues/place-check";
import type { PlaceRecord, SpellingRow } from "@/lib/venues/place-review";
import type { TidyField } from "@/lib/venues/tidy";
import { fixPlaceSpelling } from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { LINK } from "./controls";
import { useDecisionRow } from "./decision-row";
import { useVenueAction } from "./use-venue-action";

const FIELD_WORD: Record<TidyField, string> = { name: "Name", address: "Address", city: "Town", state: "State", zip: "ZIP" };

function fixKey(placeId: string, field: TidyField) {
  return `${placeId}:${field}`;
}

/**
 * Safe spelling fixes as one before-and-after table, a checkbox per fix, all ticked. Mismatches
 * that need judgment are listed under it with an edit link and are never fixed here.
 */
export function SpellingTable({
  rows,
  mismatches,
  decisionKey,
}: {
  rows: SpellingRow[];
  mismatches: { place: PlaceRecord; problems: PlaceProblem[] }[];
  decisionKey?: string;
}) {
  const all = rows.flatMap((r) => r.fixes.map((f) => fixKey(r.place.id, f.field)));
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(all));
  const { run, busy } = useVenueAction();
  const { primaryKeys, extra } = useDecisionRow();
  const places = rows.filter((r) => r.fixes.some((f) => ticked.has(fixKey(r.place.id, f.field))));

  const toggle = (key: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const fix = () =>
    run("fix", () =>
      fixPlaceSpelling({
        items: places.map((r) => ({ venueId: r.place.id, fields: r.fixes.filter((f) => ticked.has(fixKey(r.place.id, f.field))).map((f) => f.field) })),
        decisionKey,
      })
    );

  return (
    <div className="space-y-8">
      {rows.length === 0 ? (
        <Empty>Every place is spelled one way.</Empty>
      ) : (
        <div className="space-y-4">
          <ul aria-label="Spelling fixes" className="border-t border-seam md:hidden">
            {rows.flatMap((row) =>
              row.fixes.map((f) => {
                const key = fixKey(row.place.id, f.field);
                return (
                  <li key={key} className={cn("border-b border-seam px-2 py-2", ticked.has(key) && "bg-lilac-tint")}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={ticked.has(key)}
                        onChange={(e) => toggle(key, e.target.checked)}
                        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-basalt">{row.place.name}</span>
                        <span className="block text-ash">
                          {FIELD_WORD[f.field]} <span className="whitespace-pre text-basalt">{f.before}</span> becomes{" "}
                          <span className="font-medium text-basalt">{f.after}</span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          <Table label="Spelling fixes, one row per field" className="hidden md:block">
            <THead>
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Tick every fix"
                  checked={ticked.size === all.length}
                  ref={(el) => {
                    if (el) el.indeterminate = ticked.size > 0 && ticked.size < all.length;
                  }}
                  onChange={(e) => setTicked(e.target.checked ? new Set(all) : new Set())}
                  className="size-4 cursor-pointer accent-basalt"
                />
              </TH>
              <TH>Place</TH>
              <TH>Field</TH>
              <TH>Now</TH>
              <TH>Fixed</TH>
            </THead>
            <TBody>
              {rows.flatMap((row) =>
                row.fixes.map((f, i) => {
                  const key = fixKey(row.place.id, f.field);
                  return (
                    <TR key={key} className={cn(ticked.has(key) && "bg-lilac-tint hover:bg-lilac-tint")}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={ticked.has(key)}
                          onChange={(e) => toggle(key, e.target.checked)}
                          aria-label={`Fix ${FIELD_WORD[f.field].toLowerCase()} of ${row.place.name}`}
                          className="size-4 cursor-pointer accent-basalt"
                        />
                      </TD>
                      <TD>
                        {i === 0 ? (
                          <Link href={`/admin/venues/${row.place.id}`} className="font-medium text-basalt hover:underline">
                            {row.place.name}
                          </Link>
                        ) : (
                          <span className="sr-only">{row.place.name}</span>
                        )}
                      </TD>
                      <TD className="text-ash">{FIELD_WORD[f.field]}</TD>
                      <TD className="whitespace-pre">{f.before}</TD>
                      <TD className="font-medium">{f.after}</TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              variant="ink"
              keys={primaryKeys}
              data-decision-primary
              busy={busy === "fix"}
              busyLabel="Fixing"
              disabled={places.length === 0 || !!busy}
              onClick={() => void fix()}
            >
              Fix {places.length}
            </AdminButton>
            {extra}
          </div>
        </div>
      )}

      {mismatches.length > 0 && (
        <section aria-labelledby="needs-a-look" className="space-y-2">
          <h2 id="needs-a-look" className="font-text text-[15px]/[20px] font-semibold text-basalt">
            Needs a look
          </h2>
          <p className="max-w-[72ch] text-sm text-ash">These disagree with themselves. Open the place and decide which part is right.</p>
          <ul className="border-t border-seam">
            {mismatches.map(({ place, problems }) => (
              <li key={place.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-seam py-2">
                <p className="min-w-0 text-sm text-basalt">
                  <span className="font-medium">{place.name}:</span> {problems.map((p) => p.message).join(" ")}
                </p>
                <Link href={`/admin/venues/${place.id}`} className={cn(LINK, "text-sm")} aria-label={`Edit ${place.name}`}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
