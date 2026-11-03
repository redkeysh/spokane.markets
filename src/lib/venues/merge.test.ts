import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, logAuditMock } = vi.hoisted(() => ({
  tx: {
    venue: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    event: { updateMany: vi.fn() },
    market: { updateMany: vi.fn() },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { mergeVenues } from "./merge";

const venue = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Venue ${id}`,
  neighborhood: null,
  parkingNotes: null,
  deletedAt: null,
  ...overrides,
});

describe("mergeVenues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.venue.findUnique.mockResolvedValue(venue("keep"));
    tx.venue.findMany.mockResolvedValue([venue("a", { neighborhood: "south-hill" }), venue("b")]);
    tx.event.updateMany.mockResolvedValue({ count: 5 });
    tx.market.updateMany.mockResolvedValue({ count: 1 });
  });

  it("moves listings, fills missing details, archives duplicates, and audits", async () => {
    const result = await mergeVenues("keep", ["a", "b", "keep"], "admin-1");
    expect(result).toEqual({ ok: true, eventsMoved: 5, marketsMoved: 1 });
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { venueId: { in: ["a", "b"] } },
      data: { venueId: "keep" },
    });
    expect(tx.market.updateMany).toHaveBeenCalledWith({
      where: { venueId: { in: ["a", "b"] } },
      data: { venueId: "keep" },
    });
    expect(tx.venue.update).toHaveBeenCalledWith({
      where: { id: "keep" },
      data: { neighborhood: "south-hill", parkingNotes: null },
    });
    expect(tx.venue.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "MERGE_VENUES",
      "VENUE",
      "keep",
      expect.objectContaining({ mergedIds: ["a", "b"], eventsMoved: 5, marketsMoved: 1 })
    );
  });

  it("needs at least one venue other than the one kept", async () => {
    const result = await mergeVenues("keep", ["keep"], "admin-1");
    expect(result.ok).toBe(false);
    expect(tx.event.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to merge into an archived venue", async () => {
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
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
