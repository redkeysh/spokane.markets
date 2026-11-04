"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { HistoryList, type HistoryListEntry } from "@/components/admin/kit/history-list";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { loadOlderHistory, undoHistoryDecision } from "@/app/admin/_actions/history";
import {
  recordList,
  splitAround,
  type HistoryCursor,
  type HistoryLine,
  type HistoryRecord,
} from "@/app/admin/audit-log/history-shared";

const LINK = "rounded-sm text-lilac underline-offset-4 hover:underline";

function RecordName({ record }: { record: HistoryRecord }) {
  return record.href ? (
    <Link href={record.href} className={LINK}>
      {record.title}
    </Link>
  ) : (
    <>{record.title}</>
  );
}

function sentenceOf(line: HistoryLine): React.ReactNode {
  const parts = line.link?.href ? splitAround(line.sentence, line.link.title) : null;
  if (!parts || !line.link) return line.sentence;
  return (
    <>
      {parts[0]}
      <RecordName record={line.link} />
      {parts[1]}
    </>
  );
}

function recordsOf(line: HistoryLine): React.ReactNode {
  if (line.records.length === 0) return undefined;
  const { shown, more } = recordList(line.records);
  const names = shown.map((record, i) => (
    <React.Fragment key={`${record.href ?? ""}${record.title}`}>
      {i > 0 && (more > 0 || i < shown.length - 1 ? ", " : " and ")}
      <RecordName record={record} />
    </React.Fragment>
  ));
  return (
    <>
      {names}
      {more > 0 && `, and ${more} more`}
    </>
  );
}

function toEntry(line: HistoryLine): HistoryListEntry {
  return {
    id: line.id,
    day: line.day,
    at: line.at,
    time: line.time,
    timestamp: line.timestamp,
    sentence: sentenceOf(line),
    detailLine: recordsOf(line),
    details: line.details,
    canUndo: line.canUndo,
  };
}

/**
 * The History list with Undo and "Show older". The first page comes from the server; older pages
 * load below it. When the server sends a new first page (after an undo or a filter change), the
 * list starts again from it.
 */
export function HistoryView({
  lines,
  next,
  query,
  emptyMessage,
  anyTimeHref,
}: {
  lines: HistoryLine[];
  next: HistoryCursor | null;
  /** The page's filters as a query string, for loading older pages. */
  query: string;
  emptyMessage: string;
  /** Present while no filter is on; the filter bar offers Clear filters otherwise. */
  anyTimeHref?: string;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const [state, setState] = React.useState({ base: lines, lines, next });
  if (state.base !== lines) setState({ base: lines, lines, next });
  const [loading, startLoading] = React.useTransition();

  const entries = React.useMemo(() => state.lines.map(toEntry), [state.lines]);
  const decisionOf = React.useMemo(() => new Map(state.lines.map((l) => [l.id, l.decisionId])), [state.lines]);

  const undo = async (id: string) => {
    const decisionId = decisionOf.get(id);
    if (!decisionId) return;
    try {
      const result = await undoHistoryDecision(decisionId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      announce(result.message);
      router.refresh();
    } catch {
      const message = "Could not undo that change. Try again.";
      toast.error(message);
      announce(message);
    }
  };

  const showOlder = () => {
    const cursor = state.next;
    if (!cursor) return;
    startLoading(async () => {
      try {
        const page = await loadOlderHistory(query, cursor);
        setState((s) => ({ ...s, lines: [...s.lines, ...page.lines.filter((l) => !s.lines.some((x) => x.id === l.id))], next: page.next }));
        announce(page.lines.length > 0 ? `Showing ${page.lines.length} older changes.` : "There are no older changes.");
      } catch {
        toast.error("Could not load older changes. Try again.");
      }
    });
  };

  if (state.lines.length === 0) {
    return (
      <Empty
        action={
          anyTimeHref ? (
            <Link href={anyTimeHref} className={`inline-flex min-h-6 items-center text-sm ${LINK}`}>
              Show any time
            </Link>
          ) : undefined
        }
      >
        {emptyMessage}
      </Empty>
    );
  }

  return (
    <div>
      <div className="border-t border-seam bg-sheet">
        <HistoryList entries={entries} onUndo={undo} headingLevel="h2" />
      </div>
      {state.next ? (
        <div className="flex justify-center py-6">
          <AdminButton variant="outline" busy={loading} busyLabel="Loading" onClick={showOlder}>
            Show older
          </AdminButton>
        </div>
      ) : (
        <p className="py-6 text-center font-text text-sm text-ash">That is everything for these filters.</p>
      )}
    </div>
  );
}
