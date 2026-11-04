import type {
  ApplicationStatus,
  ContactMessageStatus,
  ModerationStatus,
  Prisma,
  ReportEscalationStatus,
  ReportStatus,
  Role,
  VerificationStatus,
} from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Undo for decisions about items sent from the public. Reviews, photos, reports, applications and
 * contact messages are restored by status: a row counts as unchanged while it still has the
 * status the decision gave it (photos, reports and messages have no updatedAt). Undoing an
 * application decision also puts back the role and vendor verification it gave the applicant.
 */

type Entry = {
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue;
};

type Meta = {
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
};

function metaOf(entry: Pick<Entry, "metadata">): Meta {
  const m = entry.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as unknown as Meta) : {};
}

export const PUBLIC_UNDOABLE: Record<string, Set<string>> = {
  REVIEW: new Set(["UPDATE_REVIEW_STATUS"]),
  PHOTO: new Set(["UPDATE_PHOTO_STATUS"]),
  REPORT: new Set(["UPDATE_REPORT_STATUS"]),
  APPLICATION: new Set(["APPROVE_APPLICATION", "REJECT_APPLICATION", "REQUEST_APPLICATION_INFO", "MARK_APPLICATION_DUPLICATE"]),
  CONTACT_MESSAGE: new Set(["UPDATE_CONTACT_MESSAGE_STATUS"]),
};

export function isPublicTarget(targetType: string | null | undefined): boolean {
  return !!targetType && targetType in PUBLIC_UNDOABLE;
}

/** A status change that recorded the status before it. */
export function publicEntryUndoable(entry: Entry): boolean {
  if (!entry.targetType || !PUBLIC_UNDOABLE[entry.targetType]?.has(entry.action)) return false;
  return typeof metaOf(entry).previousValue?.status === "string";
}

/** A market verification change carries only the verification status, so it can be put back. */
export function verificationOnly(entry: Entry): boolean {
  const previous = metaOf(entry).previousValue;
  return entry.action === "UPDATE_MARKET" && !!previous && Object.keys(previous).length > 0 && Object.keys(previous).every((k) => k === "verificationStatus");
}

export type PublicRow = { status: string; title: string | null };

/** Current status of every public item the entries touch, keyed "TYPE:id": one query per table. */
export async function loadPublicRows(entries: Entry[]): Promise<Map<string, PublicRow>> {
  const ids = (type: string) => [...new Set(entries.filter((e) => e.targetType === type && e.targetId).map((e) => e.targetId!))];
  const [reviews, photos, reports, applications, messages] = await Promise.all([
    ids("REVIEW").length ? db.review.findMany({ where: { id: { in: ids("REVIEW") } }, select: { id: true, status: true } }) : [],
    ids("PHOTO").length ? db.photo.findMany({ where: { id: { in: ids("PHOTO") } }, select: { id: true, status: true } }) : [],
    ids("REPORT").length ? db.report.findMany({ where: { id: { in: ids("REPORT") } }, select: { id: true, status: true } }) : [],
    ids("APPLICATION").length
      ? db.application.findMany({ where: { id: { in: ids("APPLICATION") } }, select: { id: true, status: true, name: true } })
      : [],
    ids("CONTACT_MESSAGE").length
      ? db.contactMessage.findMany({ where: { id: { in: ids("CONTACT_MESSAGE") } }, select: { id: true, status: true, subject: true } })
      : [],
  ]);
  const rows = new Map<string, PublicRow>();
  for (const r of reviews) rows.set(`REVIEW:${r.id}`, { status: r.status, title: null });
  for (const p of photos) rows.set(`PHOTO:${p.id}`, { status: p.status, title: null });
  for (const r of reports) rows.set(`REPORT:${r.id}`, { status: r.status, title: null });
  for (const a of applications) rows.set(`APPLICATION:${a.id}`, { status: a.status, title: null });
  for (const m of messages) rows.set(`CONTACT_MESSAGE:${m.id}`, { status: m.status, title: m.subject });
  return rows;
}

/** The status the decision left on a target: its last entry's new status. */
export function statusAfter(entries: Entry[], key: string): string | null {
  const last = entries.filter((e) => `${e.targetType}:${e.targetId}` === key).at(-1);
  const status = last ? metaOf(last).newValue?.status : null;
  return typeof status === "string" ? status : null;
}

/** For each field, the oldest previous value and the newest new value. */
function valuesOf(entries: Entry[]): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const entry of entries) {
    const meta = metaOf(entry);
    for (const [k, v] of Object.entries(meta.previousValue ?? {})) if (!(k in before)) before[k] = v;
    Object.assign(after, meta.newValue ?? {});
  }
  return { before, after };
}

const asDate = (value: unknown) => (typeof value === "string" ? new Date(value) : null);
const asText = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * Puts back the applicant's role and vendor verification an application decision changed, each
 * only while it still has the value the decision gave it.
 */
async function restoreApplicant(tx: Prisma.TransactionClient, applicationId: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  const role = asText(before.role);
  const verification = asText(before.vendorVerification);
  if (!role && !verification) return;
  const userId = (await tx.application.findUnique({ where: { id: applicationId }, select: { userId: true } }))?.userId;
  if (!userId) return;
  if (role && typeof after.role === "string") {
    await tx.user.updateMany({ where: { id: userId, role: after.role as Role }, data: { role: role as Role } });
  }
  if (verification && typeof after.vendorVerification === "string") {
    await tx.vendorProfile.updateMany({
      where: { userId, deletedAt: null, verificationStatus: after.vendorVerification as VerificationStatus },
      data: { verificationStatus: verification as VerificationStatus },
    });
  }
}

/**
 * Puts one public item back as it was before the decision, inside the undo's transaction. The
 * write matches the row only while it still has the status the decision gave it; the returned
 * count is 0 otherwise.
 */
export async function restorePublicTarget(tx: Prisma.TransactionClient, entries: Entry[]): Promise<{ count: number }> {
  const first = entries[0];
  const id = first.targetId!;
  const { before, after } = valuesOf(entries);
  const status = String(before.status);
  const now = String(after.status);
  switch (first.targetType) {
    case "REVIEW":
      return tx.review.updateMany({ where: { id, status: now as ModerationStatus }, data: { status: status as ModerationStatus } });
    case "PHOTO":
      return tx.photo.updateMany({ where: { id, status: now as ModerationStatus }, data: { status: status as ModerationStatus } });
    case "REPORT":
      return tx.report.updateMany({
        where: { id, status: now as ReportStatus },
        data: {
          status: status as ReportStatus,
          ...(typeof before.escalationStatus === "string" ? { escalationStatus: before.escalationStatus as ReportEscalationStatus } : {}),
        },
      });
    case "APPLICATION": {
      const restored = await tx.application.updateMany({
        where: { id, status: now as ApplicationStatus },
        data: {
          status: status as ApplicationStatus,
          ...("notes" in before ? { notes: asText(before.notes) } : {}),
          ...("reviewedAt" in before ? { reviewedAt: asDate(before.reviewedAt) } : {}),
          ...("reviewedBy" in before ? { reviewedBy: asText(before.reviewedBy) } : {}),
        },
      });
      if (restored.count > 0) await restoreApplicant(tx, id, before, after);
      return restored;
    }
    case "CONTACT_MESSAGE":
      return tx.contactMessage.updateMany({
        where: { id, status: now as ContactMessageStatus },
        data: { status: status as ContactMessageStatus, ...("readAt" in before ? { readAt: asDate(before.readAt) } : {}) },
      });
  }
  return { count: 0 };
}
