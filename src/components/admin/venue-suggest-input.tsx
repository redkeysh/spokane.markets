export type VenueOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

const MAX_SUGGESTIONS = 6;

/** Venues whose name or street address contains the query; name-prefix matches first. */
export function matchVenues(venues: VenueOption[], query: string): VenueOption[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return venues
    .filter((v) => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))
    )
    .slice(0, MAX_SUGGESTIONS);
}
