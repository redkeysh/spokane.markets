import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { hasEnded } from "@/lib/events/readiness";
import type { Series } from "@/lib/events/series";
import { SNAPSHOT_NOW, snapshotDecisionEvents, snapshotIdByTitle, snapshotRailInput, snapshotVenues } from "./__fixtures__/snapshot";
import {
  applyFilterChange,
  buildAdminEventsExportWhere,
  buildAdminEventsWhere,
  buildEventsList,
  buildEventsListWhere,
  dayHours,
  emptyMessage,
  eventsListHref,
  eventsListQuery,
  hasActiveFilters,
  lastRailDay,
  parseEventsListParams,
  resolveAdminEventsTimeScope,
  resultSummary,
  weekendFact,
  weekendHeading,
  type EventsListInput,
  type ListSourceEvent,
} from "./events-query";
import { itemIds } from "./events-list-order";
import { buildWeekendRail } from "./weekends";

const NOW = new Date("2026-04-29T20:00:00.000Z");

/** The fixture gives every hand-added event one creation time; spread them a day apart so they do not read as an import. */
function createdAtOf(createdAt: Date, index: number): Date {
  return createdAt.toISOString().startsWith("2026-04-01") ? new Date(createdAt.getTime() + index * 86_400_000) : createdAt;
}

function snapshotInput(overrides: Partial<EventsListInput> = {}, mutate?: (e: ListSourceEvent) => ListSourceEvent): EventsListInput {
  const decisionEvents = snapshotDecisionEvents({ backfill: true });
  const events: ListSourceEvent[] = decisionEvents.map((e, i) => {
    const row: ListSourceEvent = {
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status,
      deletedAt: null,
      startDate: e.startDate,
      endDate: e.endDate,
      createdAt: createdAtOf(e.createdAt, i),
      updatedAt: e.updatedAt,
      scheduleDays: e.scheduleDays,
      imageUrl: e.imageUrl,
      tagCount: e.tagCount,
      marketId: e.marketId,
      marketName: e.marketName,
      venue: e.venue,
      submittedBy: null,
      fromSubmission: false,
    };
    return mutate ? mutate(row) : row;
  });
  const context = events
    .filter((e) => !e.deletedAt && ["PENDING", "DRAFT", "PUBLISHED"].includes(e.status) && !hasEnded(e, "2026-11-03"))
    .map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      scheduleDays: e.scheduleDays,
      venueId: e.venue!.id,
      marketId: e.marketId,
    }));
  return {
    now: SNAPSHOT_NOW,
    events,
    context,
    venues: snapshotVenues,
    importRows: events.map((e) => ({ id: e.id, createdAt: e.createdAt })),
    notSameEvent: [],
    rail: buildWeekendRail(snapshotRailInput({ backfill: true }), SNAPSHOT_NOW).weeks,
    ...overrides,
  };
}

const params = (query: string) => Object.fromEntries(new URLSearchParams(query));

describe("parseEventsListParams", () => {
  it("defaults to waiting, upcoming events grouped by weekend", () => {
    const f = parseEventsListParams({});
    expect(f).toMatchObject({ q: "", show: "waiting", when: "upcoming", whenSet: false, area: null, source: null, needs: [], only: [], week: null, view: "weekends", sort: "start", dir: "asc" });
    expect(hasActiveFilters(f)).toBe(false);
  });

  it("shows every time for Everything unless When is named", () => {
    expect(parseEventsListParams({ show: "everything" }).when).toBe("all");
    expect(parseEventsListParams({ show: "everything", when: "upcoming" }).when).toBe("upcoming");
  });

  it("reads lists, areas, sources and weeks, ignoring anything unknown", () => {
    const f = parseEventsListParams(
      params("needs=tags,picture,bogus&only=series&area=north-idaho&source=import-2026-10-30&week=2026-11-05&q=%20bridal%20")
    );
    expect(f.needs).toEqual(["picture", "tags"]);
    expect(f.only).toEqual(["series"]);
    expect(f.area).toBe("North Idaho");
    expect(f.source).toBe("import-2026-10-30");
    expect(f.week).toBe("2026-11-07");
    expect(f.q).toBe("bridal");
    expect(parseEventsListParams({ source: "javascript:x", week: "2026-02-30", area: "moon" })).toMatchObject({
      source: null,
      week: null,
      area: null,
    });
    expect(parseEventsListParams({ week: "later" }).week).toBe("later");
  });

  it("sorts the past and updated columns newest first by default", () => {
    expect(parseEventsListParams({ when: "past" }).dir).toBe("desc");
    expect(parseEventsListParams({ sort: "updated" }).dir).toBe("desc");
    expect(parseEventsListParams({ sort: "title", dir: "desc" })).toMatchObject({ dir: "desc", dirSet: true });
  });
});

