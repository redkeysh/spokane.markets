import { db } from "@/lib/db";
import {
  accountNames,
  HISTORY_SELECT,
  historyRows,
  oldestCursor,
  type HistoryAuditRow,
  type HistoryCursor,
  type HistoryFilters,
} from "@/lib/admin/history";
import { decisionEntries, decisionIdOf, undoability } from "@/lib/admin/undo";
import { groupRows, toHistoryLines } from "./history-lines";
import type { HistoryLine } from "./history-shared";

export const HISTORY_PAGE_SIZE = 50;

/**
 * One page of History lines, newest first. A decision is always shown whole: when the page cuts
 * through one, its other rows are loaded too, and the next page starts below all of them.
 */
export async function loadHistoryPage(
  filters: HistoryFilters,
  viewerId: string,
  options: { cursor?: HistoryCursor | null; limit?: number; now?: Date } = {}
): Promise<{ lines: HistoryLine[]; next: HistoryCursor | null }> {
  const limit = options.limit ?? HISTORY_PAGE_SIZE;
  const now = options.now ?? new Date();
  const rows = await historyRows({ filters, cursor: options.cursor, viewerId, now, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const decisionIds = [...new Set(page.map(decisionIdOf).filter((id): id is string => !!id))];
  const pageIds = new Set(page.map((row) => row.id));
  const siblingIds = (await decisionEntries(decisionIds)).map((row) => row.id).filter((id) => !pageIds.has(id));
  const siblings: HistoryAuditRow[] = siblingIds.length
    ? await db.auditLog.findMany({ where: { id: { in: siblingIds } }, select: HISTORY_SELECT })
    : [];
  const shown = [...page, ...siblings];
  const [undoable, accounts] = await Promise.all([undoability(decisionIds), accountNames(shown)]);
  return {
    lines: toHistoryLines(groupRows(shown), viewerId, undoable, now, accounts),
    next: hasMore ? oldestCursor(shown) : null,
  };
}

/** Rows for the CSV export, newest first, one per audit entry. */
export async function loadHistoryRows(filters: HistoryFilters, viewerId: string, limit: number, now: Date = new Date()) {
  return historyRows({ filters, viewerId, now, limit });
}

/** The people who can appear under Who: every admin except the viewer, who is "You". */
export async function historyPeople(viewerId: string): Promise<{ id: string; label: string }[]> {
  const people = await db.user.findMany({
    where: { role: "ADMIN", id: { not: viewerId } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 50,
  });
  return people.map((p) => ({ id: p.id, label: p.name?.trim() || p.email }));
}
