"use client";

import * as React from "react";
import Link from "next/link";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { FilterSelect } from "@/components/admin/kit/filter-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { useRovingFocus } from "@/components/admin/kit/use-roving";
import { SingleKeysContext } from "@/components/admin/kit/use-shortcuts";
import { formatDay } from "@/lib/admin/format";
import type { NeighborhoodBuckets, NeighborhoodRow, NoneGroup, PickRow, SuggestablePlace, SureGroup } from "@/lib/venues/neighborhood-suggest";
import { acceptNeighborhoodSuggestions, addNeighborhoodAndSet, setPlacesNeighborhood } from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { listWords, plural } from "@/lib/venues/words";
import { LINK, RowSelect, TextInput } from "./controls";
import { useDecisionRow } from "./decision-row";
import { useVenueAction } from "./use-venue-action";

type Bucket = "all" | "sure" | "pick" | "none";

type Row =
  | { type: "sure"; key: string; group: SureGroup }
  | { type: "pick"; key: string; row: PickRow }
  | { type: "none"; key: string; group: NoneGroup };

const SOURCE: Record<SureGroup["source"], (g: SureGroup) => string> = {
  "zip-majority": (g) => `already used by ${plural(g.usedBy, "place")} here`,
  zip: () => "from the ZIP",
  city: () => "from the town",
};

function labelOf(slug: string, neighborhoods: readonly NeighborhoodRow[]): string {
  return neighborhoods.find((n) => n.slug === slug)?.label ?? slug;
}

function placeWithNext(place: SuggestablePlace, now: Date): string {
  return place.nextDate ? `${place.name.trim()} (next ${formatDay(place.nextDate, now)})` : place.name.trim();
}

/**
 * Places without a neighborhood in three buckets: sure (grouped by ZIP), pick one of two, and
 * none fits. Suggestions are dashed chips until set. Nothing is added to the neighborhood list
 * without the owner confirming it, since that changes the public area filter.
 * Keys on a focused row: Enter accepts, 1 and 2 pick, s sets for the whole ZIP group, j and k move.
 * The suggested action (data-decision-primary) is "Accept all" when anything is sure, else the
 * first "Add ... and set" (which only opens its confirm); with only picks there is none.
 */
