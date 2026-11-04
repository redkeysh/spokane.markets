import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { looksLikeTradeShow } from "@/lib/events/trade-shows";
import { pairKey } from "@/lib/events/twins";
import { snapshotDecisionInput, snapshotIdByTitle, SNAPSHOT_NOW } from "../__fixtures__/snapshot";
import { buildDecisions, DECISION_KINDS } from "./index";
import type { Decision, DecisionEvent, DecisionInput, DecisionKindDefinition } from "./types";

/** The 8 events the Nov 7 ready batch holds once series take their dates. */
const READY_EIGHT = [
  "Emerge Holiday Market",
  "Spokane Potters' Guild SouperBowl Fundraiser",
  "Mistequa Casino Hotel Holiday Marketplace",
  "Craft and Bake Sale at Pilgrim Lutheran Church",
  "Annual St. Gregorios Christian Bazaar",
  "Whitworth Auxiliary 2026 Fall Bazaar",
  "Central Valley High School Fall Craft Fair",
  "Holiday Bazaar (Trinity Lutheran Church)",
];
const SERIES_DATES_ON_NOV_7 = ["Handmade Holiday Craft Fair", "Spokane Farmers' Market"];

/** Of the 6 upcoming published events in the snapshot, only Yuletide Holiday Marketplace has no picture. */
function withPictures(input: DecisionInput): DecisionInput {
  return {
    ...input,
    events: input.events.map((e) =>
      e.status === "PUBLISHED" && e.title !== "Yuletide Holiday Marketplace" ? { ...e, imageUrl: "/uploads/event/x.webp" } : e
    ),
  };
}

/** The kinds without series detection, so series dates fall to the ready batch. */
const WITHOUT_SERIES: DecisionKindDefinition[] = DECISION_KINDS.map((k) => (k.kind === "series" ? { ...k, find: () => [] } : k));

const titleOf = (input: DecisionInput) => {
  const map = new Map(input.events.map((e) => [e.id, e.title]));
  return (d: Decision) => d.settles.map((id) => map.get(id)!);
};

