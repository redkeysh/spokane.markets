import { db } from "@/lib/db";
import { formatClock, formatShortDate, pacificDate, startOfPacificDay } from "./format";
import { actorOf, describeAuditEntry, type HistoryAuditRow } from "./history";
import { currentRows, decisionIdOf, metaOf, undoBlockers } from "./undo";

export type DoneTodayItem = {
  /** null for a change made outside a decision. */
  decisionId: string | null;
  at: Date;
  /** "9:41 am" */
  time: string;
  /** "You published 8 events for the weekend of Nov 7." */
  sentence: string;
  /** Titles of the records the decision changed. */
  titles: string[];
  canUndo: boolean;
  undone: boolean;
};

const PLURAL_VERBS: Record<string, string> = {
  PUBLISHED: "published",
  REJECTED: "rejected",
  CANCELLED: "marked as cancelled",
  DRAFT: "moved back to draft",
  PENDING: "moved back to waiting",
};

function weekendSuffix(decisionKey: string | undefined): string {
  const match = decisionKey?.match(/^ready:(\d{4}-\d{2}-\d{2})$/);
  return match ? ` for the weekend of ${formatShortDate(match[1])}` : "";
}

/** One decision's audit entries (oldest first) as one sentence. Pure. */
export function decisionSentence(entries: HistoryAuditRow[], viewerId: string | null): string {
  if (entries.length === 1) return describeAuditEntry(entries[0], viewerId).sentence;
  const metas = entries.map(metaOf);
  const details = metas[0].details as { decisionKey?: string; reason?: string } | undefined;
  const statuses = new Set(metas.map((m) => m.newValue?.status).filter((s): s is string => typeof s === "string"));
  const actions = new Set(entries.map((e) => e.action));
  const actor = actorOf(entries[0], viewerId);

  if (actions.size === 1 && actions.has("UPDATE_EVENT") && statuses.size === 1) {
    const status = [...statuses][0];
    const reason = details?.reason;
    return `${actor} ${PLURAL_VERBS[status] ?? "changed"} ${entries.length} events${weekendSuffix(details?.decisionKey)}${reason ? `: ${reason}` : ""}.`;
  }
  if (actions.size === 1 && actions.has("SOFT_DELETE_EVENT")) return `${actor} archived ${entries.length} events.`;

  const review = entries.find((e) => e.action === "UPDATE_SUBMISSION_STATUS");
  if (review && entries.every((e) => e === review || e.action === "UPDATE_SUBMISSION")) {
    const sentence = describeAuditEntry(review, viewerId).sentence;
    const title = metaOf(review).details?.title;
    return metaOf(review).newValue?.status === "APPROVED" && title ? `${actor} edited and published ${title}.` : sentence;
  }

  const archived = entries.filter((e) => e.action === "SOFT_DELETE_EVENT" && metaOf(e).newValue?.duplicateOfId);
  const duplicateOf = archived.length > 0 ? metaOf(archived[0]).newValue?.duplicateOfId : undefined;
  const kept = duplicateOf ? entries.find((e) => e.action === "UPDATE_EVENT" && e.targetId === duplicateOf) : undefined;
  if (kept) {
    const keptTitle = metaOf(kept).details?.title ?? "one";
    const published = metaOf(kept).newValue?.status === "PUBLISHED";
    return `${actor} kept ${keptTitle}${published ? ", published it," : ""} and archived its twin.`;
  }
  if (actions.has("CREATE_MARKET")) {
    const market = entries.find((e) => e.action === "CREATE_MARKET")!;
    return `${actor} made the market ${metaOf(market).details?.title ?? ""} and linked ${entries.length - 1} dates to it.`;
  }
  return `${actor} made ${entries.length} changes.`;
}

/**
 * An admin's own decisions since midnight Pacific, newest first, each as a
 * sentence with whether it can still be undone. Built from the audit log.
 */
export async function getDoneToday(actorId: string, now: Date = new Date()): Promise<DoneTodayItem[]> {
  const since = startOfPacificDay(pacificDate(now));
  const rows: HistoryAuditRow[] = await db.auditLog.findMany({
    where: { userId: actorId, createdAt: { gte: since } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 1000,
    select: {
      id: true,
      userId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const undone = new Set(rows.map((r) => metaOf(r).details?.undoOf).filter((id): id is string => !!id));
  const groups = new Map<string, HistoryAuditRow[]>();
  for (const row of rows) {
    if (row.action === "UNDO_DECISION") continue;
    const key = decisionIdOf(row) ?? `entry:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const current = await currentRows([...groups.values()].flat());

  return [...groups]
    .map(([key, entries]) => {
      const decisionId = key.startsWith("entry:") ? null : key;
      const last = entries[entries.length - 1];
      const isUndone = !!decisionId && undone.has(decisionId);
      return {
        decisionId,
        at: last.createdAt,
        time: formatClock(last.createdAt),
        sentence: decisionSentence(entries, actorId),
        titles: [...new Set(entries.map((e) => metaOf(e).details?.title).filter((t): t is string => !!t))],
        canUndo: !!decisionId && !isUndone && undoBlockers(entries, current).length === 0,
        undone: isUndone,
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}
