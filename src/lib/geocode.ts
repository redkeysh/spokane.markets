const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export type GeocodeResult = { lat: number; lng: number };

/**
 * Forward-geocode a US street address to coordinates using the Mapbox
 * Geocoding API (the same provider the client-side address autocomplete uses).
 *
 * Returns null when no token is configured, the request fails, or no usable
 * match is found. Callers MUST handle null (reject the write) rather than
 * fabricating a location.
 */
export async function geocodeAddress(parts: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) return null;

  const query = [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
  if (!query) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?limit=1&country=US&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    // Mapbox returns [longitude, latitude].
    const [lng, lat] = center;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }
    return { lat, lng };
  } catch {
    return null;
  }
}
