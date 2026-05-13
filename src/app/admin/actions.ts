"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { evaluateAndGrantBadges } from "@/lib/badges";
import { revalidatePath } from "next/cache";
import {
  normalizePermissionMatrix,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";
import { approveSubmissionWithEvent } from "@/lib/submission-approval";

const editSubmissionSchema = z.object({
  eventTitle: z.string().trim().min(1, "Event title is required"),
  eventDescription: z.string().trim().max(20000).nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Event date must be YYYY-MM-DD"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be HH:mm"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD").nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time must be HH:mm").nullable().optional(),
  allDay: z.boolean(),
  venueName: z.string().trim().min(1, "Venue name is required"),
  venueAddress: z.string().trim().min(1, "Venue address is required"),
  venueCity: z.string().trim().nullable().optional(),
  venueState: z.string().trim().nullable().optional(),
  venueZip: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  facebookUrl: z.string().trim().nullable().optional(),
  instagramUrl: z.string().trim().nullable().optional(),
  websiteUrl: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(20000).nullable().optional(),
});

function optionalUrlOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  try {
    // Accept only absolute URLs to stay consistent with current validators.
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch {
    throw new Error("Links must be valid absolute URLs (including https://).");
  }
}

async function requireAdminAction(permission: AdminPermissionKey) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    session.user.role !== "ADMIN" ||
    session.user.accountStatus !== "ACTIVE"
  ) {
    throw new Error("Unauthorized");
  }
  const row = await db.siteConfig.findUnique({
    where: { key: "admin_permissions_matrix" },
    select: { value: true },
  });
  const matrix = normalizePermissionMatrix(
    row?.value ? JSON.parse(row.value) : null
  );
  const allowed = matrix[session.user.role]?.includes(permission) ?? false;
  if (!allowed) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function deleteEvent(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.event.findUnique({
    where: { id },
    select: { deletedAt: true, title: true, status: true },
  });
  if (!current) return;
  await db.event.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(session.user.id, "SOFT_DELETE_EVENT", "EVENT", id, {
    previousValue: current,
    newValue: { ...current, deletedAt: "now" },
  });
  revalidatePath("/admin/events");
}

export async function deleteVenue(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.venue.findUnique({
    where: { id },
    select: { deletedAt: true, name: true },
  });
  if (!current) return;
  await db.venue.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(session.user.id, "SOFT_DELETE_VENUE", "VENUE", id, {
    previousValue: current,
    newValue: { ...current, deletedAt: "now" },
  });
  revalidatePath("/admin/venues");
}

export async function deleteMarket(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.market.findUnique({
    where: { id },
    select: { deletedAt: true, name: true, verificationStatus: true },
  });
  if (!current) return;
  await db.market.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(session.user.id, "SOFT_DELETE_MARKET", "MARKET", id, {
    previousValue: current,
    newValue: { ...current, deletedAt: "now" },
  });
  revalidatePath("/admin/markets");
}

export async function deleteVendor(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.vendorProfile.findUnique({
    where: { id },
    select: { deletedAt: true, businessName: true },
  });
  if (!current) return;
  await db.vendorProfile.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await logAudit(session.user.id, "SOFT_DELETE_VENDOR", "VENDOR_PROFILE", id, {
    previousValue: current,
    newValue: { ...current, deletedAt: "now" },
  });
  revalidatePath("/admin/vendors");
}

export async function restoreEvent(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.event.findUnique({
    where: { id },
    select: { deletedAt: true },
  });
  if (!current?.deletedAt) return;
  await db.event.update({ where: { id }, data: { deletedAt: null } });
  await logAudit(session.user.id, "RESTORE_EVENT", "EVENT", id, {
    previousValue: current,
    newValue: { deletedAt: null },
  });
  revalidatePath("/admin/events");
}

