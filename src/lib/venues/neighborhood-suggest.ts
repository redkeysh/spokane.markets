import { findTown, townName, TOWNS } from "@/lib/admin/regions";
import { slugify } from "@/lib/utils";
import { ZIP_TOWNS } from "./place-check";

/**
 * Neighborhood suggestions for places without one, in three buckets: sure (the ZIP's places
 * mostly use one neighborhood, the ZIP lies in one, or the town is named in one), pick one of two
 * (ZIPs that straddle two neighborhoods), and none fits (a neighborhood would have to be added).
 * Nothing here writes: adding a neighborhood changes the public area filter, so every suggestion
 * waits for the owner.
 */

export type NeighborhoodRow = { slug: string; label: string; isActive: boolean };

export type SuggestablePlace = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string | null;
  /** Pacific date of the next event here, "2026-11-07". */
  nextDate?: string | null;
};

/** ZIPs that straddle two neighborhoods, most likely first. */
export const TWO_NEIGHBORHOOD_ZIPS: Record<string, readonly string[]> = {
  "99201": ["downtown", "kendall-yards"],
  "99202": ["downtown", "south-hill"],
  "99207": ["north-spokane", "garland"],
  "99217": ["north-spokane", "spokane-valley"],
};

/** ZIPs that lie inside one neighborhood. */
export const ZIP_NEIGHBORHOODS: Record<string, string> = {
  "99203": "south-hill",
  "99223": "south-hill",
  "99205": "garland",
  "99208": "north-spokane",
  "99218": "north-spokane",
  "99021": "north-spokane",
  "99206": "spokane-valley",
  "99212": "spokane-valley",
  "99216": "spokane-valley",
  "99037": "spokane-valley",
  "99016": "spokane-valley",
  "99019": "liberty-lake",
  "99004": "cheney",
  "99001": "cheney",
};

/** The neighborhood to propose adding when none fits, by town. Towns not listed propose their own name. */
const PROPOSED_BY_TOWN: Record<string, string> = {
  Hayden: "North Idaho",
  Rathdrum: "North Idaho",
  Athol: "North Idaho",
  "Spirit Lake": "North Idaho",
  Blanchard: "North Idaho",
  Chewelah: "North of Spokane",
  Colbert: "North of Spokane",
  Addy: "North of Spokane",
  Newport: "North of Spokane",
};

/** Slugs the site already uses for a town under another name. */
const SLUG_ALIASES: Record<string, string[]> = {
  "Coeur d'Alene": ["cda"],
};

export type Suggestion =
  | { bucket: "sure"; slug: string; source: "zip-majority"; usedBy: number }
  | { bucket: "sure"; slug: string; source: "zip" | "city" }
  /** No candidates: a Spokane place whose ZIP says nothing; the owner picks from the list. */
  | { bucket: "pick"; candidates: string[] }
  | { bucket: "none"; proposal: { label: string; slug: string } };

function zip5(zip: string): string {
  return zip.trim().slice(0, 5);
}

