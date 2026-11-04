export const VENUE_VIEWS = [
  { key: "all", label: "All places", work: false },
  { key: "duplicates", label: "Duplicates", work: true },
  { key: "no-neighborhood", label: "No neighborhood", work: true },
  { key: "spelling", label: "Spelling", work: true },
  { key: "unused", label: "Not used", work: true },
  { key: "archived-in-use", label: "Archived, in use", work: true },
  { key: "archived", label: "Archived", work: false },
] as const;

export const VENUE_TOOLS = [
  { key: "find-duplicate", label: "Find a missed duplicate" },
  { key: "neighborhood-list", label: "Neighborhood list" },
] as const;

export type VenueViewKey = (typeof VENUE_VIEWS)[number]["key"] | (typeof VENUE_TOOLS)[number]["key"];

export const ALL_VIEW_KEYS: readonly VenueViewKey[] = [...VENUE_VIEWS.map((v) => v.key), ...VENUE_TOOLS.map((v) => v.key)];

export function parseVenueView(value: string | string[] | undefined): VenueViewKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return ALL_VIEW_KEYS.includes(raw as VenueViewKey) ? (raw as VenueViewKey) : "all";
}

export function viewLabel(key: VenueViewKey): string {
  return [...VENUE_VIEWS, ...VENUE_TOOLS].find((v) => v.key === key)?.label ?? "All places";
}

export function viewHref(key: VenueViewKey, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  if (key !== "all") query.set("view", key);
  for (const [name, value] of Object.entries(params)) if (value) query.set(name, value);
  const qs = query.toString();
  return qs ? `/admin/venues?${qs}` : "/admin/venues";
}

/** The browser tab title: "Venues", "Venues: duplicates", "Venues: archived, in use". */
export function viewTitle(key: VenueViewKey): string {
  return key === "all" ? "Venues" : `Venues: ${viewLabel(key).charAt(0).toLowerCase()}${viewLabel(key).slice(1)}`;
}

export type ViewCounts = Partial<Record<VenueViewKey, number>>;
