import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { evaluateAndGrantBadges } from "@/lib/badges";
import { createNotification } from "@/lib/notifications";
import { decisionDetails, type DecisionRef } from "@/lib/admin/decision-details";

/**
 * Status changes of items sent from the public, shared by the applications API route and the
 * inbox. With a `ref`, the audit entry carries the decision id (for Done today and undo), the
 * record's title and the moment it was written.
 */
export type PublicRef = DecisionRef & { title?: string };

export type StatusChange = {
  found: boolean;
  /** False when the item already had the status (with `skipSame`) or changed while this ran. */
  changed: boolean;
  previous: string | null;
};

const NOT_FOUND: StatusChange = { found: false, changed: false, previous: null };

function auditDetails(ref: PublicRef | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  if (!ref) return {};
  return {
    details: {
      ...decisionDetails(ref),
      ...(ref.title ? { title: ref.title } : {}),
      at: new Date().toISOString(),
      ...extra,
    },
  };
}

type Options = {
  ref?: PublicRef;
  /** Leave an item that already has the status alone instead of writing it again. */
  skipSame?: boolean;
};

export type ModerationStatus = "APPROVED" | "REJECTED";

/** Approves or rejects a review. Approving starts the author's badge check. */
export async function setReviewStatus(id: string, status: ModerationStatus, actorId: string, options: Options = {}): Promise<StatusChange> {
  const review = await db.review.findUnique({ where: { id }, select: { userId: true, status: true } });
  if (!review) return NOT_FOUND;
  if (options.skipSame && review.status === status) return { found: true, changed: false, previous: review.status };
  const updated = await db.review.updateMany({ where: { id, status: review.status }, data: { status } });
  if (updated.count === 0) return { found: true, changed: false, previous: review.status };
  if (status === "APPROVED" && review.userId) {
    evaluateAndGrantBadges(review.userId).catch(() => {});
  }
  await logAudit(actorId, "UPDATE_REVIEW_STATUS", "REVIEW", id, {
    previousValue: { status: review.status },
    newValue: { status },
    ...auditDetails(options.ref),
  });
  return { found: true, changed: true, previous: review.status };
}

/** Shows (approves) or rejects a photo. */
export async function setPhotoStatus(id: string, status: ModerationStatus, actorId: string, options: Options = {}): Promise<StatusChange> {
  const photo = await db.photo.findUnique({ where: { id }, select: { status: true } });
  if (!photo) return NOT_FOUND;
  if (options.skipSame && photo.status === status) return { found: true, changed: false, previous: photo.status };
  const updated = await db.photo.updateMany({ where: { id, status: photo.status }, data: { status } });
  if (updated.count === 0) return { found: true, changed: false, previous: photo.status };
  await logAudit(actorId, "UPDATE_PHOTO_STATUS", "PHOTO", id, {
    previousValue: { status: photo.status },
    newValue: { status },
    ...auditDetails(options.ref),
  });
  return { found: true, changed: true, previous: photo.status };
}

export type ReportStatus = "RESOLVED" | "DISMISSED";

/** Resolves or dismisses a report; resolving also closes its escalation. */
export async function setReportStatus(id: string, status: ReportStatus, actorId: string, options: Options = {}): Promise<StatusChange> {
  const report = await db.report.findUnique({ where: { id }, select: { status: true, escalationStatus: true } });
  if (!report) return NOT_FOUND;
  if (options.skipSame && report.status === status) return { found: true, changed: false, previous: report.status };
  const closes = status === "RESOLVED" && report.escalationStatus !== "CLOSED";
  const updated = await db.report.updateMany({
    where: { id, status: report.status },
    data: { status, ...(status === "RESOLVED" ? { escalationStatus: "CLOSED" } : {}) },
  });
  if (updated.count === 0) return { found: true, changed: false, previous: report.status };
  await logAudit(actorId, "UPDATE_REPORT_STATUS", "REPORT", id, {
    previousValue: { status: report.status, ...(closes ? { escalationStatus: report.escalationStatus } : {}) },
    newValue: { status, ...(closes ? { escalationStatus: "CLOSED" } : {}) },
    ...auditDetails(options.ref),
  });
  return { found: true, changed: true, previous: report.status };
}

export type ReportTriage = {
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  escalationStatus?: "NEW" | "TRIAGED" | "ESCALATED" | "CLOSED";
  internalNotes?: string;
};