describe("decisions on the 2026-11-03 snapshot, after the schedule-day backfill", () => {
  const input = withPictures(snapshotDecisionInput({ backfill: true }));
  const titles = titleOf(input);
  const result = buildDecisions(input);
  const nov7 = result.decisions.filter((d) => d.lane === "week:2026-11-07");
  const readyNov7 = nov7.find((d) => d.kind === "ready")!;

  it("puts 10 events in the Nov 7 ready batch without series detection: the 8 plus two series dates", () => {
    const batch = buildDecisions(input, WITHOUT_SERIES).decisions.find((d) => d.key === "ready:2026-11-07")!;
    expect(titles(batch).sort()).toEqual([...READY_EIGHT, ...SERIES_DATES_ON_NOV_7].sort());
    expect(batch.title).toBe("Publish the 10 ready");
  });

  it("puts exactly the 8 in the Nov 7 ready batch once series take their dates", () => {
    expect(readyNov7.key).toBe("ready:2026-11-07");
    expect(titles(readyNov7).sort()).toEqual([...READY_EIGHT].sort());
    expect(readyNov7.title).toBe("Publish the 8 ready");
    expect(readyNov7.detail).toBe("8 events, no pictures");
    expect(readyNov7.primary).toEqual({ label: "Publish the 8 ready", action: "publish", notifies: [] });
  });

  it("files the series, with the two that start on Nov 7 named as the pile shows them", () => {
    const series = result.decisions.filter((d) => d.kind === "series");
    expect(series.map((d) => [d.title, d.lane])).toEqual([
      ["Rathdrum Craft and Farmers Market, 5 dates", "week:2026-11-07"],
      ["Spokane Farmers' Market, 3 dates", "week:2026-11-07"],
      ["Community Market at Silver Lake, 4 dates", "week:2026-11-14"],
      ["Kendall Yards Christmas Market, 6 dates", "week:2026-11-28"],
      ["A Very Merry Market, 4 dates", "week:2026-11-28"],
      ["German Christmas Market (Post Falls Public Market), 4 dates", "week:2026-11-28"],
      ["Cabin Fever Indoor Market, 2 dates", "later"],
    ]);
    const farmers = series.find((d) => d.title.startsWith("Spokane Farmers"))!;
    expect(titles(farmers)).toEqual(["Spokane Farmers' Market", "Spokane Farmers' Market", "Spokane Farmers' Market"]);
    expect(farmers.detail).toBe("Coeur d'Alene Park, Sat Nov 7 to Sat Nov 21");
    expect(farmers.primary).toEqual({ label: "Publish 3 dates", action: "publish", notifies: [] });
    const kendall = series.find((d) => d.title.startsWith("Kendall"))!;
    expect(kendall.key).toBe("series:market:cmmacl70l000m3pmwhwiekmut");
    expect(kendall.settles).toHaveLength(6);
    const merry = series.find((d) => d.title.startsWith("A Very Merry"))!;
    expect(merry.detail).toBe("Silver Lake Mall, Fri Nov 27 to Sun Dec 20");
  });

  it("keeps every twin and trade show out of every ready batch", () => {
    const twinIds = new Set(result.decisions.filter((d) => d.kind === "twins").flatMap((d) => d.settles));
    for (const batch of result.decisions.filter((d) => d.kind === "ready")) {
      expect(batch.settles.filter((id) => twinIds.has(id))).toEqual([]);
      expect(titles(batch).filter(looksLikeTradeShow)).toEqual([]);
    }
  });

  it("files the 17 trade shows as one batch in the lane of CardCon", () => {
    const batch = result.decisions.find((d) => d.kind === "trade-shows")!;
    expect(batch.settles).toHaveLength(17);
    expect(batch.lane).toBe("week:2026-11-07");
    expect(batch.title).toBe("17 look like trade shows");
    expect(batch.detail).toBe("CardCon and 16 later");
    expect(batch.primary.label).toBe('Reject 17: "Not a market or fair"');
  });

  it("makes 8 twin decisions: the 12 pairs less the 4 inside the trade-show batch, 5 of them on Nov 7", () => {
    const twins = result.decisions.filter((d) => d.kind === "twins");
    expect(twins).toHaveLength(8);
    expect(nov7.filter((d) => d.kind === "twins").map((d) => d.title)).toEqual([
      "Rebel Junk Holiday Market, twice",
      "Fall Holistic Festival, twice",
      "Hillyard Senior Center Craft Bazaar, twice",
      "Holiday Bazaar in Cheney, twice",
      "Post Falls Holiday Craft Fair, twice",
    ]);
  });

  it("files the three waiting events that already happened as one decision", () => {
    const gone = result.decisions.filter((d) => d.lane === "gone");
    expect(gone).toHaveLength(1);
    expect(titles(gone[0]).sort()).toEqual(
      ["Millwood Farmers Market", "Scale House Seasonal Open-Air Market", "Spokane Farmers' Market"].sort()
    );
    expect(gone[0].primary).toEqual({ label: "Archive 3", action: "archive" });
  });

  it("flags Yuletide Holiday Marketplace as live with no picture", () => {
    const wrong = result.decisions.filter((d) => d.kind === "looks-wrong");
    expect(wrong.map((d) => d.title)).toEqual(["Yuletide Holiday Marketplace: live, no picture"]);
    expect(wrong[0].lane).toBe("week:2026-11-07");
  });

  it("orders the Nov 7 lane as the pile shows it", () => {
    const lane = nov7;
    expect(lane.map((d) => d.kind)).toEqual([
      "ready",
      "twins",
      "twins",
      "twins",
      "twins",
      "twins",
      "series",
      "series",
      "trade-shows",
      "looks-wrong",
    ]);
    expect(lane.flatMap((d) => d.settles).filter((id) => input.events.find((e) => e.id === id)!.startDate < new Date("2026-11-09"))).toHaveLength(21);
  });

  it("puts each waiting row in at most one event decision", () => {
    const counts = new Map<string, number>();
    for (const d of result.decisions) {
      if (d.kind === "looks-wrong") continue;
      for (const id of d.settles) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(counts.size).toBe(99);
  });

  it("summarizes the lanes like the rail", () => {
    const lanes = new Map(result.lanes.map((l) => [l.lane, l]));
    expect(result.lanes.map((l) => [l.label, l.waiting])).toEqual([
      ["From the public", 0],
      ["This weekend, Nov 6 to 8", 21],
      ["Next weekend, Nov 13 to 15", 14],
      ["Nov 20 to 22", 6],
      ["Nov 27 to 29, Small Business Saturday", 8],
      ["Dec 4 to 6", 11],
      ["Dec 11 to 13", 11],
      ["Dec 18 to 20, Saturday before Christmas", 4],
      ["Later, 2027", 21],
      ["Already happened", 3],
      ["Places, no deadline", 0],
    ]);
    const week = lanes.get("week:2026-11-07")!;
    expect(week.areas).toEqual([
      { area: "Spokane", live: 1, total: 8 },
      { area: "Spokane Valley", live: 0, total: 3 },
      { area: "North Idaho", live: 0, total: 8 },
      { area: "Farther out", live: 0, total: 3 },
    ]);
    expect(week.origins).toEqual([
      { source: "Import of Oct 30", live: 1, total: 13 },
      { source: "Import of Nov 2", live: 0, total: 9 },
    ]);
  });
});

describe("decisions on the raw snapshot, before the backfill", () => {
  it("keeps the two multi-day events without daily hours out of the batch", () => {
    const input = snapshotDecisionInput();
    const titles = titleOf(input);
    const result = buildDecisions(input);
    const batch = result.decisions.find((d) => d.key === "ready:2026-11-07")!;
    expect(titles(batch)).toHaveLength(6);
    expect(titles(batch)).not.toContain("Mistequa Casino Hotel Holiday Marketplace");
    expect(titles(batch).filter((t) => SERIES_DATES_ON_NOV_7.includes(t))).toEqual([]);
    const mistequa = result.decisions.find((d) => d.key === `single:${snapshotIdByTitle("Mistequa Casino Hotel Holiday Marketplace")}`)!;
    expect(mistequa.detail).toBe("Runs 2 days with no daily hours.");
    expect(mistequa.rows[0].flags).toContain("multi-day-no-hours");
  });
});

describe("memos", () => {
  const base = snapshotDecisionInput({ backfill: true });

  it("leaves out a pair marked as different events, and its rows fall to the next kind", () => {
    const a = snapshotIdByTitle("Hillyard Senior Center Holiday Craft Bazaar");
    const b = snapshotIdByTitle("Hillyard Senior Center Craft Bazaar");
    const result = buildDecisions({ ...base, memos: [{ kind: "not-same-event", key: pairKey(a, b), until: null }] });
    expect(result.decisions.some((d) => d.key === `twins:${pairKey(a, b)}`)).toBe(false);
    expect(result.decisions.find((d) => d.key === "ready:2026-11-07")!.settles).toEqual(expect.arrayContaining([a, b]));
  });

  it("sets aside a snoozed decision until its memo runs out, without freeing its rows", () => {
    const until = new Date(SNAPSHOT_NOW.getTime() + 86_400_000);
    const result = buildDecisions({ ...base, memos: [{ kind: "later", key: "trade-shows", until }] });
    expect(result.decisions.some((d) => d.key === "trade-shows")).toBe(false);
    expect(result.snoozed.map((s) => [s.decision.key, s.until])).toEqual([["trade-shows", until]]);
    expect(result.decisions.flatMap((d) => d.settles)).not.toContain(snapshotIdByTitle("CardCon"));

    const expired = buildDecisions({ ...base, memos: [{ kind: "later", key: "trade-shows", until: new Date(SNAPSHOT_NOW.getTime() - 1) }] });
    expect(expired.decisions.some((d) => d.key === "trade-shows")).toBe(true);
  });
});

describe("kinds that need fields the snapshot lacks", () => {
  const event = (overrides: Partial<DecisionEvent>): DecisionEvent => ({
    id: "e1",
    title: "Big Show",
    slug: "big-show",
    status: "PENDING",
    startDate: new Date("2027-07-17T18:00:00Z"),
    endDate: new Date("2027-07-18T02:00:00Z"),
    createdAt: new Date("2026-11-02T00:00:00Z"),
    updatedAt: new Date("2026-11-02T00:00:00Z"),
    scheduleDays: [],
    description: "A show.",
    imageUrl: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    tagCount: 1,
    featureCount: 1,
    marketId: null,
    marketName: null,
    venue: { id: "v1", name: "Hall", address: "1 Main St", city: "Spokane", state: "WA", zip: "99201", neighborhood: null, deletedAt: null },
    submittedBy: null,
    submission: null,
    ...overrides,
  });
  const input = (events: DecisionEvent[], extra: Partial<DecisionInput> = {}): DecisionInput => ({
    now: SNAPSHOT_NOW,
    events,
    submissions: [],
    venues: [],
    memos: [],
    ...extra,
  });

  it("finds an event whose submission was approved but never published, and names who is told", () => {
    const result = buildDecisions(
      input([
        event({
          submission: { id: "s1", status: "APPROVED" },
          submittedBy: { id: "u1", name: "Dana Smith", role: "USER", alertsOn: true },
        }),
      ])
    );
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      key: "approved-unpublished:e1",
      lane: "later",
      primary: { label: "Publish and tell Dana", action: "publish", notifies: ["Dana Smith"] },
    });
  });

  it("does not name a submitter who turned organizer alerts off", () => {
    const result = buildDecisions(input([event({ submittedBy: { id: "u1", name: "Dana", role: "ORGANIZER", alertsOn: false } })]));
    expect(result.decisions[0].primary).toEqual({ label: "Publish", action: "publish", notifies: [] });
  });

  it("flags live hours that close before they open", () => {
    const result = buildDecisions(
      input([
        event({
          status: "PUBLISHED",
          startDate: new Date("2026-11-20T18:00:00Z"),
          endDate: new Date("2026-11-22T00:00:00Z"),
          imageUrl: "/uploads/a.webp",
          scheduleDays: [
            { date: "2026-11-20", startTime: "10:00", endTime: "08:00", allDay: false },
            { date: "2026-11-21", startTime: "10:00", endTime: "16:00", allDay: false },
          ],
        }),
      ])
    );
    expect(result.decisions[0]).toMatchObject({
      kind: "looks-wrong",
      title: "Big Show: live, closes before it opens",
      detail: "Fri Nov 20 closes at 8:00 am, before it opens at 10:00 am.",
      primary: { action: "fix-hours" },
    });
  });

  it("files pending submissions in the public lane and counts them", () => {
    const result = buildDecisions(
      input([], {
        submissions: [
          {
            id: "s1",
            title: "Market Day",
            createdAt: new Date("2026-11-02T00:10:00Z"),
            submitterName: "Pat Lee",
            submitterHasAccount: true,
            dates: ["2026-11-14"],
            venueName: "Hall",
            venueCity: "Spokane",
          },
        ],
      })
    );
    expect(result.decisions[0]).toMatchObject({
      key: "submission:s1",
      lane: "public",
      firstDate: "2026-11-14",
      primary: { label: "Publish and tell Pat", action: "publish-submission" },
    });
    expect(result.lanes[0]).toMatchObject({ lane: "public", waiting: 1, decisions: 1 });
  });
});