export async function restoreVenue(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.venue.findUnique({
    where: { id },
    select: { deletedAt: true },
  });
  if (!current?.deletedAt) return;
  await db.venue.update({ where: { id }, data: { deletedAt: null } });
  await logAudit(session.user.id, "RESTORE_VENUE", "VENUE", id, {
    previousValue: current,
    newValue: { deletedAt: null },
  });
  revalidatePath("/admin/venues");
}

export async function restoreMarket(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.market.findUnique({
    where: { id },
    select: { deletedAt: true },
  });
  if (!current?.deletedAt) return;
  await db.market.update({ where: { id }, data: { deletedAt: null } });
  await logAudit(session.user.id, "RESTORE_MARKET", "MARKET", id, {
    previousValue: current,
    newValue: { deletedAt: null },
  });
  revalidatePath("/admin/markets");
}

export async function restoreVendor(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.vendorProfile.findUnique({
    where: { id },
    select: { deletedAt: true },
  });
  if (!current?.deletedAt) return;
  await db.vendorProfile.update({ where: { id }, data: { deletedAt: null } });
  await logAudit(session.user.id, "RESTORE_VENDOR", "VENDOR_PROFILE", id, {
    previousValue: current,
    newValue: { deletedAt: null },
  });
  revalidatePath("/admin/vendors");
}

export async function deletePromotion(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  await db.promotion.delete({ where: { id } });
  await logAudit(session.user.id, "DELETE_PROMOTION", "PROMOTION", id);
  revalidatePath("/admin/promotions");
  revalidatePath("/");
  revalidatePath("/vendors");
}

export async function verifyMarket(id: string) {
  await requireAdminAction("admin.listings.manage");
  const market = await db.market.findUnique({
    where: { id },
    select: {
      ownerId: true,
      name: true,
      slug: true,
      memberships: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: { userId: true },
      },
    },
  });
  await db.market.update({
    where: { id },
    data: { verificationStatus: "VERIFIED" },
  });
  const recipients = new Set<string>();
  if (market?.ownerId) recipients.add(market.ownerId);
  for (const membership of market?.memberships ?? []) {
    recipients.add(membership.userId);
  }
  if (market) {
    for (const recipientId of recipients) {
      await createNotification({
        userId: recipientId,
        type: "MARKET_VERIFIED",
        title: `Your market ${market.name} is now verified`,
        link: `/markets/${market.slug}`,
        objectType: "market",
        objectId: id,
      });
    }
  }
  revalidatePath("/admin/markets");
}

export async function setMarketVerificationStatus(
  id: string,
  status: "UNVERIFIED" | "PENDING" | "VERIFIED"
) {
  await requireAdminAction("admin.listings.manage");
  const market = await db.market.findUnique({
    where: { id },
    select: {
      ownerId: true,
      name: true,
      slug: true,
      memberships: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: { userId: true },
      },
    },
  });
  await db.market.update({
    where: { id },
    data: { verificationStatus: status },
  });
  if (status === "VERIFIED" && market) {
    const recipients = new Set<string>();
    if (market.ownerId) recipients.add(market.ownerId);
    for (const membership of market.memberships) {
      recipients.add(membership.userId);
    }
    for (const recipientId of recipients) {
      await createNotification({
        userId: recipientId,
        type: "MARKET_VERIFIED",
        title: `Your market ${market.name} is now verified`,
        link: `/markets/${market.slug}`,
        objectType: "market",
        objectId: id,
      });
    }
  }
  revalidatePath("/admin/markets");
}

export async function verifyVendor(id: string) {
  await setVendorVerificationStatus(id, "VERIFIED");
}

