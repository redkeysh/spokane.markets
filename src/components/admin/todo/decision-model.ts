import { REJECT_REASONS as REASONS } from "@/lib/admin/reject-reasons";
import type { Decision, TodoEvent } from "./types";
import { listAnd } from "./brief-model";

/** The reasons X offers, in key order. "Other" asks for a note, which becomes the reason. */
export const REJECT_REASONS = [
  { key: "1", label: REASONS[0] },
  { key: "2", label: REASONS[1] },
  { key: "3", label: REASONS[2] },
  { key: "4", label: REASONS[3] },
  { key: "5", label: "Other", note: true },
] as const;

export type RejectReasonKey = (typeof REJECT_REASONS)[number]["key"];

/** The reason text saved with a rejection; null when "Other" has no note yet. */
export function reasonText(key: RejectReasonKey, note: string): string | null {
  const reason = REJECT_REASONS.find((r) => r.key === key);
  if (!reason) return null;
  if ("note" in reason) return note.trim() ? note.trim() : null;
  return reason.label;
}

/** The event rows of a decision that the data has, in decision order. */
export function decisionEvents(decision: Decision, events: Record<string, TodoEvent>): TodoEvent[] {
  return decision.rows.filter((r) => r.type === "event").map((r) => events[r.id]).filter((e): e is TodoEvent => !!e);
}

/** The full editor for a decision's first row, with the way back to this decision. */
export function editorHref(decision: Decision, rowId?: string): string | null {
  const row = rowId ? decision.rows.find((r) => r.id === rowId) : decision.rows[0];
  if (!row) return null;
  const back = `from=todo&d=${encodeURIComponent(decision.key)}`;
  if (row.type === "event") return `/admin/events/${row.id}?${back}`;
  if (row.type === "submission") return `/admin/submissions/${row.id}?${back}`;
  if (row.type === "venue") return `/admin/venues/${row.id}`;
  if (row.type === "market") return `/admin/markets/${row.id}`;
  return null;
}

const LACKS: { flag: string; all: string; one: string; some: (n: number) => string }[] = [
  { flag: "no-picture", all: "none has a picture yet", one: "has no picture", some: (n) => `${n} have no picture` },
  { flag: "picture-is-page", all: "every picture link is a web page", one: "has a picture link that is a web page", some: (n) => `${n} have a picture link that is a web page` },
  { flag: "no-tags", all: "none has tags", one: "has no tags", some: (n) => `${n} have no tags` },
  { flag: "no-features", all: "none has features", one: "has no features", some: (n) => `${n} have no features` },
  { flag: "importer-note", all: "every description has an importer note", one: "has an importer note in its description", some: (n) => `${n} have an importer note in the description` },
];

/**
 * "What they lack: none has a picture yet. Holiday Bazaar (Trinity Lutheran Church) has no
 * features." Null when nothing is missing.
 */
export function lackSentence(events: TodoEvent[]): string | null {
  if (events.length === 0) return null;
  const parts: string[] = [];
  for (const lack of LACKS) {
    const missing = events.filter((e) => e.warnings.some((w) => w.flag === lack.flag));
    if (missing.length === 0) continue;
    if (missing.length === events.length && events.length > 1) parts.push(`${lack.all}.`);
    else if (missing.length === 1) parts.push(`${missing[0].title} ${lack.one}.`);
    else parts.push(`${lack.some(missing.length)}.`);
  }
  if (parts.length === 0) return null;
  const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;
  return [`What they lack: ${parts[0]}`, ...parts.slice(1).map(capital)].join(" ");
}

/** "Nobody is notified: none came from an organizer account." or "Publishing tells Dana and Lee." */
export function notifySentence(names: string[], verb: "Publishing" | "Rejecting" = "Publishing"): string {
  if (names.length === 0) return "Nobody is notified: none came from an organizer account.";
  return `${verb} tells ${listAnd(names)}.`;
}

export type CompareField = "came-from" | "when" | "where" | "about" | "tags" | "has" | "links" | "picture";

export type CompareRow = { field: CompareField; label: string; values: string[]; differs: boolean };

