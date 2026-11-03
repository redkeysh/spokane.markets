import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  venueFindMany: vi.fn(),
  venueCreate: vi.fn(),
  venueDeleteMany: vi.fn(),
  marketFindMany: vi.fn(),
  marketCreate: vi.fn(),
  eventCreate: vi.fn(),
  findMatchingVenue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    venue: { findMany: mocks.venueFindMany, create: mocks.venueCreate, deleteMany: mocks.venueDeleteMany },
    market: { findMany: mocks.marketFindMany, create: mocks.marketCreate },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ event: { create: mocks.eventCreate }, tag: {}, feature: {} }),
  },
}));
vi.mock("@/lib/neighborhoods", () => ({ getNeighborhoodSlugSet: async () => new Set<string>() }));
vi.mock("@/lib/venues/resolve", () => ({ findMatchingVenue: mocks.findMatchingVenue }));

import { importData, type ImportPayload } from "./data-import";

const venueRow = (name: string) => ({
  name,
  address: "1 Main St",
  city: "Spokane",
  state: "WA",
  zip: "99201",
  lat: 47.65,
  lng: -117.42,
});

const eventRow = (title: string, venueSlug: string) => ({
  title,
  startDate: "2026-12-05T10:00:00Z",
  endDate: "2026-12-05T16:00:00Z",
  venueSlug,
});

/** Venue ids that an event or market created during the test points at. */
let referencedVenueIds: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  referencedVenueIds = new Set();
  mocks.venueFindMany.mockResolvedValue([]);
  mocks.marketFindMany.mockResolvedValue([]);
  mocks.findMatchingVenue.mockResolvedValue(null);
  mocks.venueCreate.mockImplementation(async ({ data }: { data: { name: string } }) => ({
    id: `venue-${data.name}`,
    name: data.name,
  }));
  mocks.eventCreate.mockImplementation(async ({ data }: { data: { slug: string; venueId: string } }) => {
    if (data.slug === "taken") throw new Error("Unique constraint failed on the fields: (`slug`)");
    referencedVenueIds.add(data.venueId);
    return { id: `event-${data.slug}` };
  });
  mocks.marketCreate.mockImplementation(async ({ data }: { data: { slug: string; venueId: string } }) => {
    referencedVenueIds.add(data.venueId);
    return { id: `market-${data.slug}`, slug: data.slug };
  });
  mocks.venueDeleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    count: referencedVenueIds.has(where.id) ? 0 : 1,
  }));
});

describe("importData unused venue cleanup", () => {
  it("removes a created venue whose only event failed and reports it", async () => {
    const payload: ImportPayload = {
      venues: [venueRow("Hall A"), venueRow("Hall B")],
      events: [
        { ...eventRow("Craft Fair", "hall-a"), slug: "craft-fair" },
        { ...eventRow("Holiday Market", "hall-b"), slug: "taken" },
      ],
    };

    const result = await importData(payload);

    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 1, eventsCreated: 1 });
    expect(result.errors).toContain('Venue "Hall B": removed because none of its markets or events were imported');
    expect(mocks.venueDeleteMany).toHaveBeenCalledWith({
      where: { id: "venue-Hall B", events: { none: {} }, markets: { none: {} } },
    });
  });

  it("keeps a created venue that only a market uses", async () => {
    const result = await importData({
      venues: [venueRow("Hall A")],
      markets: [{ name: "Hall Market", venueSlug: "hall-a" }],
      events: [{ ...eventRow("Craft Fair", "hall-a"), slug: "taken" }],
    });
    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 0, marketsCreated: 1, eventsCreated: 0 });
  });

  it("removes a created venue that no row referenced", async () => {
    const result = await importData({
      venues: [venueRow("Hall A"), venueRow("Hall B")],
      events: [eventRow("Craft Fair", "hall-a")],
    });
    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 1 });
  });

  it("keeps every venue from a venues-only import", async () => {
    const result = await importData({ venues: [venueRow("Hall A"), venueRow("Hall B")] });
    expect(result).toMatchObject({ venuesCreated: 2, venuesRemoved: 0 });
    expect(mocks.venueDeleteMany).not.toHaveBeenCalled();
  });

  it("never deletes an existing venue the import matched", async () => {
    mocks.findMatchingVenue.mockResolvedValue({ id: "existing-1", name: "Hall A", deletedAt: null });
    const result = await importData({
      venues: [venueRow("Hall A")],
      events: [{ ...eventRow("Craft Fair", "hall-a"), slug: "taken" }],
    });
    expect(result).toMatchObject({ venuesCreated: 0, venuesRemoved: 0 });
    expect(mocks.venueDeleteMany).not.toHaveBeenCalled();
  });
});
