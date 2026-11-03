/** The venue fields the public venue type-ahead may show. Imported by client code, so it must stay free of server modules. */
export type PublicVenue = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export const SUGGEST_MIN_QUERY = 2;
export const SUGGEST_MAX_QUERY = 100;
export const SUGGEST_LIMIT = 6;

/** Search words of a query, at most five; empty when the query is shorter than SUGGEST_MIN_QUERY. */
export function suggestQueryWords(query: string): string[] {
  const q = query.trim();
  if (q.length < SUGGEST_MIN_QUERY) return [];
  return q.split(/\s+/).slice(0, 5);
}
