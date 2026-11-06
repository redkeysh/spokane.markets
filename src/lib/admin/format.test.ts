import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDay,
  formatDayRange,
  formatFullDate,
  formatLongDay,
  formatMonthDay,
  formatTime,
  formatTimeRange,
  formatTimestamp,
  formatWeekendSpan,
  pacificDate,
  pacificTime,
  saturdayOf,
  startOfPacificDay,
  endOfPacificDay,
  weekdayIndex,
} from "./format";

const now = new Date("2026-11-03T18:40:00.000Z");

describe("Pacific calendar", () => {
  it("reads instants in Pacific time across the DST change", () => {
    expect(pacificDate(new Date("2026-11-07T01:30:00Z"))).toBe("2026-11-06");
    expect(pacificTime(new Date("2026-11-07T01:30:00Z"))).toBe("17:30");
    expect(pacificTime(new Date("2026-10-30T17:45:00Z"))).toBe("10:45");
    expect(pacificDate(new Date("2026-11-03T06:22:00Z"))).toBe("2026-11-02");
  });

  it("finds Pacific midnight, also on the days the clocks change", () => {
    expect(startOfPacificDay("2026-11-03")).toEqual(new Date("2026-11-03T08:00:00Z"));
    expect(startOfPacificDay("2026-07-04")).toEqual(new Date("2026-07-04T07:00:00Z"));
    expect(startOfPacificDay("2026-11-01")).toEqual(new Date("2026-11-01T07:00:00Z"));
    expect(startOfPacificDay("2027-03-14")).toEqual(new Date("2027-03-14T08:00:00Z"));
  });

  it("ends a Pacific day one millisecond before the next one begins, across clock changes", () => {
    expect(endOfPacificDay("2026-12-01")).toEqual(new Date("2026-12-02T07:59:59.999Z"));
    expect(endOfPacificDay("2026-07-04")).toEqual(new Date("2026-07-05T06:59:59.999Z"));
    expect(endOfPacificDay("2026-10-31")).toEqual(new Date("2026-11-01T06:59:59.999Z"));
    expect(endOfPacificDay("2026-11-01")).toEqual(new Date("2026-11-02T07:59:59.999Z"));
    expect(pacificDate(endOfPacificDay("2027-03-14"))).toBe("2027-03-14");
  });

  it("does date arithmetic on calendar dates", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-03", "2026-11-07")).toBe(4);
    expect(weekdayIndex("2026-11-02")).toBe(0);
    expect(weekdayIndex("2026-11-08")).toBe(6);
    expect(saturdayOf("2026-11-02")).toBe("2026-11-07");
    expect(saturdayOf("2026-11-08")).toBe("2026-11-07");
    expect(saturdayOf("2026-11-09")).toBe("2026-11-14");
  });
});

describe("wording", () => {
  it("formats days, adding the year outside the current one", () => {
    expect(formatDay("2026-11-07", now)).toBe("Sat Nov 7");
    expect(formatDay("2027-01-09", now)).toBe("Sat Jan 9, 2027");
    expect(formatMonthDay("2026-11-07", now)).toBe("Nov 7");
    expect(formatFullDate("2026-11-03")).toBe("Nov 3, 2026");
    expect(formatDayRange("2026-11-06", "2026-11-08", now)).toBe("Fri Nov 6 to Sun Nov 8");
    expect(formatDayRange("2026-11-07", "2026-11-07", now)).toBe("Sat Nov 7");
    expect(formatLongDay("2026-11-03")).toBe("Tuesday, November 3");
  });

  it("formats weekend spans", () => {
    expect(formatWeekendSpan("2026-11-07", now)).toBe("Nov 6 to 8");
    expect(formatWeekendSpan("2026-10-31", now)).toBe("Oct 30 to Nov 1");
    expect(formatWeekendSpan("2027-01-09", now)).toBe("Jan 8 to 10, 2027");
    expect(formatWeekendSpan("2027-01-01", now)).toBe("Dec 31, 2026 to Jan 2, 2027");
  });

  it("formats times, dense on the hour", () => {
    expect(formatTime("10:00")).toBe("10:00 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("00:00")).toBe("12:00 am");
    expect(formatTime("11:00", { dense: true })).toBe("11 am");
    expect(formatTime("17:30", { dense: true })).toBe("5:30 pm");
    expect(formatTimeRange("12:00", "16:00")).toBe("12:00 to 4:00 pm");
    expect(formatTimeRange("10:00", "16:00")).toBe("10:00 am to 4:00 pm");
  });

  it("formats timestamps in Pacific time", () => {
    expect(formatTimestamp(new Date("2026-11-03T17:41:00Z"))).toBe("Nov 3, 2026 at 9:41 am");
  });
});