export async function setVendorVerificationStatus(
  id: string,
  status: "UNVERIFIED" | "PENDING" | "VERIFIED"
) {
  const session = await requireAdminAction("admin.listings.manage");
  const current = await db.vendorProfile.findFirst({
    where: { id, deletedAt: null },
    select: {
      verificationStatus: true,
      businessName: true,
      slug: true,
      userId: true,
    },
  });
  if (!current) return;

  await db.vendorProfile.update({
    where: { id },
    data: { verificationStatus: status },
  });

  await logAudit(session.user.id, "UPDATE_VENDOR_VERIFICATION", "VENDOR_PROFILE", id, {
    previousValue: { verificationStatus: current.verificationStatus },
    newValue: { verificationStatus: status },
  });

  if (
    status === "VERIFIED" &&
    current.userId &&
    current.verificationStatus !== "VERIFIED"
  ) {
    await createNotification({
      userId: current.userId,
      type: "VENDOR_VERIFIED",
      title: `Your vendor profile ${current.businessName} is now verified`,
      link: `/vendors/${current.slug}`,
      objectType: "vendor_profile",
      objectId: id,
    });
  }

  revalidatePath("/admin/vendors");
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${current.slug}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/account/saved");
}

export async function updateSubmissionStatus(
  id: string,
  status: "APPROVED" | "REJECTED",
  options?: { reviewNotes?: string | null }
) {
  try {
    const session = await requireAdminAction("admin.moderation.manage");
    if (status === "APPROVED") {
      try {
        await approveSubmissionWithEvent(id, session.user.id);
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Failed to approve submission. Please review required fields and try again.",
        };
      }
      revalidatePath("/admin/submissions");
      revalidatePath(`/admin/submissions/${id}`);
      revalidatePath("/admin/queues");
      return { ok: true as const };
    }

    const submission = await db.submission.findUnique({
      where: { id },
      select: { submitterEmail: true, status: true },
    });
    if (!submission) {
      return { ok: false as const, error: "Submission not found." };
    }

    const trimmedNotes = options?.reviewNotes?.trim() ?? "";
    const reviewNotes =
      options && "reviewNotes" in options ? (trimmedNotes === "" ? null : trimmedNotes) : undefined;

    await db.submission.update({
      where: { id },
      data: {
        status,
        reviewerId: session.user.id,
        ...(reviewNotes !== undefined ? { reviewNotes } : {}),
      },
    });
    const user = await db.user.findUnique({
      where: { email: submission.submitterEmail },
      select: { id: true },
    });
    if (user) {
      await createNotification({
        userId: user.id,
        type: "SUBMISSION_REJECTED",
        title: "Your event submission was rejected",
        link: "/submit",
        objectType: "submission",
        objectId: id,
      });
    }
    await logAudit(session.user.id, "UPDATE_SUBMISSION_STATUS", "SUBMISSION", id, {
      previousValue: { status: submission.status },
      newValue: { status, ...(reviewNotes !== undefined ? { reviewNotes } : {}) },
    });
    revalidatePath("/admin/submissions");
    revalidatePath(`/admin/submissions/${id}`);
    revalidatePath("/admin/queues");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to update submission status right now.",
    };
  }
}

export async function updateSubmissionDraft(
  id: string,
  input: z.input<typeof editSubmissionSchema>
) {
  try {
    const session = await requireAdminAction("admin.moderation.manage");
    const parsed = editSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? "Invalid submission edits.";
      return { ok: false as const, error: firstError };
    }

    const existing = await db.submission.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return { ok: false as const, error: "Submission not found." };
    }
    if (existing.status !== "PENDING") {
      return { ok: false as const, error: "Only pending submissions can be edited." };
    }

    const data = parsed.data;
    const next = {
      eventTitle: data.eventTitle,
      eventDescription: data.eventDescription?.trim() ? data.eventDescription.trim() : null,
      eventDate: data.eventDate,
      eventTime: data.eventTime,
      endDate: data.endDate?.trim() ? data.endDate.trim() : null,
      endTime: data.endTime?.trim() ? data.endTime.trim() : null,
      allDay: data.allDay,
      venueName: data.venueName,
      venueAddress: data.venueAddress,
      venueCity: data.venueCity?.trim() ? data.venueCity.trim() : null,
      venueState: data.venueState?.trim() ? data.venueState.trim() : null,
      venueZip: data.venueZip?.trim() ? data.venueZip.trim() : null,
      imageUrl: optionalUrlOrNull(data.imageUrl),
      facebookUrl: optionalUrlOrNull(data.facebookUrl),
      instagramUrl: optionalUrlOrNull(data.instagramUrl),
      websiteUrl: optionalUrlOrNull(data.websiteUrl),
      notes: data.notes?.trim() ? data.notes.trim() : null,
    };

    await db.submission.update({
      where: { id },
      data: next,
    });

    await logAudit(session.user.id, "UPDATE_SUBMISSION", "SUBMISSION", id, {
      newValue: next,
    });

    revalidatePath("/admin/submissions");
    revalidatePath(`/admin/submissions/${id}`);
    revalidatePath("/admin/queues");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save submission edits.",
    };
  }
}

