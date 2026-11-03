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

import { findOrCreateVenue } from "./resolve";

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

  it("returns the venue a concurrent request just created", async () => {
    createMock.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    findFirstMock.mockResolvedValue({ id: "raced", name: INPUT.name, deletedAt: null });
    await expect(findOrCreateVenue(INPUT)).resolves.toEqual({ venueId: "raced", created: false });
  });
});