export function NeighborhoodBucketsView({
  buckets,
  neighborhoods,
  now,
  decisionKey,
  showFilter = true,
}: {
  buckets: NeighborhoodBuckets;
  neighborhoods: NeighborhoodRow[];
  now: string;
  decisionKey?: string;
  showFilter?: boolean;
}) {
  const [bucket, setBucket] = React.useState<Bucket>("all");
  const [adding, setAdding] = React.useState<NoneGroup | null>(null);
  const [label, setLabel] = React.useState("");
  const { run, busy } = useVenueAction();
  const { primaryKeys, extra } = useDecisionRow();
  const singleKeys = React.useContext(SingleKeysContext);
  const nowDate = new Date(now);
  const active = neighborhoods.filter((n) => n.isActive);
  const sureCount = buckets.sure.reduce((n, g) => n + g.places.length, 0);
  const noneCount = buckets.none.reduce((n, g) => n + g.places.length, 0);
  const filters: { value: Bucket; label: string; count: number }[] = [
    { value: "all", label: "All", count: buckets.total },
    { value: "sure", label: "Sure", count: sureCount },
    { value: "pick", label: "Pick one of two", count: buckets.pick.length },
    { value: "none", label: "No neighborhood fits", count: noneCount },
  ];

  const rows: Row[] = [
    ...(bucket === "all" || bucket === "sure" ? buckets.sure.map((group) => ({ type: "sure" as const, key: group.key, group })) : []),
    ...(bucket === "all" || bucket === "pick" ? buckets.pick.map((row) => ({ type: "pick" as const, key: row.place.id, row })) : []),
    ...(bucket === "all" || bucket === "none" ? buckets.none.map((group) => ({ type: "none" as const, key: group.key, group })) : []),
  ];
  const roving = useRovingFocus<HTMLLIElement>({ count: rows.length });
  const indexOf = new Map(rows.map((r, i) => [r.key, i]));

  const setFor = (ids: string[], slug: string | null) => run(`set:${ids.join(",")}`, () => setPlacesNeighborhood({ venueIds: ids, slug, decisionKey }));
  const openAdd = (group: NoneGroup) => {
    setLabel(group.proposal.label);
    setAdding(group);
  };

  const onRowKey = (event: React.KeyboardEvent<HTMLLIElement>, row: Row) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (row.type === "sure" && (event.key === "Enter" || (singleKeys && key === "s"))) {
      event.preventDefault();
      void setFor(row.group.places.map((p) => p.id), row.group.slug);
    } else if (row.type === "pick" && singleKeys && /^[1-9]$/.test(event.key)) {
      const slug = row.row.candidates[Number(event.key) - 1];
      if (!slug) return;
      event.preventDefault();
      void setFor([row.row.place.id], slug);
    } else if (row.type === "pick" && event.key === "Enter" && row.row.candidates[0]) {
      event.preventDefault();
      void setFor([row.row.place.id], row.row.candidates[0]);
    } else if (row.type === "none" && event.key === "Enter") {
      event.preventDefault();
      openAdd(row.group);
    }
  };

  const rowProps = (row: Row) => {
    const props = roving.getItemProps(indexOf.get(row.key)!);
    return {
      ref: props.ref,
      tabIndex: props.tabIndex,
      onFocus: props.onFocus,
      onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => onRowKey(e, row),
      className: "border-b border-seam px-4 py-3 outline-offset-[-2px] focus-visible:bg-lilac-tint",
    };
  };

  if (buckets.total === 0) {
    return <Empty>Every place has a neighborhood.</Empty>;
  }

  const otherSelect = (place: SuggestablePlace) => (
    <RowSelect aria-label={`Other neighborhood for ${place.name}`} value="" onChange={(e) => e.target.value && void setFor([place.id], e.target.value)}>
      <option value="">Other</option>
      {active.map((n) => (
        <option key={n.slug} value={n.slug}>
          {n.label}
        </option>
      ))}
    </RowSelect>
  );

  return (
    <div className="space-y-6">
      {showFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Bucket>
            label="Show"
            value={bucket}
            onChange={setBucket}
            className="hidden md:inline-flex"
            options={filters}
          />
          <FilterSelect
            label="Show"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as Bucket)}
            className="md:hidden"
            options={filters.map((f) => ({ value: f.value, label: `${f.label}, ${f.count}` }))}
          />
          <Link href="/admin/venues?view=neighborhood-list" className={cn(LINK, "text-sm")}>
            Neighborhood list
          </Link>
        </div>
      )}

      <ul aria-label="Places without a neighborhood" onKeyDown={roving.onKeyDown} className="border-t border-seam">
        {rows.length === 0 && (
          <li className="px-4 py-6 text-[15px]/[23px] text-basalt">Nothing in this group.</li>
        )}
        {rows.map((row, i) => {
          const previous = rows[i - 1]?.type;
          const heading =
            row.type !== previous ? (
              <li key={`h-${row.type}`} className="flex min-h-10 flex-wrap items-center justify-between gap-3 bg-fog px-4 py-2">
                <h2 className="font-text text-[15px]/[20px] font-semibold text-basalt">
                  {row.type === "sure" ? "Sure" : row.type === "pick" ? "Pick one of two" : "No neighborhood fits"}
                </h2>
                {row.type === "sure" && buckets.sure.length > 0 && (
                  <AdminButton
                    variant="ink"
                    size="sm"
                    keys={primaryKeys}
                    data-decision-primary
                    busy={busy === "accept"}
                    busyLabel="Setting"
                    disabled={!!busy}
                    onClick={() =>
                      void run("accept", () =>
                        acceptNeighborhoodSuggestions({ groups: buckets.sure.map((g) => ({ venueIds: g.places.map((p) => p.id), slug: g.slug })), decisionKey })
                      )
                    }
                  >
                    Accept all {sureCount}
                  </AdminButton>
                )}
              </li>
            ) : null;
          return (
            <React.Fragment key={row.key}>
              {heading}
              {row.type === "sure" && <SureRow group={row.group} neighborhoods={neighborhoods} now={nowDate} busy={busy} onSet={setFor} rowProps={rowProps(row)} />}
              {row.type === "pick" && (
                <li {...rowProps(row)} aria-label={`${row.row.place.name}, pick a neighborhood`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <Link href={`/admin/venues/${row.row.place.id}`} className="text-sm font-medium text-basalt hover:underline">
                        {row.row.place.name}
                      </Link>
                      <p className="text-xs text-ash">
                        {row.row.place.address}, {row.row.place.city} {row.row.place.zip}
                        {row.row.place.nextDate ? `, next ${formatDay(row.row.place.nextDate, nowDate)}` : ""}
                      </p>
                      {row.row.note && <p className="mt-0.5 text-xs text-ash">{row.row.note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.row.candidates.map((slug, n) => (
                        <ToggleChip key={slug} dashed pressed={false} disabled={!!busy} onPressedChange={() => void setFor([row.row.place.id], slug)}>
                          <KeyHint keys={String(n + 1)} />
                          {labelOf(slug, neighborhoods)}
                        </ToggleChip>
                      ))}
                      {otherSelect(row.row.place)}
                    </div>
                  </div>
                </li>
              )}
              {row.type === "none" && (
                <li {...rowProps(row)} aria-label={`${listWords(row.group.towns)}: ${plural(row.group.places.length, "place")}, no neighborhood fits`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-basalt">
                        {listWords(row.group.towns)}: {plural(row.group.places.length, "place")}
                      </p>
                      <p className="text-xs text-ash">{listWords(row.group.places.slice(0, 3).map((p) => placeWithNext(p, nowDate)))}{row.group.places.length > 3 ? `, and ${row.group.places.length - 3} more` : ""}</p>
                    </div>
                    <AdminButton
                      variant="outline"
                      size="sm"
                      keys={buckets.sure.length === 0 && row.group.key === buckets.none[0]?.key ? primaryKeys : undefined}
                      data-decision-primary={buckets.sure.length === 0 && row.group.key === buckets.none[0]?.key ? true : undefined}
                      disabled={!!busy}
                      onClick={() => openAdd(row.group)}
                    >
                      {row.group.inactive ? "Turn on" : "Add"} &ldquo;{row.group.proposal.label}&rdquo; and set for {row.group.places.length}
                    </AdminButton>
                  </div>
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ul>
      {(bucket === "all" || bucket === "none") && buckets.none.length > 0 && (
        <p className="max-w-[72ch] text-sm text-ash">Adding a neighborhood also adds it to the public area filter and to subscriber area choices.</p>
      )}
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}

      <AdminDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        title="Add a neighborhood?"
        description="It appears in the public area filter and in subscriber area choices, and these places are filed under it."
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setAdding(null)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="ink"
              disabled={!label.trim()}
              busy={busy === "add"}
              busyLabel="Adding"
              onClick={() =>
                adding &&
                void run("add", () => addNeighborhoodAndSet({ label: label.trim(), venueIds: adding.places.map((p) => p.id), decisionKey }), {
                  onDone: () => setAdding(null),
                })
              }
            >
              Add and set for {adding?.places.length ?? 0}
            </AdminButton>
          </>
        }
      >
        {adding && (
          <div className="space-y-4">
            <div>
              <label htmlFor="new-neighborhood" className="block text-sm font-medium text-basalt">
                Name
              </label>
              <TextInput id="new-neighborhood" data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1.5" />
            </div>
            <ul className="space-y-1 text-sm text-basalt">
              {adding.places.map((p) => (
                <li key={p.id}>
                  {p.name}, <span className="text-ash">{p.city}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminDialog>
    </div>
  );
}

function SureRow({
  group,
  neighborhoods,
  now,
  busy,
  onSet,
  rowProps,
}: {
  group: SureGroup;
  neighborhoods: readonly NeighborhoodRow[];
  now: Date;
  busy: string | null;
  onSet: (ids: string[], slug: string | null) => Promise<boolean>;
  rowProps: React.LiHTMLAttributes<HTMLLIElement> & { ref: (node: HTMLLIElement | null) => void };
}) {
  const [open, setOpen] = React.useState(false);
  const label = labelOf(group.slug, neighborhoods);
  const ids = group.places.map((p) => p.id);
  const listId = React.useId();
  return (
    <li {...rowProps} aria-label={`${group.zip} ${group.town}, ${plural(group.places.length, "place")}: ${label}, ${SOURCE[group.source](group)}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-12 font-display text-sm font-bold text-basalt tabular-nums">{group.zip}</span>
          <span className="text-sm font-medium text-basalt">{group.town}</span>
          <span className="text-xs text-ash tabular-nums">{plural(group.places.length, "place")}</span>
          <span className="inline-flex items-center gap-2 text-xs text-ash">
            <span className="inline-flex min-h-6 items-center rounded-sm border border-dashed border-seam-strong px-2 text-sm whitespace-nowrap text-basalt">{label}</span>
            {SOURCE[group.source](group)}
          </span>
        </div>
        <AdminButton variant="outline" size="sm" keys="S" busy={busy === `set:${ids.join(",")}`} busyLabel="Setting" disabled={!!busy} onClick={() => void onSet(ids, group.slug)}>
          Set for {group.places.length}
        </AdminButton>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-0 sm:pl-16">
        <p className="text-xs text-ash">
          {listWords(group.places.slice(0, 2).map((p) => placeWithNext(p, now)))}
          {group.places.length > 2 ? `, and ${group.places.length - 2} more` : ""}
        </p>
        {group.places.length > 2 && (
          <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} className={cn(LINK, "text-xs")}>
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} className="mt-2 space-y-1 pl-0 text-sm sm:pl-16">
          {group.places.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/venues/${p.id}`} className="text-basalt hover:underline">
                {p.name}
              </Link>
              <span className="text-xs text-ash">, {p.address}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
