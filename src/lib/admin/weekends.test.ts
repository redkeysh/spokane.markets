import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { SNAPSHOT_NOW, snapshotRailInput } from "./__fixtures__/snapshot";
import { buildWeekendRail, submissionDays, type RailInput } from "./weekends";

const caption = (w: { live: number; pending: number; draft: number }) => `${w.live} of ${w.live + w.pending + w.draft}`;

describe("buildWeekendRail on the 2026-11-03 snapshot", () => {
  const rail = buildWeekendRail(snapshotRailInput(), SNAPSHOT_NOW);

  it("starts in the current week, on a Tuesday", () => {
    expect(rail.today).toBe("2026-11-03");
    expect(rail.todayWeekday).toBe(1);
    expect(rail.weeks.map((w) => w.key)).toEqual([
      "2026-11-07",
      "2026-11-14",
      "2026-11-21",
      "2026-11-28",
      "2026-12-05",
      "2026-12-12",
      "2026-12-19",
      "later",
    ]);
  });

  it("counts the acceptance numbers: 1 of 22, 2 of 16, 1 of 7, 0 of 8, 2 of 13, 0 of 11, 0 of 4, Later 0 of 21", () => {
    expect(rail.weeks.map(caption)).toEqual(["1 of 22", "2 of 16", "1 of 7", "0 of 8", "2 of 13", "0 of 11", "0 of 4", "0 of 21"]);
  });

  it("gives the same counts with the backfilled schedule days", () => {
    expect(buildWeekendRail(snapshotRailInput({ backfill: true }), SNAPSHOT_NOW).weeks.map(caption)).toEqual(
      rail.weeks.map(caption)
    );
  });

  it("names the weeks and labels Later with its months", () => {
    expect(rail.weeks.map((w) => [w.label, w.name])).toEqual([
      ["Nov 7", "This Saturday"],
      ["Nov 14", "Next Saturday"],
      ["Nov 21", null],
      ["Nov 28", "Small Business Saturday"],
      ["Dec 5", null],
      ["Dec 12", null],
      ["Dec 19", "Saturday before Christmas"],
      ["Later", "Jan to Oct 2027"],
    ]);
  });

  it("orders stalls Published, Pending, Draft and labels their start", () => {
    const nov7 = rail.weeks[0];
    const statuses = nov7.stalls.map((s) => s.status);
    expect(statuses.indexOf("PENDING")).toBeGreaterThan(statuses.lastIndexOf("PUBLISHED"));
    expect(statuses.indexOf("DRAFT")).toBeGreaterThan(statuses.lastIndexOf("PENDING"));
    expect(nov7.stalls[0]).toMatchObject({ title: "Yuletide Holiday Marketplace", status: "PUBLISHED", startLabel: "Fri 10 am", kind: "event" });
    expect(nov7.stalls.find((s) => s.title === "Emerge Holiday Market")?.startLabel).toBe("Sat 11 am");
    expect(rail.weeks[7].stalls.find((s) => s.title === "Spokane Boat Show")?.startLabel).toMatch(/^Thu Jan 28, 2027, /);
  });
});

describe("buildWeekendRail rules", () => {
  const now = new Date("2026-11-03T18:00:00.000Z");
  const event = (id: string, start: string, end: string, status = "PENDING", scheduleDays: RailInput["events"][number]["scheduleDays"] = []) => ({
    id,
    title: id,
    status,
    startDate: new Date(start),
    endDate: new Date(end),
    scheduleDays,
  });

  it("files an event into every week it touches, from today on", () => {
    const rail = buildWeekendRail(
      {
        events: [
          event("spans", "2026-11-07T17:00:00Z", "2026-11-10T01:00:00Z"),
          event("ended-yesterday", "2026-11-02T17:00:00Z", "2026-11-03T01:00:00Z"),
          event("cancelled", "2026-11-07T17:00:00Z", "2026-11-08T01:00:00Z", "CANCELLED"),
        ],
        submissions: [],
      },
      now
    );
    expect(rail.weeks[0].stalls.map((s) => s.id)).toEqual(["spans"]);
    expect(rail.weeks[1].stalls.map((s) => s.id)).toEqual(["spans"]);
    expect(rail.weeks[1].stalls[0].startLabel).toBe("Mon");
  });

  it("uses schedule days over the start and end", () => {
    const rail = buildWeekendRail(
      {
        events: [
          event("weekly", "2026-11-04T23:00:00Z", "2026-11-26T03:00:00Z", "PUBLISHED", [
            { date: "2026-11-04", startTime: "15:00", allDay: false },
            { date: "2026-11-25", startTime: "15:00", allDay: false },
          ]),
        ],
        submissions: [],
      },
      now
    );
    expect(rail.weeks.map((w) => w.live)).toEqual([1, 0, 0, 1, 0, 0, 0, 0]);
    expect(rail.weeks[3].stalls[0].startLabel).toBe("Wed 3 pm");
  });

  it("counts a pending submission as a waiting stall", () => {
    const rail = buildWeekendRail(
      { events: [], submissions: [{ id: "s1", title: "Market Day", days: [{ date: "2027-03-06", startTime: "10:00" }] }] },
      now
    );
    expect(rail.weeks[7]).toMatchObject({ pending: 1, name: "Mar 2027" });
    expect(rail.weeks[7].stalls[0]).toMatchObject({ kind: "submission", status: "PENDING", startLabel: "Sat Mar 6, 2027, 10 am" });
  });

  it("leaves Later unnamed when nothing is in it", () => {
    expect(buildWeekendRail({ events: [], submissions: [] }, now).weeks[7].name).toBeNull();
  });

  it("calls the current week this weekend on a Sunday, when its Saturday has passed", () => {
    const sunday = buildWeekendRail({ events: [], submissions: [] }, new Date("2026-11-08T19:00:00Z"));
    expect(sunday.todayWeekday).toBe(6);
    expect(sunday.weeks.slice(0, 2).map((w) => [w.saturday, w.name])).toEqual([
      ["2026-11-07", "This weekend"],
      ["2026-11-14", "Next Saturday"],
    ]);
    expect(buildWeekendRail({ events: [], submissions: [] }, new Date("2026-11-07T19:00:00Z")).weeks[0].name).toBe("This Saturday");
  });
});

describe("submissionDays", () => {
  it("reads schedule days, or the first date when there are none", () => {
    expect(
      submissionDays({
        eventDate: "2026-07-04",
        eventTime: "10:00",
        allDay: false,
        scheduleDays: [
          { date: "2026-07-04", allDay: false, startTime: "09:00", endTime: "12:00" },
          { date: "2026-07-05", allDay: true },
        ],
      })
    ).toEqual([
      { date: "2026-07-04", startTime: "09:00" },
      { date: "2026-07-05", startTime: null },
    ]);
    expect(submissionDays({ eventDate: "2026-07-04", eventTime: "10:00", allDay: false, scheduleDays: null })).toEqual([
      { date: "2026-07-04", startTime: "10:00" },
    ]);
  });
});
