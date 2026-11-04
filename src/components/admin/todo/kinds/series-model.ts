import { slugDisagreesWithTitle } from "@/lib/events/readiness";
import { slugify } from "@/lib/utils";
import type { TodoEvent } from "../types";

function listAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Statuses whose page has been public, so the old address keeps working as a redirect. */
const PUBLIC = new Set(["PUBLISHED", "CANCELLED"]);

/** "kendall-yards-christmas-market-2026-11-27": the title (without a trailing year) and the first date. */
export function proposedSlug(title: string, date: string): string {
  const base = slugify(title.replace(/\s+(19|20)\d{2}\s*$/, "").trim()) || "event";
  return `${base}-${date}`;
}

export type AddressFix = { eventId: string; title: string; from: string; to: string; live: boolean };

/** The dates whose web address names words their title does not, with the address their title gives. */
export function addressFixes(events: { id: string; title: string; slug: string; status: string; date: string }[]): AddressFix[] {
  return events
    .filter((e) => slugDisagreesWithTitle(e.title, e.slug))
    .map((e) => ({ eventId: e.id, title: e.title, from: e.slug, to: proposedSlug(e.title, e.date), live: PUBLIC.has(e.status) }))
    .filter((fix) => fix.to !== fix.from);
}

/**
 * "Web addresses say kendall-yards-night-market-2026-11-27. Change them to
 * kendall-yards-christmas-market-2026-11-27 and the other 5. Safe: none is live yet."
 */
export function addressSentence(fixes: AddressFix[]): string {
  if (fixes.length === 0) return "";
  const [first] = fixes;
  const rest = fixes.length - 1;
  const head =
    fixes.length === 1
      ? `Its web address says ${first.from}. Change it to ${first.to}.`
      : `Web addresses say ${first.from}. Change them to ${first.to} and ${rest === 1 ? "the other date" : `the other ${rest}`}.`;
  const live = fixes.filter((f) => f.live).length;
  const tail =
    live === 0
      ? fixes.length === 1
        ? " Safe: it is not live yet."
        : " Safe: none is live yet."
      : ` The old ${live === 1 ? "address keeps" : "addresses keep"} working for visitors who saved ${live === 1 ? "it" : "them"}.`;
  return `${head}${tail}`;
}

function sameAcross<T>(events: TodoEvent[], key: (e: TodoEvent) => T): boolean {
  const first = JSON.stringify(key(events[0]));
  return events.every((e) => JSON.stringify(key(e)) === first);
}

const LINK_WORDS: Record<string, string> = { website: "website", facebook: "Facebook", instagram: "Instagram" };

export type SeriesSummary = {
  /** "Same on all 6: description, tags Craft Fair and Holiday Market, website and Facebook." */
  same: string | null;
  /** "Not the same on every date: description and picture." */
  differs: string | null;
  /** Dates with a picture that is a picture (not a web page). */
  withPicture: number;
};

/** What every date shares and what differs, in words, so the owner knows what publishing them together shows. */
export function seriesSummary(events: TodoEvent[]): SeriesSummary {
  if (events.length === 0) return { same: null, differs: null, withPicture: 0 };
  const same: string[] = [];
  const differs: string[] = [];
  const sortedNames = (list: { name: string }[]) => list.map((x) => x.name).sort();

  const description = (e: TodoEvent) => e.description?.trim() ?? "";
  if (sameAcross(events, description)) {
    if (description(events[0])) same.push("description");
  } else differs.push("description");

  if (sameAcross(events, (e) => sortedNames(e.tags))) {
    if (events[0].tags.length) same.push(`tags ${listAnd(events[0].tags.map((t) => t.name))}`);
  } else differs.push("tags");

  if (sameAcross(events, (e) => sortedNames(e.features))) {
    if (events[0].features.length) same.push(`features ${events[0].features.map((f) => f.name).join(", ")}`);
  } else differs.push("features");

  const links = (e: TodoEvent) => e.links.map((l) => `${l.kind} ${l.href}`).sort();
  if (sameAcross(events, links)) {
    if (events[0].links.length) same.push(listAnd(events[0].links.map((l) => LINK_WORDS[l.kind] ?? l.kind)));
  } else differs.push("links");

  const withPicture = events.filter((e) => !!e.imageUrl?.trim() && !e.pictureIsPage).length;
  const picture = (e: TodoEvent) => e.imageUrl?.trim() ?? "";
  if (!sameAcross(events, picture)) differs.push("picture");
  else if (picture(events[0])) same.push("the picture");

  const n = events.length;
  const noPicture = withPicture === 0 ? (n === 2 ? " Neither has a picture." : " No picture on any.") : "";
  return {
    same: same.length ? `Same on ${n === 2 ? "both" : `all ${n}`}: ${same.join(", ")}.${noPicture}` : noPicture.trim() || null,
    differs: differs.length ? `Not the same on every date: ${listAnd(differs)}.` : null,
    withPicture,
  };
}