function words(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The active neighborhood whose label names this town ("Spokane Valley / Millwood" for Millwood). Spokane itself needs a ZIP. */
function neighborhoodForTown(city: string, active: Map<string, NeighborhoodRow>): string | null {
  const town = findTown(city);
  if (!town || town.name === "Spokane") return null;
  for (const slug of SLUG_ALIASES[town.name] ?? []) if (active.has(slug)) return slug;
  const target = words(town.name);
  for (const row of active.values()) {
    if (row.label.split("/").some((part) => words(part) === target)) return row.slug;
  }
  return null;
}

/** The most used neighborhood among other places in the ZIP, when it holds a strict majority of them. */
function zipMajority(
  place: SuggestablePlace,
  others: readonly SuggestablePlace[],
  active: Map<string, NeighborhoodRow>
): { slug: string; usedBy: number } | null {
  const zip = zip5(place.zip);
  const counts = new Map<string, number>();
  let total = 0;
  for (const other of others) {
    if (other.id === place.id || !other.neighborhood || zip5(other.zip) !== zip) continue;
    total += 1;
    counts.set(other.neighborhood, (counts.get(other.neighborhood) ?? 0) + 1);
  }
  const [slug, usedBy] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  return slug && usedBy && usedBy * 2 > total && active.has(slug) ? { slug, usedBy } : null;
}

/**
 * The neighborhood to add for a place no neighborhood fits, named for its town (the ZIP's town
 * when the ZIP is known), or null for a Spokane place: the city itself is never one neighborhood.
 */
export function proposalFor(place: Pick<SuggestablePlace, "city" | "zip">): { label: string; slug: string } | null {
  const town = ZIP_TOWNS[zip5(place.zip)]?.[0] ?? townName(place.city);
  if (town === "Spokane") return null;
  const label = PROPOSED_BY_TOWN[town] ?? town;
  return { label, slug: slugify(label.replace(/['’]/g, "")) };
}

/**
 * The suggestion for one place. Order: a ZIP that straddles two neighborhoods, a majority of at
 * least two of the ZIP's places, a ZIP inside one neighborhood, a majority of one, the town named
 * by a neighborhood (or the neighborhood once proposed for it), then none fits.
 */
export function suggestNeighborhood(
  place: SuggestablePlace,
  others: readonly SuggestablePlace[],
  neighborhoods: readonly NeighborhoodRow[]
): Suggestion {
  const active = new Map(neighborhoods.filter((n) => n.isActive).map((n) => [n.slug, n]));
  const zip = zip5(place.zip);
  const two = (TWO_NEIGHBORHOOD_ZIPS[zip] ?? []).filter((slug) => active.has(slug));
  if (two.length === 2) return { bucket: "pick", candidates: two };
  const majority = zipMajority(place, others, active);
  if (majority && majority.usedBy >= 2) return { bucket: "sure", slug: majority.slug, source: "zip-majority", usedBy: majority.usedBy };
  if (two.length === 1) return { bucket: "sure", slug: two[0], source: "zip" };
  const byZip = ZIP_NEIGHBORHOODS[zip];
  if (byZip && active.has(byZip)) return { bucket: "sure", slug: byZip, source: "zip" };
  if (majority) return { bucket: "sure", slug: majority.slug, source: "zip-majority", usedBy: majority.usedBy };
  const byTown = neighborhoodForTown(place.city, active);
  if (byTown) return { bucket: "sure", slug: byTown, source: "city" };
  const proposal = proposalFor(place);
  if (!proposal) return { bucket: "pick", candidates: [] };
  if (active.has(proposal.slug)) return { bucket: "sure", slug: proposal.slug, source: "city" };
  return { bucket: "none", proposal };
}

/** "Its name says Coeur d'Alene; it is in Spokane." when the name holds another known town. */
export function nameTownNote(place: Pick<SuggestablePlace, "name" | "city">): string | null {
  const own = findTown(place.city);
  const name = ` ${words(place.name)} `;
  const named = TOWNS.filter((t) => t !== own && name.includes(` ${words(t.name)} `)).sort((a, b) => b.name.length - a.name.length)[0];
  if (!named || (own && words(own.name).includes(words(named.name)))) return null;
  return `Its name says ${named.name}; it is in ${own?.name ?? place.city.trim()}.`;
}

function byNextDate(a: SuggestablePlace, b: SuggestablePlace): number {
  const da = a.nextDate ?? "9999";
  const db = b.nextDate ?? "9999";
  return da.localeCompare(db) || a.name.localeCompare(b.name);
}

export type SureGroup = {
  /** "83814:cda": one row per ZIP and neighborhood. */
  key: string;
  zip: string;
  town: string;
  slug: string;
  source: "zip-majority" | "zip" | "city";
  /** Other places in the ZIP with this neighborhood (zip-majority only). */
  usedBy: number;
  places: SuggestablePlace[];
};

export type PickRow = { place: SuggestablePlace; candidates: string[]; note: string | null };

export type NoneGroup = {
  /** The proposed neighborhood's slug. */
  key: string;
  proposal: { label: string; slug: string };
  /** Towns in the group, in I-90 order. */
  towns: string[];
  places: SuggestablePlace[];
  /** A neighborhood with the proposed slug that exists but is turned off. */
  inactive: boolean;
};

export type NeighborhoodBuckets = { sure: SureGroup[]; pick: PickRow[]; none: NoneGroup[]; total: number };

/**
 * Sorts every active place without a neighborhood into the three buckets. `everyone` is all
 * active places (with or without a neighborhood), for ZIP majorities. Groups and rows are
 * ordered by the next event at their places.
 */
export function neighborhoodBuckets(
  missing: readonly SuggestablePlace[],
  everyone: readonly SuggestablePlace[],
  neighborhoods: readonly NeighborhoodRow[]
): NeighborhoodBuckets {
  const sure = new Map<string, SureGroup>();
  const pick: PickRow[] = [];
  const none = new Map<string, NoneGroup>();
  const slugs = new Map(neighborhoods.map((n) => [n.slug, n]));
  for (const place of missing) {
    const suggestion = suggestNeighborhood(place, everyone, neighborhoods);
    if (suggestion.bucket === "sure") {
      const zip = zip5(place.zip);
      const key = `${zip}:${suggestion.slug}`;
      const group = sure.get(key) ?? {
        key,
        zip,
        town: townName(place.city),
        slug: suggestion.slug,
        source: suggestion.source,
        usedBy: suggestion.source === "zip-majority" ? suggestion.usedBy : 0,
        places: [],
      };
      group.places.push(place);
      sure.set(key, group);
    } else if (suggestion.bucket === "pick") {
      pick.push({ place, candidates: suggestion.candidates, note: nameTownNote(place) });
    } else {
      const key = suggestion.proposal.slug;
      const group = none.get(key) ?? {
        key,
        proposal: suggestion.proposal,
        towns: [],
        places: [],
        inactive: slugs.get(key)?.isActive === false,
      };
      const town = townName(place.city);
      if (!group.towns.includes(town)) group.towns.push(town);
      group.places.push(place);
      none.set(key, group);
    }
  }
  const firstDate = (places: SuggestablePlace[]) => [...places].sort(byNextDate)[0];
  const sortGroups = <G extends { places: SuggestablePlace[]; key: string }>(groups: G[]) =>
    groups
      .map((g) => ({ ...g, places: [...g.places].sort(byNextDate) }))
      .sort((a, b) => byNextDate(firstDate(a.places), firstDate(b.places)) || b.places.length - a.places.length || a.key.localeCompare(b.key));
  const townIndex = (name: string) => {
    const i = TOWNS.findIndex((t) => t.name === name);
    return i === -1 ? TOWNS.length : i;
  };
  return {
    sure: sortGroups([...sure.values()]),
    pick: pick.sort((a, b) => byNextDate(a.place, b.place)),
    none: sortGroups([...none.values()]).map((g) => ({ ...g, towns: [...g.towns].sort((a, b) => townIndex(a) - townIndex(b)) })),
    total: missing.length,
  };
}
