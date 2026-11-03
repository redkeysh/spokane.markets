import type { EventStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EVENT_SLUG_MAX_LENGTH, EVENT_SLUG_PATTERN, RESERVED_EVENT_SLUGS } from "./slug-rules";

export { EVENT_SLUG_MAX_LENGTH, EVENT_SLUG_PATTERN, RESERVED_EVENT_SLUGS };

type SlugClient = Pick<Prisma.TransactionClient, "event" | "eventSlugRedirect">;

/** Statuses whose event page has been public, so links to it may be out there. */
const PUBLIC_STATUSES: ReadonlySet<EventStatus> = new Set<EventStatus>(["PUBLISHED", "CANCELLED"]);

/**
 * Returns why `slug` cannot become the address of event `eventId` (null for an event being
 * created), or null when it can. Slugs are unique across all events, archived ones included, and
 * an address that still redirects to a different event is not reused, so that event's shared
 * links keep working. With `audience: "public"` the message never names another event, for
 * callers who may not see unpublished listings.
 */
export async function eventSlugProblem(
  eventId: string | null,
  slug: string,
  { audience = "admin", client = db }: { audience?: "admin" | "public"; client?: SlugClient } = {}
): Promise<string | null> {
  if (!EVENT_SLUG_PATTERN.test(slug) || slug.length > EVENT_SLUG_MAX_LENGTH) {
    return `Use lowercase letters, numbers and single hyphens, up to ${EVENT_SLUG_MAX_LENGTH} characters.`;
  }
  if (RESERVED_EVENT_SLUGS.has(slug)) {
    return `/events/${slug} is a page of its own. Pick another slug.`;
  }
  const owner = await client.event.findUnique({ where: { slug }, select: { id: true, title: true, deletedAt: true } });
  if (owner && owner.id !== eventId) {
    return audience === "public"
      ? `/events/${slug} is taken. Pick another slug.`
      : `"${owner.title}"${owner.deletedAt ? " (archived)" : ""} already uses /events/${slug}.`;
  }
  const redirect = await client.eventSlugRedirect.findUnique({
    where: { slug },
    select: { eventId: true, event: { select: { title: true } } },
  });
  if (redirect && redirect.eventId !== eventId) {
    return audience === "public"
      ? `/events/${slug} is taken. Pick another slug.`
      : `/events/${slug} used to belong to "${redirect.event.title}" and still redirects there.`;
  }
  return null;
}

/**
 * Locks the event row for the rest of the transaction and returns its slug and status as they
 * are now, so a rename records the address the event really had even when another rename
 * committed after the caller first read the row.
 */
export async function lockEventForSlugChange(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<{ slug: string; status: EventStatus }> {
  const rows = await tx.$queryRaw<{ slug: string; status: EventStatus }[]>`
    SELECT "slug", "status" FROM "events" WHERE "id" = ${eventId} FOR UPDATE`;
  if (!rows[0]) throw new Error(`Event ${eventId} not found.`);
  return rows[0];
}

/**
 * Keeps the old address working after an event's slug changes. When the event was public under
 * the old slug, that slug redirects to the event; a redirect the event is taking back as its
 * address again is removed; a redirect that already belongs to another event is left alone, so
 * that event keeps its old links. Returns whether the old address now redirects to this event.
 * Run it in the same transaction as the slug update.
 */
export async function recordEventSlugChange(
  client: SlugClient,
  eventId: string,
  oldSlug: string,
  newSlug: string,
  { previousStatus }: { previousStatus: EventStatus }
): Promise<boolean> {
  if (oldSlug === newSlug) return false;
  await client.eventSlugRedirect.deleteMany({ where: { slug: newSlug, eventId } });
  if (!PUBLIC_STATUSES.has(previousStatus)) return false;
  const existing = await client.eventSlugRedirect.findUnique({ where: { slug: oldSlug }, select: { eventId: true } });
  if (existing) return existing.eventId === eventId;
  await client.eventSlugRedirect.create({ data: { slug: oldSlug, eventId } });
  return true;
}

/** The current slug of the event that `slug` used to address, whatever that event's state. */
export async function slugRedirectTarget(slug: string): Promise<string | null> {
  const redirect = await db.eventSlugRedirect.findUnique({
    where: { slug },
    select: { event: { select: { slug: true } } },
  });
  return redirect?.event.slug ?? null;
}

/**
 * The current slug of the live (non-archived) event that `slug` used to address, or null when
 * `slug` is not an old address or a live event holds it now. With `publishedOnly`, events that are
 * not public resolve to null, so public redirects never reveal their address. The common case is
 * one primary-key lookup.
 */
export async function resolveEventSlugRedirect(
  slug: string,
  { publishedOnly = false }: { publishedOnly?: boolean } = {}
): Promise<string | null> {
  const redirect = await db.eventSlugRedirect.findUnique({
    where: { slug },
    select: { event: { select: { slug: true, deletedAt: true, status: true } } },
  });
  if (!redirect || redirect.event.deletedAt || redirect.event.slug === slug) return null;
  if (publishedOnly && redirect.event.status !== "PUBLISHED") return null;
  const holder = await db.event.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
  return holder ? null : redirect.event.slug;
}
