import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AdminPermissionKey } from "@/lib/admin/permissions";
import type { TokenPrincipal } from "@/lib/api-tokens";
import { getQueuesSummary } from "@/lib/admin/queues";
import {
  ALREADY_REVIEWED_MESSAGE,
  approveSubmissionWithEvent,
  rejectSubmission,
} from "@/lib/submission-approval";
import { notifySubmitterOfStatusChange } from "@/lib/events/status-notifications";
import { logAudit } from "@/lib/audit";
import { geocodeAddress } from "@/lib/geocode";
import { assertNeighborhoodSlug, getNeighborhoodOptions } from "@/lib/neighborhoods";
import { findDuplicateGroups } from "@/lib/venues/match";
import { findMatchingVenue } from "@/lib/venues/resolve";
import { mergeVenues } from "@/lib/venues/merge";
import { defineTool, ToolError, type McpTool, type ServerInfo } from "./protocol";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://spokane.markets").replace(/\/$/, "");
const EVENT_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "CANCELLED", "REJECTED"] as const;
const SUBMISSION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/** Eastern Washington and North Idaho: every venue the site lists lies inside this box. */
const SERVICE_AREA = { minLat: 46, maxLat: 49, minLng: -119, maxLng: -115.5 } as const;
const SERVICE_AREA_TEXT = `the Spokane and North Idaho area (latitude ${SERVICE_AREA.minLat} to ${SERVICE_AREA.maxLat}, longitude ${SERVICE_AREA.minLng} to ${SERVICE_AREA.maxLng})`;

function inServiceArea({ lat, lng }: { lat: number; lng: number }) {
  return (
    lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng
  );
}

function needs(permission: AdminPermissionKey) {
  return (ctx: TokenPrincipal) =>
    ctx.permissions.includes(permission) ? null : `The token's owner lacks the ${permission} permission.`;
}

function needsWrite(permission: AdminPermissionKey) {
  return (ctx: TokenPrincipal) =>
    ctx.access !== "WRITE"
      ? "This token is read-only. Create a read and write token in System > API tokens to use this tool."
      : needs(permission)(ctx);
}

function auditMeta(ctx: TokenPrincipal) {
  return { via: "mcp", tokenId: ctx.tokenId, tokenName: ctx.tokenName };
}

const limitField = (max: number, fallback: number) =>
  z.number().int().min(1).max(max).default(fallback).describe(`Maximum results, 1 to ${max}.`);

const offsetField = z.number().int().min(0).max(100_000).default(0).describe("Results to skip, for paging.");

/** Wraps one page of results so the caller can tell whether more exist. */
function page<T>(items: T[], total: number, offset: number) {
  return { total, offset, returned: items.length, hasMore: offset + items.length < total, items };
}

const optionalUrl = z.httpUrl().nullable().optional();

const imageUrlField = z
  .string()
  .trim()
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), "Must be an http(s) URL or an /uploads/ path.")
  .nullable()
  .optional();

const LIST_TEXT_CHARS = 300;
const FULL_TEXT_CHARS = 20_000;
const FULL_SCHEDULE_DAYS = 100;

function clip(text: string | null, max: number) {
  if (text == null || text.length <= max) return text;
  return `${text.slice(0, max)}… [${text.length - max} more characters not shown]`;
}

function scheduleSummary(value: Prisma.JsonValue) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const dates = value
    .map((d) => (d && typeof d === "object" && !Array.isArray(d) && typeof d.date === "string" ? d.date : null))
    .filter((d): d is string => d !== null)
    .sort();
  return { days: value.length, firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null };
}

function hasChange(fields: Record<string, unknown>) {
  return Object.entries(fields).some(([key, value]) => key !== "id" && value !== undefined);
}

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  eventTitle: true,
  eventDescription: true,
  submitterName: true,
  submitterEmail: true,
  eventDate: true,
  eventTime: true,
  endDate: true,
  endTime: true,
  allDay: true,
  scheduleDays: true,
  venueName: true,
  venueAddress: true,
  venueCity: true,
  venueState: true,
  venueZip: true,
  marketId: true,
  imageUrl: true,
  websiteUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  notes: true,
  reviewNotes: true,
  createdAt: true,
  createdEventId: true,
} satisfies Prisma.SubmissionSelect;

type SubmissionRow = Prisma.SubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

