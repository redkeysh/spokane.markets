import type { EventStatus, ParticipationMode, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notifySubmitterOfStatusChange } from "@/lib/events/status-notifications";
import { placeProblems } from "@/lib/events/readiness";
import { formatFullDate, pacificDate } from "@/lib/admin/format";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { decisionDetails, type DecisionRef } from "@/lib/admin/decision-details";
import { buildScheduleDayRecords, computeEventDatesFromSchedule, mergeScheduleDays } from "@/lib/shared/event-service";
import { eventSlugProblem, lockEventForSlugChange, recordEventSlugChange } from "@/lib/events/slug";

/** A change the caller asked for that cannot be made; the message is safe to show. */
export class EventMutationError extends Error {}

export type ScheduleDayChange = { date: string; allDay: boolean; startTime?: string; endTime?: string };

export type EventFieldChanges = {
  title?: string;
  slug?: string;
  description?: string | null;
  status?: EventStatus;
  venueId?: string;
  marketId?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  imageUrl?: string | null;
  showImageInList?: boolean;
  imageFocalX?: number;
  imageFocalY?: number;
  complianceNotes?: string | null;
  /** Vendor settings; null follows the market (or the site default without one). */
  participationMode?: ParticipationMode | null;
  vendorCapacity?: number | null;
  publicIntentListEnabled?: boolean | null;
  publicIntentNamesEnabled?: boolean | null;
  publicRosterEnabled?: boolean | null;
  /** Onboarding columns the editor shows under More details, in their column types; null clears. */
  details?: Partial<Record<DetailColumn, string | number | boolean | Date | null>>;
  tagIds?: string[];
  featureIds?: string[];
  /**
   * Replaces every schedule day (days sharing a date are merged into one);
   * startDate and endDate follow the first and last day.
   */
  scheduleDays?: ScheduleDayChange[];
};

export type MutationOptions = DecisionRef & {
  /** Spread into the audit metadata, e.g. { via: "mcp", tokenId }. */
  auditMeta?: Record<string, unknown>;
};

const SCALAR_FIELDS = [
  "title",
  "slug",
  "description",
  "status",
  "venueId",
  "marketId",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "imageUrl",
  "showImageInList",
  "imageFocalX",
  "imageFocalY",
  "complianceNotes",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
] as const;

/** Onboarding columns `details` may set. */
export const DETAIL_COLUMNS = [
  "indoorOutdoor",
  "accessibilitySummary",
  "parkingSummary",
  "restroomAccess",
  "petPolicy",
  "vendorApplicationState",
  "vendorApplicationDeadline",
  "feeModelVendor",
  "boothLogistics",
  "typicalVendorCount",
  "specialEventPermitStatus",
  "expectedAttendance",
  "streetClosureImpact",
  "streetClosureNarrative",
  "insuranceSummary",
  "safetyPlanSummary",
  "sanitationPlan",
  "cancellationPolicy",
] as const;
type DetailColumn = (typeof DETAIL_COLUMNS)[number];

type Submitter = { name: string | null; email: string; notificationPreference: { organizerAlertsEnabled: boolean } | null } | null;

const SUBMITTER_SELECT = {
  select: { name: true, email: true, notificationPreference: { select: { organizerAlertsEnabled: true } } },
} as const;

function submitterName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split("@")[0];
}

/** The rule notifySubmitterOfStatusChange applies: a submitter with alerts on, told when an event is published or rejected. */
function toldOf(submitter: Submitter, previous: EventStatus, next: EventStatus): string | null {
  if (!submitter || previous === next || (next !== "PUBLISHED" && next !== "REJECTED")) return null;
  if (submitter.notificationPreference?.organizerAlertsEnabled === false) return null;
  return submitterName(submitter);
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002";
}

/**
 * Changes an event's fields, as the MCP update_event tool and the admin
 * editor do: checks that a new place and market are active, then saves the
 * change and its UPDATE_EVENT audit entry (previous and new values) in one
 * transaction, tells the submitter about a publish or rejection (a failed
 * notification is logged, not thrown), and revalidates. Throws
 * EventMutationError for input that cannot be saved.
 */