describe("copies of one event outside a plain waiting pair", () => {
  const hall = { id: "v1", name: "Hall", address: "1 Main St", city: "Spokane", state: "WA", zip: "99201", neighborhood: "x", deletedAt: null };
  const church = { ...hall, id: "v2", name: "Church", address: "2 Main St" };
  const event = (id: string, overrides: Partial<DecisionEvent> = {}): DecisionEvent => ({
    id,
    title: "Holiday Craft Fair",
    slug: `holiday-craft-fair-${id}`,
    status: "PENDING",
    startDate: new Date("2026-11-07T17:00:00Z"),
    endDate: new Date("2026-11-08T00:00:00Z"),
    createdAt: SNAPSHOT_NOW,
    updatedAt: SNAPSHOT_NOW,
    scheduleDays: [{ date: "2026-11-07", startTime: "09:00", endTime: "16:00", allDay: false }],
    description: null,
    imageUrl: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    tagCount: 1,
    featureCount: 1,
    marketId: null,
    marketName: null,
    venue: hall,
    submittedBy: null,
    submission: null,
    ...overrides,
  });
  /** A ready event elsewhere, so a stray copy would make a ready batch with it. */
  const other = event("other", { title: "Church Bazaar", slug: "church-bazaar", venue: church });
  const decide = (events: DecisionEvent[]) => buildDecisions({ now: SNAPSHOT_NOW, events, submissions: [], venues: [], memos: [] });
  const settledBy = (result: ReturnType<typeof decide>, kind: string) =>
    result.decisions.filter((d) => d.kind === kind).flatMap((d) => d.settles);

  it("files three copies as one decision, leaving none for the ready batch", () => {
    const result = decide([
      event("a"),
      event("b", { title: "Holiday Craft Fair 2026" }),
      event("c", { title: "Annual Holiday Craft Fair" }),
      other,
    ]);
    const twins = result.decisions.filter((d) => d.kind === "twins");
    expect(twins).toHaveLength(1);
    expect(twins[0]).toMatchObject({
      key: "twins:a|b|c",
      title: "Holiday Craft Fair, 3 times",
      settles: ["c", "a", "b"],
      primary: { label: "Keep 1 and publish", action: "keep-one" },
    });
    expect(settledBy(result, "ready")).toEqual([]);
    expect(result.decisions.find((d) => d.key === "single:other")).toBeDefined();
  });

  it("keeps the copy approved under the old flow and archives the other, without a ready batch", () => {
    const result = decide([event("a", { submission: { id: "s1", status: "APPROVED" } }), event("b"), other]);
    expect(settledBy(result, "approved-unpublished")).toEqual(["a"]);
    expect(result.decisions.find((d) => d.kind === "twins")).toMatchObject({
      rows: [{ id: "a" }, { id: "b" }],
      settles: ["b"],
      suggestedKeepId: "a",
      primary: { label: "Keep 1", action: "archive-duplicates" },
    });
    expect(settledBy(result, "ready")).toEqual([]);
  });

  it("keeps a live copy and archives the waiting one, without a ready batch", () => {
    const result = decide([event("a", { status: "PUBLISHED", imageUrl: "/uploads/a.webp" }), event("b"), other]);
    expect(result.decisions.find((d) => d.kind === "twins")).toMatchObject({
      settles: ["b"],
      suggestedKeepId: "a",
      primary: { label: "Keep the live one", action: "archive-duplicates" },
    });
    expect(settledBy(result, "ready")).toEqual([]);
    expect(settledBy(result, "single")).toEqual(["other"]);
  });

  it("skips a pair whose copies are both live", () => {
    const result = decide([
      event("a", { status: "PUBLISHED", imageUrl: "/uploads/a.webp" }),
      event("b", { status: "PUBLISHED", imageUrl: "/uploads/b.webp" }),
    ]);
    expect(result.decisions.filter((d) => d.kind === "twins")).toEqual([]);
  });

  it("files a waiting event that only maybe matches a twin as a maybe pair", () => {
    const result = decide([
      event("a"),
      event("b", { title: "Holiday Craft Fair 2026" }),
      event("c", { title: "Craft Beer Garden" }),
      event("d", { title: "Winter Bake Sale", venue: church }),
      other,
    ]);
    expect(result.decisions.find((d) => d.kind === "maybe-twins")).toMatchObject({ settles: ["c"], primary: { action: "compare" } });
    expect(settledBy(result, "ready").sort()).toEqual(["d", "other"]);
  });
});
