import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pacificDate } from "@/lib/admin/format";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { decisionDetails } from "@/lib/admin/decision-details";
import { eventLocalDates, placeProblems } from "@/lib/events/readiness";
import { EventMutationError, type MutationOptions } from "@/lib/events/mutations";
import { computeEventDatesFromSchedule } from "@/lib/shared/event-service";
import { parseDateOnlyToUTCNoon } from "@/lib/utils";
import {
  DatePatternError,
  dateSlug,
  isNewDateStatus,
  pickSlugs,
  retitleForDate,
  validateNewDates,
  type DateHours,
  type NewDate,
  type NewDateStatus,
} from "./dates";

/** Fields a new date copies from the listing it repeats. Dates, permits, attestations and notes stay per listing. */
const COPIED_FIELDS = [
  "description",
  "imageUrl",
  "showImageInList",
  "imageFocalX",
  "imageFocalY",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
  "listingKind",
  "organizerDisplayName",
  "organizerPublicContact",
  "eventType",
  "occurrenceModel",
  "timezone",
  "indoorOutdoor",
  "shortDescription",
  "vendorCategoryPolicy",
  "vendorApplicationState",
  "vendorWorkflowMode",
  "expectedAttendance",
  "streetClosureImpact",
  "streetClosureNarrative",
  "insuranceSummary",
  "safetyPlanSummary",
  "sanitationPlan",
  "cancellationPolicy",
  "accessibilitySummary",
  "parkingSummary",
  "restroomAccess",
  "petPolicy",
  "paymentMethodsPublic",
  "productHighlights",
  "typicalVendorCount",
  "feeModelVendor",
  "boothLogistics",
  "communicationChannels",
  "equityInclusionNotes",
] as const;

const SOURCE_SELECT = {
  id: true,
  title: true,
  startDate: true,
  ...Object.fromEntries(COPIED_FIELDS.map((field) => [field, true])),
  tags: { select: { id: true } },
  features: { select: { id: true } },
} as const;

type SourceRow = { id: string; title: string; startDate: Date; tags: { id: string }[]; features: { id: string }[] } & Record<
  (typeof COPIED_FIELDS)[number],
  unknown
>;

export type CreatedDate = { id: string; slug: string; title: string; date: string };

/**
 * Creates one event per date for a market, each with its schedule day, at the market's home place
 * and linked to the market, copied from the listing named per date (or `copyFromEventId`, or the
 * market itself), with status Draft or Published. Dates the market already lists are skipped;
 * dates before today are refused.
 * Writes one CREATE_EVENT audit entry per event in the same transaction. Throws
 * EventMutationError or DatePatternError with a message that is safe to show.
 */
