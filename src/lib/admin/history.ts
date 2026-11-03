import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatAuditEntry } from "@/lib/audit/labels";
import { formatClock, formatDay, formatTimestamp, pacificDate } from "./format";
import { decisionIdOf, metaOf, undoability, type AuditRow } from "./undo";

export type HistoryAuditRow = AuditRow & { userId: string | null; user: { name: string | null; email: string } | null };

export type HistoryEntry = {
  id: string;
  at: Date;
  /** "9:41 am" */
  time: string;
  /** "Nov 3, 2026 at 9:41 am" */
  timestamp: string;
  /** "You", a person's name, or "<token name> (API token)". */
  actor: string;
  /** "You published Emerge Holiday Market." */
  sentence: string;
  /** The record's admin page, when there is one. */
  href: string | null;
  targetType: string | null;
  targetId: string | null;
  title: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  decisionId: string | null;
  canUndo: boolean;
};

const RECORD_HREFS: Record<string, (id: string) => string> = {
  EVENT: (id) => `/admin/events/${id}`,
  VENUE: (id) => `/admin/venues/${id}`,
  MARKET: (id) => `/admin/markets/${id}`,
  SUBMISSION: (id) => `/admin/submissions/${id}`,
  USER: (id) => `/admin/users/${id}`,
};

const FIELD_WORDS: Record<string, string> = {
  title: "title",
  slug: "web address",
  description: "description",
  status: "status",
  venueId: "place",
  marketId: "market",
  websiteUrl: "website",
  facebookUrl: "Facebook link",
  instagramUrl: "Instagram link",
  imageUrl: "picture",
  showImageInList: "picture on cards",
  imageFocalX: "picture focus",
  imageFocalY: "picture focus",
  complianceNotes: "notes",
  complianceFlagged: "flag",
  tagIds: "tags",
  featureIds: "features",
  scheduleDays: "dates and hours",
  startDate: "dates and hours",
  endDate: "dates and hours",
};

const STATUS_VERBS: Record<string, string> = {
  PUBLISHED: "published",
  REJECTED: "rejected",
  CANCELLED: "marked as cancelled",
  DRAFT: "moved back to draft",
  PENDING: "moved back to waiting",
};

export function actorOf(entry: HistoryAuditRow, viewerId?: string | null): string {
  const meta = entry.metadata as { via?: string; tokenName?: string } | null;
  if (meta?.via === "mcp" && meta.tokenName) return `${meta.tokenName} (API token)`;
  if (viewerId && entry.userId === viewerId) return "You";
  return entry.user?.name?.trim() || entry.user?.email || "Someone";
}

