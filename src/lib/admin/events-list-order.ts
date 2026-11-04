import type { EventListRow, EventsSort, GroupEntry, ListMark, SortDir } from "./events-query";

/** One line of a weekend group: an event, two or more twins side by side, or a series' dates collapsed. */
export type GroupItem =
  | { type: "event"; entry: GroupEntry }
  /** Same day and place; `key` is the To do decision key ("twins:<idA>|<idB>"). */
  | { type: "twins"; key: string; maybe: boolean; entries: GroupEntry[] }
  /** Two or more dates of one series inside the weekend. */
  | { type: "series"; key: string; name: string; total: number; entries: GroupEntry[] };

/** This weekend and the ones after it first, soonest first; then the weekends already gone, latest first. */
export function orderWeeks(weeks: string[], thisSaturday: string): string[] {
  const coming = weeks.filter((w) => w >= thisSaturday).sort();
  const gone = weeks.filter((w) => w < thisSaturday).sort().reverse();
  return [...coming, ...gone];
}

export function compareEntries(a: GroupEntry, b: GroupEntry, rows: Map<string, EventListRow>): number {
  return (
    a.day.localeCompare(b.day) ||
    a.at.localeCompare(b.at) ||
    (rows.get(a.id)?.title ?? "").localeCompare(rows.get(b.id)?.title ?? "") ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Orders a weekend's rows by day and opening time, with archived rows last. Twins sit together
 * at the place of the first of them; dates of one series in the weekend collapse into one item
 * at the place of the first date. Twins take precedence over a series.
 */
export function buildGroupItems(entries: GroupEntry[], rows: Map<string, EventListRow>): GroupItem[] {
  const sorted = [...entries].sort((a, b) => compareEntries(a, b, rows));
  const active = sorted.filter((e) => !rows.get(e.id)?.archived);
  const archived = sorted.filter((e) => rows.get(e.id)?.archived);

  const twinMembers = new Map<string, GroupEntry[]>();
  for (const entry of active) {
    const twin = rows.get(entry.id)?.twin;
    if (twin) twinMembers.set(twin.key, [...(twinMembers.get(twin.key) ?? []), entry]);
  }
  const bracketed = new Set<string>();
  for (const members of twinMembers.values()) {
    if (members.length > 1) for (const m of members) bracketed.add(m.id);
  }

  const seriesMembers = new Map<string, GroupEntry[]>();
  for (const entry of active) {
    if (bracketed.has(entry.id)) continue;
    const series = rows.get(entry.id)?.series;
    if (series) seriesMembers.set(series.key, [...(seriesMembers.get(series.key) ?? []), entry]);
  }

  const items: GroupItem[] = [];
  const placed = new Set<string>();
  for (const entry of active) {
    if (placed.has(entry.id)) continue;
    const row = rows.get(entry.id);
    const twinGroup = row?.twin && bracketed.has(entry.id) ? twinMembers.get(row.twin.key) : undefined;
    if (row?.twin && twinGroup) {
      items.push({ type: "twins", key: row.twin.key, maybe: row.twin.maybe, entries: twinGroup });
      for (const m of twinGroup) placed.add(m.id);
      continue;
    }
    const seriesGroup = row?.series ? seriesMembers.get(row.series.key) : undefined;
    if (row?.series && seriesGroup && seriesGroup.length > 1) {
      items.push({ type: "series", key: row.series.key, name: row.series.name, total: row.series.total, entries: seriesGroup });
      for (const m of seriesGroup) placed.add(m.id);
      continue;
    }
    items.push({ type: "event", entry });
    placed.add(entry.id);
  }
  for (const entry of archived) items.push({ type: "event", entry });
  return items;
}

/** Event ids an item covers, in order. */
export function itemIds(item: GroupItem): string[] {
  return item.type === "event" ? [item.entry.id] : item.entries.map((e) => e.id);
}

const MARK_ORDER: Record<ListMark, number> = {
  PUBLISHED: 0,
  PENDING: 1,
  DRAFT: 2,
  CANCELLED: 3,
  REJECTED: 4,
  ARCHIVED: 5,
};

function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** Table order; ties fall back to start, then id. Rows without a market sort last either way. */
export function sortTableRows(rows: EventListRow[], sort: EventsSort, dir: SortDir): EventListRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const byStart = (a: EventListRow, b: EventListRow) => a.startIso.localeCompare(b.startIso);
  const primary = (a: EventListRow, b: EventListRow): number => {
    switch (sort) {
      case "title":
        return sign * compareText(a.title, b.title);
      case "place":
        return sign * compareText(a.placeLine, b.placeLine);
      case "market":
        if (!a.marketName || !b.marketName) return compareText(a.marketName, b.marketName);
        return sign * compareText(a.marketName, b.marketName);
      case "status":
        return sign * (MARK_ORDER[a.mark] - MARK_ORDER[b.mark]);
      case "updated":
        return sign * a.updatedIso.localeCompare(b.updatedIso);
      case "start":
        return sign * byStart(a, b);
    }
  };
  return [...rows].sort((a, b) => primary(a, b) || byStart(a, b) || a.id.localeCompare(b.id));
}