export async function updateEventFields(
  id: string,
  changes: EventFieldChanges,
  actorId: string,
  options: MutationOptions = {}
): Promise<{
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  notified: string[];
  /** The slug the event had when the update ran. */
  previousSlug: string;
  /** Whether previousSlug now redirects to the event. */
  redirected: boolean;
}> {
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
      showImageInList: true,
      imageFocalX: true,
      imageFocalY: true,
      complianceNotes: true,
      participationMode: true,
      vendorCapacity: true,
      publicIntentListEnabled: true,
      publicIntentNamesEnabled: true,
      publicRosterEnabled: true,
      ...Object.fromEntries(DETAIL_COLUMNS.map((key) => [key, true])) as Record<DetailColumn, true>,
      startDate: true,
      endDate: true,
      tags: { select: { id: true } },
      features: { select: { id: true } },
      scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true }, orderBy: { date: "asc" } },
      submittedBy: SUBMITTER_SELECT,
    },
  });
  if (!existing) throw new EventMutationError("Event not found or archived.");
  if (changes.venueId) {
    const venue = await db.venue.findFirst({ where: { id: changes.venueId, deletedAt: null }, select: { id: true } });
    if (!venue) throw new EventMutationError("That venue does not exist or is archived.");
  }
  if (changes.marketId) {
    const market = await db.market.findFirst({ where: { id: changes.marketId, deletedAt: null }, select: { id: true } });
    if (!market) throw new EventMutationError("That market does not exist or is archived.");
  }
  if (changes.scheduleDays && changes.scheduleDays.length === 0) {
    throw new EventMutationError("An event needs at least one day.");
  }
  if (changes.slug !== undefined && changes.slug !== existing.slug) {
    const problem = await eventSlugProblem(id, changes.slug);
    if (problem) throw new EventMutationError(problem);
  }

  const at = new Date();
  const scalars = Object.fromEntries(SCALAR_FIELDS.filter((key) => changes[key] !== undefined).map((key) => [key, changes[key]]));
  const previousValue: Record<string, unknown> = Object.fromEntries(Object.keys(scalars).map((key) => [key, existing[key as keyof typeof existing]]));
  const newValue: Record<string, unknown> = { ...scalars };
  const data: Prisma.EventUncheckedUpdateInput = { ...(scalars as Prisma.EventUncheckedUpdateInput), updatedAt: at };
  for (const [key, value] of Object.entries(changes.details ?? {})) {
    if (value === undefined || !(DETAIL_COLUMNS as readonly string[]).includes(key)) continue;
    const before = existing[key as DetailColumn];
    previousValue[key] = before instanceof Date ? before.toISOString() : before;
    newValue[key] = value instanceof Date ? value.toISOString() : value;
    (data as Record<string, unknown>)[key] = value;
  }

  if (changes.tagIds) {
    previousValue.tagIds = existing.tags.map((t) => t.id);
    newValue.tagIds = changes.tagIds;
    data.tags = { set: changes.tagIds.map((tagId) => ({ id: tagId })) };
  }
  if (changes.featureIds) {
    previousValue.featureIds = existing.features.map((f) => f.id);
    newValue.featureIds = changes.featureIds;
    data.features = { set: changes.featureIds.map((featureId) => ({ id: featureId })) };
  }
  if (changes.scheduleDays) {
    const days = mergeScheduleDays(changes.scheduleDays);
    const bounds = computeEventDatesFromSchedule(existing.startDate.toISOString(), existing.endDate.toISOString(), days);
    previousValue.scheduleDays = existing.scheduleDays.map((d) => ({ ...d, date: d.date.toISOString().slice(0, 10) }));
    previousValue.startDate = existing.startDate.toISOString();
    previousValue.endDate = existing.endDate.toISOString();
    newValue.scheduleDays = days;
    newValue.startDate = bounds.startDate.toISOString();
    newValue.endDate = bounds.endDate.toISOString();
    data.startDate = bounds.startDate;
    data.endDate = bounds.endDate;
  }

  let saved: {
    event: { id: string; title: string; slug: string; status: EventStatus };
    told: string | null;
    previousSlug: string;
    redirected: boolean;
  };
  try {
    saved = await db.$transaction(async (tx) => {
      const before = changes.slug !== undefined ? await lockEventForSlugChange(tx, id) : existing;
      if (changes.scheduleDays) {
        await tx.eventScheduleDay.deleteMany({ where: { eventId: id } });
        await tx.eventScheduleDay.createMany({ data: buildScheduleDayRecords(id, changes.scheduleDays) });
      }
      const event = await tx.event.update({ where: { id }, data, select: { id: true, title: true, slug: true, status: true } });
      const told = toldOf(existing.submittedBy, existing.status, event.status);
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "UPDATE_EVENT",
          targetType: "EVENT",
          targetId: id,
          metadata: {
            previousValue,
            newValue,
            details: {
              title: event.title,
              at: at.toISOString(),
              ...decisionDetails(options),
              ...(told ? { notified: [told] } : {}),
            },
            ...options.auditMeta,
          } as Prisma.InputJsonValue,
        },
      });
      const redirected =
        changes.slug !== undefined &&
        (await recordEventSlugChange(tx, id, before.slug, event.slug, { previousStatus: before.status }));
      return { event, told, previousSlug: before.slug, redirected };
    });
  } catch (err) {
    if (changes.slug !== undefined && isUniqueViolation(err)) throw new EventMutationError("Another event already uses this web address.");
    throw err;
  }

  const { event, told, previousSlug, redirected } = saved;
  try {
    await notifySubmitterOfStatusChange({
      submittedById: existing.submittedById,
      previousStatus: existing.status,
      newStatus: event.status,
      event,
    });
  } catch (err) {
    console.error(`[events/mutations] notifying the submitter of ${id} failed:`, err);
  }
  revalidateAdmin({ eventSlugs: [...new Set([existing.slug, previousSlug, event.slug])] });
  return { ...event, notified: told ? [told] : [], previousSlug, redirected };
}

