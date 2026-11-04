import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "@/lib/admin/history";
import { historyDayHeading, toVendorHistory, vendorHistoryDetails } from "./history";

const NOW = new Date("2026-11-03T17:00:00.000Z");

describe("historyDayHeading", () => {
  it("names today and yesterday, then the day alone", () => {
    expect(historyDayHeading("2026-11-03", NOW)).toBe("Today, Tuesday Nov 3");
    expect(historyDayHeading("2026-11-02", NOW)).toBe("Yesterday, Monday Nov 2");
    expect(historyDayHeading("2026-10-30", NOW)).toBe("Friday Oct 30");
    expect(historyDayHeading("2025-12-31", NOW)).toBe("Wednesday Dec 31, 2025");
  });
});

describe("vendorHistoryDetails", () => {
  it("lists only the fields that changed, in words", () => {
    expect(
      vendorHistoryDetails(
        { businessName: "Bluebird", slug: "bluebird", verificationStatus: "PENDING", userId: null },
        { businessName: "Bluebird Pottery", slug: "bluebird", verificationStatus: "VERIFIED", userId: null }
      )
    ).toEqual([
      { label: "Business name", before: "Bluebird", after: "Bluebird Pottery" },
      { label: "Verification", before: "Waiting for verification", after: "Verified" },
    ]);
  });

  it("never shows account ids", () => {
    expect(vendorHistoryDetails({ userId: null }, { userId: "u1" })).toEqual([{ label: "Claimed by", before: null, after: "An account" }]);
    expect(vendorHistoryDetails({ userId: "u1" }, { userId: "u2" })).toEqual([
      { label: "Claimed by", before: "An account", after: "A different account" },
    ]);
  });

  it("reads archiving as yes or no", () => {
    expect(vendorHistoryDetails({ deletedAt: null }, { deletedAt: "now" })).toEqual([{ label: "Archived", before: "No", after: "Yes" }]);
  });

  it("shows what a new vendor started with", () => {
    expect(vendorHistoryDetails(null, { businessName: "Bluebird", slug: "bluebird" })).toEqual([
      { label: "Business name", before: null, after: "Bluebird" },
      { label: "Web address", before: null, after: "bluebird" },
    ]);
  });
});

describe("toVendorHistory", () => {
  it("groups by Pacific day and keeps the sentence and times", () => {
    const at = new Date("2026-11-03T06:30:00.000Z");
    const entry: HistoryEntry = {
      id: "a1",
      at,
      time: "10:30 pm",
      timestamp: "Nov 2, 2026 at 10:30 pm",
      actor: "You",
      sentence: "You archived a vendor: Bluebird.",
      link: null,
      href: "/admin/vendors",
      targetType: "VENDOR_PROFILE",
      targetId: "v1",
      title: "Bluebird",
      previousValue: { deletedAt: null },
      newValue: { deletedAt: "now" },
      details: [],
      decisionId: null,
      canUndo: false,
    };
    expect(toVendorHistory([entry], NOW)).toEqual([
      {
        id: "a1",
        day: "Yesterday, Monday Nov 2",
        at: at.toISOString(),
        time: "10:30 pm",
        timestamp: "Nov 2, 2026 at 10:30 pm",
        sentence: "You archived a vendor: Bluebird.",
        details: [{ label: "Archived", before: "No", after: "Yes" }],
      },
    ]);
  });
});
