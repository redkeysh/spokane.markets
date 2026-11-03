import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "./geocode";

const ADDRESS = { address: "7217 W WESTBOW BLVD", city: "SPOKANE", state: "WA", zip: "99224" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const censusMatch = {
  result: { addressMatches: [{ coordinates: { x: -117.5135, y: 47.6135 } }] },
};
const mapboxMatch = { features: [{ center: [-117.51, 47.61] }] };

describe("geocodeAddress", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the Census geocoder when no Mapbox token is configured", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(censusMatch));
    await expect(geocodeAddress(ADDRESS)).resolves.toEqual({ lat: 47.6135, lng: -117.5135 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("geocoding.geo.census.gov");
  });

  it("prefers Mapbox with the runtime server token", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    fetchMock.mockResolvedValueOnce(jsonResponse(mapboxMatch));
    await expect(geocodeAddress(ADDRESS)).resolves.toEqual({ lat: 47.61, lng: -117.51 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.mapbox.com");
  });

  it("falls back to Census when Mapbox rejects the token", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "pk.bad");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Not Authorized" }, 401))
      .mockResolvedValueOnce(jsonResponse(censusMatch));
    await expect(geocodeAddress(ADDRESS)).resolves.toEqual({ lat: 47.6135, lng: -117.5135 });
  });

  it("returns null when no provider matches", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: { addressMatches: [] } }));
    await expect(geocodeAddress(ADDRESS)).resolves.toBeNull();
  });

  it("returns null when requests throw", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(geocodeAddress(ADDRESS)).resolves.toBeNull();
  });
});
