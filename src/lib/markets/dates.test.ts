import { describe, expect, it } from "vitest";
import {
  DatePatternError,
  dateSlug,
  datesForPattern,
  isNewDateStatus,
  isSeasonLong,
  listDates,
  listingDays,
  listingRange,
  nthWeekdayOfMonth,
  pickSlugs,
  planNextSeason,
  retitleForDate,
  shiftMonth,
  validateNewDates,
  weekdayOfMonth,
  weekdayPhrase,
  type SeasonSourceEvent,
} from "./dates";

const NOW = new Date("2026-11-03T18:40:00.000Z");

/** A listing from Pacific wall-clock times (PDT in summer, PST in winter). */
function listing(id: string, start: string, end: string, extra: Partial<SeasonSourceEvent> = {}): SeasonSourceEvent {
  const offset = (iso: string) => (iso.slice(5, 7) >= "03" && iso.slice(5, 7) <= "10" ? "-07:00" : "-08:00");
  return {
    id,
    status: "PUBLISHED",
    startDate: new Date(`${start}:00${offset(start)}`),
    endDate: new Date(`${end}:00${offset(end)}`),
    scheduleDays: [],
    ...extra,
  };
}

describe("datesForPattern", () => {
  it("repeats Fridays to Sundays weekly: Kendall Yards Christmas Market next year makes 12 dates", () => {
    const dates = datesForPattern({ kind: "weekly", weekdays: [4, 5, 6], from: "2027-11-26", to: "2027-12-19" });
    expect(dates).toHaveLength(12);
    expect(dates.slice(0, 4)).toEqual(["2027-11-26", "2027-11-27", "2027-11-28", "2027-12-03"]);
    expect(dates.at(-1)).toBe("2027-12-19");
  });

  it("finds the second Saturday of each month: Community Market at Silver Lake", () => {
    expect(datesForPattern({ kind: "monthly", nth: 2, weekday: 5, from: "2026-11-01", to: "2027-03-31" })).toEqual([
      "2026-11-14",
      "2026-12-12",
      "2027-01-09",
      "2027-02-13",
      "2027-03-13",
    ]);
  });

  it("finds the last Wednesday and skips months without a fifth one", () => {
    expect(datesForPattern({ kind: "monthly", nth: -1, weekday: 2, from: "2026-11-01", to: "2027-01-31" })).toEqual([
      "2026-11-25",
      "2026-12-30",
      "2027-01-27",
    ]);
    expect(datesForPattern({ kind: "monthly", nth: 5, weekday: 0, from: "2026-11-01", to: "2027-01-31" })).toEqual(["2026-11-30"]);
  });

  it("sorts picked dates and drops repeats", () => {
    expect(datesForPattern({ kind: "dates", dates: ["2026-12-12", "2026-11-28", "2026-12-12"] })).toEqual(["2026-11-28", "2026-12-12"]);
  });

  it("refuses patterns that cannot make dates, with a message for the owner", () => {
    expect(() => datesForPattern({ kind: "weekly", weekdays: [], from: "2026-11-01", to: "2026-12-01" })).toThrow("Pick at least one day of the week.");
    expect(() => datesForPattern({ kind: "weekly", weekdays: [5], from: "2026-12-01", to: "2026-11-01" })).toThrow(DatePatternError);
    expect(() => datesForPattern({ kind: "weekly", weekdays: [5], from: "2026-01-01", to: "2029-01-01" })).toThrow("two years");
    expect(() => datesForPattern({ kind: "dates", dates: ["2026-02-30"] })).toThrow('"2026-02-30" is not a date.');
    expect(() => datesForPattern({ kind: "monthly", nth: 6, weekday: 5, from: "2026-11-01", to: "2026-12-01" })).toThrow(DatePatternError);
  });
});

describe("weekdays of a month", () => {
  it("names the nth weekday", () => {
    expect(nthWeekdayOfMonth("2026-11", 2, 5)).toBe("2026-11-14");
    expect(nthWeekdayOfMonth("2026-02", 5, 5)).toBeNull();
    expect(weekdayOfMonth("2026-11-14")).toEqual({ nth: 2, weekday: 5, last: false });
    expect(weekdayOfMonth("2026-11-28")).toEqual({ nth: 4, weekday: 5, last: true });
  });
});

describe("listings that run all season", () => {
  it("treats Millwood Farmers Market, May 27 to Oct 14, as weekly Wednesdays", () => {
    const millwood = listing("millwood", "2026-05-27T15:00", "2026-10-14T19:00");
    expect(isSeasonLong(millwood)).toBe(true);
    const days = listingDays(millwood);
    expect(days).toHaveLength(21);
    expect(days[0]).toEqual({ date: "2026-05-27", startTime: "15:00", endTime: "19:00", allDay: false });
    expect(new Set(days.map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay()))).toEqual(new Set([3]));
  });

  it("does not trust schedule days that stop months before the listing ends", () => {
    const daily = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 4, 20 + i));
      return { date: d.toISOString().slice(0, 10), startTime: "17:00", endTime: "20:30", allDay: false };
    });
    const kendall = listing("kendall", "2026-05-20T17:00", "2026-09-16T20:30", { scheduleDays: daily });
    expect(listingRange(kendall)).toEqual(["2026-05-20", "2026-09-16"]);
    const days = listingDays(kendall);
    expect(days).toHaveLength(18);
    expect(days.at(-1)).toEqual({ date: "2026-09-16", startTime: "17:00", endTime: "20:30", allDay: false });
  });

  it("keeps complete schedule days, and a short listing is one date per day", () => {
    const weekend = listing("w", "2026-11-27T09:00", "2026-11-29T18:00", {
      scheduleDays: [
        { date: "2026-11-27", startTime: "09:00", endTime: "19:00", allDay: false },
        { date: "2026-11-28", startTime: "10:00", endTime: "19:00", allDay: false },
        { date: "2026-11-29", startTime: "10:00", endTime: "18:00", allDay: false },
      ],
    });
    expect(isSeasonLong(weekend)).toBe(false);
    expect(listingDays(weekend).map((d) => d.startTime)).toEqual(["09:00", "10:00", "10:00"]);
    expect(listingDays(listing("one", "2026-09-26T10:00", "2026-09-26T19:00"))).toEqual([
      { date: "2026-09-26", startTime: "10:00", endTime: "19:00", allDay: false },
    ]);
  });
});

