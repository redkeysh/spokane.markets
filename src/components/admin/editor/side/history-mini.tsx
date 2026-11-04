"use client";

import Link from "next/link";
import { HistoryList } from "@/components/admin/kit/history-list";
import { SideSection } from "../editor-shell";
import { useEditorForm } from "../form-context";

/** The last three changes to this record as sentences, with Undo where it still applies. */
export function HistoryMini({ onUndo }: { onUndo: (decisionId: string) => Promise<void> }) {
  const { context, mode } = useEditorForm();
  if (mode === "new") return null;
  return (
    <SideSection
      title="History"
      action={
        context.historyHref ? (
          <Link href={context.historyHref} className="inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline">
            All history
          </Link>
        ) : null
      }
    >
      {context.history.length === 0 ? (
        <p className="text-sm text-ash">Nothing has changed here yet.</p>
      ) : (
        <HistoryList entries={context.history} onUndo={onUndo} headingLevel="h3" stickyHeadings={false} compact />
      )}
    </SideSection>
  );
}