async function venueOutcome(s: SubmissionRow) {
  const { venueName, venueAddress, venueCity, venueState, venueZip } = s;
  if (!venueName || !venueAddress || !venueCity || !venueState || !venueZip) {
    return { outcome: "incomplete", note: "Venue name, street, city, state, or ZIP is missing, so approval will fail." };
  }
  const match = await findMatchingVenue({
    name: venueName,
    address: venueAddress,
    city: venueCity,
    state: venueState,
    zip: venueZip,
  });
  if (!match) return { outcome: "new", note: "Approval creates a new, geocoded venue." };
  if (match.deletedAt) {
    return { outcome: "archived", venueId: match.id, name: match.name, note: "Matches an archived venue; restore it before approving." };
  }
  return { outcome: "existing", venueId: match.id, name: match.name, address: match.address };
}

async function activeVenueRows() {
  return db.venue.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      lat: true,
      lng: true,
      createdAt: true,
      _count: { select: { events: true, markets: true } },
    },
  });
}

function revalidateListings(eventSlug?: string) {
  revalidatePath("/events");
  revalidatePath("/events/calendar");
  revalidatePath("/events/map");
  revalidatePath("/markets");
  revalidatePath("/");
  revalidatePath("/admin/events");
  revalidatePath("/admin/venues");
  if (eventSlug) revalidatePath(`/events/${eventSlug}`);
}

