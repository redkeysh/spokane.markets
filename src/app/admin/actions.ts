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
import {
  ALREADY_REVIEWED_MESSAGE,
  approveSubmissionWithEvent,
  rejectSubmission,
} from "@/lib/submission-approval";
import { createApiToken } from "@/lib/api-tokens";

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

const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(80),
  access: z.enum(["READ", "WRITE"]),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable(),
});

/** Returns the plaintext token once; only its hash is stored. */
export async function createApiTokenAction(
  input: z.input<typeof createApiTokenSchema>
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const session = await requireAdminAction("admin.settings.manage");
  const parsed = createApiTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid token settings." };
  }
  const { token, record } = await createApiToken({ userId: session.user.id, ...parsed.data });
  await logAudit(session.user.id, "CREATE_API_TOKEN", "API_TOKEN", record.id, {
    name: record.name,
    access: record.access,
    expiresAt: record.expiresAt,
  });
  revalidatePath("/admin/api-tokens");
  return { ok: true, token };
}

export async function revokeApiTokenAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdminAction("admin.settings.manage");
  const existing = await db.apiToken.findUnique({ where: { id }, select: { name: true, revokedAt: true } });
  if (!existing) return { ok: false, error: "Token not found." };
  if (!existing.revokedAt) {
    await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit(session.user.id, "REVOKE_API_TOKEN", "API_TOKEN", id, { name: existing.name });
  }
  revalidatePath("/admin/api-tokens");
  return { ok: true };
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
        const event = await approveSubmissionWithEvent(id, session.user.id);
        if (!event) return { ok: false as const, error: ALREADY_REVIEWED_MESSAGE };
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

    const trimmedNotes = options?.reviewNotes?.trim() ?? "";
    const reviewNotes =
      options && "reviewNotes" in options ? (trimmedNotes === "" ? null : trimmedNotes) : undefined;

    const rejected = await rejectSubmission(id, session.user.id, reviewNotes);
    if (!rejected.ok) {
      return { ok: false as const, error: rejected.error };
    }
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
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireAdminAction("admin.moderation.manage");
  const ids = getSelectedIds(formData);
  if (ids.length === 0) return { ok: false, error: "Select at least one submission." };

  // Each submission is reviewed independently so one failure does not strand
  // the rest of the batch; already-reviewed submissions are skipped.
  const done: string[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];
  for (const id of ids) {
    if (status === "APPROVED") {
      try {
        const event = await approveSubmissionWithEvent(id, session.user.id, { auditMeta: { bulk: true } });
        (event ? done : skipped).push(id);
      } catch (e) {
        failures.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
      }
    } else {
      try {
        const result = await rejectSubmission(id, session.user.id, undefined, { auditMeta: { bulk: true } });
        (result.ok ? done : skipped).push(id);
      } catch (e) {
        failures.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
  }

  await logAudit(session.user.id, "BULK_UPDATE_SUBMISSION_STATUS", "SUBMISSION", undefined, {
    ids: done,
    newValue: { status },
    ...(skipped.length ? { skipped } : {}),
    ...(failures.length ? { failures } : {}),
  });
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/queues");

  const verb = status === "APPROVED" ? "Approved" : "Rejected";
  const summary = [
    `${verb} ${done.length} of ${ids.length}.`,
    skipped.length ? `${skipped.length} already reviewed.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (failures.length) {
    const failedVerb = status === "APPROVED" ? "approved" : "rejected";
    return { ok: false, error: `${summary} ${failures.length} could not be ${failedVerb}: ${failures.join("; ")}` };
  }
  return { ok: true, message: summary };
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