/** One audit entry as a plain sentence, in the owner's words. */
export function describeAuditEntry(entry: HistoryAuditRow, viewerId?: string | null): { sentence: string; href: string | null } {
  const actor = actorOf(entry, viewerId);
  const meta = metaOf(entry);
  const title = meta.details?.title ?? null;
  const name = title ?? "a record";
  const href = entry.targetType && entry.targetId && RECORD_HREFS[entry.targetType] ? RECORD_HREFS[entry.targetType](entry.targetId) : null;
  const next = meta.newValue ?? {};
  const reason = (meta.details as { reason?: string } | undefined)?.reason;

  switch (entry.action) {
    case "UPDATE_EVENT": {
      const fields = Object.keys(next);
      if (typeof next.status === "string" && fields.every((f) => f === "status" || f === "complianceNotes")) {
        return { sentence: `${actor} ${STATUS_VERBS[next.status] ?? "changed the status of"} ${name}${reason ? `: ${reason}` : ""}.`, href };
      }
      const words = [...new Set(fields.map((f) => FIELD_WORDS[f] ?? f))];
      return { sentence: `${actor} changed ${name}${words.length ? `: ${words.join(", ")}` : ""}.`, href };
    }
    case "SOFT_DELETE_EVENT":
      return { sentence: `${actor} archived ${name}${next.duplicateOfId ? " as a duplicate" : ""}.`, href };
    case "RESTORE_EVENT":
      return { sentence: `${actor} restored ${name}.`, href };
    case "UNDO_DECISION":
      return { sentence: `${actor} undid a decision; ${name} is back as it was.`, href };
    case "CREATE_MARKET":
      return { sentence: `${actor} made the market ${name}.`, href };
    case "UPDATE_SUBMISSION":
      return { sentence: `${actor} edited the submission ${name}.`, href };
    case "UPDATE_SUBMISSION_STATUS": {
      const what = title ?? "a submission";
      if (next.status === "APPROVED") {
        const eventId = typeof next.createdEventId === "string" ? next.createdEventId : null;
        return { sentence: `${actor} published ${what}.`, href: eventId ? RECORD_HREFS.EVENT(eventId) : href };
      }
      if (next.status === "REJECTED") return { sentence: `${actor} rejected ${what}${reason ? `: ${reason}` : ""}.`, href };
      break;
    }
    case "DELETE_ADMIN_MEMO": {
      const kind = meta.previousValue?.kind;
      if (kind === "later") return { sentence: `${actor} brought back ${title ?? "a decision"}.`, href: null };
      if (kind === "not-same-event") return { sentence: `${actor} took back marking two events as different.`, href: null };
      if (kind === "not-same-place") return { sentence: `${actor} took back marking two places as different.`, href: null };
      if (kind === "same-place") return { sentence: `${actor} took back marking two places as the same.`, href: null };
      break;
    }
    case "SET_ADMIN_MEMO": {
      const kind = next.kind;
      if (kind === "later" && typeof next.until === "string") {
        return { sentence: `${actor} put off ${title ?? "a decision"} until ${formatDay(pacificDate(new Date(next.until)))}.`, href: null };
      }
      if (kind === "not-same-event") return { sentence: `${actor} marked two events as different.`, href: null };
      if (kind === "not-same-place") return { sentence: `${actor} marked two places as different.`, href: null };
      if (kind === "same-place") return { sentence: `${actor} marked two places as the same.`, href: null };
      break;
    }
  }
  const fallback = formatAuditEntry({
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    user: { name: actor, email: "" },
  });
  return { sentence: `${fallback.message}${title ? `: ${title}` : ""}.`, href: href ?? fallback.href };
}

const HISTORY_SELECT = {
  id: true,
  userId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Shapes audit rows as history entries; `undoable` holds the decision ids that can still be undone. */
export function toHistoryEntries(rows: HistoryAuditRow[], viewerId: string | null, undoable: Map<string, boolean>): HistoryEntry[] {
  return rows.map((row) => {
    const { sentence, href } = describeAuditEntry(row, viewerId);
    const meta = metaOf(row);
    const decisionId = decisionIdOf(row);
    return {
      id: row.id,
      at: row.createdAt,
      time: formatClock(row.createdAt),
      timestamp: formatTimestamp(row.createdAt),
      actor: actorOf(row, viewerId),
      sentence,
      href,
      targetType: row.targetType,
      targetId: row.targetId,
      title: meta.details?.title ?? null,
      previousValue: asRecord(meta.previousValue),
      newValue: asRecord(meta.newValue),
      decisionId,
      canUndo: decisionId ? (undoable.get(decisionId) ?? false) : false,
    };
  });
}

/**
 * Audit entries as sentences, newest first: for one record when targetType
 * and targetId are given, otherwise for everything. `before` pages back.
 */
export async function getHistory(
  options: { targetType?: string; targetId?: string; limit?: number; before?: Date; viewerId?: string | null } = {}
): Promise<HistoryEntry[]> {
  const rows = await db.auditLog.findMany({
    where: {
      ...(options.targetType ? { targetType: options.targetType } : {}),
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(options.limit ?? 50, 1), 500),
    select: HISTORY_SELECT,
  });
  const decisionIds = [...new Set(rows.map(decisionIdOf).filter((id): id is string => !!id))];
  const undoable = await undoability(decisionIds);
  return toHistoryEntries(rows, options.viewerId ?? null, undoable);
}
