"use client";

import * as React from "react";
import Link from "next/link";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { List, ListRow } from "@/components/admin/kit/list";
import { Menu } from "@/components/admin/kit/menu";
import { STATUS_MARKS, StatusMark } from "@/components/admin/kit/status-mark";
import { formatDay, formatFullDate, pacificDate } from "@/lib/admin/format";
import type { ArchivedInUseItem, ListingRef } from "@/lib/venues/place-decision-data";
import { plural, usesText } from "@/lib/venues/words";
import type { PlaceSearchRow } from "@/app/admin/_actions/venues";
import { movePlaceListings, restorePlaces } from "@/app/admin/_actions/venues";
import { eventMark, marketMark } from "./listing-status";
import { useDecisionRow } from "./decision-row";
import { PlacePicker } from "./place-picker";
import { useVenueAction } from "./use-venue-action";

function listingHref(listing: ListingRef): string {
  return listing.kind === "event" ? `/admin/events/${listing.id}` : `/admin/markets/${listing.id}`;
}

function listingMark(listing: ListingRef) {
  return listing.kind === "event" ? eventMark(listing.status) : marketMark(listing.status);
}

function Listing({ listing, now }: { listing: ListingRef; now: Date }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm">
      <span className="w-24 shrink-0 text-ash tabular-nums">{listing.date ? formatDay(listing.date, now) : "Market"}</span>
      <Link href={listingHref(listing)} className="min-w-0 font-medium text-basalt hover:underline">
        {listing.title}
      </Link>
      <StatusMark status={listingMark(listing)} size="sm" />
    </li>
  );
}

/** "Sat Nov 7 Holiday Bazaar (Published), Valley Market (market, Verified)". */
function listingsLine(listings: ListingRef[], now: Date): string {
  return listings
    .map((l) =>
      l.date ? `${formatDay(l.date, now)} ${l.title} (${STATUS_MARKS[listingMark(l)].word})` : `${l.title} (market, ${STATUS_MARKS[listingMark(l)].word})`
    )
    .join(", ");
}

function archivedOn(deletedAt: Date | string | null): string {
  return deletedAt ? `Archived ${formatFullDate(pacificDate(new Date(deletedAt)))}.` : "";
}

/** Picks the place an archived place's listings move to: a look-alike, or any place found by search. */
function MoveListingsDialog({
  item,
  open,
  onOpenChange,
  decisionKey,
}: {
  item: ArchivedInUseItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decisionKey?: string;
}) {
  const first = item.candidates[0];
  const [target, setTarget] = React.useState<{ id: string; name: string } | null>(first ? { id: first.id, name: first.name } : null);
  const { run, busy } = useVenueAction();
  const { place } = item;
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="list"
      title={`Move ${plural(item.listings.length, "listing")} from ${place.name}?`}
      description="They will point at the place you pick. The archived place stays archived. You can undo it."
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton
            variant="ink"
            disabled={!target}
            busy={busy === "move"}
            busyLabel="Moving"
            onClick={() =>
              target && void run("move", () => movePlaceListings({ fromId: place.id, toId: target.id, decisionKey }), { onDone: () => onOpenChange(false) })
            }
          >
            {target ? `Move to ${target.name}` : "Pick a place"}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        {item.candidates.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-basalt">Looks like the same place</legend>
            <div className="space-y-2">
              {item.candidates.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`move-${place.id}`}
                    checked={target?.id === c.id}
                    onChange={() => setTarget({ id: c.id, name: c.name })}
                    className="mt-0.5 size-4 cursor-pointer accent-basalt"
                  />
                  <span>
                    <span className="font-medium text-basalt">{c.name}</span>
                    <span className="block text-xs text-ash">
                      {c.address}, {c.city} {c.zip}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <PlacePicker
          id={`move-search-${place.id}`}
          label={item.candidates.length ? "Or find another place" : "Find the place"}
          excludeIds={[place.id]}
          autoFocus={item.candidates.length === 0}
          onPick={(row: PlaceSearchRow) => setTarget({ id: row.id, name: row.name })}
        />
        {target && !item.candidates.some((c) => c.id === target.id) && (
          <p className="text-sm text-basalt">
            Moving to <span className="font-medium">{target.name}</span>.
          </p>
        )}
      </div>
    </AdminDialog>
  );
}

/**
 * One archived place still in use, as a decision pane: what uses it, then the suggested action.
 * When an active place looks like the same place, moving the listings there is the suggestion
 * (restoring would list the place twice); otherwise restoring it is.
 */