/** Changes a report's severity, escalation or internal notes. */
export async function setReportTriage(id: string, updates: ReportTriage, actorId: string): Promise<boolean> {
  const report = await db.report.findUnique({
    where: { id },
    select: { severity: true, escalationStatus: true, internalNotes: true },
  });
  if (!report) return false;
  await db.report.update({
    where: { id },
    data: {
      ...(updates.severity ? { severity: updates.severity } : {}),
      ...(updates.escalationStatus ? { escalationStatus: updates.escalationStatus } : {}),
      ...(updates.internalNotes !== undefined ? { internalNotes: updates.internalNotes || null } : {}),
    },
  });
  await logAudit(actorId, "UPDATE_REPORT_TRIAGE", "REPORT", id, { previousValue: report, newValue: updates });
  return true;
}

/** Assigns a report to an admin, or unassigns it with null. Returns false when nothing changed. */
export async function setReportAssignee(id: string, assigneeUserId: string | null, actorId: string): Promise<boolean> {
  const current = await db.report.findUnique({ where: { id }, select: { assigneeUserId: true } });
  if (!current) return false;
  if (assigneeUserId === null && !current.assigneeUserId) return false;
  await db.report.update({ where: { id }, data: { assigneeUserId } });
  await logAudit(actorId, assigneeUserId ? "ASSIGN_REPORT" : "UNASSIGN_REPORT", "REPORT", id, {
    previousValue: { assigneeUserId: current.assigneeUserId },
    newValue: { assigneeUserId },
  });
  return true;
}

/** Saves a report's internal notes; an empty text clears them. */
export async function setReportNotes(id: string, internalNotes: string, actorId: string): Promise<boolean> {
  const current = await db.report.findUnique({ where: { id }, select: { internalNotes: true } });
  if (!current) return false;
  await db.report.update({ where: { id }, data: { internalNotes: internalNotes || null } });
  await logAudit(actorId, "UPDATE_REPORT_INTERNAL_NOTES", "REPORT", id, {
    previousValue: { internalNotes: current.internalNotes },
    newValue: { internalNotes: internalNotes || null },
  });
  return true;
}

export type ApplicationDecision = "APPROVED" | "REJECTED" | "NEEDS_INFO" | "DUPLICATE";

const APPLICATION_ACTIONS: Record<ApplicationDecision, string> = {
  APPROVED: "APPROVE_APPLICATION",
  REJECTED: "REJECT_APPLICATION",
  NEEDS_INFO: "REQUEST_APPLICATION_INFO",
  DUPLICATE: "MARK_APPLICATION_DUPLICATE",
};

const APPLICATION_STATUS_TEXT: Record<ApplicationDecision, string> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_INFO: "marked as needing more information",
  DUPLICATE: "marked as duplicate",
};

/** The role approving an application of this form gives its account, or null. */
export function roleForForm(formType: string): "VENDOR" | "ORGANIZER" | null {
  if (formType === "VENDOR") return "VENDOR";
  if (formType === "MARKET") return "ORGANIZER";
  return null;
}

/**
 * Sets an application's status with optional notes. Approving a vendor or market application
 * gives the linked account the vendor or organizer role (an admin keeps theirs); a vendor
 * verification sets the vendor profile verified when approved and not verified otherwise. The
 * linked account is told. With a `ref`, the audit entry also records the account's role and the
 * vendor profile's verification before and after, so undo can put them back. Throws when the
 * application does not exist.
 */
