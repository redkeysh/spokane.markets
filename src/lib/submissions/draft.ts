import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { decisionDetails, type DecisionRef } from "@/lib/admin/decision-details";
import { mapScheduleDaysForSubmit } from "@/lib/event-schedule-day";
import { ALREADY_REVIEWED_MESSAGE, approveSubmissionWithEvent } from "@/lib/submission-approval";
import { normalizeUrlToHttps } from "@/lib/utils";
import { eventScheduleDaySchema } from "@/lib/validations/event";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const link = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? normalizeUrlToHttps(v) : v === undefined ? undefined : null))
  .refine((v) => {
    if (!v) return true;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, "Links must be web addresses, such as example.com or https://example.com.");

/**
 * The fields of a pending submission the admin can edit. Every field is
 * optional; only the fields given are saved. Links accept bare domains and
 * are saved as https:// addresses.
 */
export const submissionDraftSchema = z.object({
  eventTitle: z.string().trim().min(1, "Event title is required").max(200).optional(),
  eventDescription: nullableText(20000),
  scheduleDays: z.array(eventScheduleDaySchema).min(1, "Add at least one day").max(366).optional(),
  venueName: z.string().trim().min(1, "Venue name is required").max(200).optional(),
  venueAddress: z.string().trim().min(1, "Venue address is required").max(300).optional(),
  venueCity: nullableText(100),
  venueState: nullableText(50),
  venueZip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "ZIP must be 12345 or 12345-6789")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  marketId: z.string().trim().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
  featureIds: z.array(z.string().min(1)).max(50).optional(),
  imageUrl: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => !v || v.startsWith("/uploads/") || /^https?:\/\//i.test(v), "Must be an http(s) URL or an /uploads/ path."),
  websiteUrl: link,
  facebookUrl: link,
  instagramUrl: link,
  notes: nullableText(20000),
});

export type SubmissionDraft = z.input<typeof submissionDraftSchema>;

/** undefined stays undefined (not given); an empty string becomes null (cleared). */
function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value?.trim() ? value : null;
}

export type DraftResult = { ok: true } | { ok: false; error: string };

const DRAFT_SELECT = {
  status: true,
  eventTitle: true,
  eventDescription: true,
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
  tagIds: true,
  featureIds: true,
  imageUrl: true,
  websiteUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  notes: true,
} satisfies Prisma.SubmissionSelect;

/** The legacy one-line date fields list views read, derived from schedule days. */
export function legacyDateFields(days: { date: string; allDay: boolean; startTime?: string; endTime?: string }[]) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    eventDate: first.date,
    eventTime: first.allDay ? "00:00" : (first.startTime ?? "00:00"),
    endDate: last.date === first.date ? null : last.date,
    endTime: last.allDay ? null : (last.endTime ?? null),
    allDay: sorted.every((d) => d.allDay),
  };
}

/**
 * Saves edits to a pending submission, including schedule days, tags,
 * features, market and the place fields, so approval publishes exactly what
 * the admin sees. Only PENDING submissions change.
 */
