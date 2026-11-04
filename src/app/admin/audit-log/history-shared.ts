/**
 * History filters, line shapes and wording that both the server and the client use. Imports
 * nothing that touches the database; the types below are erased from the client bundle.
 */

import type { HistoryDetail, HistoryFilters, HistoryRecord, HistoryWhat, HistoryWhen } from "@/lib/admin/history-words";

export type { HistoryCursor, HistoryDetail, HistoryFilters, HistoryRecord, HistoryWhat, HistoryWhen } from "@/lib/admin/history-words";

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = { q: "", what: "anything", who: "anyone", when: "30" };

export const WHAT_OPTIONS: ReadonlyArray<{ value: HistoryWhat; label: string }> = [
  { value: "anything", label: "Anything" },
  { value: "publishing", label: "Publishing" },
  { value: "rejecting", label: "Rejecting" },
  { value: "editing", label: "Editing" },
  { value: "merging", label: "Merging places" },
  { value: "settings", label: "Settings" },
];

export const WHEN_OPTIONS: ReadonlyArray<{ value: HistoryWhen; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "Any time" },
];

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseHistoryFilters(params: SearchParams): HistoryFilters {
  const what = one(params.what);
  const when = one(params.when);
  const who = one(params.who);
  return {
    q: one(params.q).slice(0, 120),
    what: WHAT_OPTIONS.some((o) => o.value === what) ? (what as HistoryWhat) : DEFAULT_HISTORY_FILTERS.what,
    who: who && /^[\w-]{1,64}$/.test(who) ? who : DEFAULT_HISTORY_FILTERS.who,
    when: WHEN_OPTIONS.some((o) => o.value === when) ? (when as HistoryWhen) : DEFAULT_HISTORY_FILTERS.when,
  };
}

/** The non-default filters as a query string, without the leading "?". */
export function historyQueryString(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  for (const key of ["q", "what", "who", "when"] as const) {
    if (filters[key] !== DEFAULT_HISTORY_FILTERS[key]) params.set(key, filters[key]);
  }
  return params.toString();
}

export function historyFiltersActive(filters: HistoryFilters): boolean {
  return historyQueryString(filters) !== "";
}

/** One line of the History page, plain data so it can cross to the client and back. */
export type HistoryLine = {
  /** The decision id for a decision, else the audit row id. */
  id: string;
  decisionId: string | null;
  at: string;
  day: string;
  time: string;
  timestamp: string;
  sentence: string;
  /** The record the sentence names, linked in place. */
  link: HistoryRecord | null;
  /** The records a decision of several rows touched, for the second line. */
  records: HistoryRecord[];
  details: HistoryDetail[];
  canUndo: boolean;
};

/** "Emerge Holiday Market, Spokane Potters' Guild SouperBowl Fundraiser, and 6 more" as parts. */
export function recordList(records: readonly HistoryRecord[], max = 2): { shown: HistoryRecord[]; more: number } {
  const unique = [...new Map(records.map((r) => [`${r.href ?? ""}|${r.title}`, r])).values()];
  return { shown: unique.slice(0, max), more: Math.max(unique.length - max, 0) };
}

/** The text before and after the first mention of `title`, or null when it is not mentioned. */
export function splitAround(sentence: string, title: string): [string, string] | null {
  const at = title ? sentence.indexOf(title) : -1;
  if (at < 0) return null;
  return [sentence.slice(0, at), sentence.slice(at + title.length)];
}

/** The empty state names what emptied the list. */
export function emptyHistoryMessage(filters: HistoryFilters, whoLabel: string | null): string {
  const span = filters.when === "today" ? "today" : filters.when === "all" ? "" : `in the last ${filters.when} days`;
  const what = filters.what === "anything" ? "" : (WHAT_OPTIONS.find((o) => o.value === filters.what)?.label.toLowerCase() ?? "");
  const by = filters.who === "anyone" ? "" : `by ${whoLabel ?? "this person"}`;
  const words = (parts: string[]) => `${parts.filter(Boolean).join(" ")}.`;
  if (filters.q) return words(["Nothing", what && `in ${what}`, by, span, `matches "${filters.q}"`]);
  if (what) return words([`No ${what}`, by, span || "so far"]);
  if (by) return words(["Nothing changed", by, span || "so far"]);
  return span ? `Nothing changed ${span}.` : "Nothing has changed yet.";
}
