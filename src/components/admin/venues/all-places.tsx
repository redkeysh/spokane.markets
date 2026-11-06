import Link from "next/link";
import { Empty } from "@/components/admin/kit/empty";
import { GroupHeading, List, ListRow } from "@/components/admin/kit/list";
import { adminButtonClass } from "@/components/admin/kit/button";
import { compareTowns, stateOf, townName } from "@/lib/admin/regions";
import { addressProblems, pinProblem } from "@/lib/venues/place-check";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import { inUse, type DuplicateGroupPlan, type PlaceRecord } from "@/lib/venues/place-review";
import { spellingFixes } from "@/lib/venues/tidy";
import { plural, usesText } from "@/lib/venues/words";
import { LINK } from "./controls";
import { PlaceNeighborhoodSelect } from "./place-neighborhood-select";
import { StateDivider } from "./state-divider";

type Work = { text: string; href: string; link: string };

/** At most one thing to fix per place, the most useful first. */
function needsWork(place: PlaceRecord, duplicateOf: Map<string, string>): Work | null {
  const other = duplicateOf.get(place.id);
  if (other) return { text: `Looks like the same place as ${other}.`, href: "/admin/venues?view=duplicates", link: "Review" };
  const fix = spellingFixes(place)[0];
  if (fix) return { text: `Spelled "${fix.before}".`, href: "/admin/venues?view=spelling", link: "Fix spelling" };
  const mismatch = addressProblems(place)[0];
  if (mismatch) return { text: mismatch.message, href: `/admin/venues/${place.id}`, link: "Edit" };
  const pin = pinProblem(place);
  if (pin && place.lat !== null) return { text: pin.message, href: `/admin/venues/${place.id}`, link: "Find on map" };
  return null;
}

function matches(place: PlaceRecord, q: string): boolean {
  const needle = q.toLowerCase();
  return [place.name, place.address, place.city, place.zip].some((v) => v.toLowerCase().includes(needle));
}

type Town = { name: string; places: PlaceRecord[] };

/** One place: name, address, what uses it, at most one thing to fix, and its neighborhood (under the text on phones). */
function PlaceRow({ place, work, neighborhoods }: { place: PlaceRecord; work: Work | null; neighborhoods: NeighborhoodRow[] }) {
  const select = (className: string) => (
    <PlaceNeighborhoodSelect placeId={place.id} placeName={place.name} value={place.neighborhood} neighborhoods={neighborhoods} className={className} />
  );
  return (
    <ListRow
      rowKey={place.id}
      href={`/admin/venues/${place.id}`}
      title={place.name}
      meta={
        <>
          <span>
            {place.address}, {place.zip}. <span className="tabular-nums">{inUse(place) ? usesText(place.uses) : "Nothing uses it"}</span>.
          </span>
          {work && (
            <span className="mt-0.5 block text-honey-ink">
              {work.text}{" "}
              <span data-row-action>
                <Link href={work.href} className={LINK}>
                  {work.link}
                </Link>
              </span>
            </span>
          )}
          <span data-row-action className="mt-2 block sm:hidden">
            {select("w-full")}
          </span>
        </>
      }
      action={select("hidden sm:block")}
    />
  );
}

function townsOf(places: PlaceRecord[]): Town[] {
  const towns = new Map<string, PlaceRecord[]>();
  for (const place of places) {
    const name = townName(place.city);
    towns.set(name, [...(towns.get(name) ?? []), place]);
  }
  return [...towns]
    .sort(([a], [b]) => compareTowns(a, b))
    .map(([name, list]) => ({ name, places: list.sort((a, b) => a.name.localeCompare(b.name)) }));
}

/**
 * Every active place by state, then by town in the order you drive I-90, with the state line
 * between Washington and Idaho. Each row: name, address, what uses it, the neighborhood (set in
 * place), and at most one thing to fix.
 */
export function AllPlaces({
  places,
  groups,
  neighborhoods,
  q,
}: {
  places: PlaceRecord[];
  groups: DuplicateGroupPlan[];
  neighborhoods: NeighborhoodRow[];
  q: string;
}) {
  const duplicateOf = new Map<string, string>();
  for (const group of groups) {
    for (const record of group.records) {
      const other = group.records.find((r) => r.id !== record.id);
      if (other) duplicateOf.set(record.id, other.name.trim());
    }
  }
  const shown = places.filter((p) => !p.deletedAt && (!q || matches(p, q)));
  if (shown.length === 0) {
    return (
      <Empty
        detail={q ? "Search covers the name, address, town and ZIP." : undefined}
        action={q ? { label: "Clear search", href: "/admin/venues" } : undefined}
      >
        {q ? `No place matches "${q}".` : "No places yet."}
      </Empty>
    );
  }

  const wa = townsOf(shown.filter((p) => stateOf(p.city, p.state) !== "ID" && stateOf(p.city, p.state) !== null));
  const id = townsOf(shown.filter((p) => stateOf(p.city, p.state) === "ID"));
  const elsewhere = townsOf(shown.filter((p) => stateOf(p.city, p.state) === null));

  const town = (t: Town) => {
    const tidy = t.places.filter((p) => spellingFixes(p).length > 0).length;
    return (
      <li key={`town-${t.name}`}>
        <GroupHeading
          as="h2"
          fact={`${plural(t.places.length, "place")}${tidy ? `, ${tidy} to tidy` : ""}`}
          action={
            tidy ? (
              <Link href="/admin/venues?view=spelling" className={adminButtonClass({ variant: "quiet", size: "sm" })}>
                Fix spelling
              </Link>
            ) : undefined
          }
        >
          {t.name}
        </GroupHeading>
        <ul role="list" aria-label={t.name}>
          {t.places.map((place) => (
            <PlaceRow key={place.id} place={place} work={needsWork(place, duplicateOf)} neighborhoods={neighborhoods} />
          ))}
        </ul>
      </li>
    );
  };

  return (
    <List label="Places by town">
      {wa.map(town)}
      {wa.length > 0 && id.length > 0 && <StateDivider />}
      {id.map(town)}
      {elsewhere.map(town)}
    </List>
  );
}