export async function updateReviewStatus(id: string, status: "APPROVED" | "REJECTED") {
  const session = await requireAdminAction("admin.moderation.manage");
  const review = await db.review.findUnique({
    where: { id },
    select: { userId: true, status: true },
  });
  if (!review) return;
  await db.review.update({
    where: { id },
    data: { status },
  });
  if (status === "APPROVED" && review?.userId) {
    evaluateAndGrantBadges(review.userId).catch(() => {});
  }
  await logAudit(session.user.id, "UPDATE_REVIEW_STATUS", "REVIEW", id, {
    previousValue: { status: review.status },
    newValue: { status },
  });
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/queues");
}

export async function updatePhotoStatus(id: string, status: "APPROVED" | "REJECTED") {
  const session = await requireAdminAction("admin.moderation.manage");
  const photo = await db.photo.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!photo) return;
  await db.photo.update({
    where: { id },
    data: { status },
  });
  await logAudit(session.user.id, "UPDATE_PHOTO_STATUS", "PHOTO", id, {
    previousValue: { status: photo.status },
    newValue: { status },
  });
  revalidatePath("/admin/photos");
  revalidatePath("/admin/queues");
}

export async function updateReportStatus(
  id: string,
  status: "RESOLVED" | "DISMISSED"
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const report = await db.report.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!report) return;
  await db.report.update({
    where: { id },
    data: {
      status,
      ...(status === "RESOLVED" ? { escalationStatus: "CLOSED" } : {}),
    },
  });
  await logAudit(session.user.id, "UPDATE_REPORT_STATUS", "REPORT", id, {
    previousValue: { status: report.status },
    newValue: { status },
  });
  revalidatePath("/admin/reports");
  revalidatePath("/admin/queues");
}

export async function updateReportTriage(
  id: string,
  updates: {
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    escalationStatus?: "NEW" | "TRIAGED" | "ESCALATED" | "CLOSED";
    internalNotes?: string;
  }
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const report = await db.report.findUnique({
    where: { id },
    select: {
      severity: true,
      escalationStatus: true,
      internalNotes: true,
    },
  });
  if (!report) return;
  await db.report.update({
    where: { id },
    data: {
      ...(updates.severity ? { severity: updates.severity } : {}),
      ...(updates.escalationStatus
        ? { escalationStatus: updates.escalationStatus }
        : {}),
      ...(updates.internalNotes !== undefined
        ? { internalNotes: updates.internalNotes || null }
        : {}),
    },
  });
  await logAudit(session.user.id, "UPDATE_REPORT_TRIAGE", "REPORT", id, {
    previousValue: report,
    newValue: updates,
  });
  revalidatePath("/admin/reports");
}

export async function assignReportToMe(id: string) {
  const session = await requireAdminAction("admin.moderation.manage");
  const current = await db.report.findUnique({
    where: { id },
    select: { assigneeUserId: true },
  });
  if (!current) return;
  await db.report.update({
    where: { id },
    data: { assigneeUserId: session.user.id },
  });
  await logAudit(session.user.id, "ASSIGN_REPORT", "REPORT", id, {
    previousValue: { assigneeUserId: current.assigneeUserId },
    newValue: { assigneeUserId: session.user.id },
  });
  revalidatePath("/admin/reports");
}

