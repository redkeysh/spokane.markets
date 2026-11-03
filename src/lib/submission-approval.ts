import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { slugify, parseDateTimeInTimezone } from "@/lib/utils";
import { mapScheduleDaysForSubmit } from "@/lib/event-schedule-day";
import { createEvent, type EventData } from "@/lib/shared/event-service";
import type { Submission } from "@prisma/client";

const TZ = "America/Los_Angeles";

/** Required for `resolveVenueId` / event creation — same rules as organizer API. */
export function submissionHasCompleteVenueForEvent(s: Submission): boolean {
  return !!(
    s.venueName?.trim() &&
    s.venueAddress?.trim() &&
    s.venueCity?.trim() &&
    s.venueState?.trim() &&
    s.venueZip?.trim()
  );
}

/** Archived events keep their slug, and the slug index is unique across all events, so they count as taken. */
export async function ensureUniqueEventSlug(title: string): Promise<string> {
  const base = slugify(title) || "event";
  let candidate = base;
  for (let n = 0; n < 100_000; n += 1) {
    const exists = await db.event.findFirst({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${base}-${n + 1}`;
  }
  throw new Error("Could not generate unique event slug");
}

function enumerateDateStringsInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const startD = new Date(`${start}T12:00:00.000Z`);
  const endD = new Date(`${end}T12:00:00.000Z`);
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
    return [start];
  }
  const endTime = endD.getTime();
  for (
    let d = new Date(startD);
    d.getTime() <= endTime;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out.length > 0 ? out : [start];
}

export function buildEventDataFromSubmission(
  submission: Submission,
  slug: string
): EventData {
  if (submission.scheduleDays != null && Array.isArray(submission.scheduleDays)) {
    const mapped = mapScheduleDaysForSubmit(
      submission.scheduleDays as {
        date: string;
        allDay: boolean;
        startTime?: string;
        endTime?: string;
      }[]
    );
    const sortedMapped = [...mapped].sort((a, b) => a.date.localeCompare(b.date));
    const first = sortedMapped[0];
    const last = sortedMapped[sortedMapped.length - 1];
    const firstStart = first.allDay ? "00:00" : (first.startTime ?? "00:00");
    const lastEnd = last.allDay ? "23:59" : (last.endTime ?? "23:59");
    const startDateIso = parseDateTimeInTimezone(first.date, firstStart, TZ).toISOString();
    const endDateIso = parseDateTimeInTimezone(last.date, lastEnd, TZ).toISOString();
    const scheduleDays: NonNullable<EventData["scheduleDays"]> = mapped.map((d) => ({
      date: d.date,
      allDay: d.allDay,
      startTime: d.allDay ? undefined : d.startTime,
      endTime: d.allDay ? undefined : d.endTime,
    }));
    return {
      title: submission.eventTitle.trim(),
      slug,
      description: submission.eventDescription ?? null,
      startDate: startDateIso,
      endDate: endDateIso,
      scheduleDays,
      imageUrl: submission.imageUrl ?? null,
      websiteUrl: submission.websiteUrl ?? null,
      facebookUrl: submission.facebookUrl ?? null,
      instagramUrl: submission.instagramUrl ?? null,
      marketId: submission.marketId ?? null,
      tagIds: submission.tagIds ?? [],
      featureIds: submission.featureIds ?? [],
      venueName: submission.venueName.trim(),
      venueAddress: submission.venueAddress.trim(),
      venueCity: submission.venueCity?.trim() ?? "",
      venueState: submission.venueState?.trim() ?? "",
      venueZip: submission.venueZip?.trim() ?? "",
      venueLat: undefined,
      venueLng: undefined,
      venueId: null,
    };
  }

  const eventDate = submission.eventDate.trim();
  const endDayStr = (submission.endDate?.trim() || eventDate).trim();
  const eventTime = submission.eventTime || "00:00";
  const endTimeRaw = submission.endTime || submission.eventTime || "23:59";

  let scheduleDays: EventData["scheduleDays"] | undefined;
  let startDateIso: string;
  let endDateIso: string;

  if (endDayStr === eventDate) {
    const startDt = parseDateTimeInTimezone(
      eventDate,
      submission.allDay ? "00:00" : eventTime,
      TZ
    );
    const endDt = parseDateTimeInTimezone(
      eventDate,
      submission.allDay ? "23:59" : endTimeRaw,
      TZ
    );
    startDateIso = startDt.toISOString();
    endDateIso = endDt.toISOString();
  } else {
    const days = enumerateDateStringsInclusive(eventDate, endDayStr);
    if (submission.allDay) {
      scheduleDays = days.map((d) => ({ date: d, allDay: true }));
    } else {
      scheduleDays = days.map((d, i) => {
        if (i === 0) {
          return {
            date: d,
            allDay: false,
            startTime: eventTime,
            endTime: "23:59",
          };
        }
        if (i === days.length - 1) {
          return {
            date: d,
            allDay: false,
            startTime: "00:00",
            endTime: endTimeRaw,
          };
        }
        return { date: d, allDay: true };
      });
    }
    const first = scheduleDays[0];
    const last = scheduleDays[scheduleDays.length - 1];
    const firstStart = first.allDay ? "00:00" : (first.startTime ?? "00:00");
    const lastEnd = last.allDay ? "23:59" : (last.endTime ?? "23:59");
    startDateIso = parseDateTimeInTimezone(first.date, firstStart, TZ).toISOString();
    endDateIso = parseDateTimeInTimezone(last.date, lastEnd, TZ).toISOString();
  }

  return {
    title: submission.eventTitle.trim(),
    slug,
    description: submission.eventDescription ?? null,
    startDate: startDateIso,
    endDate: endDateIso,
    scheduleDays,
    imageUrl: submission.imageUrl ?? null,
    websiteUrl: submission.websiteUrl ?? null,
    facebookUrl: submission.facebookUrl ?? null,
    instagramUrl: submission.instagramUrl ?? null,
    marketId: submission.marketId ?? null,
    tagIds: submission.tagIds ?? [],
    featureIds: submission.featureIds ?? [],
    venueName: submission.venueName.trim(),
    venueAddress: submission.venueAddress.trim(),
    venueCity: submission.venueCity?.trim() ?? "",
    venueState: submission.venueState?.trim() ?? "",
    venueZip: submission.venueZip?.trim() ?? "",
    venueLat: undefined,
    venueLng: undefined,
    venueId: null,
  };
}

function revalidateAfterSubmissionEvent(eventSlug: string) {
  revalidatePath(`/events/${eventSlug}`);
  revalidatePath("/events");
  revalidatePath("/events/calendar");
  revalidatePath("/events/map");
  revalidatePath("/");
  revalidatePath("/admin/events");
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/queues");
}

export const ALREADY_REVIEWED_MESSAGE = "This submission was already reviewed.";

/** The guarded claim matched no row: the submission was reviewed or edited after it was read. */
class SubmissionChanged extends Error {}

/**
 * Notifications and audit entries written after a review has committed. A
 * failure here is logged rather than thrown, so a committed review is never
 * reported to the caller as failed.
 */
async function afterReviewCommitted(submissionId: string, steps: (() => Promise<unknown>)[]) {
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      console.error(`[submission-approval] follow-up for ${submissionId} failed:`, err);
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002";
}

/**
 * Approves a pending submission and creates its event as PUBLISHED. Returns
 * null without changes when the submission is missing, no longer pending, or
 * already has an event, including when another review finishes first. The
 * PENDING -> APPROVED change runs in the same transaction as the event insert
 * and only matches the row as it was read, so a concurrent review or edit
 * rolls the event back instead of being overwritten.
 */
export async function approveSubmissionWithEvent(
  submissionId: string,
  reviewerId: string,
  options: { auditMeta?: Record<string, unknown> } = {}
): Promise<{ id: string; slug: string } | null> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
  });
  if (!submission || submission.status !== "PENDING") return null;
  if (submission.createdEventId) return null;

  if (!submissionHasCompleteVenueForEvent(submission)) {
    throw new Error(
      "Cannot approve: this submission is missing venue name, street address, city, state, or ZIP. Reject it and ask the submitter to resubmit with a full address, or fix the submission in the database first."
    );
  }

  const slug = await ensureUniqueEventSlug(submission.eventTitle);
  const [tags, features] = await Promise.all([
    db.tag.findMany({ where: { id: { in: submission.tagIds } }, select: { id: true } }),
    db.feature.findMany({ where: { id: { in: submission.featureIds } }, select: { id: true } }),
  ]);
  const eventData = {
    ...buildEventDataFromSubmission(submission, slug),
    tagIds: tags.map((t) => t.id),
    featureIds: features.map((f) => f.id),
  };

  const submitterUser = await db.user.findUnique({
    where: { email: submission.submitterEmail },
    select: { id: true },
  });

  let result: Awaited<ReturnType<typeof createEvent>>;
  try {
    result = await createEvent(eventData, {
      status: "PUBLISHED",
      submittedById: submitterUser?.id ?? null,
      inTransaction: async (tx, created) => {
        const claimed = await tx.submission.updateMany({
          where: {
            id: submissionId,
            status: "PENDING",
            createdEventId: null,
            updatedAt: submission.updatedAt,
          },
          data: { status: "APPROVED", reviewerId, createdEventId: created.id },
        });
        if (claimed.count === 0) throw new SubmissionChanged();
      },
    });
  } catch (err) {
    if (!(err instanceof SubmissionChanged) && !isUniqueViolation(err)) throw err;
    const current = await db.submission.findUnique({
      where: { id: submissionId },
      select: { status: true, createdEventId: true },
    });
    if (!current || current.status !== "PENDING" || current.createdEventId) return null;
    if (err instanceof SubmissionChanged) {
      throw new Error("This submission was edited while it was being approved. Check the changes and approve again.");
    }
    if (await db.event.findFirst({ where: { slug }, select: { id: true } })) {
      throw new Error("Another event took this event's URL at the same moment. Try approving again.");
    }
    throw err;
  }
  if (result.error || !result.event) {
    throw new Error(result.error ?? "Failed to create event from submission");
  }
  const event = result.event;

  await afterReviewCommitted(submissionId, [
    async () => {
      if (!submitterUser) return;
      await createNotification({
        userId: submitterUser.id,
        type: "SUBMISSION_APPROVED",
        title: "Your event submission was approved",
        link: `/events/${event.slug}`,
        objectType: "submission",
        objectId: submissionId,
      });
    },
    () =>
      logAudit(reviewerId, "UPDATE_SUBMISSION_STATUS", "SUBMISSION", submissionId, {
        previousValue: { status: submission.status },
        newValue: { status: "APPROVED", createdEventId: event.id },
        ...options.auditMeta,
      }),
  ]);

  revalidateAfterSubmissionEvent(event.slug);
  return { id: event.id, slug: event.slug };
}

/**
 * Rejects a pending submission, notifies a submitter who has an account, and
 * audits it. The status change only applies while the submission is PENDING.
 */
export async function rejectSubmission(
  submissionId: string,
  reviewerId: string,
  reviewNotes: string | null | undefined,
  options: { auditMeta?: Record<string, unknown> } = {}
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "already_reviewed"; error: string }> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: { submitterEmail: true, status: true },
  });
  if (!submission) return { ok: false, reason: "not_found", error: "Submission not found." };

  const updated = await db.submission.updateMany({
    where: { id: submissionId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewerId,
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    },
  });
  if (updated.count === 0) return { ok: false, reason: "already_reviewed", error: ALREADY_REVIEWED_MESSAGE };

  await afterReviewCommitted(submissionId, [
    async () => {
      const submitter = await db.user.findUnique({
        where: { email: submission.submitterEmail },
        select: { id: true },
      });
      if (!submitter) return;
      await createNotification({
        userId: submitter.id,
        type: "SUBMISSION_REJECTED",
        title: "Your event submission was rejected",
        link: "/submit",
        objectType: "submission",
        objectId: submissionId,
      });
    },
    () =>
      logAudit(reviewerId, "UPDATE_SUBMISSION_STATUS", "SUBMISSION", submissionId, {
        previousValue: { status: "PENDING" },
        newValue: { status: "REJECTED", ...(reviewNotes !== undefined ? { reviewNotes } : {}) },
        ...options.auditMeta,
      }),
  ]);

  return { ok: true };
}
