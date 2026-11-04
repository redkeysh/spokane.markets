import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { neighborhoodBuckets } from "@/lib/venues/neighborhood-suggest";
import { loadArchivedInUseIds, loadNeighborhoods, loadPlaceMemos, loadPlaceRecords, loadSnoozedKeys } from "@/lib/venues/place-data";
import { asSuggestable, loadArchivedInUse } from "@/lib/venues/place-decision-data";
import { addressMismatches, duplicateGroups, spellingRows, unusedPlaces } from "@/lib/venues/place-review";
import { AllPlaces } from "@/components/admin/venues/all-places";
import { ArchivedInUse, ArchivedPlaces } from "@/components/admin/venues/archived-in-use";
import { plural } from "@/lib/venues/words";
import { DuplicatesView } from "@/components/admin/venues/duplicates-view";
import { FindMissedDuplicate } from "@/components/admin/venues/find-missed-duplicate";
import { NeighborhoodBucketsView } from "@/components/admin/venues/neighborhood-buckets";
import { NeighborhoodList } from "@/components/admin/venues/neighborhood-list";
import { PlacesSearch } from "@/components/admin/venues/places-search";
import { SpellingTable } from "@/components/admin/venues/spelling-table";
import { UnusedPlaces } from "@/components/admin/venues/unused-places";
import { VenueDecisions } from "@/components/admin/venues/use-venue-action";
import { ViewHeader } from "@/components/admin/venues/view-header";
import { ViewSelect, ViewsNav } from "@/components/admin/venues/views-nav";
import { parseVenueView, viewLabel, viewTitle, type ViewCounts } from "@/components/admin/venues/views";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return { title: viewTitle(parseVenueView((await searchParams).view)) };
}

export default async function VenuesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const view = parseVenueView(params.view);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const now = new Date();

  const [records, neighborhoods, memos, snoozed, inUseArchived] = await Promise.all([
    loadPlaceRecords(now),
    loadNeighborhoods(),
    loadPlaceMemos(),
    loadSnoozedKeys(now),
    loadArchivedInUseIds(now),
  ]);
  const active = records.filter((r) => !r.deletedAt);
  const groups = duplicateGroups(records, memos);
  const missing = active.filter((r) => !r.neighborhood);
  const spelling = spellingRows(records);
  const unused = unusedPlaces(records, groups);
  const archived = records.filter((r) => r.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  const counts: ViewCounts = {
    all: active.length,
    duplicates: groups.length,
    "no-neighborhood": missing.length,
    spelling: spelling.length,
    unused: unused.length,
    "archived-in-use": inUseArchived.size,
    archived: archived.length,
  };
  const iso = now.toISOString();
  const newPlace = (
    <AdminLinkButton href="/admin/venues/new" variant="outline">
      New place
    </AdminLinkButton>
  );

  let header: React.ReactNode;
  let body: React.ReactNode;
  switch (view) {
    case "duplicates": {
      const recordCount = groups.reduce((n, g) => n + g.records.length, 0);
      header = (
        <ViewHeader
          title="Duplicates"
          fact={groups.length ? `${plural(groups.length, "group")}, ${plural(recordCount, "record")}` : undefined}
          actions={newPlace}
          description="Merging moves every event and market to the place you keep and archives the others. You can undo it."
        />
      );
      body = (
        <DuplicatesView
          plans={groups.filter((g) => !snoozed.has(g.key))}
          snoozed={groups.filter((g) => snoozed.has(g.key)).map((plan) => ({ plan, until: snoozed.get(plan.key)!.toISOString() }))}
          neighborhoods={neighborhoods}
          now={iso}
        />
      );
      break;
    }
    case "no-neighborhood":
      header = (
        <ViewHeader
          title="No neighborhood"
          fact={plural(missing.length, "place")}
          description="A place's neighborhood decides which area filter its events appear under on the site."
        />
      );
      body = (
        <NeighborhoodBucketsView buckets={neighborhoodBuckets(missing.map(asSuggestable), active.map(asSuggestable), neighborhoods)} neighborhoods={neighborhoods} now={iso} />
      );
      break;
    case "spelling":
      header = (
        <ViewHeader
          title="Spelling"
          fact={plural(spelling.length, "place")}
          description="Safe fixes only: capital letters, spacing, town names and state codes. Untick any you want to keep as it is."
        />
      );
      body = <SpellingTable rows={spelling} mismatches={addressMismatches(records)} />;
      break;
    case "unused":
      header = (
        <ViewHeader
          title="Not used"
          fact={plural(unused.length, "place")}
          description="No event and no market uses these. Archiving takes them out of every list and place picker, and can be undone."
        />
      );
      body = <UnusedPlaces rows={unused} />;
      break;
    case "archived-in-use":
      header = (
        <ViewHeader
          title="Archived, in use"
          fact={plural(inUseArchived.size, "place")}
          description="Archived places that an upcoming event or an active market still points at. Restore the place, or move its listings to the right one."
        />
      );
      body = <ArchivedInUse items={await loadArchivedInUse(records, inUseArchived, now)} now={iso} />;
      break;
    case "archived":
      header = <ViewHeader title="Archived" fact={plural(archived.length, "place")} description="Out of every list and place picker. Restore one to use it again." />;
      body = (
        <ArchivedPlaces
          places={archived.map((p) => ({ id: p.id, name: p.name, address: p.address, city: p.city, zip: p.zip, deletedAt: p.deletedAt, events: p.uses.events, markets: p.uses.markets }))}
        />
      );
      break;
    case "find-duplicate":
      header = (
        <ViewHeader
          title="Find a missed duplicate"
          description="Pick two or more places that are one place, then merge them. A merge made here also teaches the duplicate finder."
        />
      );
      body = <FindMissedDuplicate neighborhoods={neighborhoods} now={iso} />;
      break;
    case "neighborhood-list":
      header = <ViewHeader title="Neighborhood list" fact={plural(neighborhoods.length, "neighborhood")} />;
      body = <NeighborhoodList neighborhoods={neighborhoods} />;
      break;
    default:
      header = (
        <ViewHeader
          title="All places"
          fact={plural(active.length, "place")}
          actions={newPlace}
          description="By town, in the order you drive I-90, Washington before Idaho."
        />
      );
      body = (
        <div className="space-y-4">
          <PlacesSearch initial={q} />
          <AllPlaces places={active} groups={groups} neighborhoods={neighborhoods} q={q} />
        </div>
      );
  }

  return (
    <Screen className="xl:grid xl:grid-cols-[232px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
      <Pane label="Venue views" tone="fog" className="hidden border-r border-seam xl:block">
        <ViewsNav current={view} counts={counts} />
      </Pane>
      <Pane label={viewLabel(view)} className="h-full">
        <VenueDecisions>
          <div className="mx-auto w-full max-w-[1184px] space-y-6">
            <ViewSelect current={view} counts={counts} className="xl:hidden" />
            {header}
            {body}
          </div>
        </VenueDecisions>
      </Pane>
    </Screen>
  );
}
