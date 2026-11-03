import { revalidatePath } from "next/cache";

/** Public pages that list events, markets or places. */
export const PUBLIC_LISTING_PATHS = ["/", "/events", "/events/calendar", "/events/map", "/markets"] as const;

/**
 * Refreshes the admin layout (rail and nav signals persist across soft
 * navigation) and the public listing pages, plus each changed event's and
 * market's page.
 */
export function revalidateAdmin(options: { eventSlugs?: (string | null | undefined)[]; marketSlugs?: (string | null | undefined)[] } = {}): void {
  revalidatePath("/admin", "layout");
  for (const path of PUBLIC_LISTING_PATHS) revalidatePath(path);
  for (const slug of new Set(options.eventSlugs ?? [])) if (slug) revalidatePath(`/events/${slug}`);
  for (const slug of new Set(options.marketSlugs ?? [])) if (slug) revalidatePath(`/markets/${slug}`);
}
