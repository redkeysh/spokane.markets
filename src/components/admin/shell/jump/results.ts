import { defaultFilter } from "cmdk";
import { weekHref } from "@/lib/admin/nav";
import { STATUS_MARKS } from "@/components/admin/kit/status-mark";
import type { JumpGroup, JumpGroupKey, JumpHit, JumpResults, JumpWeekend } from "@/lib/admin/search";
import { railCaption } from "../rail-labels";

/** Matches normalizeQuery in src/lib/admin/search.ts, which the client cannot import. */
export const JUMP_MAX_QUERY = 100;
export const JUMP_MIN_QUERY = 2;

export function jumpQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, JUMP_MAX_QUERY);
}

/** cmdk scores a match at the start of a word about 0.9 and a match inside a word or scattered letters below 0.2. */
const WORD_START_MATCH = 0.5;

/**
 * Pages or commands that match the query, best first, scored the way cmdk
 * scores its own items. One letter matches loosely; longer queries need a
 * word that starts with them or the query inside the label or a keyword, so
 * "dana" finds the person, not "Edit announcement". With an empty query, all
 * of them in their order.
 */
export function filterLocal<T extends { label: string; keywords: readonly string[] }>(
  items: readonly T[],
  query: string
): T[] {
  const q = jumpQuery(query);
  if (!q) return [...items];
  const needle = q.toLowerCase();
  const strict = q.length >= JUMP_MIN_QUERY;
  return items
    .map((item, index) => ({ item, index, score: defaultFilter(item.label, q, [...item.keywords]) }))
    .filter(
      ({ item, score }) =>
        score > 0 &&
        (!strict ||
          score >= WORD_START_MATCH ||
          [item.label, ...item.keywords].some((text) => text.toLowerCase().includes(needle)))
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}

const GROUP_NOUN: Record<JumpGroupKey, { one: string; many: string }> = {
  events: { one: "event", many: "events" },
  markets: { one: "market", many: "markets" },
  places: { one: "place", many: "places" },
  vendors: { one: "vendor", many: "vendors" },
  people: { one: "person", many: "people" },
};

/** "See all events matching “kendall”" */
export function moreLabel(key: JumpGroupKey, query: string): string {
  return `See all ${GROUP_NOUN[key].many} matching “${query}”`;
}

/** The option's accessible name: title, meta and status as one comma-separated line. */
export function hitLabel(hit: JumpHit): string {
  const status = hit.status ? STATUS_MARKS[hit.status].word : hit.note;
  return [hit.title, hit.meta, status].filter(Boolean).join(", ");
}

export function weekendLabel(weekend: JumpWeekend): string {
  return [weekend.title, weekend.meta, railCaption(weekend.week).text].filter(Boolean).join(", ");
}

/**
 * Where the weekend option goes: its lane on To do when the owner is on To do and the
 * week is on the rail, otherwise the events list for that week.
 */
export function weekendHref(weekend: Pick<JumpWeekend, "saturday" | "onRail">, pathname: string): string {
  return weekHref(weekend.onRail ? pathname : "/admin/events", weekend.saturday);
}

function count(n: number, noun: { one: string; many: string }): string {
  return `${n} ${n === 1 ? noun.one : noun.many}`;
}

function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function groupCount(group: JumpGroup): string {
  const noun = GROUP_NOUN[group.key];
  return group.moreHref ? `more than ${group.hits.length} ${noun.many}` : count(group.hits.length, noun);
}

/**
 * What the dialog's live region says once results for a query arrive:
 * "1 page, more than 5 events and 1 place.", "Weekend of Sat Dec 12: 0 of 11 live. Also 1 page.",
 * or that nothing matched.
 */
export function jumpAnnouncement(results: JumpResults, local: { pages: number; commands: number }): string {
  const parts = [
    ...(local.pages > 0 ? [count(local.pages, { one: "page", many: "pages" })] : []),
    ...(local.commands > 0 ? [count(local.commands, { one: "command", many: "commands" })] : []),
    ...results.groups.map(groupCount),
  ];
  if (results.weekend) {
    const weekend = `${results.weekend.title}: ${railCaption(results.weekend.week).text}.`;
    return parts.length > 0 ? `${weekend} Also ${listWords(parts)}.` : weekend;
  }
  if (parts.length === 0) return `Nothing matches “${results.query}”.`;
  return `${listWords(parts)}.`.replace(/^./, (c) => c.toUpperCase());
}
