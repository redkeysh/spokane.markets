"use client";

import * as React from "react";
import type { EditorSeries } from "./types";

/**
 * At the top of the main column when the event is one date of a series: which date it is, and
 * whether shared fields (description, picture, tags, features, links, place, market, vendor
 * settings) go to this date or to every date. Title, dates and web address stay per date.
 */
export function SeriesBanner({
  series,
  applyToAll,
  onChange,
  readOnly,
}: {
  series: EditorSeries;
  applyToAll: boolean;
  onChange: (applyToAll: boolean) => void;
  readOnly: boolean;
}) {
  const name = React.useId();
  return (
    <div className="border-l-2 border-seam-strong pl-4">
      <p className="text-sm text-basalt tabular-nums">
        This is {series.index} of {series.total} dates of {series.name}.
      </p>
      {!readOnly && (
        <fieldset className="mt-2">
          <legend className="text-sm text-ash">Apply changes to</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            <label className="inline-flex min-h-6 items-center gap-2 text-sm text-basalt">
              <input type="radio" name={name} checked={!applyToAll} onChange={() => onChange(false)} className="size-4 accent-[var(--sm-basalt)]" />
              this date
            </label>
            <label className="inline-flex min-h-6 items-center gap-2 text-sm text-basalt tabular-nums">
              <input type="radio" name={name} checked={applyToAll} onChange={() => onChange(true)} className="size-4 accent-[var(--sm-basalt)]" />
              all {series.total} dates
            </label>
          </div>
          {applyToAll && <p className="mt-1 text-xs text-ash">Title, dates and web address stay as they are on each date.</p>}
        </fieldset>
      )}
    </div>
  );
}