describe("eventsListQuery and eventsListHref", () => {
  it("writes only what differs from the defaults, and round-trips", () => {
    const query = "q=bridal&show=live&area=spokane&needs=picture,hours&only=twins&week=2026-11-14&view=table&sort=title&dir=desc";
    const f = parseEventsListParams(params(query));
    expect(eventsListQuery(f)).toBe(new URLSearchParams(params(query)).toString());
    expect(eventsListHref(parseEventsListParams({}))).toBe("/admin/events");
  });

  it("keeps an explicit When when Show changes, and follows the Show default otherwise", () => {
    const base = parseEventsListParams({});
    expect(eventsListHref(base, { show: "everything" })).toBe("/admin/events?show=everything");
    expect(parseEventsListParams(params("show=everything")).when).toBe("all");
    const past = parseEventsListParams({ when: "past" });
    expect(eventsListHref(past, { show: "live" })).toBe("/admin/events?show=live&when=past");
  });

  it("drops When from the URL when it is set back to the Show default", () => {
    const past = parseEventsListParams({ when: "past" });
    expect(eventsListHref(past, { when: "upcoming" })).toBe("/admin/events");
  });

  it("resets an explicit direction when the sort column changes", () => {
    const f = parseEventsListParams({ view: "table", sort: "title", dir: "desc" });
    const next = applyFilterChange(f, { sort: "updated" });
    expect(next).toMatchObject({ sort: "updated", dir: "desc", dirSet: false });
    expect(eventsListQuery(next)).toBe("view=table&sort=updated");
  });

  it("leaves sort out of the weekend view", () => {
    expect(eventsListQuery(parseEventsListParams({ sort: "title" }))).toBe("");
  });
});

describe("buildEventsListWhere", () => {
  const now = SNAPSHOT_NOW;
  const startOfToday = new Date("2026-11-03T08:00:00.000Z");

  it("narrows Waiting to Pending and Draft that are not archived, ending today or later", () => {
    expect(buildEventsListWhere({ show: "waiting", when: "upcoming", q: "" }, now)).toEqual({
      status: { in: ["PENDING", "DRAFT"] },
      deletedAt: null,
      endDate: { gte: startOfToday },
    });
  });

  it("keeps archived rows and every status for Everything", () => {
    const where = buildEventsListWhere({ show: "everything", when: "all", q: "" }, now);
    expect(where).toEqual({});
  });

  it("bounds the past by the start", () => {
    expect(buildEventsListWhere({ show: "live", when: "past", q: "" }, now)).toEqual({
      status: "PUBLISHED",
      deletedAt: null,
      startDate: { lt: startOfToday },
    });
  });

  it("searches title, web address, place name, city and market", () => {
    const where = buildEventsListWhere({ show: "waiting", when: "upcoming", q: "fair" }, now);
    expect(where.OR).toHaveLength(5);
    expect(where.OR).toContainEqual({ market: { name: { contains: "fair", mode: "insensitive" } } });
    expect(where.OR).toContainEqual({ venue: { city: { contains: "fair", mode: "insensitive" } } });
  });
});