export type StatusChangeResult = {
  /** Ids whose status changed. */
  changed: string[];
  /** Ids that already had the status. */
  alreadyThere: string[];
  /** Ids not found or archived. */
  missing: string[];
  /** Ids left as they were because they cannot be published, each with the reason. */
  refused: { id: string; reason: string }[];
  /** Names of submitters who were told. */
  notified: string[];
};

function rejectionNote(existing: string | null, reason: string, at: Date): string {
  const line = `Rejected ${formatFullDate(pacificDate(at))}: ${reason}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

/**
 * Sets the status of many events in one transaction, with one UPDATE_EVENT
 * audit entry per changed event (previous status in previousValue, the
 * decision id in details). Publishing re-checks each event's place and
 * refuses events whose place is archived or has a blank address part. A
 * rejection reason is appended to complianceNotes. Each write only matches a
 * row still as it was read; when another change got there first, nothing is
 * changed and EventMutationError is thrown. Submitters are told after the
 * commit; a failed notification is logged and never undoes the change.
 */
export async function setEventStatuses(
  ids: string[],
  status: EventStatus,
  actorId: string,
  options: MutationOptions & { reason?: string } = {}
): Promise<StatusChangeResult> {
  const unique = [...new Set(ids)];
  const reason = options.reason?.trim();
  const note = status === "REJECTED" && reason ? reason : null;
  const at = new Date();

  const { rows, toChange, refused } = await db.$transaction(async (tx) => {
    const rows = await tx.event.findMany({
      where: { id: { in: unique }, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        complianceNotes: true,
        submittedById: true,
        submittedBy: SUBMITTER_SELECT,
        venue: { select: { name: true, address: true, city: true, state: true, zip: true, deletedAt: true } },
      },
    });
    const refused =
      status === "PUBLISHED"
        ? rows.flatMap((row) => {
            const problems = placeProblems(row.venue);
            return problems.length > 0 && row.status !== status ? [{ id: row.id, reason: problems.map((p) => p.message).join(" ") }] : [];
          })
        : [];
    const refusedIds = new Set(refused.map((r) => r.id));
    const toChange = rows.filter((r) => r.status !== status && !refusedIds.has(r.id));

    // One write per previous status (and, for a rejection note, per previous note).
    const groups = new Map<string, typeof toChange>();
    for (const row of toChange) {
      const key = JSON.stringify([row.status, note ? row.complianceNotes : null]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      const { status: previous, complianceNotes } = group[0];
      const updated = await tx.event.updateMany({
        where: { id: { in: group.map((r) => r.id) }, deletedAt: null, status: previous, ...(note ? { complianceNotes } : {}) },
        data: { status, updatedAt: at, ...(note ? { complianceNotes: rejectionNote(complianceNotes, note, at) } : {}) },
      });
      if (updated.count !== group.length) {
        throw new EventMutationError("Some of these events changed while they were being saved, so none were changed. Try again.");
      }
    }
    if (toChange.length > 0) {
      await tx.auditLog.createMany({
        data: toChange.map((row) => {
          const told = toldOf(row.submittedBy, row.status, status);
          return {
            userId: actorId,
            action: "UPDATE_EVENT",
            targetType: "EVENT",
            targetId: row.id,
            metadata: {
              previousValue: { status: row.status, ...(note ? { complianceNotes: row.complianceNotes } : {}) },
              newValue: { status, ...(note ? { complianceNotes: rejectionNote(row.complianceNotes, note, at) } : {}) },
              details: {
                title: row.title,
                at: at.toISOString(),
                ...decisionDetails(options),
                ...(reason ? { reason } : {}),
                ...(told ? { notified: [told] } : {}),
              },
              ...options.auditMeta,
            } as Prisma.InputJsonValue,
          };
        }),
      });
    }
    return { rows, toChange, refused };
  });

  for (const row of toChange) {
    try {
      await notifySubmitterOfStatusChange({ submittedById: row.submittedById, previousStatus: row.status, newStatus: status, event: row });
    } catch (err) {
      console.error(`[events/mutations] notifying the submitter of ${row.id} failed:`, err);
    }
  }
  if (toChange.length > 0) revalidateAdmin({ eventSlugs: toChange.map((r) => r.slug) });

  const found = new Set(rows.map((r) => r.id));
  const told = toChange.map((r) => toldOf(r.submittedBy, r.status, status)).filter((n): n is string => !!n);
  return {
    changed: toChange.map((r) => r.id),
    alreadyThere: rows.filter((r) => r.status === status).map((r) => r.id),
    missing: unique.filter((id) => !found.has(id)),
    refused,
    notified: [...new Set(told)],
  };
}

/**
 * Archives events (sets deletedAt) in one transaction, each with a
 * SOFT_DELETE_EVENT audit entry. With duplicateOfId, every archived event
 * records the event it duplicates, which must be active and not among `ids`.
 */
export async function archiveEvents(
  ids: string[],
  actorId: string,
  options: MutationOptions & { duplicateOfId?: string } = {}
): Promise<{ archived: string[]; missing: string[] }> {
  const unique = [...new Set(ids)];
  const { duplicateOfId } = options;
  if (duplicateOfId) {
    if (unique.includes(duplicateOfId)) throw new EventMutationError("An event cannot be a duplicate of itself.");
    const kept = await db.event.findFirst({ where: { id: duplicateOfId, deletedAt: null }, select: { id: true } });
    if (!kept) throw new EventMutationError("The event to keep does not exist or is archived.");
  }
  const rows = await db.event.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true, title: true, slug: true, status: true, duplicateOfId: true },
  });
  const at = new Date();
  if (rows.length > 0) {
    await db.$transaction([
      db.event.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, deletedAt: null },
        data: { deletedAt: at, updatedAt: at, ...(duplicateOfId ? { duplicateOfId } : {}) },
      }),
      db.auditLog.createMany({
        data: rows.map((row) => ({
          userId: actorId,
          action: "SOFT_DELETE_EVENT",
          targetType: "EVENT",
          targetId: row.id,
          metadata: {
            previousValue: { deletedAt: null, duplicateOfId: row.duplicateOfId, status: row.status },
            newValue: { deletedAt: at.toISOString(), duplicateOfId: duplicateOfId ?? row.duplicateOfId },
            details: {
              title: row.title,
              at: at.toISOString(),
              ...decisionDetails(options),
            },
            ...options.auditMeta,
          } as Prisma.InputJsonValue,
        })),
      }),
    ]);
  }
  revalidateAdmin({ eventSlugs: rows.map((r) => r.slug) });
  const found = new Set(rows.map((r) => r.id));
  return { archived: rows.map((r) => r.id), missing: unique.filter((id) => !found.has(id)) };
}

/** Restores archived events and clears what they duplicated, with a RESTORE_EVENT audit entry each. */
export async function restoreEvents(ids: string[], actorId: string, options: MutationOptions = {}): Promise<{ restored: string[] }> {
  const rows = await db.event.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: { not: null } },
    select: { id: true, title: true, slug: true, deletedAt: true, duplicateOfId: true },
  });
  const at = new Date();
  if (rows.length > 0) {
    await db.$transaction([
      db.event.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: null, duplicateOfId: null, updatedAt: at } }),
      db.auditLog.createMany({
        data: rows.map((row) => ({
          userId: actorId,
          action: "RESTORE_EVENT",
          targetType: "EVENT",
          targetId: row.id,
          metadata: {
            previousValue: { deletedAt: row.deletedAt?.toISOString() ?? null, duplicateOfId: row.duplicateOfId },
            newValue: { deletedAt: null, duplicateOfId: null },
            details: { title: row.title, at: at.toISOString(), ...decisionDetails(options) },
            ...options.auditMeta,
          } as Prisma.InputJsonValue,
        })),
      }),
    ]);
  }
  revalidateAdmin({ eventSlugs: rows.map((r) => r.slug) });
  return { restored: rows.map((r) => r.id) };
}

/**
 * Names of the submitters a publish or rejection of these events would tell
 * (an account that submitted the event, with organizer alerts on), for
 * "Publish and tell Dana".
 */
export async function notificationTarget(eventIds: string[]): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const rows = await db.event.findMany({
    where: { id: { in: eventIds }, submittedById: { not: null } },
    select: { submittedById: true, submittedBy: SUBMITTER_SELECT },
  });
  const names = new Map<string, string>();
  for (const row of rows) {
    if (!row.submittedById || !row.submittedBy) continue;
    if (row.submittedBy.notificationPreference?.organizerAlertsEnabled === false) continue;
    names.set(row.submittedById, submitterName(row.submittedBy));
  }
  return [...names.values()];
}
