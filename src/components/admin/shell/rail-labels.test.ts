import { describe, expect, it } from "vitest";
import type { RailWeek } from "@/lib/admin/weekends";
import {
  chipDate,
  columnLabel,
  railCaption,
  slimCaption,
  stallTooltip,
  stallsPerRow,
  summaryStatus,
  todayLabel,
  todayLineLeft,
  visibleStalls,
} from "./rail-labels";

function week(live: number, pending: number, draft: number, extra: Partial<RailWeek> = {}): RailWeek {
  return { key: "2026-11-07", saturday: "2026-11-07", label: "Nov 7", name: null, live, pending, draft, stalls: [], ...extra };
}

describe("captions", () => {
  it("reads as plain facts", () => {
    expect(railCaption(week(1, 12, 9))).toEqual({ text: "1 of 22 live", tone: "ash" });
    expect(railCaption(week(0, 7, 1))).toEqual({ text: "0 of 8 live", tone: "honey" });
    expect(railCaption(week(13, 0, 0))).toEqual({ text: "All 13 live", tone: "cedar" });
    expect(railCaption(week(0, 0, 0))).toEqual({ text: "Nothing listed", tone: "ash" });
  });

  it("shortens on the slim rail", () => {
    expect(slimCaption(week(1, 12, 9))).toEqual({ text: "1 of 22", tone: "ash" });
    expect(slimCaption(week(0, 2, 2))).toEqual({ text: "0 of 4", tone: "honey" });
  });

  it("summarizes a week as one stall", () => {
    expect(summaryStatus(week(13, 0, 0))).toBe("PUBLISHED");
    expect(summaryStatus(week(1, 0, 1))).toBe("PENDING");
    expect(summaryStatus(week(0, 0, 0))).toBe("EMPTY");
  });
});

describe("labels", () => {
  it("names a column in full for assistive tech", () => {
    expect(columnLabel(week(1, 12, 9, { name: "This Saturday" }))).toBe(
      "Nov 7, weekend of Saturday November 7, This Saturday: 1 of 22 live, 12 pending, 9 draft"
    );
    expect(columnLabel(week(1, 12, 9), "2026-11-03")).toBe(
      "Nov 7, weekend of Saturday November 7: 1 of 22 live, 12 pending, 9 draft. Today, Tuesday November 3"
    );
    expect(
      columnLabel(week(0, 17, 4, { key: "later", saturday: null, label: "Later", name: "Jan to Oct 2027" }))
    ).toBe("Later, Jan to Oct 2027: 0 of 21 live, 17 pending, 4 draft");
    expect(columnLabel(week(0, 0, 0), undefined, "Sat Nov 7")).toBe(
      "Sat Nov 7, weekend of Saturday November 7: nothing listed"
    );
  });

  it("formats today, chips and stall tooltips", () => {
    expect(todayLabel("2026-11-03")).toBe("Today, Tuesday November 3");
    expect(chipDate(week(0, 0, 0))).toBe("Sat Nov 7");
    expect(chipDate(week(0, 0, 0, { saturday: null, label: "Later" }))).toBe("Later");
    expect(
      stallTooltip({ id: "a", title: "Emerge Holiday Market", status: "PENDING", startLabel: "Sat 11 am", kind: "event" })
    ).toBe("Emerge Holiday Market, Sat 11 am, Pending");
  });
});

describe("stall layout", () => {
  it("fits 11 stalls per row at 1440 and 9 dense ones at 1024", () => {
    // A column is (viewport - 2 x 24 gutter) / 8 wide; its link has 4 px padding on each side.
    const block = (viewport: number) => (viewport - 48) / 8 - 8;
    expect(stallsPerRow(block(1440), 12)).toBe(11);
    expect(stallsPerRow(block(1024), 10)).toBe(9);
  });

  it("gives the last two slots to the overflow count", () => {
    expect(visibleStalls(20, 22)).toEqual({ shown: 20, more: 0 });
    expect(visibleStalls(22, 22)).toEqual({ shown: 22, more: 0 });
    expect(visibleStalls(26, 22)).toEqual({ shown: 20, more: 6 });
  });

  it("snaps the today line into a gap between stalls", () => {
    const left = todayLineLeft(1, 162, 12);
    // Gaps sit at 12..15, 27..30, ...; a 2 px line starting at 27.5 stays inside one.
    expect(left).toBe(27.5);
    expect(todayLineLeft(0, 162, 12)).toBe(0);
  });
});