describe("planNextSeason", () => {
  it("moves last season 52 weeks so Wednesdays stay Wednesdays: Millwood makes May 26 to Oct 13, 2027", () => {
    const plan = planNextSeason([listing("millwood", "2026-05-27T15:00", "2026-10-14T19:00")], "2026-11-03");
    expect(plan).toHaveLength(21);
    expect(plan[0]).toEqual({ date: "2027-05-26", startTime: "15:00", endTime: "19:00", allDay: false, sourceEventId: "millwood", sourceDate: "2026-05-27" });
    expect(plan.at(-1)?.date).toBe("2027-10-13");
  });

  it("leaves out dates already listed, dates before today, upcoming dates and rejected listings", () => {
    const events = [
      listing("fair", "2026-09-26T10:00", "2026-09-26T19:00"),
      listing("old", "2025-09-20T10:00", "2025-09-20T19:00"),
      listing("ahead", "2026-11-27T12:00", "2026-11-27T16:00"),
      listing("rejected", "2026-08-01T10:00", "2026-08-01T12:00", { status: "REJECTED" }),
    ];
    expect(planNextSeason(events, "2026-11-03").map((p) => p.date)).toEqual(["2027-09-25"]);
    expect(planNextSeason(events, "2026-11-03", ["2027-09-25"])).toEqual([]);
  });
});

describe("new dates", () => {
  it("moves a year in the title with the date", () => {
    expect(retitleForDate("Family Fall Festival 2027", "2027-10-16", "2028-10-14")).toBe("Family Fall Festival 2028");
    expect(retitleForDate("Kendall Yards Christmas Market", "2026-11-27", "2027-11-26")).toBe("Kendall Yards Christmas Market");
  });

  it("builds web addresses from the title without years, then the date, and never reuses one", () => {
    expect(dateSlug("Family Fall Festival 2028", "2028-10-14")).toBe("family-fall-festival-2028-10-14");
    expect(dateSlug("Kendall Yards Christmas Market", "2027-11-26")).toBe("kendall-yards-christmas-market-2027-11-26");
    const taken = new Set(["a-2027-01-01", "a-2027-01-01-2"]);
    expect(pickSlugs(["a-2027-01-01", "a-2027-01-01", "b-2027-01-02"], taken)).toEqual(["a-2027-01-01-3", "a-2027-01-01-4", "b-2027-01-02"]);
    expect(dateSlug("x".repeat(200), "2027-01-01").length).toBeLessThanOrEqual(120);
  });

  it("checks hours before anything is written", () => {
    expect(validateNewDates([{ date: "2027-01-09", allDay: true }])).toEqual([{ date: "2027-01-09", allDay: true, startTime: "00:00", endTime: "23:59" }]);
    expect(() => validateNewDates([{ date: "2027-01-09", startTime: "16:00", endTime: "12:00" }])).toThrow("The closing time is before the opening time.");
    expect(() => validateNewDates([{ date: "2027-01-09", startTime: "9am", endTime: "12:00" }])).toThrow(DatePatternError);
    expect(() => validateNewDates([])).toThrow("There are no dates to create.");
    expect(() => validateNewDates(Array.from({ length: 101 }, () => ({ date: "2027-01-09", allDay: true })))).toThrow("at most 100");
  });

  it("refuses dates before today and any status but Draft or Published", () => {
    expect(() => validateNewDates([{ date: "2026-11-02", allDay: true }], "2026-11-03")).toThrow("has gone by");
    expect(validateNewDates([{ date: "2026-11-03", allDay: true }], "2026-11-03")).toHaveLength(1);
    expect(isNewDateStatus("DRAFT")).toBe(true);
    expect(isNewDateStatus("PUBLISHED")).toBe(true);
    expect(isNewDateStatus("PENDING")).toBe(false);
  });

  it("moves months across years either way", () => {
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 12)).toBe("2027-11");
  });

  it("words dates and weekdays as the owner reads them", () => {
    expect(listDates(["2027-11-26", "2027-11-27", "2027-11-28", "2027-12-03", "2027-12-04"], NOW)).toBe(
      "Fri Nov 26, 2027, Sat Nov 27, 2027, Sun Nov 28, 2027, Fri Dec 3, 2027, and 1 more"
    );
    expect(listDates(["2026-11-14", "2026-12-12"], NOW)).toBe("Sat Nov 14 and Sat Dec 12");
    expect(weekdayPhrase(["2026-11-27", "2026-11-28", "2026-11-29"])).toBe("Fridays to Sundays");
    expect(weekdayPhrase(["2026-11-25", "2026-11-28"])).toBe("Wednesdays and Saturdays");
  });
});