export const ADMIN_TOOLS: McpTool<TokenPrincipal>[] = [
  defineTool({
    name: "get_overview",
    title: "Overview",
    description:
      "What needs attention: pending moderation counts with the oldest item's age, events waiting for review, upcoming published events, and the number of duplicate venue groups.",
    readOnly: true,
    input: z.object({}),
    unavailableReason: needs("admin.moderation.manage"),
    run: async () => {
      const now = new Date();
      const [queues, eventsPendingReview, upcomingPublishedEvents, venues] = await Promise.all([
        getQueuesSummary(),
        db.event.count({ where: { status: "PENDING", deletedAt: null } }),
        db.event.count({ where: { status: "PUBLISHED", deletedAt: null, endDate: { gte: now } } }),
        activeVenueRows(),
      ]);
      return {
        moderationQueues: queues,
        eventsPendingReview,
        upcomingPublishedEvents,
        activeVenues: venues.length,
        duplicateVenueGroups: findDuplicateGroups(venues).length,
      };
    },
  }),

  defineTool({
    name: "list_submissions",
    title: "List submissions",
    description:
      "Public event submissions, one page at a time. Pending ones are oldest first and include venueOutcome: whether approving reuses an existing venue, creates a new one, or will fail. Long text is shortened and the schedule is summarized; use get_submission for the full record. Approving or rejecting removes items from the pending list, so after acting on a page, list again from offset 0 instead of advancing the offset.",
    readOnly: true,
    input: z.object({
      status: z.enum(SUBMISSION_STATUSES).default("PENDING"),
      limit: limitField(50, 20),
      offset: offsetField,
    }),
    unavailableReason: needs("admin.moderation.manage"),
    run: async ({ status, limit, offset }) => {
      const [rows, total] = await Promise.all([
        db.submission.findMany({
          where: { status },
          orderBy: [{ createdAt: status === "PENDING" ? "asc" : "desc" }, { id: "asc" }],
          skip: offset,
          take: limit,
          select: SUBMISSION_SELECT,
        }),
        db.submission.count({ where: { status } }),
      ]);
      const items = await Promise.all(
        rows.map(async (s) => ({
          ...s,
          eventDescription: clip(s.eventDescription, LIST_TEXT_CHARS),
          notes: clip(s.notes, LIST_TEXT_CHARS),
          reviewNotes: clip(s.reviewNotes, LIST_TEXT_CHARS),
          scheduleDays: scheduleSummary(s.scheduleDays),
          adminUrl: `${APP_URL}/admin/submissions/${s.id}`,
          ...(status === "PENDING" ? { venueOutcome: await venueOutcome(s) } : {}),
        }))
      );
      return page(items, total, offset);
    },
  }),

  defineTool({
    name: "get_submission",
    title: "Get submission",
    description: "One submission in full, with venueOutcome for pending submissions.",
    readOnly: true,
    input: z.object({ id: z.string().min(1) }),
    unavailableReason: needs("admin.moderation.manage"),
    run: async ({ id }) => {
      const s = await db.submission.findUnique({ where: { id }, select: SUBMISSION_SELECT });
      if (!s) throw new ToolError("Submission not found.");
      const days = Array.isArray(s.scheduleDays) ? s.scheduleDays : null;
      const daysCut = days !== null && days.length > FULL_SCHEDULE_DAYS;
      return {
        ...s,
        eventDescription: clip(s.eventDescription, FULL_TEXT_CHARS),
        notes: clip(s.notes, FULL_TEXT_CHARS),
        reviewNotes: clip(s.reviewNotes, FULL_TEXT_CHARS),
        scheduleDays: daysCut ? days.slice(0, FULL_SCHEDULE_DAYS) : s.scheduleDays,
        ...(daysCut ? { scheduleDaysNote: `Showing the first ${FULL_SCHEDULE_DAYS} of ${days.length} days.` } : {}),
        adminUrl: `${APP_URL}/admin/submissions/${s.id}`,
        ...(s.status === "PENDING" ? { venueOutcome: await venueOutcome(s) } : {}),
      };
    },
  }),

  defineTool({
    name: "approve_submission",
    title: "Approve submission",
    description:
      "Approves a pending submission. The event is created and published immediately, reusing a matching venue or creating a geocoded one. The submitter is notified.",
    readOnly: false,
    input: z.object({ id: z.string().min(1) }),
    unavailableReason: needsWrite("admin.moderation.manage"),
    run: async ({ id }, ctx) => {
      const s = await db.submission.findUnique({ where: { id }, select: { status: true } });
      if (!s) throw new ToolError("Submission not found.");
      if (s.status !== "PENDING") throw new ToolError(`Submission is already ${s.status.toLowerCase()}.`);
      let created;
      try {
        created = await approveSubmissionWithEvent(id, ctx.user.id, { auditMeta: auditMeta(ctx) });
      } catch (err) {
        throw new ToolError(err instanceof Error ? err.message : "Approval failed.");
      }
      if (!created) throw new ToolError(ALREADY_REVIEWED_MESSAGE);
      const event = await db.event.findUnique({
        where: { id: created.id },
        select: { id: true, title: true, slug: true, status: true },
      });
      revalidatePath("/admin/submissions");
      revalidatePath("/admin/queues");
      return { approved: true, event: { ...(event ?? created), url: `${APP_URL}/events/${created.slug}` } };
    },
  }),

  defineTool({
    name: "reject_submission",
    title: "Reject submission",
    description: "Rejects a pending submission with a reason, which is saved as the review note. The submitter is notified.",
    readOnly: false,
    input: z.object({
      id: z.string().min(1),
      reason: z.string().trim().min(1).max(2000).describe("Why it was rejected; saved as the review note."),
    }),
    unavailableReason: needsWrite("admin.moderation.manage"),
    run: async ({ id, reason }, ctx) => {
      const s = await db.submission.findUnique({ where: { id }, select: { status: true } });
      if (!s) throw new ToolError("Submission not found.");
      if (s.status !== "PENDING") throw new ToolError(`Submission is already ${s.status.toLowerCase()}.`);
      const result = await rejectSubmission(id, ctx.user.id, reason, { auditMeta: auditMeta(ctx) });
      if (!result.ok) throw new ToolError(result.error);
      revalidatePath("/admin/submissions");
      revalidatePath("/admin/queues");
      return { rejected: true };
    },
  }),

  defineTool({
    name: "search_events",
    title: "Search events",
    description:
      "Events matching a title, slug, or venue name, one page at a time. Excludes archived events. Upcoming events are soonest first; past and all are most recent first.",
    readOnly: true,
    input: z.object({
      query: z.string().trim().max(200).optional(),
      status: z.enum(EVENT_STATUSES).optional(),
      when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
      limit: limitField(100, 25),
      offset: offsetField,
    }),
    unavailableReason: needs("admin.listings.manage"),
    run: async ({ query, status, when, limit, offset }) => {
      const now = new Date();
      const where: Prisma.EventWhereInput = {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(when === "upcoming" ? { endDate: { gte: now } } : when === "past" ? { endDate: { lt: now } } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { slug: { contains: query, mode: "insensitive" } },
                { venue: { name: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [events, total] = await Promise.all([
        db.event.findMany({
          where,
          orderBy: [{ startDate: when === "upcoming" ? "asc" : "desc" }, { id: "asc" }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startDate: true,
            endDate: true,
            venue: { select: { id: true, name: true, city: true } },
            market: { select: { id: true, name: true } },
          },
        }),
        db.event.count({ where }),
      ]);
      return page(
        events.map((e) => ({ ...e, url: `${APP_URL}/events/${e.slug}` })),
        total,
        offset
      );
    },
  }),

  defineTool({
    name: "get_event",
    title: "Get event",
    description: "One event in full, by id or slug: venue, market, schedule days, tags, features, and links.",
    readOnly: true,
    input: z
      .object({ id: z.string().min(1).optional(), slug: z.string().min(1).optional() })
      .refine((v) => v.id || v.slug, { message: "Pass id or slug." }),
    unavailableReason: needs("admin.listings.manage"),
    run: async ({ id, slug }) => {
      const event = await db.event.findFirst({
        where: id ? { id } : { slug },
        include: {
          venue: { select: { id: true, name: true, address: true, city: true, state: true, zip: true } },
          market: { select: { id: true, name: true, slug: true } },
          tags: { select: { name: true } },
          features: { select: { name: true } },
          scheduleDays: { orderBy: { date: "asc" } },
        },
      });
      if (!event) throw new ToolError("Event not found.");
      return {
        ...event,
        tags: event.tags.map((t) => t.name),
        features: event.features.map((f) => f.name),
        url: `${APP_URL}/events/${event.slug}`,
        adminUrl: `${APP_URL}/admin/events/${event.id}/edit`,
      };
    },
  }),

  defineTool({
    name: "update_event",
    title: "Update event",
    description:
      "Changes an event's title, description, status, venue, market, links, or image. Pass only the fields to change; null clears an optional field. Dates and schedules are edited in the dashboard.",
    readOnly: false,
    input: z
      .object({
        id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(20000).nullable().optional(),
        status: z.enum(EVENT_STATUSES).optional(),
        venueId: z.string().min(1).optional(),
        marketId: z.string().min(1).nullable().optional(),
        websiteUrl: optionalUrl,
        facebookUrl: optionalUrl,
        instagramUrl: optionalUrl,
        imageUrl: imageUrlField,
      })
      .refine(hasChange, { message: "Pass at least one field to change." }),
    unavailableReason: needsWrite("admin.listings.manage"),
    run: async ({ id, ...changes }, ctx) => {
      const existing = await db.event.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          submittedById: true,
          description: true,
          venueId: true,
          marketId: true,
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          imageUrl: true,
        },
      });
      if (!existing) throw new ToolError("Event not found or archived.");
      if (changes.venueId) {
        const venue = await db.venue.findFirst({ where: { id: changes.venueId, deletedAt: null }, select: { id: true } });
        if (!venue) throw new ToolError("That venue does not exist or is archived.");
      }
      if (changes.marketId) {
        const market = await db.market.findFirst({ where: { id: changes.marketId, deletedAt: null }, select: { id: true } });
        if (!market) throw new ToolError("That market does not exist or is archived.");
      }

      const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      const event = await db.event.update({
        where: { id },
        data,
        select: { id: true, title: true, slug: true, status: true },
      });

      await notifySubmitterOfStatusChange({
        submittedById: existing.submittedById,
        previousStatus: existing.status,
        newStatus: event.status,
        event,
      });
      const previousValue = Object.fromEntries(
        Object.keys(data).map((key) => [key, existing[key as keyof typeof existing]])
      );
      await logAudit(ctx.user.id, "UPDATE_EVENT", "EVENT", id, {
        previousValue,
        newValue: data,
        ...auditMeta(ctx),
      });
      revalidateListings(event.slug);
      return { ...event, url: `${APP_URL}/events/${event.slug}` };
    },
  }),

  defineTool({
    name: "search_venues",
    title: "Search venues",
    description:
      "Venues matching a name or street address, one page at a time, alphabetical, with their map coordinates (lat, lng) and how many events and markets use each.",
    readOnly: true,
    input: z.object({
      query: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      includeArchived: z.boolean().default(false),
      limit: limitField(100, 25),
      offset: offsetField,
    }),
    unavailableReason: needs("admin.listings.manage"),
    run: async ({ query, city, includeArchived, limit, offset }) => {
      const where: Prisma.VenueWhereInput = {
        ...(includeArchived ? {} : { deletedAt: null }),
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { address: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [venues, total] = await Promise.all([
        db.venue.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zip: true,
            lat: true,
            lng: true,
            neighborhood: true,
            parkingNotes: true,
            deletedAt: true,
            _count: { select: { events: true, markets: true } },
          },
        }),
        db.venue.count({ where }),
      ]);
      return page(venues, total, offset);
    },
  }),

  defineTool({
    name: "find_duplicate_venues",
    title: "Find duplicate venues",
    description:
      "Groups of active venues that look like the same place (same street address, same name, or the same spot on the map). The first venue in each group has the most listings and is the suggested one to keep.",
    readOnly: true,
    input: z.object({}),
    unavailableReason: needs("admin.listings.manage"),
    run: async () => {
      const listings = (v: Awaited<ReturnType<typeof activeVenueRows>>[number]) =>
        v._count.events + v._count.markets;
      return findDuplicateGroups(await activeVenueRows()).map((group) => {
        const sorted = [...group].sort(
          (a, b) => listings(b) - listings(a) || a.createdAt.getTime() - b.createdAt.getTime()
        );
        return {
          suggestedKeepId: sorted[0].id,
          venues: sorted.map((v) => ({
            id: v.id,
            name: v.name,
            address: `${v.address}, ${v.city}, ${v.state} ${v.zip}`,
            events: v._count.events,
            markets: v._count.markets,
          })),
        };
      });
    },
  }),

  defineTool({
    name: "merge_venues",
    title: "Merge venues",
    description:
      "Merges duplicate venues into the one to keep: their events and markets move to it, a missing neighborhood or parking notes is copied over, and the duplicates are archived (not deleted).",
    readOnly: false,
    destructive: true,
    input: z.object({
      keepId: z.string().min(1),
      mergeIds: z.array(z.string().min(1)).min(1).max(20),
    }),
    unavailableReason: needsWrite("admin.listings.manage"),
    run: async ({ keepId, mergeIds }, ctx) => {
      const result = await mergeVenues(keepId, mergeIds, ctx.user.id, { auditMeta: auditMeta(ctx) });
      if (!result.ok) throw new ToolError(result.error);
      revalidateListings();
      revalidatePath("/admin/venues/duplicates");
      return result;
    },
  }),

  defineTool({
    name: "update_venue",
    title: "Update venue",
    description:
      "Changes a venue's name, address, neighborhood, parking notes, or map location. Pass only the fields to change. A changed address is geocoded again and rejected if it cannot be found. To fix a misplaced map pin, pass relocate: true to geocode the address again, or pass lat and lng. Coordinates must fall in the Spokane and North Idaho area.",
    readOnly: false,
    input: z
      .object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(200).optional(),
        address: z.string().trim().min(1).max(300).optional(),
        city: z.string().trim().min(1).max(100).optional(),
        state: z.string().trim().min(2).max(50).optional(),
        zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 12345 or 12345-6789").optional(),
        neighborhood: z.string().trim().nullable().optional().describe("Neighborhood slug, or null to clear."),
        parkingNotes: z.string().max(1000).nullable().optional(),
        relocate: z
          .boolean()
          .optional()
          .describe("true to geocode the address again (the new one if passed, otherwise the current one) and save its coordinates."),
        lat: z
          .number()
          .min(SERVICE_AREA.minLat)
          .max(SERVICE_AREA.maxLat)
          .optional()
          .describe("Latitude to save, passed together with lng instead of geocoding."),
        lng: z
          .number()
          .min(SERVICE_AREA.minLng)
          .max(SERVICE_AREA.maxLng)
          .optional()
          .describe("Longitude to save, passed together with lat instead of geocoding."),
      })
      .refine((v) => hasChange({ ...v, relocate: v.relocate || undefined }), {
        message: "Pass at least one field to change.",
      })
      .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "Pass lat and lng together." })
      .refine((v) => !(v.relocate && v.lat !== undefined), {
        message: "Pass either relocate or lat and lng, not both.",
      }),
    unavailableReason: needsWrite("admin.listings.manage"),
    run: async ({ id, ...changes }, ctx) => {
      const existing = await db.venue.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new ToolError("Venue not found or archived.");

      const data: Prisma.VenueUpdateInput = {
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.address !== undefined ? { address: changes.address } : {}),
        ...(changes.city !== undefined ? { city: changes.city } : {}),
        ...(changes.state !== undefined ? { state: changes.state } : {}),
        ...(changes.zip !== undefined ? { zip: changes.zip } : {}),
        ...(changes.parkingNotes !== undefined ? { parkingNotes: changes.parkingNotes } : {}),
      };
      if (changes.neighborhood !== undefined) {
        try {
          data.neighborhoodRef = changes.neighborhood
            ? { connect: { slug: (await assertNeighborhoodSlug(changes.neighborhood, "neighborhood"))! } }
            : { disconnect: true };
        } catch (err) {
          throw new ToolError(err instanceof Error ? err.message : "Unknown neighborhood.");
        }
      }

      const addressChanged = (["address", "city", "state", "zip"] as const).some(
        (key) => changes[key] !== undefined && changes[key] !== existing[key]
      );
      let coords: { lat: number; lng: number } | null = null;
      if (changes.lat !== undefined && changes.lng !== undefined) {
        coords = { lat: changes.lat, lng: changes.lng };
      } else if (addressChanged || changes.relocate) {
        coords = await geocodeAddress({
          address: changes.address ?? existing.address,
          city: changes.city ?? existing.city,
          state: changes.state ?? existing.state,
          zip: changes.zip ?? existing.zip,
        });
        if (!coords) {
          throw new ToolError(
            `Couldn't find the ${addressChanged ? "new " : ""}address on the map. Check the street, city, state, and ZIP, or pass lat and lng.`
          );
        }
        if (!inServiceArea(coords)) {
          throw new ToolError(
            `The address was placed at ${coords.lat}, ${coords.lng}, outside ${SERVICE_AREA_TEXT}. Check the city, state, and ZIP, or pass lat and lng.`
          );
        }
      }
      if (coords) {
        data.lat = coords.lat;
        data.lng = coords.lng;
      }

      let venue;
      try {
        venue = await db.venue.update({ where: { id }, data });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002") {
          throw new ToolError("Another venue already has this name and address. Merge them instead.");
        }
        throw err;
      }
      await logAudit(ctx.user.id, "UPDATE_VENUE", "VENUE", id, {
        previousValue: {
          name: existing.name,
          address: existing.address,
          city: existing.city,
          state: existing.state,
          zip: existing.zip,
          neighborhood: existing.neighborhood,
          parkingNotes: existing.parkingNotes,
          ...(coords ? { lat: existing.lat, lng: existing.lng } : {}),
        },
        newValue: { ...changes, ...coords },
        ...auditMeta(ctx),
      });
      revalidateListings();
      return venue;
    },
  }),

  defineTool({
    name: "search_markets",
    title: "Search markets",
    description:
      "Markets matching a name or slug, one page at a time, alphabetical, with their home venue. Excludes archived markets.",
    readOnly: true,
    input: z.object({
      query: z.string().trim().max(200).optional(),
      limit: limitField(100, 25),
      offset: offsetField,
    }),
    unavailableReason: needs("admin.listings.manage"),
    run: async ({ query, limit, offset }) => {
      const where: Prisma.MarketWhereInput = {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { slug: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [markets, total] = await Promise.all([
        db.market.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
          select: {
            id: true,
            name: true,
            slug: true,
            verificationStatus: true,
            venue: { select: { id: true, name: true } },
          },
        }),
        db.market.count({ where }),
      ]);
      return page(
        markets.map((m) => ({ ...m, url: `${APP_URL}/markets/${m.slug}` })),
        total,
        offset
      );
    },
  }),

  defineTool({
    name: "list_taxonomy",
    title: "List taxonomy",
    description:
      "Every tag and feature, and every active neighborhood, each with its name and slug, alphabetical. Imports match tagNames and featureNames by these names or slugs and create any they don't find; venue neighborhoods and market base areas must be one of these neighborhood slugs.",
    readOnly: true,
    input: z.object({}),
    unavailableReason: needs("admin.listings.manage"),
    run: async () => {
      const [tags, features, neighborhoods] = await Promise.all([
        db.tag.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
        db.feature.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
        getNeighborhoodOptions(),
      ]);
      return {
        tags,
        features,
        neighborhoods: neighborhoods.map((n) => ({ name: n.label, slug: n.value })),
      };
    },
  }),
];

export const ADMIN_MCP_SERVER: ServerInfo = {
  name: "spokane-markets-admin",
  version: "1.0.0",
  instructions: [
    "Admin tools for Spokane Markets (spokane.markets), a directory of markets, events, vendors, and venues in the Spokane and Coeur d'Alene area.",
    "Start with get_overview to see what needs attention.",
    "List and search tools return one page with total and hasMore; pass offset to read the next page of an unchanged list. After approving, rejecting, or changing status, list again from offset 0, because the items that were acted on have left the list.",
    "Approving a submission publishes its event immediately; check its venueOutcome first.",
    "Before creating or fixing venues, use find_duplicate_venues and merge duplicates rather than editing them apart.",
    "Use list_taxonomy for the existing tags, features, and neighborhoods so new listings reuse them instead of inventing near-synonyms.",
    "Write tools change the live site and every change is audit-logged under the token's owner.",
  ].join(" "),
};
