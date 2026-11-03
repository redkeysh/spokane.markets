export type GeocodeResult = { lat: number; lng: number };

type AddressParts = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

const REQUEST_TIMEOUT_MS = 5000;

function validCoords(lat: unknown, lng: unknown): GeocodeResult | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so a token supplied only at
 * runtime is invisible through that name. MAPBOX_ACCESS_TOKEN is read at
 * runtime on the server.
 */
function mapboxToken(): string | undefined {
  return process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || undefined;
}

async function geocodeWithMapbox(query: string): Promise<GeocodeResult | null> {
  const token = mapboxToken();
  if (!token) {
    console.warn("[geocode] Mapbox skipped: no MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
    return null;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?limit=1&country=US&access_token=${token}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[geocode] Mapbox returned HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { features?: { center?: [number, number] }[] };
    // Mapbox returns [longitude, latitude].
    const center = data.features?.[0]?.center;
    return center ? validCoords(center[1], center[0]) : null;
  } catch (err) {
    console.warn("[geocode] Mapbox request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** US Census Bureau geocoder: keyless, US street addresses only. */
async function geocodeWithCensus(query: string): Promise<GeocodeResult | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(
    query
  )}&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[geocode] Census geocoder returned HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] };
    };
    const coords = data.result?.addressMatches?.[0]?.coordinates;
    return coords ? validCoords(coords.y, coords.x) : null;
  } catch (err) {
    console.warn("[geocode] Census request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Forward-geocode a US street address. Tries Mapbox (the provider behind the
 * client address autocomplete) and falls back to the US Census geocoder.
 *
 * Returns null when no provider finds a usable match. Callers must handle null
 * (reject the write) rather than fabricating a location.
 */
export async function geocodeAddress(parts: AddressParts): Promise<GeocodeResult | null> {
  const query = [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
  if (!query) return null;

  const result = (await geocodeWithMapbox(query)) ?? (await geocodeWithCensus(query));
  if (!result) console.warn(`[geocode] No match for "${query}"`);
  return result;
}
