import type { TodoEvent, TodoLink } from "../types";

/** A field the copies can disagree on; each becomes a group of radios when they do. */
export type CombineField = "title" | "when" | "where" | "about" | "tags" | "has" | "links" | "picture";

/** The copy (by index) whose value is taken, or "all" for the tags or features of every copy together. */
export type CombineChoice = number | "all";

export type CombineChoices = Partial<Record<CombineField, CombineChoice>>;

export type CombineOption = { value: CombineChoice; label: string; detail: string; disabled?: string };

export type CombineRow = { field: CombineField; label: string; options: CombineOption[]; note?: string };

/** The fields the kept copy is written with; only the ones that change it. */
export type CombineChanges = {
  title?: string;
  description?: string | null;
  scheduleDays?: { date: string; allDay: boolean; startTime?: string; endTime?: string }[];
  venueId?: string;
  tagIds?: string[];
  featureIds?: string[];
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  imageUrl?: string | null;
};

const LABELS: Record<CombineField, string> = {
  title: "Title",
  when: "When",
  where: "Where",
  about: "About",
  tags: "Tags",
  has: "Has",
  links: "Links",
  picture: "Picture",
};

function names(list: { name: string }[]): string {
  return list.length ? list.map((x) => x.name).join(", ") : "None";
}

function ids(list: { id: string }[]): string[] {
  return list.map((x) => x.id).sort();
}

function same(values: string[]): boolean {
  return new Set(values).size <= 1;
}

function usefulDescription(e: TodoEvent): boolean {
  return !!e.description?.trim() && !e.importerNote;
}

function hasPicture(e: TodoEvent): boolean {
  return !!e.imageUrl?.trim() && !e.pictureIsPage;
}

function linkOf(links: TodoLink[], kind: TodoLink["kind"]): string | null {
  return links.find((l) => l.kind === kind)?.href ?? null;
}

function union<T extends { id: string; name: string }>(events: TodoEvent[], pick: (e: TodoEvent) => T[]): T[] {
  const seen = new Map<string, T>();
  for (const e of events) for (const x of pick(e)) if (!seen.has(x.id)) seen.set(x.id, x);
  return [...seen.values()];
}

const SHORT = 90;

function short(text: string | null): string {
  const t = text?.trim();
  if (!t) return "No description";
  return t.length > SHORT ? `${t.slice(0, SHORT - 1).trimEnd()}…` : t;
}

/** The copy whose value the field takes by default. */
export function defaultChoices(events: TodoEvent[], keepIndex: number): Record<CombineField, CombineChoice> {
  const keep = events[keepIndex];
  const earliest = events.reduce(
    (best, e, i) => (e.scheduleDays.length > 0 && e.startIso < events[best].startIso ? i : best),
    keepIndex
  );
  const descriptions = events.map((e, i) => ({ i, useful: usefulDescription(e), length: e.description?.trim().length ?? 0 }));
  const about = [...descriptions].sort((a, b) => Number(b.useful) - Number(a.useful) || b.length - a.length || Number(b.i === keepIndex) - Number(a.i === keepIndex))[0].i;
  const links = events.reduce((best, e, i) => (e.links.length > events[best].links.length ? i : best), keepIndex);
  const withPicture = events.findIndex(hasPicture);
  const picture = hasPicture(keep) || withPicture === -1 ? keepIndex : withPicture;
  return {
    title: keepIndex,
    when: earliest,
    where: keepIndex,
    about,
    tags: same(events.map((e) => ids(e.tags).join("|"))) ? keepIndex : "all",
    has: same(events.map((e) => ids(e.features).join("|"))) ? keepIndex : "all",
    links,
    picture,
  };
}

/**
 * The rows of "Pick field by field": one per field the copies disagree on, each option labeled by
 * the copy's number. A copy without daily hours cannot give its hours, except the kept copy
 * (`keepIndex`), whose own hours stay when it is chosen.
 */
