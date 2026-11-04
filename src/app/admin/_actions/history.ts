"use server";

import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { undoDecision } from "@/lib/admin/undo";
import { parseHistoryFilters, type HistoryCursor, type HistoryLine } from "@/app/admin/audit-log/history-shared";
import { isHistoryCursor } from "@/lib/admin/history";
import { loadHistoryPage } from "@/app/admin/audit-log/history-query";

const DECISION_ID = /^d_[0-9a-f-]{36}$/;

/** Undoes one decision from the History page and says what happened, in a sentence. */
export async function undoHistoryDecision(decisionId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireAdminAction();
  if (typeof decisionId !== "string" || !DECISION_ID.test(decisionId)) {
    return { ok: false, message: "This change cannot be undone here." };
  }
  const result = await undoDecision(decisionId, session.user.id);
  revalidateAdmin();
  return { ok: result.ok, message: result.message };
}

/** The next page of History below `cursor`, with the filters of the page's query string. */
export async function loadOlderHistory(
  query: string,
  cursor: HistoryCursor
): Promise<{ lines: HistoryLine[]; next: HistoryCursor | null }> {
  const session = await requireAdminAction();
  if (!isHistoryCursor(cursor)) return { lines: [], next: null };
  const filters = parseHistoryFilters(Object.fromEntries(new URLSearchParams(typeof query === "string" ? query : "")));
  return loadHistoryPage(filters, session.user.id, { cursor });
}
