import { describe, expect, it } from "vitest";
import {
  applyScheduleToEventPayload,
  isFullDayTimeRange,
  mapScheduleDaysForSubmit,
} from "./event-schedule-day";
import { eventSchema, type EventInput } from "@/lib/validations";

const baseEvent = (): EventInput =>
  eventSchema.parse({
    title: "T",
    slug: "t",
    description: "",
    startDate: "2026-01-01T08:00:00",
    endDate: "2026-01-01T14:00:00",
    timezone: "",
    venueId: "v1",
    venueName: "",
    venueAddress: "",
    venueCity: "",
    venueState: "",
    venueZip: "",
    marketId: "",
    imageUrl: "",
    showImageInList: true,
    imageFocalX: 50,
    imageFocalY: 50,
    status: "DRAFT",
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    tagIds: [],
    featureIds: [],
  }) as EventInput;

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

describe("applyScheduleToEventPayload", () => {
  it("computes startDate/endDate from first/last schedule rows", () => {
    const data = baseEvent();
    data.scheduleDays = [
      { date: "2026-06-10", allDay: false, startTime: "09:00", endTime: "12:00" },
      { date: "2026-06-11", allDay: false, startTime: "09:00", endTime: "12:00" },
    ];
    const out = applyScheduleToEventPayload(data);
    expect(out.startDate).toBe("2026-06-10T09:00:00");
    expect(out.endDate).toBe("2026-06-11T12:00:00");
  });
});