export function ArchivedInUseItemView({ item, now, decisionKey, headingLevel = "h2" }: { item: ArchivedInUseItem; now: string; decisionKey?: string; headingLevel?: "h2" | "h3" }) {
  const [moving, setMoving] = React.useState(false);
  const { run, busy } = useVenueAction();
  const { primaryKeys, extra } = useDecisionRow();
  const nowDate = new Date(now);
  const Heading = headingLevel;
  const { place } = item;
  const candidate = item.candidates[0];
  const restore = () => run("restore", () => restorePlaces({ venueIds: [place.id], decisionKey }));

  return (
    <section aria-label={place.name} className="space-y-3 border-b border-seam py-5 first:pt-2">
      <div>
        <Heading className="font-text text-[15px]/[20px] font-semibold text-basalt">
          <Link href={`/admin/venues/${place.id}`} className="hover:underline">
            {place.name}
          </Link>
        </Heading>
        <p className="text-xs text-ash">
          {place.address}, {place.city} {place.zip}. {archivedOn(place.deletedAt)}
        </p>
      </div>
      <ul aria-label={`What still uses ${place.name}`} className="divide-y divide-seam">
        {item.listings.map((listing) => (
          <Listing key={`${listing.kind}-${listing.id}`} listing={listing} now={nowDate} />
        ))}
      </ul>
      {candidate && (
        <p className="max-w-[72ch] text-sm text-ash">
          {candidate.name}, {candidate.address}, {candidate.city} {candidate.zip}, looks like the same place and is not archived.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {candidate ? (
          <>
            <AdminButton
              variant="ink"
              keys={primaryKeys}
              data-decision-primary
              busy={busy === "move"}
              busyLabel="Moving"
              disabled={!!busy}
              onClick={() => void run("move", () => movePlaceListings({ fromId: place.id, toId: candidate.id, decisionKey }))}
            >
              Move its listings to {candidate.name}
            </AdminButton>
            <AdminButton variant="outline" disabled={!!busy} onClick={() => setMoving(true)}>
              Move somewhere else...
            </AdminButton>
            <AdminButton variant="quiet" busy={busy === "restore"} busyLabel="Restoring" disabled={!!busy} onClick={() => void restore()}>
              Restore
            </AdminButton>
          </>
        ) : (
          <>
            <AdminButton variant="ink" keys={primaryKeys} data-decision-primary busy={busy === "restore"} busyLabel="Restoring" disabled={!!busy} onClick={() => void restore()}>
              Restore
            </AdminButton>
            <AdminButton variant="outline" disabled={!!busy} onClick={() => setMoving(true)}>
              Move its listings to...
            </AdminButton>
          </>
        )}
        {extra}
      </div>
      <MoveListingsDialog item={item} open={moving} onOpenChange={setMoving} decisionKey={decisionKey} />
    </section>
  );
}

function ArchivedInUseRow({ item, now }: { item: ArchivedInUseItem; now: Date }) {
  const [moving, setMoving] = React.useState(false);
  const { run, busy } = useVenueAction();
  const { place } = item;
  const candidate = item.candidates[0];
  const restore = () => void run("restore", () => restorePlaces({ venueIds: [place.id] }));
  const actions = (
    <>
      {candidate ? (
        <AdminButton variant="outline" size="sm" disabled={!!busy} onClick={() => setMoving(true)}>
          Move to {candidate.name}
        </AdminButton>
      ) : (
        <AdminButton variant="outline" size="sm" busy={busy === "restore"} busyLabel="Restoring" disabled={!!busy} onClick={restore}>
          Restore
        </AdminButton>
      )}
      <Menu
        label={`More for ${place.name}`}
        items={
          candidate
            ? [
                { label: "Move somewhere else", description: "Pick the place from a search.", onSelect: () => setMoving(true) },
                { label: "Restore", description: "Back in every list and place picker.", onSelect: restore },
              ]
            : [{ label: "Move its listings", description: "Pick the place they belong to.", onSelect: () => setMoving(true) }]
        }
      />
    </>
  );
  return (
    <>
      <ListRow
        rowKey={place.id}
        href={`/admin/venues/${place.id}`}
        title={place.name}
        archived
        meta={
          <>
            <span className="block">
              {place.address}, {place.city} {place.zip}. {archivedOn(place.deletedAt)}
            </span>
            <span className="block">Used by {listingsLine(item.listings, now)}.</span>
            {candidate && <span className="block">Looks like {candidate.name}, which is not archived.</span>}
            <span data-row-action className="mt-2 flex items-center gap-1 sm:hidden">
              {actions}
            </span>
          </>
        }
        action={<span className="hidden items-center gap-1 sm:flex">{actions}</span>}
      />
      <MoveListingsDialog item={item} open={moving} onOpenChange={setMoving} />
    </>
  );
}

/** Archived places an upcoming event or an active market still uses, one row each. */
export function ArchivedInUse({ items, now }: { items: ArchivedInUseItem[]; now: string }) {
  if (items.length === 0) return <Empty>No archived place is still in use.</Empty>;
  const nowDate = new Date(now);
  return (
    <List label="Archived places still in use">
      {items.map((item) => (
        <ArchivedInUseRow key={item.place.id} item={item} now={nowDate} />
      ))}
    </List>
  );
}

type ArchivedPlace = { id: string; name: string; address: string; city: string; zip: string; deletedAt: Date | null; events: number; markets: number };

function ArchivedPlaceRow({ place }: { place: ArchivedPlace }) {
  const { run, busy } = useVenueAction();
  const holds = place.events || place.markets ? ` Still holds ${usesText(place)}.` : "";
  return (
    <ListRow
      rowKey={place.id}
      href={`/admin/venues/${place.id}`}
      title={place.name}
      archived
      meta={
        <>
          {place.address}, {place.city} {place.zip}. {archivedOn(place.deletedAt)}
          {holds}
        </>
      }
      action={
        <AdminButton variant="outline" size="sm" busy={busy === "restore"} busyLabel="Restoring" disabled={!!busy} onClick={() => void run("restore", () => restorePlaces({ venueIds: [place.id] }))}>
          Restore
        </AdminButton>
      }
    />
  );
}

/** Every archived place, greyed, with Restore. */
export function ArchivedPlaces({ places }: { places: ArchivedPlace[] }) {
  if (places.length === 0) return <Empty>No place is archived.</Empty>;
  return (
    <List label="Archived places">
      {places.map((p) => (
        <ArchivedPlaceRow key={p.id} place={p} />
      ))}
    </List>
  );
}
