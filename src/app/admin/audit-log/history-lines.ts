import { decisionSentence } from "@/lib/admin/done-today";
import { describeRow, groupDetails, recordOf, type AccountNames, type HistoryAuditRow, type HistoryRecord } from "@/lib/admin/history";
import { decisionIdOf } from "@/lib/admin/undo";
import { formatClock, formatMonthDay, formatTimestamp, pacificDate } from "@/lib/admin/format";
import type { HistoryLine } from "./history-shared";

/**
 * Rows newest first, with every row of one decision gathered at the position of its newest row.
 * Each group is returned oldest first, the order decision sentences read them in.
 */
export function groupRows(rows: readonly HistoryAuditRow[]): HistoryAuditRow[][] {
  const sorted = [...new Map(rows.map((r) => [r.id, r])).values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
  const groups: HistoryAuditRow[][] = [];
  const byDecision = new Map<string, HistoryAuditRow[]>();
  for (const row of sorted) {
    const decisionId = decisionIdOf(row);
    if (decisionId) {
      const group = byDecision.get(decisionId);
      if (group) {
        group.push(row);
        continue;
      }
      const fresh = [row];
      byDecision.set(decisionId, fresh);
      groups.push(fresh);
    } else {
      groups.push([row]);
    }
  }
  return groups.map((group) => [...group].reverse());
}

const longWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });

/** "Today, Tuesday Nov 3", "Monday Nov 2", "Friday Jan 9, 2026". */
export function dayLabel(instant: Date, now: Date): string {
  const iso = pacificDate(instant);
  const named = `${longWeekday.format(new Date(`${iso}T12:00:00.000Z`))} ${formatMonthDay(iso, now)}`;
  return iso === pacificDate(now) ? `Today, ${named}` : named;
}

/** Groups as History lines. `undoable` holds whether each decision id can still be undone. */
export function toHistoryLines(
  groups: readonly HistoryAuditRow[][],
  viewerId: string | null,
  undoable: ReadonlyMap<string, boolean>,
  now: Date = new Date(),
  accounts: AccountNames = new Map()
): HistoryLine[] {
  return groups.map((group) => {
    const newest = group[group.length - 1];
    const decisionId = decisionIdOf(newest);
    const single = group.length === 1;
    const described = single ? describeRow(newest, viewerId, accounts) : null;
    const sentence = described ? described.sentence : decisionSentence(group, viewerId);
    const link = described?.link ?? null;
    return {
      id: decisionId ?? newest.id,
      decisionId,
      at: newest.createdAt.toISOString(),
      day: dayLabel(newest.createdAt, now),
      time: formatClock(newest.createdAt),
      timestamp: formatTimestamp(newest.createdAt),
      sentence,
      link,
      records: single ? [] : group.map(recordOf).filter((r): r is HistoryRecord => r !== null),
      details: groupDetails(group, now),
      canUndo: decisionId ? (undoable.get(decisionId) ?? false) : false,
    };
  });
}

/** One CSV line; every value quoted, quotes doubled, and a leading formula character neutralized. */
export function csvLine(values: readonly (string | null | undefined)[]): string {
  return values
    .map((value) => {
      let text = value ?? "";
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    })
    .join(",");
}
