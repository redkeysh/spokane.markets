import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { archivedPlaceInUse, buildNavSignals } from "./nav-signals";

describe("archivedPlaceInUse", () => {
  it("counts only places that upcoming, still-possible events or active markets use", () => {
    const today = new Date("2026-11-03T08:00:00Z");
    expect(archivedPlaceInUse(today)).toEqual({
      deletedAt: { not: null },
      OR: [
        { events: { some: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] }, endDate: { gte: today } } } },
        { markets: { some: { deletedAt: null } } },
      ],
    });
  });
});

describe("buildNavSignals", () => {
  it("words the snapshot's signals as the spec does", () => {
    expect(
      buildNavSignals({ weekendWaiting: 21, publicWaiting: 0, duplicateGroups: 14, archivedInUse: 3, marketsAwaitingVerification: 0 })
    ).toEqual({
      todo: { dot: true, label: "To do: 21 waiting this weekend, nothing from the public" },
      markets: { dot: false, label: "Markets: none waiting for verification" },
      venues: { dot: true, label: "Venues: 14 duplicate groups, 3 archived places in use" },
    });
  });

  it("lights a dot for public items alone and goes dark when everything is done", () => {
    expect(buildNavSignals({ weekendWaiting: 0, publicWaiting: 2, duplicateGroups: 0, archivedInUse: 0, marketsAwaitingVerification: 1 })).toEqual({
      todo: { dot: true, label: "To do: nothing waiting this weekend, 2 from the public" },
      markets: { dot: true, label: "Markets: 1 waiting for verification" },
      venues: { dot: false, label: "Venues: no duplicates, no archived places in use" },
    });
  });
});