export async function createMarketDates(
  marketId: string,
  input: { dates: readonly NewDate[]; copyFromEventId?: string | null; status: NewDateStatus },
  actorId: string,
  options: MutationOptions = {}
): Promise<{ created: CreatedDate[]; skipped: string[] }> {
  if (!isNewDateStatus(input.status)) throw new DatePatternError("New dates are either Draft or Published.");
  const dates = validateNewDates(input.dates, pacificDate(new Date()));
  const market = await db.market.findFirst({
    where: { id: marketId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      imageFocalX: true,
      imageFocalY: true,
      websiteUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      venue: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, deletedAt: true } },
    },
  });
  if (!market) throw new EventMutationError("This market does not exist or is archived.");
  if (market.venue.deletedAt) {
    throw new EventMutationError(`The market's home place, ${market.venue.name}, is archived. Restore it or pick another home place first.`);
  }
  if (input.status === "PUBLISHED") {
    const problems = placeProblems(market.venue);
    if (problems.length > 0) throw new EventMutationError(`${problems.map((p) => p.message).join(" ")} Create them as drafts, or fix ${market.venue.name} first.`);
  }

  const sourceIds = [...new Set(dates.map((d) => d.sourceEventId ?? input.copyFromEventId ?? null).filter((id): id is string => !!id))];
  const sources = sourceIds.length
    ? ((await db.event.findMany({ where: { id: { in: sourceIds }, marketId }, select: SOURCE_SELECT })) as unknown as SourceRow[])
    : [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const missing = sourceIds.find((id) => !sourceById.has(id));
  if (missing) throw new EventMutationError("A date to copy from is no longer part of this market.");

  const listed = await db.event.findMany({
    where: { marketId, deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] } },
    select: { startDate: true, endDate: true, scheduleDays: { select: { date: true } } },
  });
  const taken = new Set(
    listed.flatMap((e) => eventLocalDates({ ...e, scheduleDays: e.scheduleDays.map((d) => ({ date: d.date.toISOString().slice(0, 10) })) }))
  );
  const skipped: string[] = [];
  const todo: (NewDate & DateHours & { source: SourceRow | null; title: string })[] = [];
  const seen = new Set<string>();
  for (const d of [...dates].sort((a, b) => a.date.localeCompare(b.date))) {
    if (taken.has(d.date) || seen.has(d.date)) {
      skipped.push(d.date);
      continue;
    }
    seen.add(d.date);
    const sourceId = d.sourceEventId ?? input.copyFromEventId ?? null;
    const source = sourceId ? sourceById.get(sourceId)! : null;
    const title = source ? retitleForDate(source.title, pacificDate(source.startDate), d.date) : market.name;
    todo.push({ ...d, source, title });
  }
  if (todo.length === 0) return { created: [], skipped };

  const wanted = todo.map((d) => dateSlug(d.title, d.date));
  const prefixes = [...new Set(wanted)];
  const [slugRows, redirectRows] = await Promise.all([
    db.event.findMany({ where: { OR: prefixes.map((p) => ({ slug: { startsWith: p } })) }, select: { slug: true } }),
    db.eventSlugRedirect.findMany({ where: { OR: prefixes.map((p) => ({ slug: { startsWith: p } })) }, select: { slug: true } }),
  ]);
  const slugs = pickSlugs(wanted, new Set([...slugRows, ...redirectRows].map((r) => r.slug)));

  const at = new Date();
  const created = await db.$transaction(async (tx) => {
    const rows: CreatedDate[] = [];
    for (const [i, d] of todo.entries()) {
      const day = { date: d.date, startTime: d.startTime, endTime: d.endTime, allDay: d.allDay };
      const { startDate, endDate } = computeEventDatesFromSchedule("", "", [day]);
      const copied: Record<string, unknown> = {};
      if (d.source) {
        for (const field of COPIED_FIELDS) {
          const value = d.source[field];
          if (value !== null && value !== undefined) copied[field] = value;
        }
      } else {
        for (const field of ["description", "imageUrl", "imageFocalX", "imageFocalY", "websiteUrl", "facebookUrl", "instagramUrl"] as const) {
          if (market[field] !== null) copied[field] = market[field];
        }
      }
      const event = await tx.event.create({
        data: {
          ...(copied as Prisma.EventUncheckedCreateInput),
          title: d.title,
          slug: slugs[i],
          status: input.status,
          startDate,
          endDate,
          venueId: market.venue.id,
          marketId: market.id,
          updatedAt: at,
          scheduleDays: {
            create: [{ date: parseDateOnlyToUTCNoon(d.date), startTime: d.startTime, endTime: d.endTime, allDay: d.allDay }],
          },
          ...(d.source?.tags.length ? { tags: { connect: d.source.tags.map((t) => ({ id: t.id })) } } : {}),
          ...(d.source?.features.length ? { features: { connect: d.source.features.map((f) => ({ id: f.id })) } } : {}),
        },
        select: { id: true, slug: true, title: true },
      });
      rows.push({ ...event, date: d.date });
    }
    await tx.auditLog.createMany({
      data: rows.map((row, i) => ({
        userId: actorId,
        action: "CREATE_EVENT",
        targetType: "EVENT",
        targetId: row.id,
        metadata: {
          newValue: {
            status: input.status,
            marketId: market.id,
            venueId: market.venue.id,
            scheduleDays: [{ date: todo[i].date, startTime: todo[i].startTime, endTime: todo[i].endTime, allDay: todo[i].allDay }],
            ...(todo[i].source ? { copiedFrom: todo[i].source!.id } : {}),
          },
          details: { title: row.title, at: at.toISOString(), market: market.name, ...decisionDetails(options) },
          ...options.auditMeta,
        } as Prisma.InputJsonValue,
      })),
    });
    return rows;
  });

  revalidateAdmin({ eventSlugs: input.status === "PUBLISHED" ? created.map((c) => c.slug) : [], marketSlugs: [market.slug] });
  return { created, skipped };
}