const ABOUT_LIMIT = 240;

function about(e: TodoEvent): string {
  const text = e.description?.trim();
  if (!text) return "No description";
  return text.length > ABOUT_LIMIT ? `${text.slice(0, ABOUT_LIMIT - 1).trimEnd()}…` : text;
}

const STATUS_WORD: Record<string, string> = { PUBLISHED: "Published", PENDING: "Pending", DRAFT: "Draft" };

/** The rows of a side-by-side comparison; a row differs when any two copies disagree. */
export function compareRows(events: TodoEvent[]): CompareRow[] {
  const join = (list: { name: string }[]) => (list.length ? list.map((x) => x.name).join(", ") : "None");
  const same = (values: string[], key: (v: string) => string = (v) => v) => new Set(values.map(key)).size <= 1;
  const sorted = (v: string) => v.split(", ").sort().join(", ");
  const rows: CompareRow[] = [];
  const add = (field: CompareField, label: string, values: string[], differs?: boolean) =>
    rows.push({ field, label, values, differs: differs ?? !same(values) });

  add("came-from", "Came from", events.map((e) => `${e.origin}, ${STATUS_WORD[e.status] ?? e.status}`), false);
  add("when", "When", events.map((e) => e.whenShort));
  const places = events.map((e) => `${e.venue.name}, ${e.venue.city}`);
  if (!same(places)) add("where", "Where", places, true);
  const abouts = events.map(about);
  add("about", "About", abouts);
  const tags = events.map((e) => join(e.tags));
  add("tags", "Tags", tags, !same(tags, sorted));
  const has = events.map((e) => join(e.features));
  add("has", "Has", has, !same(has, sorted));
  const links = events.map((e) => (e.links.length ? e.links.map((l) => l.label).join(", ") : "None"));
  add("links", "Links", links);
  const pictures = events.map((e) => (e.imageUrl ? (e.pictureIsPage ? "A web page, not a picture" : "Yes") : "None"));
  add("picture", "Picture", pictures);
  return rows;
}

function usefulDescription(e: TodoEvent): boolean {
  return !!e.description?.trim() && !e.importerNote;
}

/** Why the suggested copy is the one to keep: "it lists the prices" style, in plain words. */
export function suggestReason(keep: TodoEvent, others: TodoEvent[]): string {
  if (keep.status === "PUBLISHED") return "it is already live";
  if (keep.imageUrl && others.every((o) => !o.imageUrl)) return "it has a picture";
  if (usefulDescription(keep) && others.some((o) => !usefulDescription(o))) {
    return others.some((o) => o.importerNote) ? "the other reads like an importer note" : "it has a description";
  }
  const longer = others.every((o) => (keep.description?.length ?? 0) > (o.description?.length ?? 0) + 40);
  if (usefulDescription(keep) && longer) return "it has the fuller description";
  const extras = (e: TodoEvent) => e.tags.length + e.features.length;
  if (others.every((o) => extras(keep) > extras(o))) return "it has more tags and features";
  if (others.every((o) => keep.links.length > o.links.length)) return "it has more links";
  return "it was added first";
}

/** Tag and feature names the other copies have and the kept one lacks, in order. */
export function takeFromOthers(keep: TodoEvent, others: TodoEvent[]): string[] {
  const tagIds = new Set(keep.tags.map((t) => t.id));
  const featureIds = new Set(keep.features.map((f) => f.id));
  const names: string[] = [];
  for (const other of others) {
    for (const t of other.tags) {
      if (tagIds.has(t.id)) continue;
      tagIds.add(t.id);
      names.push(t.name);
    }
    for (const f of other.features) {
      if (featureIds.has(f.id)) continue;
      featureIds.add(f.id);
      names.push(f.name);
    }
  }
  return names;
}

/** The copy that cannot be archived here: a live one, else one an earlier decision holds. */
export function fixedCopy(decision: Decision, events: TodoEvent[]): TodoEvent | null {
  const settles = new Set(decision.settles);
  return events.find((e) => e.status === "PUBLISHED") ?? events.find((e) => !settles.has(e.id)) ?? null;
}
