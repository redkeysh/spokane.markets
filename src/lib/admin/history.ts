import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatClock, formatTimestamp } from "./format";
import { decisionIdOf, metaOf, undoability } from "./undo";
import {
  actorOf,
  asRecord,
  describeRow,
  historyWhere,
  olderThan,
  rowDetails,
  type AccountNames,
  type HistoryAuditRow,
  type HistoryCursor,
  type HistoryDetail,
  type HistoryFilters,
  type HistoryRecord,
} from "./history-words";

export {
  actorOf,
  describeAuditEntry,
  describeRow,
  fieldLabel,
  formatValue,
  groupDetails,
  historySince,
  historyWhere,
  isHistoryCursor,
  olderThan,
  oldestCursor,
  recordHref,
  recordOf,
  rowDetails,
  RECORD_HREFS,
} from "./history-words";
export type {
  AccountNames,
  HistoryAuditRow,
  HistoryCursor,
  HistoryDetail,
  HistoryFilters,
  HistoryRecord,
  HistoryWhat,
  HistoryWhen,
  RowSentence,
} from "./history-words";

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
  /** The record the sentence names, to link in place. */
  link: HistoryRecord | null;
  /** The record's admin page, when there is one. */
  href: string | null;
  targetType: string | null;
  targetId: string | null;
  title: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  /** The previous and new values, field by field, in words. */
  details: HistoryDetail[];
  decisionId: string | null;
  canUndo: boolean;
};

export const HISTORY_SELECT = {
  id: true,
  userId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

/** The name, or else the email, of each person whose account one of `rows` changed. */
export async function accountNames(rows: readonly HistoryAuditRow[]): Promise<AccountNames> {
  const ids = [...new Set(rows.filter((r) => r.targetType === "USER" && r.targetId).map((r) => r.targetId as string))];
  if (ids.length === 0) return new Map();
  const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(people.map((p) => [p.id, p.name?.trim() || p.email]));
}

/** Shapes audit rows as history entries; `undoable` holds the decision ids that can still be undone. */
export function toHistoryEntries(
  rows: HistoryAuditRow[],
  viewerId: string | null,
  undoable: Map<string, boolean>,
  accounts: AccountNames = new Map(),
  now: Date = new Date()
): HistoryEntry[] {
  return rows.map((row) => {
    const { sentence, link } = describeRow(row, viewerId, accounts);
    const meta = metaOf(row);
    const decisionId = decisionIdOf(row);
    return {
      id: row.id,
      at: row.createdAt,
      time: formatClock(row.createdAt),
      timestamp: formatTimestamp(row.createdAt),
      actor: actorOf(row, viewerId),
      sentence,
      link,
      href: link?.href ?? null,
      targetType: row.targetType,
      targetId: row.targetId,
      title: meta.details?.title ?? null,
      previousValue: asRecord(meta.previousValue),
      newValue: asRecord(meta.newValue),
      details: rowDetails(row, now),
      decisionId,
      canUndo: decisionId ? (undoable.get(decisionId) ?? false) : false,
    };
  });
}

/** The audit rows of History, newest first, read the way `getHistory` reads them. */
export async function historyRows(options: {
  targetType?: string;
  targetId?: string;
  limit?: number;
  before?: Date;
  viewerId?: string | null;
  filters?: HistoryFilters;
  cursor?: HistoryCursor | null;
  now?: Date;
}): Promise<HistoryAuditRow[]> {
  const base: Prisma.AuditLogWhereInput = {
    ...(options.targetType ? { targetType: options.targetType } : {}),
    ...(options.targetId ? { targetId: options.targetId } : {}),
    ...(options.before ? { createdAt: { lt: options.before } } : {}),
  };
  const more: Prisma.AuditLogWhereInput[] = [];
  if (options.filters) more.push(historyWhere(options.filters, options.viewerId ?? "", options.now ?? new Date()));
  if (options.cursor) more.push(olderThan(options.cursor));
  return db.auditLog.findMany({
    where: more.length > 0 ? { AND: [base, ...more] } : base,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(options.limit ?? 50, 1), 5000),
    select: HISTORY_SELECT,
  });
}

/**
 * Audit entries as sentences, newest first: for one record when targetType and targetId are
 * given, otherwise for everything the History filters let through. `before` and `cursor` page
 * back.
 */
export async function getHistory(
  options: {
    targetType?: string;
    targetId?: string;
    limit?: number;
    before?: Date;
    viewerId?: string | null;
    filters?: HistoryFilters;
    cursor?: HistoryCursor | null;
    now?: Date;
  } = {}
): Promise<HistoryEntry[]> {
  const rows = await historyRows({ ...options, limit: Math.min(Math.max(options.limit ?? 50, 1), 500) });
  const decisionIds = [...new Set(rows.map(decisionIdOf).filter((id): id is string => !!id))];
  const [undoable, accounts] = await Promise.all([undoability(decisionIds), accountNames(rows)]);
  return toHistoryEntries(rows, options.viewerId ?? null, undoable, accounts, options.now);
}
