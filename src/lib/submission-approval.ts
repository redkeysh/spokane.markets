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

export async function ensureUniqueEventSlug(title: string): Promise<string> {
  const base = slugify(title) || "event";
  let candidate = base;
  for (let n = 0; n < 100_000; n += 1) {
    const exists = await db.event.findFirst({
      where: { slug: candidate, deletedAt: null },
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

function revalidateAfterSubmissionEvent() {
  revalidatePath("/events");
  revalidatePath("/events/calendar");
  revalidatePath("/events/map");
  revalidatePath("/");
  revalidatePath("/admin/events");
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/queues");
}

/**
 * Approves a pending submission and creates a PENDING event. Idempotent if
 * `createdEventId` is already set.
 */
export async function approveSubmissionWithEvent(
  submissionId: string,
  reviewerId: string
): Promise<void> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
  });
  if (!submission || submission.status !== "PENDING") return;
  if (submission.createdEventId) return;

  if (!submissionHasCompleteVenueForEvent(submission)) {
    throw new Error(
      "Cannot approve: this submission is missing venue name, street address, city, state, or ZIP. Reject it and ask the submitter to resubmit with a full address, or fix the submission in the database first."
    );
  }

  const slug = await ensureUniqueEventSlug(submission.eventTitle);
  const eventData = buildEventDataFromSubmission(submission, slug);

  const submitterUser = await db.user.findUnique({
    where: { email: submission.submitterEmail },
    select: { id: true },
  });

  const result = await createEvent(eventData, {
    status: "PENDING",
    submittedById: submitterUser?.id ?? null,
  });

  if (result.error || !result.event) {
    throw new Error(result.error ?? "Failed to create event from submission");
  }

  await db.submission.update({
    where: { id: submissionId },
    data: {
      status: "APPROVED",
      reviewerId,
      createdEventId: result.event.id,
    },
  });

  if (submitterUser) {
    await createNotification({
      userId: submitterUser.id,
      type: "SUBMISSION_APPROVED",
      title: "Your event submission was approved",
      link: "/events",
      objectType: "submission",
      objectId: submissionId,
    });
  }

  await logAudit(reviewerId, "UPDATE_SUBMISSION_STATUS", "SUBMISSION", submissionId, {
    previousValue: { status: submission.status },
    newValue: { status: "APPROVED", createdEventId: result.event.id },
  });

  revalidateAfterSubmissionEvent();
}
