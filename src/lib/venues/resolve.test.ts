import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, findFirstMock, createMock, geocodeMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  findFirstMock: vi.fn(),
  createMock: vi.fn(),
  geocodeMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { venue: { findMany: findManyMock, findFirst: findFirstMock, create: createMock } },
}));
vi.mock("@/lib/geocode", () => ({ geocodeAddress: geocodeMock }));

import { DEFAULT_PIN } from "./match";
import { findMatchingVenue, findMatchingVenueAmong, findOrCreateVenue, lookupVenue } from "./resolve";

const INPUT = {
  name: "Shriners Event Center",
  address: "7217 W WESTBOW BLVD",
  city: "SPOKANE",
  state: "WA",
  zip: "99224",
};

const existing = (overrides: Record<string, unknown> = {}) => ({
  id: "venue-1",
  name: "Shriners Event Center",
  address: "7217 West Westbow Boulevard",
  city: "Spokane",
  zip: "99224",
  lat: 47.6136,
  lng: -117.5136,
  deletedAt: null,
  ...overrides,
});

describe("findOrCreateVenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([]);
    geocodeMock.mockResolvedValue({ lat: 47.6136, lng: -117.5136 });
    createMock.mockResolvedValue({ id: "new-venue" });
  });

  it("reuses a matching venue without geocoding or creating", async () => {
    findManyMock.mockResolvedValue([existing()]);
    await expect(findOrCreateVenue(INPUT)).resolves.toEqual({ venueId: "venue-1", created: false });
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("refuses to duplicate an archived venue", async () => {
    findManyMock.mockResolvedValue([existing({ deletedAt: new Date() })]);
    const result = await findOrCreateVenue(INPUT);
    expect(result).toEqual({ error: expect.stringContaining("archived") });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects an address no geocoder can place", async () => {
    geocodeMock.mockResolvedValue(null);
    const result = await findOrCreateVenue(INPUT);
    expect(result).toEqual({ error: expect.stringContaining("Couldn't find") });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("reuses a venue at the same spot once the address is geocoded", async () => {
    const nearby = existing({ address: "7217 Westbow" });
    findManyMock.mockResolvedValueOnce([nearby]).mockResolvedValueOnce([nearby]);
    await expect(findOrCreateVenue(INPUT)).resolves.toEqual({ venueId: "venue-1", created: false });
    expect(geocodeMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a geocoded venue when nothing matches", async () => {
    await expect(findOrCreateVenue(INPUT)).resolves.toEqual({ venueId: "new-venue", created: true });
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Shriners Event Center", lat: 47.6136, lng: -117.5136 }),
    });
  });

  it("uses supplied coordinates instead of geocoding", async () => {
    await findOrCreateVenue({ ...INPUT, lat: 47.6, lng: -117.5 });
    expect(geocodeMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({ data: expect.objectContaining({ lat: 47.6, lng: -117.5 }) });
  });

  it("looks up candidates near the geocoded spot and reuses one typed with another city and ZIP", async () => {
    const expo = {
      id: "expo",
      name: "Spokane County Fair & Expo Center",
      address: "404 N Havana St",
      city: "Spokane Valley",
      zip: "99216",
      lat: 47.6626,
      lng: -117.3511,
      deletedAt: null,
    };
    findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([expo]);
    geocodeMock.mockResolvedValue({ lat: 47.6641, lng: -117.3532 });

    const result = await findOrCreateVenue({
      name: "Spokane County Fair and Expo Center",
      address: "404 North Havana Street",
      city: "Spokane",
      state: "WA",
      zip: "99202",
    });

    expect(result).toEqual({ venueId: "expo", created: false });
    const firstWhere = findManyMock.mock.calls[0][0].where.OR;
    const secondWhere = findManyMock.mock.calls[1][0].where.OR;
    expect(firstWhere).toHaveLength(2);
    expect(secondWhere[2]).toEqual({
      lat: { gte: expect.closeTo(47.655, 3), lte: expect.closeTo(47.673, 3) },
      lng: { gte: expect.closeTo(-117.3665, 3), lte: expect.closeTo(-117.3399, 3) },
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the venue a concurrent request just created", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    findFirstMock.mockResolvedValue({ id: "raced", name: INPUT.name, deletedAt: null });
    await expect(findOrCreateVenue(INPUT)).resolves.toEqual({ venueId: "raced", created: false });
  });
});

describe("findMatchingVenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([]);
  });

  it("does not search around the admin form's default pin", async () => {
    await findMatchingVenue({ ...INPUT, lat: DEFAULT_PIN.lat, lng: DEFAULT_PIN.lng });
    expect(findManyMock.mock.calls[0][0].where.OR).toHaveLength(2);
  });
});

describe("findMatchingVenueAmong", () => {
  it("matches like findMatchingVenue against venues already loaded, active ones first, without a query", () => {
    findManyMock.mockClear();
    const archived = existing({ id: "old", deletedAt: new Date() });
    const otherTown = existing({ id: "far", city: "Cheney", zip: "99004", lat: 47.49, lng: -117.58 });
    expect(findMatchingVenueAmong(INPUT, [archived, otherTown])).toBe(archived);
    expect(findMatchingVenueAmong(INPUT, [archived, existing()])?.id).toBe("venue-1");
    expect(findMatchingVenueAmong(INPUT, [existing({ name: "Spokane Valley Mall" })])).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("finds a venue by the nearby box when its ZIP and city differ", () => {
    const pinned = { ...INPUT, city: "Airway Heights", zip: "99001", lat: 47.6136, lng: -117.5136 };
    expect(findMatchingVenueAmong(pinned, [existing({ lat: 47.6137, lng: -117.5137 })])?.id).toBe("venue-1");
    expect(findMatchingVenueAmong({ ...pinned, lat: null, lng: null }, [existing({ lat: 47.6137, lng: -117.5137 })])).toBeNull();
  });
});

describe("lookupVenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([]);
  });

  it("finds a venue only the geocoded spot reveals, without creating anything", async () => {
    const nearby = existing({ address: "7217 Westbow" });
    findManyMock.mockResolvedValueOnce([nearby]).mockResolvedValueOnce([nearby]);
    geocodeMock.mockResolvedValue({ lat: 47.6136, lng: -117.5136 });
    await expect(lookupVenue(INPUT)).resolves.toEqual({ status: "existing", venue: nearby });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the coordinates a new venue would get", async () => {
    geocodeMock.mockResolvedValue({ lat: 47.6136, lng: -117.5136 });
    await expect(lookupVenue(INPUT)).resolves.toEqual({ status: "new", coords: { lat: 47.6136, lng: -117.5136 } });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uses supplied coordinates without geocoding", async () => {
    await expect(lookupVenue({ ...INPUT, lat: 47.6, lng: -117.5 })).resolves.toEqual({
      status: "new",
      coords: { lat: 47.6, lng: -117.5 },
    });
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it("reports an address no geocoder can place", async () => {
    geocodeMock.mockResolvedValue(null);
    await expect(lookupVenue(INPUT)).resolves.toEqual({ status: "unplaceable" });
  });
});