export async function unassignReport(id: string) {
  const session = await requireAdminAction("admin.moderation.manage");
  const current = await db.report.findUnique({
    where: { id },
    select: { assigneeUserId: true },
  });
  if (!current?.assigneeUserId) return;
  await db.report.update({
    where: { id },
    data: { assigneeUserId: null },
  });
  await logAudit(session.user.id, "UNASSIGN_REPORT", "REPORT", id, {
    previousValue: { assigneeUserId: current.assigneeUserId },
    newValue: { assigneeUserId: null },
  });
  revalidatePath("/admin/reports");
}

export async function updateReportInternalNotes(formData: FormData) {
  const session = await requireAdminAction("admin.moderation.manage");
  const id = String(formData.get("reportId") ?? "");
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();
  if (!id) return;
  const current = await db.report.findUnique({
    where: { id },
    select: { internalNotes: true },
  });
  if (!current) return;
  await db.report.update({
    where: { id },
    data: { internalNotes: internalNotes || null },
  });
  await logAudit(session.user.id, "UPDATE_REPORT_INTERNAL_NOTES", "REPORT", id, {
    previousValue: { internalNotes: current.internalNotes },
    newValue: { internalNotes: internalNotes || null },
  });
  revalidatePath("/admin/reports");
}

function getSelectedIds(formData: FormData): string[] {
  return formData
    .getAll("selectedIds")
    .map((v) => String(v))
    .filter(Boolean);
}

export async function bulkUpdateSubmissionStatus(
  status: "APPROVED" | "REJECTED",
  formData: FormData
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const ids = getSelectedIds(formData);
  if (ids.length === 0) return;

  if (status === "APPROVED") {
    for (const id of ids) {
      await approveSubmissionWithEvent(id, session.user.id);
    }
    await logAudit(
      session.user.id,
      "BULK_UPDATE_SUBMISSION_STATUS",
      "SUBMISSION",
      undefined,
      { ids, newValue: { status: "APPROVED" } }
    );
    return;
  }

  await db.submission.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status, reviewerId: session.user.id },
  });
  await logAudit(
    session.user.id,
    "BULK_UPDATE_SUBMISSION_STATUS",
    "SUBMISSION",
    undefined,
    {
      ids,
      newValue: { status },
    }
  );
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/queues");
}

export async function bulkUpdateReviewStatus(
  status: "APPROVED" | "REJECTED",
  formData: FormData
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const ids = getSelectedIds(formData);
  if (ids.length === 0) return;
  await db.review.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status },
  });
  await logAudit(session.user.id, "BULK_UPDATE_REVIEW_STATUS", "REVIEW", undefined, {
    ids,
    newValue: { status },
  });
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/queues");
}

export async function bulkUpdatePhotoStatus(
  status: "APPROVED" | "REJECTED",
  formData: FormData
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const ids = getSelectedIds(formData);
  if (ids.length === 0) return;
  await db.photo.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status },
  });
  await logAudit(session.user.id, "BULK_UPDATE_PHOTO_STATUS", "PHOTO", undefined, {
    ids,
    newValue: { status },
  });
  revalidatePath("/admin/photos");
  revalidatePath("/admin/queues");
}

export async function bulkUpdateReportStatus(
  status: "RESOLVED" | "DISMISSED",
  formData: FormData
) {
  const session = await requireAdminAction("admin.moderation.manage");
  const ids = getSelectedIds(formData);
  if (ids.length === 0) return;
  await db.report.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: {
      status,
      ...(status === "RESOLVED" ? { escalationStatus: "CLOSED" } : {}),
    },
  });
  await logAudit(session.user.id, "BULK_UPDATE_REPORT_STATUS", "REPORT", undefined, {
    ids,
    newValue: { status },
  });
  revalidatePath("/admin/reports");
  revalidatePath("/admin/queues");
}
