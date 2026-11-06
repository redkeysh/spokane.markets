import { describe, expect, it } from "vitest";
import { isFullDayTimeRange, mapScheduleDaysForSubmit } from "./event-schedule-day";

describe("isFullDayTimeRange", () => {
  it("is true only for 00:00–23:59", () => {
    expect(isFullDayTimeRange("00:00", "23:59")).toBe(true);
    expect(isFullDayTimeRange("08:00", "14:00")).toBe(false);
    expect(isFullDayTimeRange("00:00", "14:00")).toBe(false);
  });
});

describe("mapScheduleDaysForSubmit", () => {
  it("sets allDay when times are full calendar span", () => {
    const out = mapScheduleDaysForSubmit([
      { date: "2026-06-01", allDay: false, startTime: "00:00", endTime: "23:59" },
    ]);
    expect(out[0].allDay).toBe(true);
  });

  it("clears allDay for partial-day times", () => {
    const out = mapScheduleDaysForSubmit([
      { date: "2026-06-01", allDay: true, startTime: "08:00", endTime: "14:00" },
    ]);
    expect(out[0].allDay).toBe(false);
  });
});