describe("buildEventsList on the 2026-11-03 snapshot", () => {
  const input = snapshotInput();

  it("lists the 21 waiting events of the weekend of Nov 7 under one heading with the rail's numbers", () => {
    const result = buildEventsList(input, parseEventsListParams({ week: "2026-11-07" }));
    expect(result.rows).toHaveLength(21);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ key: "2026-11-07", heading: "Weekend of Nov 7", fact: "21 waiting, 1 live" });
    expect(result.weekLabel).toBe("Weekend of Nov 7");
  });

  it("takes a weekend's waiting and live counts from the rail, so a waiting submission counts too", () => {
    const railInput = snapshotRailInput({ backfill: true });
    const withSubmission = buildWeekendRail(
      { ...railInput, submissions: [...railInput.submissions, { id: "s1", title: "Craft Fair", days: [{ date: "2026-11-07", startTime: "10:00" }] }] },
      SNAPSHOT_NOW
    );
    const result = buildEventsList({ ...input, rail: withSubmission.weeks }, parseEventsListParams({ week: "2026-11-07" }));
    expect(result.rows).toHaveLength(21);
    expect(result.groups[0].fact).toBe("22 waiting, 1 live");
  });

  it("names the local day in the heading", () => {
    const result = buildEventsList(input, parseEventsListParams({ week: "2026-11-28" }));
    expect(result.groups[0].heading).toBe("Weekend of Nov 28, Small Business Saturday");
    expect(result.groups[0].fact).toBe("8 waiting, nothing live");
  });

  it("puts the twins of the weekend side by side", () => {
    const result = buildEventsList(input, parseEventsListParams({ week: "2026-11-07" }));
    const twins = result.groups[0].items.filter((i) => i.type === "twins");
    expect(twins).toHaveLength(5);
    const rebel = snapshotIdByTitle("11th Annual Rebel Junk Holiday Market");
    const pair = twins.find((t) => itemIds(t).includes(rebel));
    expect(pair && itemIds(pair)).toContain(snapshotIdByTitle("Rebel Junk Holiday Market"));
    expect(pair?.type === "twins" && pair.key.startsWith("twins:")).toBe(true);
  });

  it("finds the 17 waiting events that may not be markets", () => {
    const result = buildEventsList(input, parseEventsListParams({ only: "trade-shows" }));
    expect(result.rows).toHaveLength(17);
    expect(result.rows.every((r) => r.flags.includes("Maybe not a market"))).toBe(true);
    expect(result.rows.map((r) => r.title)).toContain("CardCon");
  });

  it("shows the live events for Live, Yuletide flagged for its missing picture", () => {
    const result = buildEventsList(input, parseEventsListParams({ show: "live", week: "2026-11-07" }));
    expect(result.rows.map((r) => r.title)).toEqual(["Yuletide Holiday Marketplace"]);
    expect(result.rows[0].flags).toContain("No picture");
    expect(result.rows[0].mark).toBe("PUBLISHED");
  });

  it("filters by area through the town of the place", () => {
    const result = buildEventsList(input, parseEventsListParams({ area: "north-idaho", week: "2026-11-07" }));
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.area === "North Idaho")).toBe(true);
  });

  it("filters by the import a listing came from", () => {
    const result = buildEventsList(input, parseEventsListParams({}));
    expect(result.sourceOptions.map((o) => o.label)).toEqual([
      "Import of Oct 30",
      "Import of Nov 2",
      "Sent from the site",
      "Organizer accounts",
      "Added by hand",
    ]);
    const oct30 = result.sourceOptions[0].value;
    expect(oct30).toBe("import-2026-10-30");
    const fromOct30 = buildEventsList(input, parseEventsListParams({ source: oct30 }));
    expect(fromOct30.rows.length).toBeGreaterThan(0);
    expect(fromOct30.rows.every((r) => r.sourceLabel === "Import of Oct 30")).toBe(true);
  });

  it("matches any of the Needs pressed", () => {
    const withPictures = snapshotInput({}, (e) => (e.title === "Emerge Holiday Market" ? e : { ...e, imageUrl: "/uploads/x.webp" }));
    const pictures = buildEventsList(withPictures, parseEventsListParams({ needs: "picture" }));
    expect(pictures.rows.map((r) => r.title)).toEqual(["Emerge Holiday Market"]);
    const noTags = snapshotInput({}, (e) => (e.title === "CardCon" ? { ...e, tagCount: 0 } : e));
    const either = buildEventsList(
      { ...noTags, events: noTags.events.map((e) => (e.title === "Emerge Holiday Market" ? e : { ...e, imageUrl: "/uploads/x.webp" })) },
      parseEventsListParams({ needs: "picture,tags" })
    );
    expect(either.rows.map((r) => r.title).sort()).toEqual(["CardCon", "Emerge Holiday Market"]);
  });

  it("keeps Later to the weeks after the rail", () => {
    const result = buildEventsList(input, parseEventsListParams({ week: "later" }));
    const end = lastRailDay(input.rail);
    expect(end).toBe("2026-12-20");
    expect(result.groups.every((g) => g.key > end)).toBe(true);
    expect(result.weekLabel).toBe("Later, after the weekend of Dec 19");
  });

  it("orders the weekends soonest first and files each row once per weekend", () => {
    const result = buildEventsList(input, parseEventsListParams({}));
    const keys = result.groups.map((g) => g.key);
    expect(keys).toEqual([...keys].sort());
    for (const group of result.groups) {
      const ids = group.items.flatMap(itemIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("collapses the dates of a series inside one weekend", () => {
    const ids = ["Kendall Yards Christmas Market"].flatMap((title) =>
      input.events.filter((e) => e.title === title).map((e) => e.id)
    );
    expect(ids.length).toBe(6);
    const series: Series[] = [
      { key: "series:kendall", name: "Kendall Yards Christmas Market", eventIds: ids, marketId: null, marketName: null, suggestMarket: false, suggestedMarket: null, venueId: "kendall", dates: [] },
    ];
    const result = buildEventsList({ ...input, series }, parseEventsListParams({ week: "2026-11-28" }));
    const item = result.groups[0].items.find((i) => i.type === "series");
    expect(item?.type).toBe("series");
    if (item?.type === "series") {
      expect(item.entries).toHaveLength(3);
      expect(item.total).toBe(6);
    }
    expect(result.seriesIds["series:kendall"]).toEqual(ids);
    const single = buildEventsList({ ...input, series }, parseEventsListParams({ week: "2026-11-28", only: "series" }));
    expect(single.rows.every((r) => r.series?.key === "series:kendall")).toBe(true);
  });

  it("lists archived rows last under Everything with their mark and no flags", () => {
    const archivedId = snapshotIdByTitle("Emerge Holiday Market");
    const withArchived = snapshotInput({}, (e) => (e.id === archivedId ? { ...e, deletedAt: new Date("2026-11-02T00:00:00Z") } : e));
    const result = buildEventsList(withArchived, parseEventsListParams({ show: "everything", week: "2026-11-07" }));
    const items = result.groups[0].items;
    const last = items[items.length - 1];
    expect(last.type === "event" && last.entry.id).toBe(archivedId);
    const row = result.rows.find((r) => r.id === archivedId)!;
    expect(row).toMatchObject({ mark: "ARCHIVED", archived: true, flags: [] });
    const waiting = buildEventsList(withArchived, parseEventsListParams({ week: "2026-11-07" }));
    expect(waiting.rows.some((r) => r.id === archivedId)).toBe(false);
  });

  it("drops ended events from the upcoming list and keeps them in the past", () => {
    const upcoming = buildEventsList(input, parseEventsListParams({}));
    const past = buildEventsList(input, parseEventsListParams({ when: "past" }));
    const upcomingIds = new Set(upcoming.rows.map((r) => r.id));
    expect(past.rows.length).toBeGreaterThan(0);
    expect(past.rows.every((r) => !upcomingIds.has(r.id))).toBe(true);
    expect(past.groups.every((g, i, all) => i === 0 || g.key <= all[i - 1].key)).toBe(true);
  });
});

describe("words", () => {
  it("states the weekend facts plainly", () => {
    expect(weekendFact({ waiting: 21, live: 1, off: 0 })).toBe("21 waiting, 1 live");
    expect(weekendFact({ waiting: 8, live: 0, off: 0 })).toBe("8 waiting, nothing live");
    expect(weekendFact({ waiting: 0, live: 3, off: 2 })).toBe("3 live, 2 kept off the site");
  });

  it("writes the year only outside this year", () => {
    expect(weekendHeading("2027-01-09", SNAPSHOT_NOW)).toBe("Weekend of Jan 9, 2027");
  });

  it("names the filters that emptied the list", () => {
    const context = { weekLabel: "Weekend of Nov 21", sourceOptions: [] };
    expect(emptyMessage(parseEventsListParams({ week: "2026-11-21", q: "bridal" }), context)).toEqual({
      text: "No waiting events in the weekend of Nov 21 match 'bridal'.",
      clear: "search",
    });
    expect(emptyMessage(parseEventsListParams({ needs: "picture,tags", area: "spokane" }), { weekLabel: null, sourceOptions: [] })).toEqual({
      text: "No waiting events in Spokane that need a picture or tags.",
      clear: "filters",
    });
    expect(
      emptyMessage(parseEventsListParams({ show: "live", only: "twins", q: "fair" }), { weekLabel: null, sourceOptions: [] }).text
    ).toBe("No live events that are listed twice and match 'fair'.");
    expect(emptyMessage(parseEventsListParams({}), { weekLabel: null, sourceOptions: [] }).clear).toBeNull();
  });

  it("summarizes the result for the live region", () => {
    expect(resultSummary({ rows: [{}, {}] as never, groups: [{}] as never }, "weekends")).toBe("2 events in 1 weekend.");
    expect(resultSummary({ rows: [{}] as never, groups: [] }, "table")).toBe("1 event.");
    expect(resultSummary({ rows: [], groups: [] }, "weekends")).toBe("No events match.");
  });

  it("reads a day's hours from its schedule or from the start and end", () => {
    const start = new Date("2026-11-07T02:00:00.000Z");
    const end = new Date("2026-11-08T00:00:00.000Z");
    expect(dayHours({ startDate: start, endDate: end, scheduleDays: [] }, "2026-11-06")).toBe("From 6 pm");
    expect(dayHours({ startDate: start, endDate: end, scheduleDays: [] }, "2026-11-07")).toBe("Until 4 pm");
    expect(
      dayHours(
        { startDate: start, endDate: end, scheduleDays: [{ date: "2026-11-07", startTime: "10:00", endTime: "16:00", allDay: false }] },
        "2026-11-07"
      )
    ).toBe("10 am to 4 pm");
    expect(
      dayHours({ startDate: start, endDate: end, scheduleDays: [{ date: "2026-11-07", startTime: "00:00", endTime: "23:59", allDay: true }] }, "2026-11-07")
    ).toBe("All day");
  });
});

describe("buildAdminEventsWhere (the data export)", () => {
  it("uses active scope to hide archived and past events", () => {
    const where = buildAdminEventsWhere({ timeScope: "active", q: "", now: NOW });
    expect(where).toEqual({ deletedAt: null, endDate: { gte: NOW } });
  });

  it("uses all_records scope to include archived and past events", () => {
    const where = buildAdminEventsWhere({ timeScope: "all_records", q: "", now: NOW });
    expect(where).not.toHaveProperty("deletedAt");
    expect(where).not.toHaveProperty("endDate");
  });

  it("uses past scope to include only non-archived past events", () => {
    const where = buildAdminEventsWhere({ timeScope: "past", q: "", now: NOW });
    expect(where.deletedAt).toBeNull();
    expect(where.endDate).toEqual({ lt: NOW });
  });

  it("applies status filter independently of time scope", () => {
    const archivedDraft = buildAdminEventsWhere({ timeScope: "all_records", q: "", now: NOW, statusFilter: "DRAFT" });
    expect(archivedDraft.status).toBe("DRAFT");
    expect(archivedDraft).not.toHaveProperty("deletedAt");
  });

  it("searches title, slug and venue, and the export title and slug only", () => {
    expect(buildAdminEventsWhere({ timeScope: "active", q: "spring fair", now: NOW }).OR).toHaveLength(3);
    expect(buildAdminEventsExportWhere({ timeScope: "active", q: "fest", now: NOW }).OR).toEqual([
      { title: { contains: "fest", mode: "insensitive" } },
      { slug: { contains: "fest", mode: "insensitive" } },
    ]);
  });

  it("resolves the time scope from the flags", () => {
    expect(resolveAdminEventsTimeScope({ archived: false, past: false })).toBe("active");
    expect(resolveAdminEventsTimeScope({ archived: false, past: true })).toBe("past");
    expect(resolveAdminEventsTimeScope({ archived: true, past: true })).toBe("all_records");
  });
});