export function combineRows(events: TodoEvent[], keepIndex: number): CombineRow[] {
  const rows: CombineRow[] = [];
  const perCopy = (field: CombineField, values: string[], disabled?: (e: TodoEvent) => string | undefined) => ({
    field,
    label: LABELS[field],
    options: events.map(
      (e, i): CombineOption => ({ value: i, label: String(i + 1), detail: values[i], disabled: i === keepIndex ? undefined : disabled?.(e) })
    ),
  });

  const titles = events.map((e) => e.title.trim());
  if (!same(titles)) rows.push(perCopy("title", titles));

  const whens = events.map((e) => e.whenShort);
  if (!same(whens)) {
    rows.push({
      ...perCopy("when", whens, (e) => (e.scheduleDays.length ? undefined : "No daily hours to take")),
      note: "Times differ. The earlier start is chosen.",
    });
  }

  const places = events.map((e) => `${e.venue.name}, ${e.venue.city}`);
  if (!same(events.map((e) => e.venue.id))) rows.push(perCopy("where", places));

  if (!same(events.map((e) => e.description?.trim() ?? ""))) {
    rows.push(perCopy("about", events.map((e) => `${short(e.description)}${e.importerNote ? " Reads like an importer note." : ""}`)));
  }

  for (const [field, pick] of [
    ["tags", (e: TodoEvent) => e.tags],
    ["has", (e: TodoEvent) => e.features],
  ] as const) {
    if (same(events.map((e) => ids(pick(e)).join("|")))) continue;
    const row = perCopy(field, events.map((e) => names(pick(e))));
    row.options.push({ value: "all", label: events.length === 2 ? "Both" : "All", detail: names(union(events, pick)) });
    rows.push(row);
  }

  const links = events.map((e) => (e.links.length ? e.links.map((l) => l.label).join(", ") : "None"));
  if (!same(events.map((e) => e.links.map((l) => `${l.kind} ${l.href}`).sort().join("|")))) rows.push(perCopy("links", links));

  const pictures = events.map((e) => (e.imageUrl?.trim() ? (e.pictureIsPage ? "A web page, not a picture" : "Yes") : "None"));
  if (!same(events.map((e) => e.imageUrl?.trim() ?? ""))) rows.push(perCopy("picture", pictures));

  return rows;
}

/** What the kept copy is written with, from the choices; fields equal to its own are left out. */
export function combinedChanges(events: TodoEvent[], keepIndex: number, choices: CombineChoices): CombineChanges {
  const keep = events[keepIndex];
  const from = (field: CombineField): TodoEvent | null => {
    const choice = choices[field];
    return typeof choice === "number" && choice !== keepIndex && events[choice] ? events[choice] : null;
  };
  const changes: CombineChanges = {};

  const title = from("title");
  if (title && title.title.trim() !== keep.title.trim()) changes.title = title.title.trim();

  const when = from("when");
  if (when && when.scheduleDays.length && when.whenShort !== keep.whenShort) {
    changes.scheduleDays = when.scheduleDays.map((d) =>
      d.allDay ? { date: d.date, allDay: true } : { date: d.date, allDay: false, startTime: d.startTime, endTime: d.endTime }
    );
  }

  const where = from("where");
  if (where && where.venue.id !== keep.venue.id) changes.venueId = where.venue.id;

  const about = from("about");
  if (about && (about.description?.trim() ?? "") !== (keep.description?.trim() ?? "")) changes.description = about.description?.trim() || null;

  for (const [field, pick, key] of [
    ["tags", (e: TodoEvent) => e.tags, "tagIds"],
    ["has", (e: TodoEvent) => e.features, "featureIds"],
  ] as const) {
    const choice = choices[field];
    const chosen = choice === "all" ? union(events, pick) : typeof choice === "number" && events[choice] ? pick(events[choice]) : pick(keep);
    if (ids(chosen).join("|") !== ids(pick(keep)).join("|")) changes[key] = chosen.map((x) => x.id);
  }

  const links = from("links");
  if (links) {
    for (const [kind, key] of [
      ["website", "websiteUrl"],
      ["facebook", "facebookUrl"],
      ["instagram", "instagramUrl"],
    ] as const) {
      const next = linkOf(links.links, kind);
      if (next !== linkOf(keep.links, kind)) changes[key] = next;
    }
  }

  const picture = from("picture");
  if (picture && (picture.imageUrl?.trim() ?? "") !== (keep.imageUrl?.trim() ?? "")) changes.imageUrl = picture.imageUrl?.trim() || null;

  return changes;
}

/**
 * 'Result: "11th Annual Rebel Junk Holiday Market", Fri 5:30 pm to Sat 4:00 pm, 3 tags, 5 features.'
 */
export function resultLine(events: TodoEvent[], keepIndex: number, choices: CombineChoices): string {
  const pick = (field: CombineField) => {
    const choice = choices[field];
    return typeof choice === "number" && events[choice] ? events[choice] : events[keepIndex];
  };
  const tags = choices.tags === "all" ? union(events, (e) => e.tags) : pick("tags").tags;
  const features = choices.has === "all" ? union(events, (e) => e.features) : pick("has").features;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const when = pick("when").scheduleDays.length ? pick("when").whenShort : events[keepIndex].whenShort;
  return `Result: "${pick("title").title.trim()}", ${when}, ${count(tags.length, "tag", "tags")}, ${count(features.length, "feature", "features")}.`;
}
