import { requireAdminAction } from "@/lib/admin/auth-action";
import { accountNames, actorOf, describeRow } from "@/lib/admin/history";
import { formatTimestamp, pacificDate } from "@/lib/admin/format";
import { metaOf } from "@/lib/admin/undo";
import { csvLine } from "../history-lines";
import { parseHistoryFilters } from "../history-shared";
import { loadHistoryRows } from "../history-query";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

/** The History list as CSV, one row per change, with the page's filters. */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireAdminAction();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = new URL(request.url);
  const filters = parseHistoryFilters(Object.fromEntries(url.searchParams));
  const now = new Date();
  const rows = await loadHistoryRows(filters, session.user.id, MAX_ROWS, now);
  const accounts = await accountNames(rows);
  const lines = [csvLine(["When", "Who", "What happened", "Record", "Link"])];
  for (const row of rows) {
    const { sentence, link } = describeRow(row, session.user.id, accounts);
    lines.push(
      csvLine([
        formatTimestamp(row.createdAt),
        actorOf(row, session.user.id),
        sentence,
        metaOf(row).details?.title ?? link?.title ?? null,
        link?.href ? new URL(link.href, url.origin).toString() : null,
      ])
    );
  }
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="history-${pacificDate(now)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
