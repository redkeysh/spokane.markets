import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx } = vi.hoisted(() => ({
  tx: {
    venue: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    event: { findMany: vi.fn(), updateMany: vi.fn() },
    market: { findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));

import { keepChanges, mergeVenues, moveVenueListings } from "./merge";

const venue = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Venue ${id}`,
  address: `${id} Main St`,
  city: "Spokane",
  state: "WA",
  zip: "99201",
  lat: 47.66,
  lng: -117.41,
  neighborhood: null,
  parkingNotes: null,
  deletedAt: null,
  ...overrides,
});

function auditMetadata() {
  return tx.auditLog.create.mock.calls[0][0].data.metadata;
}

describe("keepChanges", () => {
  it("writes only overrides that differ and fills a missing neighborhood from a duplicate", () => {
    const keep = venue("keep", { name: "Spokane Community College, The Lair" });
    const result = keepChanges(keep, [{ neighborhood: "north-spokane", parkingNotes: null }], {
      name: "Spokane Community College, The Lair",
      address: "1810 N Greene St",
    });
    expect(result.next).toEqual({ address: "1810 N Greene St", neighborhood: "north-spokane" });
    expect(result.previous).toEqual({ address: "keep Main St", neighborhood: null });
  });

  it("lets an explicit neighborhood win over the one a duplicate has", () => {
    const result = keepChanges(venue("keep"), [{ neighborhood: "garland", parkingNotes: "Lot B" }], { neighborhood: "downtown" });
    expect(result.next).toEqual({ neighborhood: "downtown", parkingNotes: "Lot B" });
  });
});

describe("mergeVenues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.venue.findUnique.mockResolvedValue(venue("keep"));
    tx.venue.findMany.mockResolvedValue([venue("a", { neighborhood: "south-hill" }), venue("b")]);
    tx.venue.findFirst.mockResolvedValue(null);
    tx.event.findMany.mockResolvedValue([
      { id: "e1", venueId: "a", slug: "e-one" },
      { id: "e2", venueId: "b", slug: "e-two" },
    ]);
    tx.market.findMany.mockResolvedValue([{ id: "m1", venueId: "a", slug: "m-one" }]);
  });

  it("moves listings, fills missing details, archives duplicates, and records what moved", async () => {
    const result = await mergeVenues("keep", ["a", "b", "keep"], "admin-1", { decisionId: "d_1", decisionKey: "place-duplicates:a|b|keep" });
    expect(result).toEqual({ ok: true, keepId: "keep", eventsMoved: 2, marketsMoved: 1, eventSlugs: ["e-one", "e-two"], marketSlugs: ["m-one"] });
    expect(tx.event.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["e1", "e2"] } }, data: { venueId: "keep", updatedAt: expect.any(Date) } });
    expect(tx.market.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["m1"] } }, data: { venueId: "keep" } });
    expect(tx.venue.update).toHaveBeenCalledWith({ where: { id: "keep" }, data: { neighborhood: "south-hill" } });
    expect(tx.venue.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } }, data: { deletedAt: expect.any(Date) } });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: "admin-1", action: "MERGE_VENUES", targetType: "VENUE", targetId: "keep" });
    expect(auditMetadata()).toMatchObject({
      mergedIds: ["a", "b"],
      eventsMoved: 2,
      marketsMoved: 1,
      moved: {
        events: [
          { id: "e1", fromVenueId: "a" },
          { id: "e2", fromVenueId: "b" },
        ],
        markets: [{ id: "m1", fromVenueId: "a" }],
      },
      previousValue: { neighborhood: null },
      newValue: { neighborhood: "south-hill" },
      details: { decisionId: "d_1", decisionKey: "place-duplicates:a|b|keep", title: "Venue keep" },
    });
  });

  it("writes the chosen values to the kept place in the same transaction and records the old ones", async () => {
    tx.venue.findMany.mockResolvedValue([venue("a", { neighborhood: "south-hill" })]);
    const result = await mergeVenues("keep", ["a"], "admin-1", {
      overrides: { name: "Spokane Community College", address: "1810 N Greene St", lat: 47.673, lng: -117.36 },
    });
    expect(result.ok).toBe(true);
    expect(tx.venue.findFirst).toHaveBeenCalledWith({
      where: { name: "Spokane Community College", address: "1810 N Greene St", id: { not: "keep" } },
      select: { id: true, name: true },
    });
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "keep" },
      data: { name: "Spokane Community College", address: "1810 N Greene St", lat: 47.673, lng: -117.36, neighborhood: "south-hill" },
    });
    expect(auditMetadata().previousValue).toEqual({ name: "Venue keep", address: "keep Main St", lat: 47.66, lng: -117.41, neighborhood: null });
  });

  it("refuses a name and address another place already has", async () => {
    tx.venue.findMany.mockResolvedValue([venue("a")]);
    tx.venue.findFirst.mockResolvedValue({ id: "a", name: "Venue a" });
    const result = await mergeVenues("keep", ["a"], "admin-1", { overrides: { name: "Venue a", address: "a Main St" } });
    expect(result).toEqual({ ok: false, error: "Venue a already has this name and address. Keep that record instead." });
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("needs at least one place other than the one kept", async () => {
    const result = await mergeVenues("keep", ["keep"], "admin-1");
    expect(result.ok).toBe(false);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to merge into an archived place", async () => {
    tx.venue.findUnique.mockResolvedValue(venue("keep", { deletedAt: new Date() }));
    const result = await mergeVenues("keep", ["a"], "admin-1");
    expect(result.ok).toBe(false);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when a duplicate is already gone", async () => {
    tx.venue.findMany.mockResolvedValue([venue("a")]);
    const result = await mergeVenues("keep", ["a", "b"], "admin-1");
    expect(result.ok).toBe(false);
    expect(tx.venue.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("moveVenueListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.venue.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "old" ? { id: "old", name: "Old Hall" } : { id: "new", name: "New Hall", deletedAt: null })
    );
    tx.event.findMany.mockResolvedValue([{ id: "e1", slug: "e-one" }]);
    tx.market.findMany.mockResolvedValue([{ id: "m1", slug: "m-one" }]);
  });

  it("moves events and markets, archives nothing, and records where each came from", async () => {
    const result = await moveVenueListings("old", "new", "admin-1", { decisionId: "d_2" });
    expect(result).toEqual({ ok: true, eventsMoved: 1, marketsMoved: 1, eventSlugs: ["e-one"], marketSlugs: ["m-one"] });
    expect(tx.venue.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "MERGE_VENUES", targetId: "new" });
    expect(auditMetadata()).toMatchObject({
      mergedIds: [],
      moved: { events: [{ id: "e1", fromVenueId: "old" }], markets: [{ id: "m1", fromVenueId: "old" }] },
      details: { decisionId: "d_2" },
    });
  });

  it("refuses an archived destination", async () => {
    tx.venue.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "old" ? { id: "old", name: "Old Hall" } : { id: "new", name: "New Hall", deletedAt: new Date() })
    );
    const result = await moveVenueListings("old", "new", "admin-1");
    expect(result.ok).toBe(false);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when nothing uses the place", async () => {
    tx.event.findMany.mockResolvedValue([]);
    tx.market.findMany.mockResolvedValue([]);
    const result = await moveVenueListings("old", "new", "admin-1");
    expect(result).toEqual({ ok: false, error: "Nothing uses Old Hall any more." });
  });
});