export async function setApplicationStatus(
  id: string,
  status: ApplicationDecision,
  notes: string | undefined,
  actorId: string,
  ref?: PublicRef
) {
  const result = await db.$transaction(async (tx) => {
    const before = await tx.application.findUnique({
      where: { id },
      select: { status: true, notes: true, reviewedAt: true, reviewedBy: true },
    });
    const app = await tx.application.update({
      where: { id },
      data: { status, notes: notes ?? undefined, reviewedAt: new Date(), reviewedBy: actorId },
      include: { form: { select: { type: true } } },
    });
    let roleGiven: string | null = null;
    let roleBefore: string | null = null;
    if (status === "APPROVED" && app.userId) {
      const newRole = roleForForm(app.form.type);
      if (newRole) {
        if (ref) roleBefore = (await tx.user.findUnique({ where: { id: app.userId }, select: { role: true } }))?.role ?? null;
        // Never downgrade a higher-privileged account by approving a
        // vendor/market application (e.g. don't demote an ADMIN to ORGANIZER).
        const changed = await tx.user.updateMany({
          where: { id: app.userId, role: { not: "ADMIN" } },
          data: { role: newRole },
        });
        if (changed.count > 0) roleGiven = newRole;
      }
    }
    let vendorVerification: string | null = null;
    let verificationBefore: string | null = null;
    if (app.form.type === "VENDOR_VERIFICATION" && app.userId) {
      vendorVerification = status === "APPROVED" ? "VERIFIED" : "UNVERIFIED";
      if (ref) {
        const profile = await tx.vendorProfile.findFirst({ where: { userId: app.userId, deletedAt: null }, select: { verificationStatus: true } });
        verificationBefore = profile?.verificationStatus ?? null;
      }
      await tx.vendorProfile.updateMany({
        where: { userId: app.userId, deletedAt: null },
        data: { verificationStatus: vendorVerification as "VERIFIED" | "UNVERIFIED" },
      });
    }
    return { app, before, roleGiven, roleBefore, vendorVerification, verificationBefore };
  });

  const { app, before } = result;
  const newRole = status === "APPROVED" && app.userId ? roleForForm(app.form.type) : null;
  const told = app.userId ? app.name : null;
  const roleChange = ref && result.roleGiven && result.roleBefore ? { before: { role: result.roleBefore }, after: { role: result.roleGiven } } : null;
  const verificationChange =
    ref && result.vendorVerification && result.verificationBefore
      ? { before: { vendorVerification: result.verificationBefore }, after: { vendorVerification: result.vendorVerification } }
      : null;
  await logAudit(actorId, APPLICATION_ACTIONS[status], "APPLICATION", id, {
    email: app.email,
    previousValue: before
      ? {
          status: before.status,
          ...(ref ? { notes: before.notes, reviewedAt: before.reviewedAt?.toISOString() ?? null, reviewedBy: before.reviewedBy } : {}),
          ...roleChange?.before,
          ...verificationChange?.before,
        }
      : { status: null },
    newValue: { status, ...(ref && notes !== undefined ? { notes } : {}), ...roleChange?.after, ...verificationChange?.after },
    ...(newRole ? { newRole } : {}),
    ...(ref && result.vendorVerification ? { vendorVerification: result.vendorVerification } : {}),
    ...auditDetails(ref, told ? { notified: [told] } : {}),
  } as Record<string, unknown>);

  if (app.userId) {
    await createNotification({
      userId: app.userId,
      type: "APPLICATION_STATUS",
      title: `Your ${app.form.type.toLowerCase()} application has been ${APPLICATION_STATUS_TEXT[status]}`,
      link: `/dashboard`,
      objectType: "application",
    });
  }

  return { app, previousStatus: before?.status ?? null, roleGiven: result.roleGiven, vendorVerification: result.vendorVerification, told };
}

/** Saves an application's notes without changing its status; an empty text clears them. False when it is gone. */
export async function setApplicationNotes(id: string, notes: string, actorId: string): Promise<boolean> {
  const current = await db.application.findUnique({ where: { id }, select: { notes: true } });
  if (!current) return false;
  await db.application.update({ where: { id }, data: { notes: notes || null } });
  await logAudit(actorId, "UPDATE_APPLICATION_NOTES", "APPLICATION", id, {
    previousValue: { notes: current.notes },
    newValue: { notes: notes || null },
  });
  return true;
}

export type MessageStatus = "PENDING" | "READ" | "ARCHIVED";

/** Marks a contact message read, archived, or unread again. Reading it first sets when it was read. */
export async function setMessageStatus(id: string, status: MessageStatus, actorId: string, options: Options = {}): Promise<StatusChange> {
  const message = await db.contactMessage.findUnique({ where: { id }, select: { status: true, readAt: true } });
  if (!message) return NOT_FOUND;
  if (options.skipSame && message.status === status) return { found: true, changed: false, previous: message.status };
  const readAt = status === "PENDING" ? null : (message.readAt ?? new Date());
  const updated = await db.contactMessage.updateMany({ where: { id, status: message.status }, data: { status, readAt } });
  if (updated.count === 0) return { found: true, changed: false, previous: message.status };
  await logAudit(actorId, "UPDATE_CONTACT_MESSAGE_STATUS", "CONTACT_MESSAGE", id, {
    previousValue: { status: message.status, readAt: message.readAt?.toISOString() ?? null },
    newValue: { status, readAt: readAt?.toISOString() ?? null },
    ...auditDetails(options.ref),
  });
  return { found: true, changed: true, previous: message.status };
}