export async function saveSubmissionDraft(
  id: string,
  draft: SubmissionDraft,
  actorId: string,
  options: DecisionRef & { auditMeta?: Record<string, unknown> } = {}
): Promise<DraftResult> {
  const parsed = submissionDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission edits." };
  const input = parsed.data;

  const existing = await db.submission.findUnique({ where: { id }, select: DRAFT_SELECT });
  if (!existing) return { ok: false, error: "Submission not found." };
  if (existing.status !== "PENDING") return { ok: false, error: "Only pending submissions can be edited." };

  if (input.marketId) {
    const market = await db.market.findFirst({ where: { id: input.marketId, deletedAt: null }, select: { id: true } });
    if (!market) return { ok: false, error: "That market does not exist or is archived." };
  }
  const tagIds = input.tagIds ? [...new Set(input.tagIds)] : undefined;
  const featureIds = input.featureIds ? [...new Set(input.featureIds)] : undefined;
  if (tagIds?.length && (await db.tag.count({ where: { id: { in: tagIds } } })) !== tagIds.length) {
    return { ok: false, error: "One of the tags no longer exists." };
  }
  if (featureIds?.length && (await db.feature.count({ where: { id: { in: featureIds } } })) !== featureIds.length) {
    return { ok: false, error: "One of the features no longer exists." };
  }

  const data: Prisma.SubmissionUpdateManyMutationInput = {};
  const set = <K extends keyof typeof DRAFT_SELECT & keyof Prisma.SubmissionUpdateManyMutationInput>(
    key: K,
    value: Prisma.SubmissionUpdateManyMutationInput[K] | undefined
  ) => {
    if (value !== undefined) data[key] = value;
  };
  set("eventTitle", input.eventTitle);
  set("eventDescription", blankToNull(input.eventDescription));
  set("venueName", input.venueName);
  set("venueAddress", input.venueAddress);
  set("venueCity", blankToNull(input.venueCity));
  set("venueState", blankToNull(input.venueState));
  set("venueZip", input.venueZip);
  set("marketId", input.marketId);
  set("tagIds", tagIds);
  set("featureIds", featureIds);
  set("imageUrl", blankToNull(input.imageUrl));
  set("websiteUrl", input.websiteUrl);
  set("facebookUrl", input.facebookUrl);
  set("instagramUrl", input.instagramUrl);
  set("notes", blankToNull(input.notes));
  if (input.scheduleDays) {
    const days = mapScheduleDaysForSubmit(input.scheduleDays);
    data.scheduleDays = days as Prisma.InputJsonValue;
    Object.assign(data, legacyDateFields(days));
  }
  if (Object.keys(data).length === 0) return { ok: true };

  const updated = await db.submission.updateMany({ where: { id, status: "PENDING" }, data });
  if (updated.count === 0) return { ok: false, error: "Only pending submissions can be edited." };

  const previousValue = Object.fromEntries(Object.keys(data).map((key) => [key, existing[key as keyof typeof existing]]));
  await logAudit(actorId, "UPDATE_SUBMISSION", "SUBMISSION", id, {
    previousValue,
    newValue: data,
    details: { title: input.eventTitle ?? existing.eventTitle, ...decisionDetails(options) },
    ...options.auditMeta,
  });
  revalidateAdmin();
  return { ok: true };
}

export type PublishResult = { ok: true; eventId: string; slug: string; notified: string[] } | { ok: false; error: string };

/**
 * Saves the draft (when given), then approves the submission with
 * approveSubmissionWithEvent, which creates the event as Published in the same
 * transaction that claims the submission and tells a submitter who has an
 * account. The approval's audit entry carries the title, the decision and who
 * was told.
 */
export async function publishSubmission(
  id: string,
  draft: SubmissionDraft | null,
  actorId: string,
  options: DecisionRef & { auditMeta?: Record<string, unknown> } = {}
): Promise<PublishResult> {
  if (draft) {
    const saved = await saveSubmissionDraft(id, draft, actorId, options);
    if (!saved.ok) return saved;
  }
  const submission = await db.submission.findUnique({
    where: { id },
    select: { submitterEmail: true, submitterName: true, eventTitle: true },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  // The same lookup approveSubmissionWithEvent uses to find the account it notifies.
  const account = await db.user.findUnique({ where: { email: submission.submitterEmail }, select: { id: true } });
  const notified = account ? [submission.submitterName] : [];

  let created: { id: string; slug: string } | null;
  try {
    created = await approveSubmissionWithEvent(id, actorId, {
      auditMeta: {
        ...options.auditMeta,
        details: {
          ...decisionDetails(options),
          title: submission.eventTitle.trim(),
          at: new Date().toISOString(),
          ...(notified.length ? { notified } : {}),
        },
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approval failed." };
  }
  if (!created) return { ok: false, error: ALREADY_REVIEWED_MESSAGE };

  revalidateAdmin({ eventSlugs: [created.slug] });
  return { ok: true, eventId: created.id, slug: created.slug, notified };
}
