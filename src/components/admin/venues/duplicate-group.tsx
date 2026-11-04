"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { formatDay, formatTimestamp } from "@/lib/admin/format";
import { realCoords } from "@/lib/venues/match";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import {
  defaultChoices,
  keepRecordChoices,
  mergePlan,
  mergeResultLine,
  type DuplicateGroupPlan,
  type MergeChoices,
} from "@/lib/venues/place-review";
import {
  bringBackPlaceDecision,
  markDifferentPlaces,
  mergePlaces,
  putPlaceOffLater,
  type VenueActionResult,
} from "@/app/admin/_actions/venues";
import { useDecisionRow } from "./decision-row";
import { MergeTable } from "./merge-table";
import { PlaceMap } from "./place-map";
import { plural, usesText } from "@/lib/venues/words";
import { useVenueAction } from "./use-venue-action";

/** "3 records, same street, 40 m apart". */
export function groupFact(plan: DuplicateGroupPlan): string {
  const where = plan.safe
    ? "same address"
    : plan.addressesDiffer
      ? "addresses differ"
      : "same street";
  const apart =
    plan.farthestMeters !== null
      ? `, ${Math.round(plan.farthestMeters)} m apart`
      : "";
  return `${plural(plan.records.length, "record")}, ${where}${apart}`;
}

/**
 * One duplicate group: what happens here next, the merge table, the result, and Merge,
 * Different places and Later. While focus is inside the group, 1 to 9 choose the record to keep,
 * m merges, d keeps them apart, l puts it off until tomorrow (Shift+L until next Monday). On
 * phones the result and the buttons stick to the bottom while the group is on screen.
 */
export function DuplicateGroup({
  plan,
  neighborhoods,
  primary = true,
  onFocusGroup,
  snoozedUntil,
  byHand = false,
  headingLevel = "h2",
  now,
  onDone,
  showLater = true,
}: {
  plan: DuplicateGroupPlan;
  neighborhoods: readonly NeighborhoodRow[];
  /** Whether Merge is this pane's one filled button. */
  primary?: boolean;
  onFocusGroup?: () => void;
  /** ISO time the group comes back, when it was put off. */
  snoozedUntil?: string | null;
  /** Picked by hand: merging also remembers the records as one place. */
  byHand?: boolean;
  headingLevel?: "h2" | "h3";
  /** ISO time of the request, so dates read the same on the server and the client. */
  now: string;
  /** After a merge, Different places or Later succeeded. */
  onDone?: (result: Extract<VenueActionResult, { ok: true }>) => void;
  /** Off inside a decision frame that has its own Later. */
  showLater?: boolean;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const groupId = React.useId();
  const [choices, setChoices] = React.useState<MergeChoices>(() =>
    defaultChoices(plan),
  );
  const { run, busy } = useVenueAction();
  const decisionRow = useDecisionRow();
  const Heading = headingLevel;
  const planned = mergePlan(plan.records, choices);
  const keep =
    plan.records.find((r) => r.id === planned.keepId) ?? plan.records[0];
  const title = keep.name.trim();
  const result = mergeResultLine(plan.records, choices);
  const nowDate = new Date(now);
  const pins = plan.addressesDiffer
    ? plan.records.flatMap((r, i) => {
        const at = realCoords(r);
        return at
          ? [
              {
                ...at,
                title: `${i + 1}. ${r.name}, ${r.address}`,
                label: String(i + 1),
              },
            ]
          : [];
      })
    : [];

  const done = {
    onDone: (result: Extract<VenueActionResult, { ok: true }>) =>
      onDone?.(result),
  };
  const merge = () =>
    run(
      "merge",
      () => mergePlaces({ ...planned, decisionKey: plan.key, byHand }),
      done,
    );
  const different = () =>
    run(
      "different",
      () =>
        markDifferentPlaces({
          ids: plan.records.map((r) => r.id),
          decisionKey: plan.key,
          title,
        }),
      done,
    );
  const putOff = (until: "tomorrow" | "next-monday") =>
    run("later", () => putPlaceOffLater({ key: plan.key, title, until }), done);

  useShortcuts(
    {
      ...Object.fromEntries(
        plan.records
          .slice(0, 9)
          .map((r, i) => [
            String(i + 1),
            () => setChoices((c) => keepRecordChoices(c, r.id)),
          ]),
      ),
      m: () => void merge(),
      d: () => void different(),
      ...(showLater
        ? {
            l: () => void putOff("tomorrow"),
            "shift+l": () => void putOff("next-monday"),
          }
        : {}),
    },
    { scope: ref, enabled: !snoozedUntil && !busy },
  );

  if (snoozedUntil) {
    return (
      <section
        aria-label={`${title}, put off`}
        className="flex flex-wrap items-center justify-between gap-3 border-b border-seam py-3"
      >
        <div className="min-w-0">
          <Heading className="font-text text-[15px]/[20px] font-semibold text-basalt">
            {title}
          </Heading>
          <p className="text-xs text-ash">
            {groupFact(plan)}. Put off until{" "}
            {formatTimestamp(new Date(snoozedUntil))}.
          </p>
        </div>
        <AdminButton
          variant="quiet"
          size="sm"
          busy={busy === "back"}
          busyLabel="Bringing back"
          onClick={() =>
            run("back", () => bringBackPlaceDecision({ key: plan.key, title }))
          }
        >
          Bring back
        </AdminButton>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      aria-labelledby={`${groupId}-title`}
      onFocus={onFocusGroup}
      className="space-y-4 border-b border-seam py-6 first:pt-2"
    >
      <div>
        <p className="text-xs text-ash">
          {plan.next ? (
            <>
              Next here:{" "}
              <span className="tabular-nums">
                {formatDay(plan.next.date, nowDate)}
              </span>
              , {plan.next.title}
            </>
          ) : (
            "Nothing coming up at these records."
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Heading
            id={`${groupId}-title`}
            className="font-text text-[15px]/[20px] font-semibold text-basalt"
          >
            {plan.records[0].name.trim()}
          </Heading>
          <p className="text-xs text-ash tabular-nums">{groupFact(plan)}</p>
        </div>
      </div>

      {plan.addressesDiffer && (
        <div className="flex flex-wrap items-start gap-4">
          {pins.length > 1 && (
            <PlaceMap
              pins={pins}
              label={`Map of the ${plan.records.length} records of ${title}`}
              className="h-40 w-full max-w-[360px]"
            />
          )}
          <p className="max-w-[48ch] text-sm text-ash">
            The street numbers differ, so these may be two places. Check the{" "}
            {pins.length > 1 ? "pins" : "addresses"} before merging. Never
            merged in bulk.
          </p>
        </div>
      )}

      <MergeTable
        groupId={groupId}
        records={plan.records}
        choices={choices}
        onChange={setChoices}
        neighborhoods={neighborhoods}
      />

      <div className="sm-sticky-bottom space-y-3 max-md:-mx-4 max-md:border-t max-md:border-seam max-md:bg-sheet max-md:px-4 max-md:py-3 md:static">
        <p className="max-w-[72ch] text-sm text-basalt">
          <span className="font-medium">Result:</span> {result.line}, with{" "}
          {usesText({ events: result.events, markets: result.markets })}.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <AdminButton
            variant={primary ? "ink" : "outline"}
            keys={decisionRow.primaryKeys ?? "M"}
            data-decision-primary
            busy={busy === "merge"}
            busyLabel="Merging"
            disabled={!!busy}
            onClick={() => void merge()}
          >
            Merge {plan.records.length} into one
          </AdminButton>
          <AdminButton
            variant="outline"
            keys="D"
            busy={busy === "different"}
            busyLabel="Saving"
            disabled={!!busy}
            onClick={() => void different()}
          >
            Different places
          </AdminButton>
          {showLater && (
            <AdminButton
              variant="quiet"
              keys="L"
              busy={busy === "later"}
              busyLabel="Putting off"
              disabled={!!busy}
              onClick={() => void putOff("tomorrow")}
            >
              Later
            </AdminButton>
          )}
          {decisionRow.extra}
        </div>
      </div>
    </section>
  );
}
